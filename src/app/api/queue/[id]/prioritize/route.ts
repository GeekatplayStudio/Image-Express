import { getQueue } from '@/lib/server/jobQueue';
import { blockCrossSiteRequest } from '@/lib/server/trustedCaller';
import { apiError, jsonWithRequestId, toApiErrorResponse } from '@/lib/server/apiContract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Move a waiting job to the front of its lane. */
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
                code: 'job_not_queued',
                message: `Job is ${existing.status}; only a waiting job can be moved up.`,
                status: 409,
            });
        }

        const job = await queue.prioritize(id);
        return jsonWithRequestId(request, { job });
    } catch (error) {
        return toApiErrorResponse(request, error, {
            code: 'job_prioritize_failed',
            message: 'Failed to move the job up.',
            status: 500,
            retryable: true,
        });
    }
}
