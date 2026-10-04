/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { JobScheduler } from '@/lib/server/jobQueue/scheduler';
import type { QueueEvent, QueueJobRecord } from '@/lib/server/jobQueue/types';

const ORIGINAL_DATA_DIR = process.env.IMAGE_EXPRESS_DATA_DIR;

let tempDir: string;
let schedulers: JobScheduler[] = [];

/**
 * Every scheduler built through this helper is flushed before teardown, so
 * no queued write can outlive the temp data dir it belongs to.
 */
const createScheduler = (): JobScheduler => {
    const scheduler = new JobScheduler();
    schedulers.push(scheduler);
    return scheduler;
};

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iq-queue-test-'));
    process.env.IMAGE_EXPRESS_DATA_DIR = tempDir;
    schedulers = [];
});

afterEach(async () => {
    await Promise.all(schedulers.map((scheduler) => scheduler.flush()));
    if (ORIGINAL_DATA_DIR === undefined) {
        delete process.env.IMAGE_EXPRESS_DATA_DIR;
    } else {
        process.env.IMAGE_EXPRESS_DATA_DIR = ORIGINAL_DATA_DIR;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
});

const queueFilePath = () => path.join(tempDir, 'queue', 'jobs.json');

const readQueueFile = async (): Promise<{ jobs: QueueJobRecord[] }> => (
    JSON.parse(await fs.readFile(queueFilePath(), 'utf-8'))
);

const flushAll = async (scheduler: JobScheduler) => {
    await scheduler.idle();
    await scheduler.flush();
};

// Queue controls surfaced by the Activity panel: moving a waiting job to the
// front and clearing the history.
describe('JobScheduler controls', () => {
    test('a prioritized job runs before jobs queued ahead of it', async () => {
        const scheduler = createScheduler();
        const order: string[] = [];
        let releaseFirst: () => void;
        const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });

        scheduler.registerHandler('gpu', async ({ job }) => {
            order.push(job.label);
            if (job.label === 'first') await firstHeld;
        });
        const enqueue = (label: string) => scheduler.enqueue({
            kind: 'gpu', lane: 'local-gpu', external: false, label, payload: {},
        });

        // local-gpu runs one at a time, so 'first' holds the lane while the
        // other three wait in arrival order.
        await enqueue('first');
        await enqueue('second');
        await enqueue('third');
        const last = await enqueue('fourth');
        await new Promise((resolve) => setTimeout(resolve, 20));

        const moved = await scheduler.prioritize(last.id);
        expect(moved?.priority).toBeGreaterThan(0);

        releaseFirst!();
        await flushAll(scheduler);
        expect(order).toEqual(['first', 'fourth', 'second', 'third']);
    });

    test('prioritizing twice, or a job already at the front, does not keep raising it', async () => {
        const scheduler = createScheduler();
        const enqueue = (label: string) => scheduler.enqueue({
            kind: 'never-runs', lane: 'local-cpu', external: false, label, payload: {},
        });
        await enqueue('a');
        const b = await enqueue('b');

        const once = await scheduler.prioritize(b.id);
        const twice = await scheduler.prioritize(b.id);
        expect(twice?.priority).toBe(once?.priority);
    });

    test('only a waiting job can be prioritized', async () => {
        const scheduler = createScheduler();
        scheduler.registerHandler('quick', async () => {});
        const job = await scheduler.enqueue({
            kind: 'quick', lane: 'local-cpu', external: false, label: 'done', payload: {},
        });
        await flushAll(scheduler);

        const result = await scheduler.prioritize(job.id);
        expect(result?.status).toBe('succeeded');
        expect(result?.priority).toBe(0);
        await expect(scheduler.prioritize('missing')).resolves.toBeUndefined();
    });

    test('clearing history removes finished jobs, keeps waiting ones, and resyncs subscribers', async () => {
        const scheduler = createScheduler();
        scheduler.registerHandler('quick', async () => {});
        scheduler.registerHandler('boom', async () => { throw new Error('nope'); });
        const base = { lane: 'local-cpu' as const, external: false, payload: {} };
        await scheduler.enqueue({ ...base, kind: 'quick', label: 'ok' });
        await scheduler.enqueue({ ...base, kind: 'boom', label: 'bad' });
        const waiting = await scheduler.enqueue({ ...base, kind: 'never-runs', label: 'waiting' });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const events: QueueEvent[] = [];
        scheduler.subscribe((event) => events.push(event));

        expect(await scheduler.clearFinished()).toBe(2);
        expect((await scheduler.listJobs()).map((job) => job.id)).toEqual([waiting.id]);

        const snapshot = events.find((event) => event.type === 'snapshot');
        expect(snapshot?.type === 'snapshot' && snapshot.jobs.map((job) => job.label)).toEqual(['waiting']);

        // Nothing left to clear: no write, no event.
        events.length = 0;
        expect(await scheduler.clearFinished()).toBe(0);
        expect(events).toEqual([]);

        await scheduler.flush();
        expect((await readQueueFile()).jobs.map((job) => job.label)).toEqual(['waiting']);
    });
});
