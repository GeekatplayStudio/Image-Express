import {
    canHandOffToServer,
    handOffPollingToServer,
} from '@/features/generation/application/client/serverPollHandoff';
import type { BackgroundJob } from '@/types';

const job = (over: Partial<BackgroundJob> = {}): Partial<BackgroundJob> => ({
    id: 'task-1',
    provider: 'meshy',
    type: 'image-to-3d',
    ...over,
});

const okFetch = () => jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ job_id: 'qjob_9' }),
}) as unknown as typeof fetch;

describe('canHandOffToServer', () => {
    it('refuses guests, who have no vaulted key', () => {
        expect(canHandOffToServer(job(), 'Guest')).toBe(false);
        expect(canHandOffToServer(job(), undefined)).toBe(false);
        expect(canHandOffToServer(job(), '')).toBe(false);
    });

    it('accepts the four providers the server can drive', () => {
        for (const provider of ['meshy', 'tripo', 'hitems', 'stability']) {
            expect(canHandOffToServer(job({ provider }), 'alice')).toBe(true);
        }
    });

    it('refuses an unknown provider or a job with no task id', () => {
        expect(canHandOffToServer(job({ provider: 'somethingelse' }), 'alice')).toBe(false);
        expect(canHandOffToServer(job({ id: undefined }), 'alice')).toBe(false);
    });
});

describe('handOffPollingToServer', () => {
    beforeEach(() => window.localStorage.clear());

    it('returns the queue job id on success', async () => {
        const fetchImpl = okFetch();
        const result = await handOffPollingToServer(job(), 'alice', { fetchImpl });
        expect(result).toEqual({ handedOff: true, queueJobId: 'qjob_9' });
    });

    it('never sends an API key — the server reads it from the vault', async () => {
        const fetchImpl = okFetch();
        await handOffPollingToServer(job({ apiKey: 'super-secret' }), 'alice', { fetchImpl });
        const [, init] = (fetchImpl as jest.Mock).mock.calls[0];
        expect(init.body).not.toContain('super-secret');
        expect(init.body).not.toContain('apiKey');
    });

    it('forwards the hitem3d app id, which is a preference rather than a secret', async () => {
        window.localStorage.setItem('hitems_appid', 'app-42');
        const fetchImpl = okFetch();
        await handOffPollingToServer(job({ provider: 'hitems' }), 'alice', { fetchImpl });
        const [, init] = (fetchImpl as jest.Mock).mock.calls[0];
        expect(JSON.parse(init.body).hitemsAppId).toBe('app-42');
    });

    it('does not call the server for a guest', async () => {
        const fetchImpl = okFetch();
        const result = await handOffPollingToServer(job(), 'Guest', { fetchImpl });
        expect(result).toEqual({ handedOff: false, reason: 'guest' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    /**
     * The handoff is an enhancement, not a prerequisite. If it fails the
     * browser poller carries on, so a generation must never be lost to a queue
     * outage.
     */
    it('degrades quietly when the request fails', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
        expect(await handOffPollingToServer(job(), 'alice', { fetchImpl }))
            .toEqual({ handedOff: false, reason: 'error' });
    });

    it('degrades quietly when the network throws', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
        expect(await handOffPollingToServer(job(), 'alice', { fetchImpl }))
            .toEqual({ handedOff: false, reason: 'error' });
    });

    it('degrades quietly when the response carries no job id', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
        expect(await handOffPollingToServer(job(), 'alice', { fetchImpl }))
            .toEqual({ handedOff: false, reason: 'error' });
    });
});
