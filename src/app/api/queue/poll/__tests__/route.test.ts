/**
 * @jest-environment node
 */

const enqueue = jest.fn(async () => ({ id: 'job_1', status: 'queued' }));
const resolveRequestUser = jest.fn();

jest.mock('@/lib/server/jobQueue', () => ({ getQueue: () => ({ enqueue }) }));
jest.mock('@/lib/server/user-session', () => ({
    resolveRequestUser: (request: Request) => resolveRequestUser(request),
}));

import { POST } from '@/app/api/queue/poll/route';

const post = (body: unknown) => POST(new Request('http://localhost/api/queue/poll', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
}));

const TASK = { provider: 'meshy', taskId: 'task_123', owner: 'owner@example.com' };

describe('POST /api/queue/poll ownership', () => {
    const originalRuntime = process.env.IMAGE_EXPRESS_RUNTIME;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.IMAGE_EXPRESS_RUNTIME = 'developer-local';
        resolveRequestUser.mockResolvedValue(null);
    });

    afterAll(() => {
        if (originalRuntime === undefined) delete process.env.IMAGE_EXPRESS_RUNTIME;
        else process.env.IMAGE_EXPRESS_RUNTIME = originalRuntime;
    });

    it('will not spend a named account’s key for a caller with no session', async () => {
        const response = await post(TASK);
        expect(response.status).toBe(401);
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('will not spend one account’s key on behalf of another', async () => {
        resolveRequestUser.mockResolvedValue({ id: 'usr_2', email: 'other@example.com' });
        const response = await post(TASK);
        expect(response.status).toBe(403);
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('queues the poll for the account that owns the key', async () => {
        resolveRequestUser.mockResolvedValue({ id: 'usr_1', email: 'Owner@Example.com', username: 'owner' });
        const response = await post(TASK);
        expect(response.status).toBeLessThan(300);
        expect(enqueue).toHaveBeenCalledTimes(1);
        expect(enqueue.mock.calls[0][0]).toMatchObject({ kind: 'remote-poll', lane: 'remote:meshy' });
    });

    it('still explains that guests cannot be polled server-side', async () => {
        const response = await post({ ...TASK, owner: 'Guest' });
        expect(response.status).toBe(400);
        expect(enqueue).not.toHaveBeenCalled();
    });
});
