import { useEffect, useRef } from 'react';
import type * as fabric from 'fabric';

import type { BackgroundJob } from '@/types';
import { materializeCompletedJob } from '@/components/Editor/backgroundJobCompletion';
import { useServerPolledJobCompletion } from '@/components/Editor/useServerPolledJobCompletion';
import {
    normalizeProviderPoll,
    providerPollHeaders,
    providerPollPath,
    type RemoteProvider,
} from '@/lib/server/jobQueue/providerPoll';

type UseBackgroundJobPollingArgs = {
    backgroundJobs: BackgroundJob[];
    setBackgroundJobs: React.Dispatch<React.SetStateAction<BackgroundJob[]>>;
    canvas: fabric.Canvas | null;
    user: string;
};

const POLL_MIN_INTERVAL_MS = 2000;
const POLL_MAX_INTERVAL_MS = 15_000;
const POLL_HIDDEN_MAX_INTERVAL_MS = 60_000;
const POLL_MAX_CONCURRENT = 3;

type PollOutcome = { status: BackgroundJob['status']; progress: number; progressed: boolean };

export function useBackgroundJobPolling({
    backgroundJobs,
    setBackgroundJobs,
    canvas,
    user,
}: UseBackgroundJobPollingArgs) {
    // Jobs the server owns are completed from the SSE stream instead. Called
    // here rather than from EditorView so background-job tracking stays a
    // single entry point: one hook to mount, one place to reason about.
    useServerPolledJobCompletion({ backgroundJobs, setBackgroundJobs, canvas, user });

    const backgroundJobsRef = useRef<BackgroundJob[]>([]);
    const pollIntervalsRef = useRef<Map<string, number>>(new Map());
    const nextDueRef = useRef<Map<string, number>>(new Map());
    const checkJobStatusRef = useRef<((job: BackgroundJob) => Promise<PollOutcome | undefined>) | null>(null);
    const wakeSchedulerRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        backgroundJobsRef.current = backgroundJobs;
    }, [backgroundJobs]);

    useEffect(() => {
        // Jobs the server took over are polled there, so this tab must not
        // duplicate the work — two pollers would double the provider's rate
        // limit consumption and race each other on the Meshy refine handoff.
        // Guests, and any job whose handoff failed, keep polling here.
        const activeJobs = backgroundJobs.filter((job) => (
            (job.status === 'PENDING' || job.status === 'IN_PROGRESS') && !job.queueJobId
        ));
        if (activeJobs.length === 0) return;

        const checkJobStatus = async (job: BackgroundJob): Promise<PollOutcome | undefined> => {
            if (!job.id) return;
            if (!job.apiKey) {
                const updatedJob: BackgroundJob = {
                    ...job,
                    status: 'FAILED',
                    error: 'Missing API key for job polling. Re-enter key in Settings and recover this job ID.',
                };
                setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));
                return { status: 'FAILED', progress: job.progress || 0, progressed: false };
            }
            try {
                const previousProgress = job.progress || 0;
                const provider = (job.provider || 'meshy') as RemoteProvider;
                const headers = providerPollHeaders(provider, job.apiKey, {
                    hitemsAppId: typeof window !== 'undefined' ? localStorage.getItem('hitems_appid') : null,
                });

                const res = await fetch(providerPollPath(provider, job.id, job.type), { headers });
                if (!res.ok) {
                    // Stability's poll endpoint has no body worth reading on a
                    // transient error; the others report a reason.
                    if (provider === 'stability') return;
                    const payload = await res.json().catch(() => null) as
                        | { message?: string; msg?: string; detail?: string; error?: string }
                        | null;
                    const text = payload?.message || payload?.msg || payload?.detail || payload?.error
                        || res.statusText || 'No details returned.';
                    const failed: BackgroundJob = {
                        ...job,
                        status: 'FAILED',
                        error: `${provider} poll failed (${res.status}). ${text}`.trim(),
                        progress: previousProgress,
                    };
                    setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? failed : p)));
                    return { status: 'FAILED', progress: previousProgress, progressed: false };
                }

                const outcome = normalizeProviderPoll(provider, await res.json(), {
                    previousProgress,
                    jobType: job.type,
                    stage: job.stage,
                });

                let status: BackgroundJob['status'] = outcome.status;
                const progress = outcome.progress;
                const resultUrl = outcome.resultUrl ?? job.resultUrl;
                const thumbnailUrl = outcome.thumbnailUrl ?? job.thumbnailUrl;
                const errorDetail = outcome.error ?? job.error;

                // A finished Meshy *preview* is not a finished job: resubmit for
                // texture refinement and keep polling the new task id it returns.
                if (outcome.needsMeshyRefine) {
                    try {
                        const refineRes = await fetch('/api/ai/meshy?endpoint=text-to-3d', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${job.apiKey}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                mode: 'refine',
                                preview_task_id: job.id,
                                enable_pbr: true,
                                ai_model: 'meshy-4',
                            }),
                        });
                        const refineJson = await refineRes.json();
                        const refineId = refineJson.result;
                        if (refineId) {
                            const refining: BackgroundJob = {
                                ...job,
                                id: refineId,
                                stage: 'refining',
                                status: 'IN_PROGRESS',
                                progress: 0,
                            };
                            setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? refining : p)));
                            return;
                        }
                        console.error('Refine failed to start:', refineJson);
                    } catch (error) {
                        console.error('Refine launch error', error);
                    }
                    // Refinement could not start — keep the preview result rather
                    // than losing the model entirely.
                    status = 'SUCCEEDED';
                }

                if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED') {
                    await materializeCompletedJob({
                        job,
                        outcome: { status, progress, resultUrl, thumbnailUrl, error: errorDetail },
                        canvas,
                        user,
                        setBackgroundJobs,
                    });
                } else if (progress !== job.progress || status !== job.status) {
                    setBackgroundJobs((prev) =>
                        prev.map((p) => (p.id === job.id ? { ...p, progress, status, error: status === 'IN_PROGRESS' ? undefined : p.error } : p))
                    );
                }
                return { status, progress, progressed: progress > previousProgress };
            } catch (error) {
                const reason = error instanceof Error ? error.message : 'Unexpected polling error.';
                const updatedJob: BackgroundJob = { ...job, status: 'FAILED', error: reason, progress: job.progress };
                setBackgroundJobs((prev) => prev.map((p) => (p.id === job.id ? updatedJob : p)));
                return { status: 'FAILED', progress: job.progress || 0, progressed: false };
            }
        };

        // Expose the freshest checkJobStatus (it closes over canvas/user) to
        // the singleton scheduler below.
        checkJobStatusRef.current = checkJobStatus;

        // Register jobs that need polling; the scheduler picks them up on its
        // next wake. New jobs get an immediate first check.
        const now = Date.now();
        for (const job of activeJobs) {
            if (!nextDueRef.current.has(job.id)) {
                nextDueRef.current.set(job.id, now);
                pollIntervalsRef.current.set(job.id, POLL_MIN_INTERVAL_MS);
            }
        }
        // Drop finished/removed jobs from the schedule.
        for (const id of Array.from(nextDueRef.current.keys())) {
            const job = backgroundJobsRef.current.find((entry) => entry.id === id);
            if (!job || (job.status !== 'PENDING' && job.status !== 'IN_PROGRESS')) {
                nextDueRef.current.delete(id);
                pollIntervalsRef.current.delete(id);
            }
        }
        wakeSchedulerRef.current?.();
    }, [backgroundJobs, canvas, user, setBackgroundJobs]);

    /**
     * Singleton scheduler — one timer for ALL jobs instead of a timer chain
     * per job. Behaves like a small worker pool:
     * - at most POLL_MAX_CONCURRENT status requests in flight at once, so ten
     *   queued generations don't fire ten simultaneous requests;
     * - per-job exponential backoff with jitter (fast again on real progress),
     *   so providers aren't hammered in lockstep;
     * - when the tab is hidden, intervals stretch to the background cap and
     *   snap back on return, so an idle tab stops spamming.
     */
    useEffect(() => {
        let disposed = false;
        let timer: number | null = null;
        const inFlight = new Set<string>();

        const jitter = (ms: number) => ms * (0.85 + Math.random() * 0.3);

        const runDueJobs = async () => {
            const now = Date.now();
            const due: string[] = [];
            for (const [id, dueAt] of nextDueRef.current) {
                if (dueAt <= now && !inFlight.has(id)) due.push(id);
            }
            // Oldest-due first: round-robin fairness across providers/jobs.
            due.sort((a, b) => (nextDueRef.current.get(a) ?? 0) - (nextDueRef.current.get(b) ?? 0));

            for (const id of due.slice(0, Math.max(0, POLL_MAX_CONCURRENT - inFlight.size))) {
                const job = backgroundJobsRef.current.find((entry) => entry.id === id);
                if (!job || (job.status !== 'PENDING' && job.status !== 'IN_PROGRESS')) {
                    nextDueRef.current.delete(id);
                    pollIntervalsRef.current.delete(id);
                    continue;
                }
                inFlight.add(id);
                void (async () => {
                    try {
                        const result = await checkJobStatusRef.current?.(job);
                        // undefined means a transient failure (e.g. a non-ok
                        // poll response that didn't fail the job) — keep
                        // polling with backoff rather than abandoning the job.
                        const stillActive = !result
                            || result.status === 'PENDING'
                            || result.status === 'IN_PROGRESS';
                        if (!stillActive) {
                            nextDueRef.current.delete(id);
                            pollIntervalsRef.current.delete(id);
                            return;
                        }
                        const prev = pollIntervalsRef.current.get(id) ?? POLL_MIN_INTERVAL_MS;
                        const hidden = typeof document !== 'undefined' && document.hidden;
                        const cap = hidden ? POLL_HIDDEN_MAX_INTERVAL_MS : POLL_MAX_INTERVAL_MS;
                        const next = result?.progressed
                            ? POLL_MIN_INTERVAL_MS
                            : Math.min(prev * 1.5, cap);
                        pollIntervalsRef.current.set(id, next);
                        nextDueRef.current.set(id, Date.now() + jitter(next));
                    } finally {
                        inFlight.delete(id);
                        schedule();
                    }
                })();
            }
        };

        const schedule = () => {
            if (disposed) return;
            if (timer !== null) {
                window.clearTimeout(timer);
                timer = null;
            }
            if (nextDueRef.current.size === 0) return;

            // Every worker is busy. A job's `nextDue` only moves forward once
            // its request settles, so arming a timer now would compute a
            // negative delay, fire immediately, dispatch nothing (the pool is
            // full), and re-arm at 0ms — a tight CPU spin for the whole poll
            // cycle. Each in-flight job calls schedule() from its `finally`,
            // so doing nothing here is both correct and self-healing.
            if (inFlight.size >= POLL_MAX_CONCURRENT) return;

            const now = Date.now();
            let earliest = Number.POSITIVE_INFINITY;
            for (const [id, dueAt] of nextDueRef.current) {
                // Same reason: an in-flight job's due time is stale until it
                // settles, and it reschedules itself when it does.
                if (inFlight.has(id)) continue;
                if (dueAt < earliest) earliest = dueAt;
            }
            if (earliest === Number.POSITIVE_INFINITY) return;

            timer = window.setTimeout(() => {
                timer = null;
                void runDueJobs();
                schedule();
            }, Math.max(0, Math.min(earliest - now, POLL_MAX_INTERVAL_MS)));
        };

        // Coming back to the tab: forget the stretched background intervals and
        // check everything promptly.
        const onVisible = () => {
            if (document.hidden) return;
            const now = Date.now();
            for (const id of nextDueRef.current.keys()) {
                pollIntervalsRef.current.set(id, POLL_MIN_INTERVAL_MS);
                nextDueRef.current.set(id, now);
            }
            schedule();
        };

        wakeSchedulerRef.current = schedule;
        document.addEventListener('visibilitychange', onVisible);
        schedule();

        return () => {
            disposed = true;
            wakeSchedulerRef.current = null;
            document.removeEventListener('visibilitychange', onVisible);
            if (timer !== null) window.clearTimeout(timer);
        };
    }, []);
}
