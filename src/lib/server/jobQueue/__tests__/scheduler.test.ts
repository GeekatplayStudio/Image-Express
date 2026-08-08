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

describe('JobScheduler', () => {
    test('a running job can be asked to stop and finishes as cancelled', async () => {
        // The vault indexing service runs passes that take minutes; without
        // cooperative stop, the Stop button could only cancel passes that had
        // not started yet, which reads as a button that does nothing.
        const scheduler = createScheduler();
        let sawStopRequest = false;
        let release: () => void;
        const started = new Promise<void>((resolve) => { release = resolve; });

        scheduler.registerHandler('long', async ({ update, stopRequested }) => {
            release();
            // Simulate batch boundaries: poll the flag until it flips.
            for (let i = 0; i < 200; i += 1) {
                if (stopRequested?.()) { sawStopRequest = true; return; }
                await update({ progress: i / 200 });
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
        });

        const job = await scheduler.enqueue({
            kind: 'long',
            lane: 'local-cpu',
            external: false,
            label: 'Long pass',
            payload: {},
        });
        await started;
        const stopping = await scheduler.cancel(job.id);
        // The record reflects the request immediately, so the UI can say
        // "Stopping..." rather than appearing to ignore the click.
        expect(stopping?.status).toBe('running');
        expect(stopping?.message).toBe('Stopping…');

        await flushAll(scheduler);
        const final = (await readQueueFile()).jobs.find((entry) => entry.id === job.id);
        expect(sawStopRequest).toBe(true);
        expect(final?.status).toBe('cancelled');
        // A pass cut short must not report success: 'Completed' would claim
        // coverage the run never achieved.
        expect(final?.message).toBe('Stopped');
    });

    test('a stop request on a queued job still cancels it outright', async () => {
        const scheduler = createScheduler();
        // No handler registered, so the job can never start.
        const job = await scheduler.enqueue({
            kind: 'never-runs',
            lane: 'local-cpu',
            external: false,
            label: 'Queued only',
            payload: {},
        });
        const cancelled = await scheduler.cancel(job.id);
        expect(cancelled?.status).toBe('cancelled');
    });

    test('runs an enqueued job to success and persists the terminal record', async () => {
        const scheduler = createScheduler();
        scheduler.registerHandler('demo', async ({ update }) => {
            await update({ stage: 'ai', progress: 0.5, message: 'halfway' });
            return { resultUrl: '/results/demo.png' };
        });

        const job = await scheduler.enqueue({
            kind: 'demo',
            lane: 'local-cpu',
            external: false,
            label: 'Demo job',
            payload: {},
        });
        await flushAll(scheduler);

        const finished = await scheduler.getJob(job.id);
        expect(finished?.status).toBe('succeeded');
        expect(finished?.stage).toBe('retrieve');
        expect(finished?.progress).toBe(1);
        expect(finished?.resultUrl).toBe('/results/demo.png');

        const persisted = await readQueueFile();
        expect(persisted.jobs.find((entry) => entry.id === job.id)?.status).toBe('succeeded');
    });

    test('serializes the local-gpu lane to one concurrent job', async () => {
        const scheduler = createScheduler();
        let running = 0;
        let peak = 0;
        scheduler.registerHandler('gpu', async () => {
            running += 1;
            peak = Math.max(peak, running);
            await new Promise((resolve) => setTimeout(resolve, 30));
            running -= 1;
        });

        await Promise.all(Array.from({ length: 4 }, (_, index) => scheduler.enqueue({
            kind: 'gpu',
            lane: 'local-gpu',
            external: false,
            label: `GPU job ${index}`,
            payload: {},
        })));
        await flushAll(scheduler);

        expect(peak).toBe(1);
    });

    test('caps a remote lane at three concurrent jobs without starving another lane', async () => {
        const scheduler = createScheduler();
        let remoteRunning = 0;
        let remotePeak = 0;
        let otherLaneRan = false;

        scheduler.registerHandler('remote', async () => {
            remoteRunning += 1;
            remotePeak = Math.max(remotePeak, remoteRunning);
            await new Promise((resolve) => setTimeout(resolve, 40));
            remoteRunning -= 1;
        });
        scheduler.registerHandler('cpu', async () => {
            otherLaneRan = true;
        });

        await Promise.all([
            ...Array.from({ length: 6 }, (_, index) => scheduler.enqueue({
                kind: 'remote',
                lane: 'remote:stability',
                external: true,
                label: `Remote ${index}`,
                payload: {},
            })),
            scheduler.enqueue({
                kind: 'cpu',
                lane: 'local-cpu',
                external: false,
                label: 'CPU job',
                payload: {},
            }),
        ]);
        await flushAll(scheduler);

        expect(remotePeak).toBeLessThanOrEqual(3);
        expect(remotePeak).toBeGreaterThan(1);
        expect(otherLaneRan).toBe(true);
    });

    test('fails a job whose handler throws, keeping the error message', async () => {
        const scheduler = createScheduler();
        scheduler.registerHandler('boom', async () => {
            throw new Error('provider exploded');
        });

        const job = await scheduler.enqueue({
            kind: 'boom',
            lane: 'local-cpu',
            external: false,
            label: 'Boom',
            payload: {},
        });
        await flushAll(scheduler);

        const finished = await scheduler.getJob(job.id);
        expect(finished?.status).toBe('failed');
        expect(finished?.error).toBe('provider exploded');
    });

    test('retries up to maxAttempts and succeeds on the second attempt', async () => {
        const scheduler = createScheduler();
        let attempts = 0;
        scheduler.registerHandler('flaky', async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('transient');
        });

        const job = await scheduler.enqueue({
            kind: 'flaky',
            lane: 'local-cpu',
            external: false,
            label: 'Flaky',
            payload: {},
            maxAttempts: 2,
        });
        await flushAll(scheduler);

        expect(attempts).toBe(2);
        expect((await scheduler.getJob(job.id))?.status).toBe('succeeded');
    });

    test('recovers zombie running jobs from a previous process as failed/interrupted', async () => {
        const zombie: QueueJobRecord = {
            id: 'qjob_zombie',
            kind: 'demo',
            lane: 'local-cpu',
            external: false,
            label: 'Zombie',
            status: 'running',
            stage: 'ai',
            progress: 0.5,
            payload: {},
            attempts: 1,
            maxAttempts: 1,
            priority: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            leaseUntil: Date.now() - 60_000,
        };
        await fs.mkdir(path.dirname(queueFilePath()), { recursive: true });
        await fs.writeFile(queueFilePath(), JSON.stringify({ schemaVersion: 1, jobs: [zombie] }), 'utf-8');

        const scheduler = createScheduler();
        const recovered = await scheduler.getJob('qjob_zombie');
        expect(recovered?.status).toBe('failed');
        expect(recovered?.error).toBe('interrupted');
    });

    test('emits events for every lifecycle transition', async () => {
        const scheduler = createScheduler();
        scheduler.registerHandler('demo', async ({ update }) => {
            await update({ stage: 'ai', progress: 0.5 });
        });

        const events: QueueEvent[] = [];
        const unsubscribe = scheduler.subscribe((event) => events.push(event));

        const job = await scheduler.enqueue({
            kind: 'demo',
            lane: 'local-cpu',
            external: false,
            label: 'Demo',
            payload: {},
        });
        await flushAll(scheduler);
        unsubscribe();

        const statuses = events
            .filter((event): event is Extract<QueueEvent, { type: 'job' }> => event.type === 'job')
            .filter((event) => event.job.id === job.id)
            .map((event) => event.job.status);
        expect(statuses[0]).toBe('queued');
        expect(statuses).toContain('running');
        expect(statuses[statuses.length - 1]).toBe('succeeded');
    });

    test('cancels a queued job before any handler exists to run it', async () => {
        const scheduler = createScheduler();
        // No handler registered for 'later' — the job stays queued.
        const job = await scheduler.enqueue({
            kind: 'later',
            lane: 'local-cpu',
            external: false,
            label: 'Waiting',
            payload: {},
        });

        const cancelled = await scheduler.cancel(job.id);
        expect(cancelled?.status).toBe('cancelled');
        // Flush inside the test so the write lands in the temp data dir,
        // not wherever IMAGE_EXPRESS_DATA_DIR points after env restore.
        await scheduler.flush();
    });

    test('retries a failed job with a fresh attempt budget and runs it again', async () => {
        const scheduler = createScheduler();
        let shouldFail = true;
        let runs = 0;
        scheduler.registerHandler('retryable', async () => {
            runs += 1;
            if (shouldFail) throw new Error('first run failed');
        });

        const job = await scheduler.enqueue({
            kind: 'retryable',
            lane: 'local-cpu',
            external: false,
            label: 'Retryable',
            payload: {},
        });
        await flushAll(scheduler);
        expect((await scheduler.getJob(job.id))?.status).toBe('failed');

        shouldFail = false;
        const requeued = await scheduler.retry(job.id);
        expect(requeued?.status).toBe('queued');
        expect(requeued?.attempts).toBe(0);
        expect(requeued?.error).toBeUndefined();

        await flushAll(scheduler);
        expect(runs).toBe(2);
        expect((await scheduler.getJob(job.id))?.status).toBe('succeeded');
    });

    test('refuses to retry a succeeded job', async () => {
        const scheduler = createScheduler();
        scheduler.registerHandler('ok', async () => undefined);

        const job = await scheduler.enqueue({
            kind: 'ok',
            lane: 'local-cpu',
            external: false,
            label: 'Fine',
            payload: {},
        });
        await flushAll(scheduler);

        const result = await scheduler.retry(job.id);
        expect(result?.status).toBe('succeeded');
    });

    test('retries a cancelled job back into the queue', async () => {
        const scheduler = createScheduler();
        const job = await scheduler.enqueue({
            kind: 'unregistered',
            lane: 'local-cpu',
            external: false,
            label: 'Cancelled then retried',
            payload: {},
        });
        await scheduler.cancel(job.id);

        const requeued = await scheduler.retry(job.id);
        expect(requeued?.status).toBe('queued');
        await scheduler.flush();
    });

    test('does not cancel a job that is already running', async () => {
        const scheduler = createScheduler();
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        scheduler.registerHandler('slow', async () => { await gate; });

        const job = await scheduler.enqueue({
            kind: 'slow',
            lane: 'local-cpu',
            external: false,
            label: 'Slow',
            payload: {},
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect((await scheduler.getJob(job.id))?.status).toBe('running');

        const attempted = await scheduler.cancel(job.id);
        expect(attempted?.status).toBe('running');

        release();
        await flushAll(scheduler);
        expect((await scheduler.getJob(job.id))?.status).toBe('succeeded');
    });

    test('respects priority then FIFO within a serialized lane', async () => {
        const scheduler = createScheduler();
        const order: string[] = [];
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => { release = resolve; });

        scheduler.registerHandler('ordered', async ({ job }) => {
            if (job.label === 'blocker') {
                await gate;
                return;
            }
            order.push(job.label);
        });

        // Occupy the lane so subsequent jobs queue up behind it.
        await scheduler.enqueue({ kind: 'ordered', lane: 'local-gpu', external: false, label: 'blocker', payload: {} });
        await new Promise((resolve) => setTimeout(resolve, 20));
        await scheduler.enqueue({ kind: 'ordered', lane: 'local-gpu', external: false, label: 'low-first', payload: {} });
        await scheduler.enqueue({ kind: 'ordered', lane: 'local-gpu', external: false, label: 'low-second', payload: {} });
        await scheduler.enqueue({ kind: 'ordered', lane: 'local-gpu', external: false, label: 'high', payload: {}, priority: 10 });
        release();
        await flushAll(scheduler);

        expect(order).toEqual(['high', 'low-first', 'low-second']);
    });
});
