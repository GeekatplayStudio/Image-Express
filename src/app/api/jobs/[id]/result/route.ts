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

    if (job.state.status !== 'succeeded' || !job.output) {
        return NextResponse.json({ message: 'Job is not completed yet' }, { status: 409 });
    }

    return NextResponse.json({
        imageUrl: job.output.imageUrl,
        meta: job.output.meta,
    });
}
