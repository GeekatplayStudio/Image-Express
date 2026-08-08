/**
 * In-process job scheduler — the heart of the "Q".
 *
 * Design (single-machine analogue of Adobe's Firefly job service):
 * - Admission control: jobs are enqueued, never executed inside a request
 *   handler. `202 Accepted` semantics end at `enqueue()`.
 * - Lane-based concurrency: `local-gpu` serializes (one GPU), `local-cpu`
 *   allows a few, each `remote:<provider>` gets its own small window so a
 *   slow provider cannot starve the rest.
 * - Leases: a running job holds a lease that its progress updates renew.
 *   On boot, any 'running' job from a previous process is dead by
 *   definition (single-process app) and is failed as 'interrupted' —
 *   eliminating zombie jobs that report "running" forever.
 * - Events: every mutation is pushed to subscribers (the SSE route).
 *
 * The singleton is pinned to `globalThis` so Next.js dev-mode HMR module
 * reloads do not orphan in-flight jobs or drop the queue.
 */

import crypto from 'node:crypto';

import { QueueStore } from '@/lib/server/jobQueue/store';
import type {
    EnqueueJobInput,
    QueueEvent,
    QueueJobHandler,
    QueueJobRecord,
    QueueJobUpdate,
    QueueLane,
} from '@/lib/server/jobQueue/types';
import { isTerminalQueueStatus } from '@/lib/server/jobQueue/types';

const LEASE_MS = 5 * 60 * 1000;
const DEFAULT_REMOTE_CAP = 3;

const LANE_CAPS: Record<string, number> = {
    'local-gpu': 1,
    'local-cpu': 4,
};

const laneCap = (lane: QueueLane): number => LANE_CAPS[lane] ?? DEFAULT_REMOTE_CAP;

const nowIso = () => new Date().toISOString();

type QueueListener = (event: QueueEvent) => void;

export class JobScheduler {
    private store = new QueueStore();
    private handlers = new Map<string, QueueJobHandler>();
    private listeners = new Set<QueueListener>();
    private running = new Set<string>();
    /**
     * Running jobs the user has asked to stop.
     *
     * A stop is a *request*, not a kill: the handler owns provider calls and
     * open file handles, so it checks `stopRequested()` at its own safe points
     * (between batches) and exits cleanly. In-memory only, deliberately — if
     * the process dies the job dies with it, so there is nothing to stop.
     */
    private stopRequests = new Set<string>();
    private ready: Promise<void>;
    private pumping = false;

    constructor() {
        this.ready = this.boot();
    }

    private async boot(): Promise<void> {
        await this.store.load();
        // Crash recovery: this is a single-process app, so any job persisted
        // as 'running' belonged to a dead process and can never complete.
        for (const job of this.store.list()) {
            if (job.status === 'running' || (job.status === 'queued' && !this.handlers.has(job.kind))) {
                if (job.status === 'running') {
                    this.store.upsert({
                        ...job,
                        status: 'failed',
                        error: 'interrupted',
                        message: 'Interrupted by application restart',
                        finishedAt: nowIso(),
                        updatedAt: nowIso(),
                    });
                }
            }
        }
    }

    registerHandler(kind: string, handler: QueueJobHandler): void {
        this.handlers.set(kind, handler);
    }

