/**
 * @jest-environment node
 */

const rotateVaultSecret = jest.fn();
const resolveRequestUser = jest.fn();

jest.mock('@/lib/server/user-key-vault', () => ({
    rotateVaultSecret: (options: unknown) => rotateVaultSecret(options),
}));
jest.mock('@/lib/server/user-session', () => ({
    resolveRequestUser: (request: Request) => resolveRequestUser(request),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/user/admin/key-vault/rotate/route';

const ADMIN = { id: 'usr_admin', email: 'admin@example.com', roles: ['admin'], rights: [] };
const MEMBER = { id: 'usr_1', email: 'owner@example.com', roles: ['member'], rights: [] };

const post = (body: unknown, headers: Record<string, string> = {}) =>
    POST(new NextRequest('http://localhost/api/user/admin/key-vault/rotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
    }));

describe('/api/user/admin/key-vault/rotate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        rotateVaultSecret.mockResolvedValue({ rotatedAt: '2026-11-02T00:00:00.000Z', ownerCount: 2 });
    });

    it('is for administrators only', async () => {
        resolveRequestUser.mockResolvedValue(null);
        expect((await post({})).status).toBe(401);
        resolveRequestUser.mockResolvedValue(MEMBER);
        expect((await post({})).status).toBe(403);
        expect(rotateVaultSecret).not.toHaveBeenCalled();
    });

    it('refuses a cross-site trigger even from an admin', async () => {
        resolveRequestUser.mockResolvedValue(ADMIN);
        expect((await post({}, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
        expect(rotateVaultSecret).not.toHaveBeenCalled();
    });

    it('rotates for an admin and names them in the audit source', async () => {
        resolveRequestUser.mockResolvedValue(ADMIN);
        const response = await post({});
        expect(response.status).toBe(200);
        expect(rotateVaultSecret).toHaveBeenCalledWith({ nextSecret: undefined, source: 'api:admin/key-vault/rotate:usr_admin' });
        await expect(response.json()).resolves.toMatchObject({ success: true, ownerCount: 2 });
    });

    it('relays the vault’s own refusal for an env-managed secret', async () => {
        resolveRequestUser.mockResolvedValue(ADMIN);
        rotateVaultSecret.mockRejectedValue(new Error('The vault secret is set by IMAGE_EXPRESS_KEY_VAULT_SECRET; pass the next secret to rotate it.'));
        const response = await post({});
        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toMatchObject({ message: expect.stringContaining('IMAGE_EXPRESS_KEY_VAULT_SECRET') });
    });
});
