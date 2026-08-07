import { getQueue } from '@/lib/server/jobQueue';
import { jsonWithRequestId, toApiErrorResponse } from '@/lib/server/apiContract';

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
