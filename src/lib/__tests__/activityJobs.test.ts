import {
    activityJobActions,
    activityJobSeconds,
    countActivityJobs,
    filterActivityJobs,
    formatActivityDuration,
    sortActivityJobs,
    upsertActivityJob,
} from '@/lib/activityJobs';
import type { QueueJobRecord } from '@/lib/server/jobQueue/types';

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, seconds)).toISOString();

const job = (id: string, over: Partial<QueueJobRecord> = {}): QueueJobRecord => ({
    id,
    kind: 'generate',
    lane: 'local-gpu',
    external: false,
    label: id,
    status: 'queued',
    stage: 'queue',
    progress: 0,
    payload: {},
    attempts: 0,
    maxAttempts: 1,
    priority: 0,
    createdAt: at(0),
    updatedAt: at(0),
    ...over,
});

const ids = (jobs: QueueJobRecord[]) => jobs.map((entry) => entry.id);

describe('sortActivityJobs', () => {
    it('puts running first, then the queue, then history', () => {
        const sorted = sortActivityJobs([
            job('done', { status: 'succeeded', finishedAt: at(5) }),
            job('waiting'),
            job('running', { status: 'running', startedAt: at(1) }),
        ]);
        expect(ids(sorted)).toEqual(['running', 'waiting', 'done']);
    });

    it('lists the queue in the order the scheduler will run it', () => {
        // Priority first, arrival second — the scheduler's own rule.
        const sorted = sortActivityJobs([
            job('early', { createdAt: at(1) }),
            job('late', { createdAt: at(9) }),
            job('bumped', { createdAt: at(20), priority: 1 }),
        ]);
        expect(ids(sorted)).toEqual(['bumped', 'early', 'late']);
    });

    it('shows history newest first', () => {
        const sorted = sortActivityJobs([
            job('old', { status: 'succeeded', finishedAt: at(10) }),
            job('new', { status: 'failed', finishedAt: at(40) }),
            job('mid', { status: 'cancelled', finishedAt: at(25) }),
        ]);
        expect(ids(sorted)).toEqual(['new', 'mid', 'old']);
    });

    it('does not mutate its input', () => {
        const input = [job('b', { status: 'succeeded' }), job('a')];
        sortActivityJobs(input);
        expect(ids(input)).toEqual(['b', 'a']);
    });
});

describe('filterActivityJobs and countActivityJobs', () => {
    const jobs = [
        job('q'),
        job('r', { status: 'running' }),
        job('ok', { status: 'succeeded' }),
        job('bad', { status: 'failed' }),
        job('stopped', { status: 'cancelled' }),
    ];

    it('filters by what the user is looking for', () => {
        expect(ids(filterActivityJobs(jobs, 'all'))).toHaveLength(5);
        expect(ids(filterActivityJobs(jobs, 'active'))).toEqual(['q', 'r']);
        expect(ids(filterActivityJobs(jobs, 'done'))).toEqual(['ok']);
        // Cancelled sits with failed: both are retryable.
        expect(ids(filterActivityJobs(jobs, 'failed'))).toEqual(['bad', 'stopped']);
    });

    it('counts every job exactly once', () => {
        const counts = countActivityJobs(jobs);
        expect(counts).toEqual({ running: 1, queued: 1, done: 1, failed: 2 });
        expect(counts.running + counts.queued + counts.done + counts.failed).toBe(jobs.length);
    });
});

describe('activityJobActions', () => {
    it('lets a waiting or running job be cancelled, and nothing else', () => {
        expect(activityJobActions(job('q'), []).cancel).toBe(true);
        expect(activityJobActions(job('r', { status: 'running' }), []).cancel).toBe(true);
        expect(activityJobActions(job('ok', { status: 'succeeded' }), []).cancel).toBe(false);
    });

    it('offers retry for failed and cancelled jobs but not successes', () => {
        expect(activityJobActions(job('bad', { status: 'failed' }), []).retry).toBe(true);
        expect(activityJobActions(job('stopped', { status: 'cancelled' }), []).retry).toBe(true);
        expect(activityJobActions(job('ok', { status: 'succeeded' }), []).retry).toBe(false);
        expect(activityJobActions(job('q'), []).retry).toBe(false);
    });

    it('offers "run next" only when another waiting job in the lane is ahead', () => {
        const first = job('first', { createdAt: at(1) });
        const second = job('second', { createdAt: at(2) });
        const all = [first, second];
        expect(activityJobActions(second, all).prioritize).toBe(true);
        // Already first: the button would do nothing, so it is not shown.
        expect(activityJobActions(first, all).prioritize).toBe(false);
    });

    it('ignores other lanes and jobs that are not waiting', () => {
        const mine = job('mine', { createdAt: at(5), lane: 'local-gpu' });
        const otherLane = job('other', { createdAt: at(1), lane: 'remote:meshy' });
        const running = job('running', { createdAt: at(1), status: 'running' });
        expect(activityJobActions(mine, [mine, otherLane, running]).prioritize).toBe(false);
    });

    it('treats a job already bumped above the rest as first', () => {
        const bumped = job('bumped', { createdAt: at(9), priority: 1 });
        const earlier = job('earlier', { createdAt: at(1) });
        expect(activityJobActions(bumped, [bumped, earlier]).prioritize).toBe(false);
        expect(activityJobActions(earlier, [bumped, earlier]).prioritize).toBe(true);
    });
});

describe('durations', () => {
    it('measures a finished job from start to finish, not to now', () => {
        const finished = job('ok', { status: 'succeeded', startedAt: at(10), finishedAt: at(52) });
        expect(activityJobSeconds(finished, Date.parse(at(59)) + 3_600_000)).toBe(42);
    });

    it('measures a running job up to now, and a waiting one from when it was queued', () => {
        expect(activityJobSeconds(job('r', { status: 'running', startedAt: at(10) }), Date.parse(at(25)))).toBe(15);
        expect(activityJobSeconds(job('q', { createdAt: at(0) }), Date.parse(at(7)))).toBe(7);
    });

    it('never reports a negative duration', () => {
        expect(activityJobSeconds(job('r', { status: 'running', startedAt: at(30) }), Date.parse(at(10)))).toBe(0);
    });

    it('formats compactly at each scale', () => {
        expect(formatActivityDuration(0)).toBe('0s');
        expect(formatActivityDuration(42)).toBe('42s');
        expect(formatActivityDuration(185)).toBe('3m 05s');
        expect(formatActivityDuration(3600 + 12 * 60)).toBe('1h 12m');
        expect(formatActivityDuration(-5)).toBe('0s');
    });
});

describe('upsertActivityJob', () => {
    it('replaces a job in place and appends an unknown one', () => {
        const start = [job('a'), job('b')];
        const updated = upsertActivityJob(start, job('a', { status: 'running' }));
        expect(updated.map((entry) => `${entry.id}:${entry.status}`)).toEqual(['a:running', 'b:queued']);
        expect(ids(upsertActivityJob(start, job('c')))).toEqual(['a', 'b', 'c']);
        // The original list is left alone, as React state requires.
        expect(start[0].status).toBe('queued');
    });
});
