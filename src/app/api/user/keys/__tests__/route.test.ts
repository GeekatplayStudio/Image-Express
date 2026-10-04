/**
 * @jest-environment node
 */

const loadUserApiKeys = jest.fn(async () => ({ openai: 'sk-owner-secret' }));
const mergeUserApiKeys = jest.fn(async () => ({ keyCount: 1, updatedAt: '2026-10-03T00:00:00.000Z' }));
const resolveRequestUser = jest.fn();

jest.mock('@/lib/server/user-key-vault', () => ({
    loadUserApiKeys: (owner: string) => loadUserApiKeys(owner),
    mergeUserApiKeys: (owner: string, keys: unknown) => mergeUserApiKeys(owner, keys),
}));
jest.mock('@/lib/server/user-session', () => ({
    resolveRequestUser: (request: Request) => resolveRequestUser(request),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/user/keys/route';

const OWNER = { id: 'usr_1', email: 'owner@example.com', username: 'owner', status: 'approved' };

const get = (query: string, headers: Record<string, string> = {}) =>
    GET(new NextRequest(`http://localhost/api/user/keys${query}`, { headers }));

const post = (body: unknown, headers: Record<string, string> = {}) =>
    POST(new NextRequest('http://localhost/api/user/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
    }));

describe('/api/user/keys authorisation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resolveRequestUser.mockResolvedValue(null);
    });

    it('refuses to hand keys to a caller with no session', async () => {
        // The hole: this returned the named account's decrypted keys.
        const response = await get('?userId=owner@example.com');
        expect(response.status).toBe(401);
        expect(loadUserApiKeys).not.toHaveBeenCalled();
        expect(JSON.stringify(await response.json())).not.toContain('sk-owner-secret');
    });

    it('refuses a signed-in user asking for someone else’s keys', async () => {
        resolveRequestUser.mockResolvedValue({ id: 'usr_2', email: 'other@example.com', username: 'other' });
        const response = await get('?userId=owner@example.com');
        expect(response.status).toBe(403);
        expect(loadUserApiKeys).not.toHaveBeenCalled();
    });

    it('returns the owner’s keys, uncacheable, by any of their own identifiers', async () => {
        resolveRequestUser.mockResolvedValue(OWNER);
        for (const name of ['owner@example.com', 'OWNER@Example.com', 'owner', 'usr_1']) {
            const response = await get(`?userId=${encodeURIComponent(name)}`);
            expect(response.status).toBe(200);
            expect(response.headers.get('cache-control')).toBe('no-store');
            await expect(response.json()).resolves.toEqual({ keys: { openai: 'sk-owner-secret' } });
        }
    });

    it('still answers 400 when no owner is named', async () => {
        resolveRequestUser.mockResolvedValue(OWNER);
        expect((await get('')).status).toBe(400);
    });

    it('refuses to overwrite a vault without a session, or another account’s vault', async () => {
        expect((await post({ userId: 'owner@example.com', keys: { openai: 'attacker' } })).status).toBe(401);

        resolveRequestUser.mockResolvedValue({ id: 'usr_2', email: 'other@example.com' });
        expect((await post({ userId: 'owner@example.com', keys: { openai: 'attacker' } })).status).toBe(403);

        expect(mergeUserApiKeys).not.toHaveBeenCalled();
    });

    it('saves the owner’s own keys', async () => {
        resolveRequestUser.mockResolvedValue(OWNER);
        const response = await post({ userId: 'owner@example.com', keys: { openai: 'sk-new' } });
        expect(response.status).toBe(200);
        expect(mergeUserApiKeys).toHaveBeenCalledWith('owner@example.com', { openai: 'sk-new' });
    });

    it('refuses a save driven by another site, even with a valid session', async () => {
        resolveRequestUser.mockResolvedValue(OWNER);
        const response = await post(
            { userId: 'owner@example.com', keys: { openai: 'x' } },
            { 'sec-fetch-site': 'cross-site' },
        );
        expect(response.status).toBe(403);
        expect(mergeUserApiKeys).not.toHaveBeenCalled();
    });
});
