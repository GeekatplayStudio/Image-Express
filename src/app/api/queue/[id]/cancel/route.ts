import { getQueue } from '@/lib/server/jobQueue';
import { blockCrossSiteRequest } from '@/lib/server/trustedCaller';
import { apiError, jsonWithRequestId, toApiErrorResponse } from '@/lib/server/apiContract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cancel a queued job, or ask a running one to stop.
 *
 * A queued job is cancelled immediately. A running job gets a cooperative
 * stop request: the handler owns its provider calls and open handles, so it
 * exits at its next safe point (indexing and precache passes check between
 * batches) and the job finishes as 'cancelled'. Only terminal jobs report 409.
 */
export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const crossSite = blockCrossSiteRequest(request);
    if (crossSite) return crossSite;
    try {
        const { id } = await context.params;
        const queue = getQueue();
        const existing = await queue.getJob(id);
        if (!existing) {
            return apiError(request, {
                code: 'job_not_found',
                message: 'Queue job was not found.',
                status: 404,
            });
        }
        if (existing.status !== 'queued' && existing.status !== 'running') {
            return apiError(request, {
                code: 'job_not_cancellable',
                message: `Job is ${existing.status} and can no longer be cancelled.`,
                status: 409,
            });
        }

        const job = await queue.cancel(id);
        return jsonWithRequestId(request, { job });
    } catch (error) {
        return toApiErrorResponse(request, error, {
            code: 'job_cancel_failed',
            message: 'Failed to cancel queue job.',
            status: 500,
            retryable: true,
        });
    }
}
