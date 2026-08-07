import { getQueue } from '@/lib/server/jobQueue';
import { apiError, jsonWithRequestId, toApiErrorResponse } from '@/lib/server/apiContract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Re-queue a failed or cancelled job with a fresh attempt budget. */
export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
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
        if (existing.status !== 'failed' && existing.status !== 'cancelled') {
            return apiError(request, {
                code: 'job_not_retryable',
                message: `Job is ${existing.status} and does not need a retry.`,
                status: 409,
            });
        }

        const job = await queue.retry(id);
        return jsonWithRequestId(request, { job });
    } catch (error) {
        return toApiErrorResponse(request, error, {
            code: 'job_retry_failed',
            message: 'Failed to retry queue job.',
            status: 500,
            retryable: true,
        });
    }
}
