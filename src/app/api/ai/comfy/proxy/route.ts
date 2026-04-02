import { NextRequest, NextResponse } from 'next/server';
import { resolveComfyBaseUrlCandidates } from '@/lib/comfyui/proxy';

const ALLOWED_PATH_PREFIXES = [
    '/features',
    '/system_stats',
    '/object_info',
    '/prompt',
    '/upload/image',
    '/history',
    '/view',
];

type ForwardableBody =
    | { kind: 'none' }
    | { kind: 'buffer'; body: ArrayBuffer; contentType: string | null }
    | { kind: 'form-data'; entries: Array<[string, FormDataEntryValue]> };

const isAllowedComfyPath = (path: string): boolean => (
    ALLOWED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))
);

const copyResponseHeaders = (headers: Headers): Headers => {
    const nextHeaders = new Headers();
    const passThrough = [
        'content-type',
        'content-length',
        'cache-control',
        'etag',
        'last-modified',
        'content-disposition',
    ];

    for (const headerName of passThrough) {
        const value = headers.get(headerName);
        if (value) {
            nextHeaders.set(headerName, value);
        }
    }

    return nextHeaders;
};

const buildForwardHeaders = (request: NextRequest, body: ForwardableBody): Headers => {
    const headers = new Headers();
    const accept = request.headers.get('accept');
    if (accept) {
        headers.set('accept', accept);
    }

    if (body.kind === 'buffer' && body.contentType) {
        headers.set('content-type', body.contentType);
    }

    return headers;
};

const cloneForwardBody = (body: ForwardableBody): BodyInit | undefined => {
    if (body.kind === 'none') {
        return undefined;
    }

    if (body.kind === 'buffer') {
        return new Blob([body.body], {
            type: body.contentType || 'application/octet-stream',
        });
    }

    const formData = new FormData();
    for (const [key, value] of body.entries) {
        formData.append(key, value);
    }
    return formData;
};

const prepareForwardBody = async (request: NextRequest): Promise<ForwardableBody> => {
    if (request.method === 'GET' || request.method === 'HEAD') {
        return { kind: 'none' };
    }

    const contentType = request.headers.get('content-type');
    if (contentType && contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        return {
            kind: 'form-data',
            entries: Array.from(formData.entries()),
        };
    }

    const arrayBuffer = await request.arrayBuffer();
    return {
        kind: 'buffer',
        body: arrayBuffer,
        contentType,
    };
};

const forwardToComfy = async (
    request: NextRequest,
    upstreamBaseUrl: string,
    path: string,
    forwardedSearchParams: URLSearchParams,
    preparedBody: ForwardableBody
): Promise<Response> => {
    const upstreamUrl = new URL(path, `${upstreamBaseUrl}/`);
    forwardedSearchParams.forEach((value, key) => {
        upstreamUrl.searchParams.append(key, value);
    });

    return await fetch(upstreamUrl, {
        method: request.method,
        headers: buildForwardHeaders(request, preparedBody),
        body: cloneForwardBody(preparedBody),
    });
};

const handleProxyRequest = async (request: NextRequest): Promise<NextResponse> => {
    const upstream = request.nextUrl.searchParams.get('upstream') || '';
    const path = request.nextUrl.searchParams.get('path') || '';

    if (!upstream.trim() || !path.trim()) {
        return NextResponse.json({
            success: false,
            message: 'Both upstream and path are required.',
        }, { status: 400 });
    }

    if (!isAllowedComfyPath(path)) {
        return NextResponse.json({
            success: false,
            message: `Unsupported Comfy proxy path: ${path}`,
        }, { status: 400 });
    }

    const preparedBody = await prepareForwardBody(request);
    const forwardedSearchParams = new URLSearchParams(request.nextUrl.searchParams);
    forwardedSearchParams.delete('upstream');
    forwardedSearchParams.delete('path');

    const candidates = resolveComfyBaseUrlCandidates(upstream);
    let lastError: Error | null = null;

    for (const candidate of candidates) {
        try {
            const upstreamResponse = await forwardToComfy(
                request,
                candidate,
                path,
                forwardedSearchParams,
                preparedBody
            );
            const body = await upstreamResponse.arrayBuffer();
            const responseHeaders = copyResponseHeaders(upstreamResponse.headers);
            responseHeaders.set('x-comfy-upstream', candidate);
            return new NextResponse(body, {
                status: upstreamResponse.status,
                headers: responseHeaders,
            });
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    return NextResponse.json({
        success: false,
        message: lastError?.message || 'Failed to reach ComfyUI.',
    }, { status: 502 });
};

export async function GET(request: NextRequest): Promise<NextResponse> {
    return await handleProxyRequest(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    return await handleProxyRequest(request);
}
