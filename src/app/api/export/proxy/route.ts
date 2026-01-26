import { NextRequest, NextResponse } from 'next/server';

const PASS_THROUGH_HEADERS = new Set([
    'content-type',
    'content-length',
    'content-disposition',
    'content-range',
    'accept-ranges',
    'last-modified',
    'etag',
    'cache-control'
]);

export async function GET(request: NextRequest): Promise<NextResponse> {
    const urlParam = request.nextUrl.searchParams.get('url');

    if (!urlParam) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    let target: URL;
    try {
        target = new URL(urlParam);
    } catch {
        return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
        return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
    }

    try {
        const upstream = await fetch(target.toString(), {
            method: 'GET',
            redirect: 'follow',
            cache: 'no-store'
        });

        if (!upstream.ok) {
            return NextResponse.json({ error: `Upstream request failed with status ${upstream.status}` }, { status: upstream.status });
        }

        const buffer = await upstream.arrayBuffer();
        const headers = new Headers();
        upstream.headers.forEach((value, key) => {
            if (PASS_THROUGH_HEADERS.has(key.toLowerCase())) {
                headers.set(key, value);
            }
        });

        return new NextResponse(buffer, {
            status: 200,
            headers
        });
    } catch (error) {
        console.error('Export proxy failed:', error);
        return NextResponse.json({ error: 'Failed to retrieve asset' }, { status: 500 });
    }
}
