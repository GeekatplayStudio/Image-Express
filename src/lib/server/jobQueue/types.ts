/**
 * Unified server-side job queue ("Q") types.
 *
 * Modeled on Adobe Firefly Services' async job contract:
 * - jobs are accepted instantly (202) and tracked by id,
 * - a small flat status enum (`queued | running | succeeded | failed`),
 * - a durable record that survives process restarts,
 * - completion is pushed to clients (SSE) rather than polled.
 *
 * Each job also tracks a pipeline `stage` so the UI can show where a
 * request currently is: Request -> API -> Queue -> Worker -> AI ->
 * Validate -> Store -> Notify -> Retrieve.
 */

export const QUEUE_STAGES = [
    'request',
    'api',
    'queue',
    'worker',
    'ai',
    'validate',
    'store',
    'notify',
    'retrieve',
] as const;

export type QueueStage = (typeof QUEUE_STAGES)[number];

export type QueueJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * Execution lanes with independent concurrency caps. Local GPU work must
 * serialize; remote providers get a small per-provider window so one slow
 * provider cannot starve the others.
 */
export type QueueLane = 'local-gpu' | 'local-cpu' | `remote:${string}`;

export interface QueueJobRecord {
    id: string;
    /** Handler key, e.g. 'generate'. */
    kind: string;
    lane: QueueLane;
    /** True when the heavy work happens on an external API. */
    external: boolean;
    /** Short human-readable label, e.g. 'Generate (flux)'. */
    label: string;
    status: QueueJobStatus;
    stage: QueueStage;
    /** 0..1 */
    progress: number;
    message?: string;
    error?: string;
    /** Handler-specific payload; must be JSON-serializable. */
    payload: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
    priority: number;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    finishedAt?: string;
    /** Crash-recovery lease; a 'running' job whose lease expired is dead. */
    leaseUntil?: number;
    /** Stable pointer to the durable result (never deleted on read). */
    resultUrl?: string;
}

export interface QueueJobUpdate {
    status?: QueueJobStatus;
    stage?: QueueStage;
    progress?: number;
    message?: string;
    error?: string;
    resultUrl?: string;
}

/** Context handed to a job handler while it runs. */
export interface QueueHandlerContext {
    job: QueueJobRecord;
    /** Reflect pipeline position/progress; also renews the lease. */
    update: (update: QueueJobUpdate) => Promise<void>;
    /**
     * True once the user has asked this job to stop. Long-running handlers
     * check it between batches and return cleanly; the scheduler then records
     * the job as 'cancelled' rather than 'succeeded'. Optional so handler
     * tests that never stop can pass a minimal context.
     */
    stopRequested?: () => boolean;
}

export type QueueJobHandler = (context: QueueHandlerContext) => Promise<{ resultUrl?: string } | void>;

export interface EnqueueJobInput {
    kind: string;
    lane: QueueLane;
    external: boolean;
    label: string;
    payload: Record<string, unknown>;
    /** Reuse an externally-created id (e.g. the agentic-edit job id). */
    id?: string;
    priority?: number;
    maxAttempts?: number;
}

export type QueueEvent =
    | { type: 'job'; job: QueueJobRecord }
    | { type: 'snapshot'; jobs: QueueJobRecord[] };

export const TERMINAL_QUEUE_STATUSES: readonly QueueJobStatus[] = ['succeeded', 'failed', 'cancelled'];

export const isTerminalQueueStatus = (status: QueueJobStatus): boolean => (
    TERMINAL_QUEUE_STATUSES.includes(status)
);
