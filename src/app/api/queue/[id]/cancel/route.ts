import { getQueue } from '@/lib/server/jobQueue';
import { blockCrossSiteRequest } from '@/lib/server/trustedCaller';
import { apiError, jsonWithRequestId, toApiErrorResponse } from '@/lib/server/apiContract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cancel a queued job. Jobs that already started are not cancellable —
 * handlers own their provider calls and cannot be interrupted safely, so
 * this reports 409 rather than leaving a half-run job in a lying state.
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
        if (existing.status !== 'queued') {
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
