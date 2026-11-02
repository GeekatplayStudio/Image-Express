/**
 * @jest-environment node
 */

const describeUserApiKeys = jest.fn();
const readUserVaultAudit = jest.fn();
const resolveRequestUser = jest.fn();

jest.mock('@/lib/server/user-key-vault', () => ({
    describeUserApiKeys: (owner: string) => describeUserApiKeys(owner),
    readUserVaultAudit: (owner: string, limit: number) => readUserVaultAudit(owner, limit),
}));
jest.mock('@/lib/server/user-session', () => ({
    resolveRequestUser: (request: Request) => resolveRequestUser(request),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/user/keys/audit/route';

const OWNER = { id: 'usr_1', email: 'owner@example.com', username: 'owner', status: 'approved' };
const get = (query: string) => GET(new NextRequest(`http://localhost/api/user/keys/audit${query}`));

describe('/api/user/keys/audit', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resolveRequestUser.mockResolvedValue(null);
        describeUserApiKeys.mockResolvedValue({ ownerId: 'owner', maxAgeDays: 180, keys: [{ name: 'openai', updatedAt: 'x', ageDays: 200, stale: true }], readCount: 3, writeCount: 1 });
        readUserVaultAudit.mockResolvedValue([{ at: 'x', event: 'read', owner: 'owner', keyCount: 1, source: 'queue:remote-poll' }]);
    });

    it('needs the owner’s session, like the keys themselves', async () => {
        expect((await get('?userId=owner')).status).toBe(401);
        resolveRequestUser.mockResolvedValue({ id: 'usr_2', email: 'other@example.com' });
        expect((await get('?userId=owner')).status).toBe(403);
        expect(describeUserApiKeys).not.toHaveBeenCalled();
        expect(readUserVaultAudit).not.toHaveBeenCalled();
    });

    it('returns key ages and the recent trail, uncacheable', async () => {
        resolveRequestUser.mockResolvedValue(OWNER);
        const response = await get('?userId=owner&limit=5');
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(readUserVaultAudit).toHaveBeenCalledWith('owner', 5);
        await expect(response.json()).resolves.toMatchObject({
            maxAgeDays: 180,
            keys: [{ name: 'openai', stale: true }],
            events: [{ event: 'read', source: 'queue:remote-poll' }],
        });
    });
});