    subscribe(listener: QueueListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async listJobs(): Promise<QueueJobRecord[]> {
        await this.ready;
        return this.store.list();
    }

    async getJob(id: string): Promise<QueueJobRecord | undefined> {
        await this.ready;
        return this.store.get(id);
    }

    async enqueue(input: EnqueueJobInput): Promise<QueueJobRecord> {
        await this.ready;
        const createdAt = nowIso();
        const job: QueueJobRecord = {
            id: input.id || `qjob_${crypto.randomUUID()}`,
            kind: input.kind,
            lane: input.lane,
            external: input.external,
            label: input.label,
            status: 'queued',
            stage: 'queue',
            progress: 0,
            payload: input.payload,
            attempts: 0,
            maxAttempts: Math.max(1, input.maxAttempts ?? 1),
            priority: input.priority ?? 0,
            createdAt,
            updatedAt: createdAt,
        };
        this.store.upsert(job);
        this.emit({ type: 'job', job });
        queueMicrotask(() => { void this.pump(); });
        return job;
    }

    async cancel(id: string): Promise<QueueJobRecord | undefined> {
        await this.ready;
        const job = this.store.get(id);
        if (!job) return job;

        if (job.status === 'queued') {
            const cancelled: QueueJobRecord = {
                ...job,
                status: 'cancelled',
                message: 'Cancelled',
                finishedAt: nowIso(),
                updatedAt: nowIso(),
            };
            this.store.upsert(cancelled);
            this.emit({ type: 'job', job: cancelled });
            return cancelled;
        }

        // A running job is stopped cooperatively: flag it, tell the user, and
        // let the handler exit at its next safe point. Long background passes
        // (indexing, thumbnail precache) check the flag between batches.
        if (job.status === 'running') {
            this.stopRequests.add(id);
            const stopping: QueueJobRecord = {
                ...job,
                message: 'Stopping…',
                updatedAt: nowIso(),
            };
            this.store.upsert(stopping);
            this.emit({ type: 'job', job: stopping });
            return stopping;
        }

        return job;
    }

    /**
     * Re-queue a terminal job for a fresh run. Attempts reset to zero so the
     * job gets its full retry budget again. Returns undefined when the job
     * is unknown, and the unchanged record when it is not retryable.
     */
    async retry(id: string): Promise<QueueJobRecord | undefined> {
        await this.ready;
        const job = this.store.get(id);
        if (!job || !isTerminalQueueStatus(job.status) || job.status === 'succeeded') {
            return job;
        }
        const requeued: QueueJobRecord = {
            ...job,
            status: 'queued',
            stage: 'queue',
            progress: 0,
            attempts: 0,
            error: undefined,
            message: 'Queued for retry',
            startedAt: undefined,
            finishedAt: undefined,
            leaseUntil: undefined,
            updatedAt: nowIso(),
        };
        this.store.upsert(requeued);
        this.emit({ type: 'job', job: requeued });
        queueMicrotask(() => { void this.pump(); });
        return requeued;
    }

    /** Wait until all persisted mutations reach disk (used by tests). */
    flush(): Promise<void> {
        return this.store.flush();
    }

    /** Resolves when no job is queued or running (used by tests). */
    async idle(): Promise<void> {
        await this.ready;
        // Poll cheaply; the scheduler is event-driven so this is test-only.
        while (this.running.size > 0
            || this.store.list().some((job) => job.status === 'queued' && this.handlers.has(job.kind))) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }

    private emit(event: QueueEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('[jobQueue] listener failed', error);
            }
        }
    }

    private countRunningInLane(lane: QueueLane): number {
        let count = 0;
        for (const id of this.running) {
            const job = this.store.get(id);
            if (job && job.lane === lane) count += 1;
        }
        return count;
    }

    private async pump(): Promise<void> {
        await this.ready;
        if (this.pumping) return;
        this.pumping = true;
        try {
            const queued = this.store.list()
                .filter((job) => job.status === 'queued' && this.handlers.has(job.kind))
                .sort((a, b) => (b.priority - a.priority)
                    || (Date.parse(a.createdAt) - Date.parse(b.createdAt)));

            for (const job of queued) {
                if (this.countRunningInLane(job.lane) >= laneCap(job.lane)) continue;
                this.startJob(job);
            }
        } finally {
            this.pumping = false;
        }
    }

    private startJob(job: QueueJobRecord): void {
        const handler = this.handlers.get(job.kind);
        if (!handler) return;

        this.running.add(job.id);
        const startedAt = nowIso();
        const started: QueueJobRecord = {
            ...job,
            status: 'running',
            stage: 'worker',
            attempts: job.attempts + 1,
            startedAt,
            updatedAt: startedAt,
            leaseUntil: Date.now() + LEASE_MS,
            message: job.message ?? 'Started',
        };
        this.store.upsert(started);
        this.emit({ type: 'job', job: started });

        const update = async (patch: QueueJobUpdate): Promise<void> => {
            const current = this.store.get(job.id);
            if (!current || isTerminalQueueStatus(current.status)) return;
            const next: QueueJobRecord = {
                ...current,
                ...patch,
                updatedAt: nowIso(),
                leaseUntil: Date.now() + LEASE_MS,
            };
            this.store.upsert(next);
            this.emit({ type: 'job', job: next });
        };

        // 'cancelled' is recorded only when the handler *acknowledged* the
        // stop — it asked, was told yes, and returned early. A handler that
        // never checks (a generate job mid-provider-call) completes its work
        // in full, and reporting that as cancelled would hide a real result.
        let stopAcknowledged = false;
        const stopRequested = () => {
            const requested = this.stopRequests.has(job.id);
            if (requested) stopAcknowledged = true;
            return requested;
        };

        void handler({ job: started, update, stopRequested })
            .then(async (result) => {
                if (stopAcknowledged) {
                    await this.finish(job.id, { status: 'cancelled' });
                    return;
                }
                await this.finish(job.id, {
                    status: 'succeeded',
                    stage: 'retrieve',
                    progress: 1,
                    resultUrl: result?.resultUrl,
                });
            })
            .catch(async (error: unknown) => {
                const current = this.store.get(job.id);
                const message = error instanceof Error ? error.message : 'Unknown job error';
                if (current && current.attempts < current.maxAttempts) {
                    const requeued: QueueJobRecord = {
                        ...current,
                        status: 'queued',
                        stage: 'queue',
                        message: `Retrying (${current.attempts}/${current.maxAttempts}): ${message}`,
                        updatedAt: nowIso(),
                        leaseUntil: undefined,
                    };
                    this.store.upsert(requeued);
                    this.emit({ type: 'job', job: requeued });
                } else {
                    await this.finish(job.id, { status: 'failed', error: message });
                }
            })
            .finally(() => {
                this.running.delete(job.id);
                this.stopRequests.delete(job.id);
                void this.pump();
            });
    }

    private async finish(id: string, patch: QueueJobUpdate): Promise<void> {
        const current = this.store.get(id);
        if (!current) return;
        const finished: QueueJobRecord = {
            ...current,
            ...patch,
            message: patch.status === 'succeeded'
                ? 'Completed'
                : patch.status === 'cancelled'
                    ? 'Stopped'
                    : (patch.error ?? current.message),
            finishedAt: nowIso(),
            updatedAt: nowIso(),
            leaseUntil: undefined,
        };
        this.store.upsert(finished);
        this.emit({ type: 'job', job: finished });
    }
}

/**
 * Global singleton — survives HMR reloads in dev (the exact failure mode of
 * the old module-level `runtimeProviderParams` Map).
 */
const GLOBAL_KEY = '__imageExpressJobScheduler';

type SchedulerGlobal = typeof globalThis & { [GLOBAL_KEY]?: JobScheduler };

export const getJobScheduler = (): JobScheduler => {
    const scope = globalThis as SchedulerGlobal;
    if (!scope[GLOBAL_KEY]) {
        scope[GLOBAL_KEY] = new JobScheduler();
    }
    return scope[GLOBAL_KEY];
};
