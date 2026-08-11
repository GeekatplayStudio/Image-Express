import { NextResponse } from 'next/server';
import { isImageDataUrl, runUpscaleJob } from '@/lib/server/upscaleProxy';

/**
 * Provider-agnostic upscale proxy. The client sends its own provider API key
 * in the Authorization header (same convention as the Stability routes); the
 * server never stores it. Responds with a finished data URL, or a task id the
 * client polls via /api/ai/upscale/poll.
 */
export async function POST(request: Request) {
    try {
        const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '') || '';
        if (!apiKey) {
            return NextResponse.json({ success: false, message: 'Missing API key.' }, { status: 401 });
        }

        const body = await request.json().catch(() => null) as {
            provider?: unknown;
            image?: unknown;
            scale?: unknown;
            creativity?: unknown;
            prompt?: unknown;
            sourceWidth?: unknown;
            sourceHeight?: unknown;
        } | null;

        const provider = typeof body?.provider === 'string' ? body.provider : '';
        const scale = typeof body?.scale === 'number' && Number.isFinite(body.scale) ? body.scale : 0;
        if (!provider || !isImageDataUrl(body?.image) || scale < 1 || scale > 16) {
            return NextResponse.json(
                { success: false, message: 'Request needs a provider, a base64 image data URL, and a scale between 1 and 16.' },
                { status: 400 },
            );
        }

        const result = await runUpscaleJob({
            provider,
            image: body!.image as string,
            scale,
            creativity: typeof body?.creativity === 'number' ? body.creativity : undefined,
            prompt: typeof body?.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : undefined,
            sourceWidth: typeof body?.sourceWidth === 'number' ? body.sourceWidth : undefined,
            sourceHeight: typeof body?.sourceHeight === 'number' ? body.sourceHeight : undefined,
        }, apiKey);

        if (result.kind === 'error') {
            return NextResponse.json({ success: false, message: result.message }, { status: result.statusCode });
        }
        if (result.kind === 'task') {
            return NextResponse.json({ success: true, status: 'IN_PROGRESS', taskId: result.taskId });
        }
        return NextResponse.json({ success: true, status: 'SUCCEEDED', image: result.image });
    } catch (error) {
        console.error('Upscale proxy error:', error);
        return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
    }
}
