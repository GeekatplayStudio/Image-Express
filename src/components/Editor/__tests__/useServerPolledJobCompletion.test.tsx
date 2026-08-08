import { act, renderHook } from '@testing-library/react';

import { useServerPolledJobCompletion } from '@/components/Editor/useServerPolledJobCompletion';
import type { BackgroundJob } from '@/types';
import type { QueueJobRecord } from '@/lib/server/jobQueue/types';

const materialize = jest.fn().mockResolvedValue(undefined);
jest.mock('@/components/Editor/backgroundJobCompletion', () => ({
    materializeCompletedJob: (...args: unknown[]) => materialize(...args),
}));

/** Captured SSE handlers, so tests can push queue records at the hook. */
let handlers: { onSnapshot: (r: QueueJobRecord[]) => void; onJob: (r: QueueJobRecord) => void };
jest.mock('@/hooks/useQueueStream', () => ({
    useQueueStream: (_enabled: boolean, h: typeof handlers) => { handlers = h; },
}));

const queueJob = (over: Partial<QueueJobRecord> = {}): QueueJobRecord => ({
    id: 'qjob_1',
    kind: 'remote-poll',
    lane: 'remote:meshy',
    external: true,
    label: 'meshy',
    status: 'succeeded',
    stage: 'retrieve',
    progress: 1,
    payload: {},
    attempts: 1,
    maxAttempts: 1,
    priority: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resultUrl: 'model.glb',
    ...over,
});

const bgJob = (over: Partial<BackgroundJob> = {}): BackgroundJob => ({
    id: 'task-1',
    type: 'image-to-3d',
    status: 'IN_PROGRESS',
    createdAt: Date.now(),
    provider: 'meshy',
    queueJobId: 'qjob_1',
    progress: 10,
    ...over,
} as BackgroundJob);

const setup = (jobs: BackgroundJob[]) => {
    const setBackgroundJobs = jest.fn();
    renderHook(() => useServerPolledJobCompletion({
        backgroundJobs: jobs,
        setBackgroundJobs,
        canvas: null,
        user: 'alice',
    }));
    return { setBackgroundJobs };
};

describe('useServerPolledJobCompletion', () => {
    beforeEach(() => materialize.mockClear());

    it('completes a handed-off job when the queue reports success', () => {
        setup([bgJob()]);
        act(() => handlers.onJob(queueJob()));

        expect(materialize).toHaveBeenCalledTimes(1);
        expect(materialize.mock.calls[0][0].outcome).toMatchObject({
            status: 'SUCCEEDED', resultUrl: 'model.glb',
        });
    });

    /**
     * SSE re-sends a full snapshot on every reconnect. Without a guard, a
     * dropped connection would place the same model on the canvas again.
     */
    it('materialises a job only once across repeated snapshots', () => {
        setup([bgJob()]);
        act(() => {
            handlers.onSnapshot([queueJob()]);
            handlers.onSnapshot([queueJob()]);
            handlers.onJob(queueJob());
        });
        expect(materialize).toHaveBeenCalledTimes(1);
    });

    it('ignores queue jobs that are not remote polls', () => {
        setup([bgJob()]);
        act(() => handlers.onJob(queueJob({ kind: 'generate' })));
        expect(materialize).not.toHaveBeenCalled();
    });

    it('ignores a queue job no local job is waiting on', () => {
        setup([bgJob({ queueJobId: 'other' })]);
        act(() => handlers.onJob(queueJob()));
        expect(materialize).not.toHaveBeenCalled();
    });

    it('does not re-complete a job that already finished by another path', () => {
        setup([bgJob({ status: 'SUCCEEDED' })]);
        act(() => handlers.onJob(queueJob()));
        expect(materialize).not.toHaveBeenCalled();
    });

    it('propagates a server-side failure with its reason', () => {
        setup([bgJob()]);
        act(() => handlers.onJob(queueJob({ status: 'failed', resultUrl: undefined, error: 'out of credits' })));
        expect(materialize.mock.calls[0][0].outcome).toMatchObject({
            status: 'FAILED', error: 'out of credits',
        });
    });

    it('mirrors in-flight progress so the panel keeps moving', () => {
        const { setBackgroundJobs } = setup([bgJob({ progress: 10 })]);
        act(() => handlers.onJob(queueJob({ status: 'running', progress: 0.55 })));

        expect(materialize).not.toHaveBeenCalled();
        expect(setBackgroundJobs).toHaveBeenCalled();
        const updater = setBackgroundJobs.mock.calls[0][0] as (p: BackgroundJob[]) => BackgroundJob[];
        expect(updater([bgJob({ progress: 10 })])[0].progress).toBe(55);
    });

    it('does not churn state when progress has not moved', () => {
        const { setBackgroundJobs } = setup([bgJob({ progress: 55 })]);
        act(() => handlers.onJob(queueJob({ status: 'running', progress: 0.55 })));
        expect(setBackgroundJobs).not.toHaveBeenCalled();
    });
});
