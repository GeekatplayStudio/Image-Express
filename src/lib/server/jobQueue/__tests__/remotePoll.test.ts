/**
 * @jest-environment node
 */

import { runRemotePollJob } from '@/lib/server/jobQueue/handlers/remotePoll';
import type { QueueHandlerContext, QueueJobRecord } from '@/lib/server/jobQueue/types';

const mockLoadUserApiKeys = jest.fn();
jest.mock('@/lib/server/user-key-vault', () => ({
    loadUserApiKeys: (...args: unknown[]) => mockLoadUserApiKeys(...args),
}));

const job = (payload: Record<string, unknown>): QueueJobRecord => ({
    id: 'qjob_1',
    kind: 'remote-poll',
    lane: 'remote:meshy',
    external: true,
    label: 'test',
    status: 'running',
    stage: 'worker',
    progress: 0,
    payload,
    attempts: 1,
    maxAttempts: 1,
    priority: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
});

const ctx = (payload: Record<string, unknown>) => {
    const updates: Array<Record<string, unknown>> = [];
    return {
        updates,
        context: {
            job: job(payload),
            update: async (patch) => { updates.push(patch as Record<string, unknown>); },
        } as QueueHandlerContext,
    };
};

const basePayload = {
    provider: 'meshy',
    taskId: 'task-1',
    jobType: 'image-to-3d',
    owner: 'alice',
    // Injected so the suite runs in milliseconds instead of sleeping the real
    // 2s floor between polls.
    minDelayMs: 1,
    maxDelayMs: 2,
};

describe('runRemotePollJob', () => {
    beforeEach(() => {
        mockLoadUserApiKeys.mockReset();
        mockLoadUserApiKeys.mockResolvedValue({ meshy: 'secret-key' });
        global.fetch = jest.fn();
    });

    it('reads the key from the vault and never takes one from the caller', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'SUCCEEDED', model_urls: { glb: 'out.glb' } }),
        });

        const { context } = ctx(basePayload);
        const result = await runRemotePollJob(context);

        expect(result).toEqual({ resultUrl: 'out.glb' });
        expect(mockLoadUserApiKeys).toHaveBeenCalledWith('alice');
        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer secret-key');
    });

    it('calls the provider directly rather than looping back through our own API', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'SUCCEEDED', model_urls: { glb: 'out.glb' } }),
        });

        await runRemotePollJob(ctx(basePayload).context);
        const [url] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toContain('api.meshy.ai');
        expect(url).not.toContain('/api/ai/');
    });

    it('fails with an actionable message when the account has no stored key', async () => {
        mockLoadUserApiKeys.mockResolvedValue({});
        await expect(runRemotePollJob(ctx(basePayload).context))
            .rejects.toThrow(/No stored meshy API key.*Settings/s);
    });

    it('rejects a payload missing its identifiers', async () => {
        await expect(runRemotePollJob(ctx({ provider: 'meshy' }).context))
            .rejects.toThrow(/requires provider, taskId and owner/);
    });

    it('keeps polling while the task is running, then resolves', async () => {
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'IN_PROGRESS', progress: 20 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'IN_PROGRESS', progress: 70 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'SUCCEEDED', model_urls: { glb: 'a.glb' } }) });

        const { context, updates } = ctx(basePayload);
        const result = await runRemotePollJob(context);

        expect(result.resultUrl).toBe('a.glb');
        expect((global.fetch as jest.Mock).mock.calls).toHaveLength(3);
        // Progress is reported as it advances, never as a completed fraction
        // before the result has actually been checked.
        const progresses = updates.map((u) => u.progress).filter((p): p is number => typeof p === 'number');
        expect(Math.max(...progresses.slice(0, -1))).toBeLessThan(1);
    });

    it('fails fast on a 4xx, because retrying cannot fix a bad key', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false, status: 401, text: async () => 'unauthorized',
        });
        await expect(runRemotePollJob(ctx(basePayload).context)).rejects.toThrow(/401/);
        expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });

    it('rides out transient 5xx responses instead of failing the job', async () => {
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
            .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'SUCCEEDED', model_urls: { glb: 'a.glb' } }) });

        const result = await runRemotePollJob(ctx(basePayload).context);
        expect(result.resultUrl).toBe('a.glb');
    });

    it('gives up after repeated transport failures', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
        await expect(runRemotePollJob(ctx(basePayload).context)).rejects.toThrow(/ECONNRESET/);
    });

    it('surfaces a provider-reported failure as the job error', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true, json: async () => ({ status: 'FAILED' }),
        });
        await expect(runRemotePollJob(ctx(basePayload).context)).rejects.toThrow(/meshy task failed/i);
    });

    it('treats a cancelled provider task as terminal rather than polling forever', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true, json: async () => ({ status: 'CANCELED' }),
        });
        await expect(runRemotePollJob(ctx(basePayload).context)).rejects.toThrow(/cancelled/i);
    });

    it('refuses a success with no result URL rather than storing nothing', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true, json: async () => ({ status: 'SUCCEEDED' }),
        });
        await expect(runRemotePollJob(ctx(basePayload).context))
            .rejects.toThrow(/success without a result URL/);
    });

    it('sends the Appid alongside an ak:sk credential for hitem3d', async () => {
        mockLoadUserApiKeys.mockResolvedValue({ hitems: 'AK123:SK456' });
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ code: 200, data: { task_status: 4, task_result: { model_url: 'm.glb' } } }),
        });

        await runRemotePollJob(ctx({
            provider: 'hitems', taskId: 't1', owner: 'alice', hitemsAppId: 'app-9',
            minDelayMs: 1, maxDelayMs: 2,
        }).context);

        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(init.headers.Authorization).toBe('AK123:SK456');
        expect(init.headers.Appid).toBe('app-9');
    });
});
