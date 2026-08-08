/**
 * Queue handler that polls a remote provider until the task reaches a terminal
 * state — server-side, so a job survives the tab that started it.
 *
 * Browser-side polling had three problems this fixes: closing the tab abandoned
 * a running job (and the user still paid for it), the concurrency cap was
 * per-tab rather than global, and the API key had to live in localStorage and
 * be replayed on every request. Here the key is read from the encrypted vault
 * and never leaves the server.
 *
 * Completion work stays on the client: persisting the asset, rendering a
 * thumbnail and placing the model on the canvas all need a canvas. This handler
 * establishes *that the job finished and where the result is*, and the SSE
 * stream tells the client to go and collect it.
 */

import { loadUserApiKeys } from '@/lib/server/user-key-vault';
import {
    isTerminalPollStatus,
    nextPollDelayMs,
    normalizeProviderPoll,
    providerPollHeaders,
    providerUpstreamExtraHeaders,
    providerUpstreamUrl,
    type RemoteProvider,
    type RemotePollResult,
} from '@/lib/server/jobQueue/providerPoll';
import type { QueueHandlerContext, QueueStage } from '@/lib/server/jobQueue/types';

/** Give up rather than poll a wedged provider forever. */
const MAX_POLL_DURATION_MS = 2 * 60 * 60 * 1000;
/** Consecutive transport failures tolerated before the job is failed. */
const MAX_CONSECUTIVE_ERRORS = 5;

export type RemotePollPayload = {
    provider: RemoteProvider;
    taskId: string;
    jobType?: string;
    stage?: string;
    /** Vault owner whose key authorises this poll. */
    owner: string;
    /** Hitem3D sends an app id alongside the credential. */
    hitemsAppId?: string;
    /**
     * Poll interval bounds, in ms. Present so the timing is injectable rather
     * than hardcoded — a handler that always sleeps two seconds cannot be
     * tested without either fake timers fighting real ones, or a slow suite.
     */
    minDelayMs?: number;
    maxDelayMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const stageFor = (progress: number): QueueStage => (progress >= 100 ? 'store' : 'ai');

/**
 * Resolve the provider credential from the encrypted vault.
 *
 * Settings syncs keys under the bare provider name (`meshy`, `tripo`,
 * `hitems`, `stability`) — and only for signed-in users; a Guest session keeps
 * keys in localStorage only. That is why a missing key is reported as an
 * actionable message rather than a crash: for a guest it is expected, and the
 * job stays retryable once they sign in and save the key.
 */
async function resolveApiKey(owner: string, provider: RemoteProvider): Promise<string | null> {
    const keys = await loadUserApiKeys(owner);
    const value = keys[provider];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export const runRemotePollJob = async (
    { job, update }: QueueHandlerContext,
): Promise<{ resultUrl?: string }> => {
    const payload = job.payload as unknown as RemotePollPayload;
    const { provider, taskId, jobType, stage, owner, hitemsAppId } = payload;

    if (!provider || !taskId || !owner) {
        throw new Error('remote-poll requires provider, taskId and owner.');
    }

    const apiKey = await resolveApiKey(owner, provider);
    if (!apiKey) {
        // Actionable rather than generic: the user can fix this in Settings and
        // retry the job, which is why the queue keeps failed jobs retryable.
        throw new Error(
            `No stored ${provider} API key for this account. `
            + 'Add it in Settings, then retry this job.',
        );
    }

    const url = providerUpstreamUrl(provider, taskId, jobType);
    const headers = {
        ...providerPollHeaders(provider, apiKey, { hitemsAppId }),
        ...providerUpstreamExtraHeaders(provider),
    };

    const minDelayMs = payload.minDelayMs ?? 2000;
    const maxDelayMs = payload.maxDelayMs ?? 15_000;
    const delayBounds = { minMs: minDelayMs, maxMs: maxDelayMs };

    const startedAt = Date.now();
    let delay = minDelayMs;
    let previousProgress = 0;
    let consecutiveErrors = 0;

    await update({ stage: 'ai', progress: 0, message: `Waiting on ${provider}...` });

    for (;;) {
        if (Date.now() - startedAt > MAX_POLL_DURATION_MS) {
            throw new Error(`${provider} task ${taskId} did not finish within 2 hours.`);
        }

        await sleep(delay);

        let outcome: RemotePollResult;
        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                // 4xx is the provider telling us something is wrong with the
                // request or the key; retrying cannot fix it. 5xx and transport
                // faults are worth riding out.
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    const detail = await response.text().catch(() => '');
                    throw new Error(
                        `${provider} poll rejected (${response.status}). ${detail.slice(0, 300)}`.trim(),
                    );
                }
                consecutiveErrors += 1;
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    throw new Error(`${provider} poll failed ${consecutiveErrors} times (last ${response.status}).`);
                }
                delay = nextPollDelayMs(delay, false, delayBounds);
                continue;
            }
            outcome = normalizeProviderPoll(provider, await response.json(), {
                previousProgress,
                jobType,
                stage,
            });
            consecutiveErrors = 0;
        } catch (error) {
            // A thrown 4xx above is deliberate and must not be swallowed by the
            // transport-retry path.
            if (error instanceof Error && /rejected \(4\d\d\)/.test(error.message)) throw error;
            consecutiveErrors += 1;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                throw error instanceof Error ? error : new Error(String(error));
            }
            delay = nextPollDelayMs(delay, false, delayBounds);
            continue;
        }

        const progressed = outcome.progress > previousProgress;
        previousProgress = Math.max(previousProgress, outcome.progress);

        if (!isTerminalPollStatus(outcome.status)) {
            await update({
                stage: stageFor(outcome.progress),
                progress: Math.min(0.99, outcome.progress / 100),
                message: `${provider} ${outcome.progress}%`,
            });
            delay = nextPollDelayMs(delay, progressed, delayBounds);
            continue;
        }

        if (outcome.status === 'FAILED' || outcome.status === 'CANCELLED') {
            throw new Error(outcome.error || `${provider} task ${outcome.status.toLowerCase()}.`);
        }

        // Meshy text-to-3d finishes a preview first; the refine pass returns a
        // NEW task id, so this job is not done. Handled by the caller, which
        // enqueues the refine leg — see F-04 step 3.
        if (outcome.needsMeshyRefine) {
            await update({
                stage: 'ai',
                progress: 0.5,
                message: 'Preview ready — refining textures...',
            });
        }

        await update({ stage: 'validate', progress: 0.98, message: 'Checking result...' });
        if (!outcome.resultUrl) {
            throw new Error(`${provider} reported success without a result URL.`);
        }

        return { resultUrl: outcome.resultUrl };
    }
};
