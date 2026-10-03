/**
 * @jest-environment node
 */

jest.mock('@/lib/server/user-auth-store', () => ({
    loadUsers: jest.fn(async () => ({ users: [] })),
    findUserByIdentifier: jest.fn(),
    toPublicUser: jest.fn((user: { email: string }) => ({ email: user.email })),
    createPendingUser: jest.fn(),
}));
jest.mock('@/lib/server/auth-utils', () => ({
    ...jest.requireActual('@/lib/server/auth-utils'),
    verifyPassword: jest.fn((password: string) => password === 'correct'),
}));
jest.mock('@/lib/server/user-session', () => ({
    createUserSessionToken: jest.fn(() => 'session-token'),
}));
jest.mock('@/lib/server/user-notifications', () => ({
    notifyRegistrationApprovalRequest: jest.fn(),
}));

import { POST as login } from '@/app/api/user/auth/login/route';
import { POST as register } from '@/app/api/user/auth/register/route';
import { findUserByIdentifier, createPendingUser } from '@/lib/server/user-auth-store';
import {
    AUTH_ACCOUNT_FAILURE_LIMIT,
    AUTH_SIDE_EFFECT_LIMIT,
    resetAllRateLimits,
} from '@/lib/server/rateLimit';

const post = (path: string, body: unknown) =>
    new Request(`http://localhost/api/user/auth/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });

const attempt = (identifier: string, password: string) => login(post('login', { identifier, password }));

const OWNER = { email: 'owner@example.com', status: 'approved', passwordSalt: 's', passwordHash: 'h' };

describe('auth rate limiting', () => {
    beforeEach(() => {
        resetAllRateLimits();
        (findUserByIdentifier as jest.Mock).mockImplementation((_users: unknown, identifier: string) =>
            identifier.toLowerCase() === OWNER.email ? OWNER : undefined);
    });

    it('locks an account after repeated wrong passwords — even for the right one', async () => {
        for (let i = 0; i < AUTH_ACCOUNT_FAILURE_LIMIT.limit; i += 1) {
            expect((await attempt(OWNER.email, 'wrong')).status).toBe(401);
        }
        const locked = await attempt(OWNER.email, 'correct');
        expect(locked.status).toBe(429);
        expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    });

    it('cannot be sidestepped by changing the identifier case', async () => {
        for (let i = 0; i < AUTH_ACCOUNT_FAILURE_LIMIT.limit; i += 1) {
            await attempt(i % 2 ? OWNER.email : 'Owner@Example.COM', 'wrong');
        }
        expect((await attempt(OWNER.email, 'wrong')).status).toBe(429);
    });

    it('a successful sign-in clears the failures, so an owner who mistypes is never locked out', async () => {
        for (let round = 0; round < 3; round += 1) {
            for (let i = 0; i < AUTH_ACCOUNT_FAILURE_LIMIT.limit - 1; i += 1) {
                await attempt(OWNER.email, 'wrong');
            }
            expect((await attempt(OWNER.email, 'correct')).status).toBe(200);
        }
    });

    it('locking one account leaves another untouched', async () => {
        for (let i = 0; i < AUTH_ACCOUNT_FAILURE_LIMIT.limit; i += 1) {
            await attempt('victim@example.com', 'wrong');
        }
        expect((await attempt('victim@example.com', 'wrong')).status).toBe(429);
        expect((await attempt(OWNER.email, 'correct')).status).toBe(200);
    });

    it('answers unknown accounts with the same lockout, so 429 is not an existence oracle', async () => {
        for (let i = 0; i < AUTH_ACCOUNT_FAILURE_LIMIT.limit; i += 1) {
            expect((await attempt('nobody@example.com', 'wrong')).status).toBe(401);
        }
        expect((await attempt('nobody@example.com', 'wrong')).status).toBe(429);
    });

    it('caps registrations before they reach the user store', async () => {
        (createPendingUser as jest.Mock).mockImplementation(async ({ email }: { email: string }) => ({
            ok: true,
            user: { email, displayName: email },
        }));
        for (let i = 0; i < AUTH_SIDE_EFFECT_LIMIT.limit; i += 1) {
            const ok = await register(post('register', { email: `u${i}@example.com`, password: 'hunter22' }));
            expect(ok.status).toBe(200);
        }
        const refused = await register(post('register', { email: 'extra@example.com', password: 'hunter22' }));
        expect(refused.status).toBe(429);
        expect(createPendingUser).toHaveBeenCalledTimes(AUTH_SIDE_EFFECT_LIMIT.limit);
    });
});
