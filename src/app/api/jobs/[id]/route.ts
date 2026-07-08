import { NextResponse } from 'next/server';
import { readGenerateJob } from '@/lib/agentic-edit/jobs';

export const runtime = 'nodejs';

export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const job = await readGenerateJob(id);
    if (!job) {
        return NextResponse.json({ message: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
        id: job.state.id,
        status: job.state.status,
        progress: job.state.progress,
        message: job.state.message,
        error: job.state.error,
        createdAt: job.state.createdAt,
        updatedAt: job.state.updatedAt,
        resultImageUrl: job.state.resultImageUrl,
    });
}
