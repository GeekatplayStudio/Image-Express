import { NextResponse } from 'next/server';
import { cleanupGenerateJobArtifacts, readGenerateJob } from '@/lib/agentic-edit/jobs';

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

    const responsePayload = {
        imageUrl: job.output.imageUrl,
        meta: job.output.meta,
    };

    try {
        await cleanupGenerateJobArtifacts(id, {
            removeJobRecord: true,
            removeUploads: true,
        });
    } catch {
        // best-effort cleanup
    }

    return NextResponse.json(responsePayload);
}
