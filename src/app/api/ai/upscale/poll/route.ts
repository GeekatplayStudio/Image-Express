import { NextResponse } from 'next/server';
import { pollUpscaleTask } from '@/lib/server/upscaleProxy';

/**
 * Poll an async upscale task (Replicate / Freepik). GET with ?provider=&id=,
 * key in the Authorization header — mirrors the Stability poll route, which
 * learned the hard way that the background-job poller sends GET.
 */
async function handlePoll(request: Request) {
    try {
        const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '') || '';
        if (!apiKey) {
            return NextResponse.json({ success: false, message: 'Missing API key.' }, { status: 401 });
        }

        const url = new URL(request.url);
        const provider = url.searchParams.get('provider') || '';
        const taskId = url.searchParams.get('id') || '';
        if (!provider || !taskId) {
            return NextResponse.json({ success: false, message: 'Missing provider or task id.' }, { status: 400 });
        }

        const result = await pollUpscaleTask(provider, taskId, apiKey);
        if (result.kind === 'error') {
            return NextResponse.json({ success: false, message: result.message }, { status: result.statusCode });
        }
        if (result.kind === 'task') {
            return NextResponse.json({ success: true, status: 'IN_PROGRESS', taskId: result.taskId });
        }
        return NextResponse.json({ success: true, status: 'SUCCEEDED', image: result.image });
    } catch (error) {
        console.error('Upscale poll error:', error);
        return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
    }
}

export const GET = handlePoll;
export const POST = handlePoll;
