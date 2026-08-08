'use client';

import type { BackgroundJob } from '@/types';

/**
 * Hand a provider task to the server so it is polled to completion even if the
 * tab closes.
 *
 * Browser polling only runs while the tab is open, so closing it abandoned a
 * running — and already paid for — generation, and the concurrency cap was
 * per-tab. Handing the task to the queue fixes both.
 *
 * This is best-effort by design. If the handoff fails, the browser poller keeps
 * running exactly as before: a job that is merely *less* resilient is far
 * better than a generation that never starts because a queue call 500'd.
 */

export type ServerPollHandoffResult =
    | { handedOff: true; queueJobId: string }
    | { handedOff: false; reason: 'guest' | 'unsupported' | 'error' };

/** Providers the server-side poller knows how to drive. */
const SUPPORTED = new Set(['meshy', 'tripo', 'hitems', 'stability']);

/**
 * Keys are only vaulted for signed-in accounts — Settings skips the sync for
 * Guest — so the server has nothing to authenticate with. Detect that here
 * rather than letting the request fail server-side.
 */
export function canHandOffToServer(job: Partial<BackgroundJob>, owner: string | undefined): boolean {
    if (!owner || owner === 'Guest') return false;
    if (!job.id || !job.provider) return false;
    return SUPPORTED.has(job.provider);
}

export async function handOffPollingToServer(
    job: Partial<BackgroundJob>,
    owner: string | undefined,
    options?: { fetchImpl?: typeof fetch },
): Promise<ServerPollHandoffResult> {
    if (!owner || owner === 'Guest') return { handedOff: false, reason: 'guest' };
    if (!canHandOffToServer(job, owner)) return { handedOff: false, reason: 'unsupported' };

    const doFetch = options?.fetchImpl ?? fetch;
    try {
        const response = await doFetch('/api/queue/poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: job.provider,
                taskId: job.id,
                jobType: job.type,
                stage: job.stage,
                owner,
                // Hitem3D needs this alongside the credential and it is a local
                // preference rather than a secret, so it travels with the request.
                hitemsAppId: typeof window !== 'undefined'
                    ? window.localStorage.getItem('hitems_appid') ?? undefined
                    : undefined,
                label: job.prompt
                    ? `${job.provider} · ${job.prompt.slice(0, 40)}`
                    : `${job.provider} ${job.type ?? 'task'}`,
            }),
        });

        if (!response.ok) return { handedOff: false, reason: 'error' };
        const payload = await response.json() as { job_id?: string };
        if (!payload?.job_id) return { handedOff: false, reason: 'error' };
        return { handedOff: true, queueJobId: payload.job_id };
    } catch {
        return { handedOff: false, reason: 'error' };
    }
}
