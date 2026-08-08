/**
 * @jest-environment node
 */

import { requestVaultEmbedding, VAULT_EMBED_JOB_KIND } from '@/lib/server/vaultEmbedQueue';
import { getQueue } from '@/lib/server/jobQueue';

jest.mock('@/lib/server/jobQueue', () => ({ getQueue: jest.fn() }));

/**
 * Search calls this on every query, so the property that matters is that it
 * does nothing while indexing is already under way. Without the guard a busy
 * user would enqueue a job per keystroke, and the queue would fill with
 * duplicates all racing to embed the same assets — worse than the blocking
 * behaviour this replaced.
 */

type Job = { id: string; kind: string; status: string };

const mockQueue = (jobs: Job[]) => {
    const enqueue = jest.fn(async (input: Record<string, unknown>) => ({
        id: 'job_new',
        ...input,
    }));
    (getQueue as jest.Mock).mockReturnValue({
        listJobs: jest.fn(async () => jobs),
        enqueue,
    });
    return enqueue;
};

beforeEach(() => jest.clearAllMocks());

describe('requestVaultEmbedding', () => {
    it('enqueues when nothing is indexing', async () => {
        const enqueue = mockQueue([]);
        await expect(requestVaultEmbedding(500)).resolves.toBe('job_new');
        expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it.each(['queued', 'running'])('does nothing while a job is %s', async (status) => {
        const enqueue = mockQueue([{ id: 'job_1', kind: VAULT_EMBED_JOB_KIND, status }]);
        await expect(requestVaultEmbedding(500)).resolves.toBeNull();
        expect(enqueue).not.toHaveBeenCalled();
    });

    it.each(['succeeded', 'failed', 'cancelled'])(
        'enqueues again after the previous job %s',
        async (status) => {
            // Otherwise indexing would stop for good after the first pass, and
            // newly indexed drives would never be embedded.
            const enqueue = mockQueue([{ id: 'job_1', kind: VAULT_EMBED_JOB_KIND, status }]);
            await expect(requestVaultEmbedding(500)).resolves.toBe('job_new');
            expect(enqueue).toHaveBeenCalledTimes(1);
        },
    );

    it('ignores unrelated jobs that happen to be running', async () => {
        const enqueue = mockQueue([{ id: 'job_1', kind: 'generate', status: 'running' }]);
        await expect(requestVaultEmbedding(500)).resolves.toBe('job_new');
        expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it('does nothing when there is nothing left to index', async () => {
        const enqueue = mockQueue([]);
        await expect(requestVaultEmbedding(0)).resolves.toBeNull();
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('runs on the CPU lane, below interactive work', async () => {
        // Indexing must never hold the single GPU lane, and a generation the
        // user is waiting on must never queue behind it.
        const enqueue = mockQueue([]);
        await requestVaultEmbedding(1200);

        expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
            kind: VAULT_EMBED_JOB_KIND,
            lane: 'local-cpu',
            external: false,
        }));
        expect(enqueue.mock.calls[0][0].priority).toBeLessThan(0);
    });

    it('says how much is left in the label', async () => {
        const enqueue = mockQueue([]);
        await requestVaultEmbedding(239321);
        expect(enqueue.mock.calls[0][0].label).toContain('239,321');
    });
});
