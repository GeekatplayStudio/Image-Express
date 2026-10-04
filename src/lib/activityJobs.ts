import type { QueueJobRecord } from '@/lib/server/jobQueue/types';

/**
 * The model behind the Activity panel: how queue jobs are ordered, filtered,
 * counted and described. Pure, so the panel is a thin renderer over it.
 */

export const OPEN_ACTIVITY_PANEL_EVENT = 'image-express:open-activity';

export type ActivityFilter = 'all' | 'active' | 'failed' | 'done';

export interface ActivityCounts {
    running: number;
    queued: number;
    failed: number;
    done: number;
}

const isFinished = (job: QueueJobRecord) => job.status !== 'queued' && job.status !== 'running';

const time = (iso: string | undefined) => {
    const value = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(value) ? value : 0;
};

/**
 * Running first, then the queue in the order it will actually run, then
 * history newest first.
 *
 * The queued order mirrors the scheduler's own rule — priority, then arrival —
 * so the list never promises an order the server will not keep.
 */
export function sortActivityJobs(jobs: readonly QueueJobRecord[]): QueueJobRecord[] {
    const rank = (job: QueueJobRecord) => (job.status === 'running' ? 0 : job.status === 'queued' ? 1 : 2);
    return [...jobs].sort((a, b) => {
        const byRank = rank(a) - rank(b);
        if (byRank !== 0) return byRank;
        if (a.status === 'queued' && b.status === 'queued') {
            return (b.priority - a.priority) || (time(a.createdAt) - time(b.createdAt));
        }
        if (a.status === 'running' && b.status === 'running') {
            return time(a.startedAt ?? a.createdAt) - time(b.startedAt ?? b.createdAt);
        }
        return time(b.finishedAt ?? b.updatedAt) - time(a.finishedAt ?? a.updatedAt);
    });
}

export function filterActivityJobs(jobs: readonly QueueJobRecord[], filter: ActivityFilter): QueueJobRecord[] {
    switch (filter) {
        case 'active':
            return jobs.filter((job) => !isFinished(job));
        case 'failed':
            // A cancelled job is here too: like a failure, it can be retried.
            return jobs.filter((job) => job.status === 'failed' || job.status === 'cancelled');
        case 'done':
            return jobs.filter((job) => job.status === 'succeeded');
        default:
            return [...jobs];
    }
}

export function countActivityJobs(jobs: readonly QueueJobRecord[]): ActivityCounts {
    const counts: ActivityCounts = { running: 0, queued: 0, failed: 0, done: 0 };
    for (const job of jobs) {
        if (job.status === 'running') counts.running += 1;
        else if (job.status === 'queued') counts.queued += 1;
        else if (job.status === 'succeeded') counts.done += 1;
        else counts.failed += 1;
    }
    return counts;
}

export interface ActivityJobActions {
    /** Stop a waiting or running job. */
    cancel: boolean;
    /** Run a failed or cancelled job again. */
    retry: boolean;
    /** Move a waiting job to the front of its lane. */
    prioritize: boolean;
}

/**
 * What the user may do with a job right now.
 *
 * "Run next" is offered only when it would change something: the job must be
 * waiting, and another waiting job in the same lane must be ahead of it.
 */
export function activityJobActions(job: QueueJobRecord, all: readonly QueueJobRecord[]): ActivityJobActions {
    const cancel = job.status === 'queued' || job.status === 'running';
    const retry = job.status === 'failed' || job.status === 'cancelled';
    const prioritize = job.status === 'queued' && all.some((other) => (
        other.id !== job.id
        && other.status === 'queued'
        && other.lane === job.lane
        && (other.priority > job.priority
            || (other.priority === job.priority && time(other.createdAt) < time(job.createdAt)))
    ));
    return { cancel, retry, prioritize };
}

/** How long the job ran, or has been running or waiting, in whole seconds. */
export function activityJobSeconds(job: QueueJobRecord, now: number): number {
    const start = time(job.startedAt ?? job.createdAt);
    const end = isFinished(job) ? time(job.finishedAt ?? job.updatedAt) : now;
    return Math.max(0, Math.round((end - start) / 1000));
}

/** `42s`, `3m 05s`, `1h 12m` — compact enough for a table column. */
export function formatActivityDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Merge one job event into a list, replacing the record with the same id. */
export function upsertActivityJob(jobs: readonly QueueJobRecord[], job: QueueJobRecord): QueueJobRecord[] {
    const index = jobs.findIndex((entry) => entry.id === job.id);
    if (index < 0) return [...jobs, job];
    const next = [...jobs];
    next[index] = job;
    return next;
}
