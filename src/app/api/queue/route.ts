import { getQueue } from '@/lib/server/jobQueue';
import { jsonWithRequestId, toApiErrorResponse } from '@/lib/server/apiContract';
import { blockCrossSiteRequest } from '@/lib/server/trustedCaller';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Snapshot of the unified job queue (polling fallback for the SSE stream). */
export async function GET(request: Request) {
    try {
        const jobs = await getQueue().listJobs();
        return jsonWithRequestId(request, { jobs });
    } catch (error) {
        return toApiErrorResponse(request, error, {
            code: 'queue_snapshot_failed',
            message: 'Failed to read queue state.',
            status: 500,
            retryable: true,
        });
    }
}

/** Clear finished jobs from the history. Queued and running jobs are kept. */
export async function DELETE(request: Request) {
    const crossSite = blockCrossSiteRequest(request);
    if (crossSite) return crossSite;
    try {
        const removed = await getQueue().clearFinished();
        return jsonWithRequestId(request, { removed });
    } catch (error) {
        return toApiErrorResponse(request, error, {
            code: 'queue_clear_failed',
            message: 'Failed to clear finished jobs.',
            status: 500,
            retryable: true,
        });
    }
}
