import { getQueue } from '@/lib/server/jobQueue';
import { apiError, jsonWithRequestId, toApiErrorResponse } from '@/lib/server/apiContract';
import { getRuntimeProfile } from '@/lib/server/runtimeProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS = new Set(['meshy', 'tripo', 'hitems', 'stability']);

/**
 * Hand a provider task to the server so it is polled to completion regardless
 * of what the browser does next.
 *
 * The client used to own this loop, which meant closing the tab abandoned a
 * running (and already paid for) job, and the concurrency cap was per-tab. The
 * job lands on the provider's own lane, so the cap is global.
 *
 * No API key is accepted here: it is read from the encrypted vault server-side,
 * so a credential never has to be replayed from localStorage on every poll.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null) as {
            provider?: string;
            taskId?: string;
            jobType?: string;
            stage?: string;
            owner?: string;
            hitemsAppId?: string;
            label?: string;
        } | null;

        const provider = body?.provider?.trim();
        const taskId = body?.taskId?.trim();
        const owner = body?.owner?.trim();

        if (!provider || !PROVIDERS.has(provider)) {
            return apiError(request, {
                code: 'poll_provider_invalid',
                message: `provider must be one of: ${[...PROVIDERS].join(', ')}.`,
                status: 400,
            });
        }
        if (!taskId) {
            return apiError(request, {
                code: 'poll_task_id_required',
                message: 'A provider taskId is required.',
                status: 400,
            });
        }
        if (!owner || owner === 'Guest') {
            // Keys are only vaulted for signed-in users, so a guest job could
            // never be polled server-side. Say so instead of failing later.
            return apiError(request, {
                code: 'poll_requires_account',
                message: 'Server-side polling needs a signed-in account with a saved API key.',
                status: 400,
            });
        }
        if (getRuntimeProfile() === 'self-hosted') {
            return apiError(request, {
                code: 'poll_not_available',
                message: 'Server-side provider polling is disabled in self-hosted mode.',
                status: 403,
            });
        }

        const job = await getQueue().enqueue({
            kind: 'remote-poll',
            lane: `remote:${provider}`,
            external: true,
            label: body?.label?.trim() || `${provider} ${body?.jobType || 'task'}`,
            payload: {
                provider,
                taskId,
                jobType: body?.jobType,
                stage: body?.stage,
                owner,
                hitemsAppId: body?.hitemsAppId,
            },
        });

        return jsonWithRequestId(request, { job_id: job.id, job }, { status: 202 });
    } catch (error) {
        return toApiErrorResponse(request, error, {
            code: 'poll_enqueue_failed',
            message: 'Failed to queue provider polling.',
            status: 500,
            retryable: true,
        });
    }
}
