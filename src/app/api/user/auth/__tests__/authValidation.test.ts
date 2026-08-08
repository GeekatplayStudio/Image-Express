/**
 * @jest-environment node
 */

import { POST as login } from '@/app/api/user/auth/login/route';
import { POST as register } from '@/app/api/user/auth/register/route';
import { POST as resetPassword } from '@/app/api/user/auth/reset-password/route';
import { POST as changePassword } from '@/app/api/user/auth/change-password/route';
import { AUTH_BODY_LIMIT_BYTES } from '@/app/api/user/auth/authValidation';

/**
 * These routes previously cast the body with `as LoginPayload` — no runtime
 * check at all — so anything reached the password hasher and the user store.
 * What matters is not that valid input still works (the existing suites cover
 * that) but that hostile input is now refused before any of that runs.
 */

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });

const LOGIN_URL = 'http://localhost/api/user/auth/login';

describe('auth request validation', () => {
    it('rejects a non-string password instead of hashing an object', async () => {
        const response = await login(post(LOGIN_URL, { identifier: 'a@b.com', password: { $ne: null } }));
        expect(response.status).toBe(400);
    });

    it('rejects a non-string identifier', async () => {
        const response = await login(post(LOGIN_URL, { identifier: ['a@b.com'], password: 'hunter2' }));
        expect(response.status).toBe(400);
    });

    it('rejects an absurdly long credential', async () => {
        const response = await login(post(LOGIN_URL, { identifier: 'a@b.com', password: 'x'.repeat(5000) }));
        expect(response.status).toBe(400);
    });

    it('rejects an oversized body with 413, not 500', async () => {
        // Previously there was no size limit at all on this route.
        const huge = JSON.stringify({ identifier: 'a@b.com', password: 'x'.repeat(AUTH_BODY_LIMIT_BYTES) });
        const response = await login(post(LOGIN_URL, huge, {
            'content-length': String(Buffer.byteLength(huge)),
        }));
        expect(response.status).toBe(413);
    });

    it('rejects malformed JSON with 400 rather than a 500', async () => {
        const response = await login(post(LOGIN_URL, '{not json'));
        expect(response.status).toBe(400);
    });

    it('rejects a JSON array as the body', async () => {
        expect((await login(post(LOGIN_URL, ['a', 'b']))).status).toBe(400);
    });

    it('still answers missing fields with the route\'s own message, not a schema error', async () => {
        // Fields are deliberately optional so this behaviour — which the UI
        // keys on — is unchanged by adding validation.
        const response = await login(post(LOGIN_URL, {}));
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            message: 'Email and password are required.',
        });
    });

    it('ignores unexpected extra keys rather than passing them through', async () => {
        const response = await login(post(LOGIN_URL, {
            identifier: '', password: '', isAdmin: true, __proto__: { polluted: true },
        }));
        // Still the route's own required-field answer: the extras were stripped.
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ success: false });
    });

    it.each([
        ['register', register, 'http://localhost/api/user/auth/register'],
        ['reset-password', resetPassword, 'http://localhost/api/user/auth/reset-password'],
        ['change-password', changePassword, 'http://localhost/api/user/auth/change-password'],
    ])('rejects a non-string password on %s', async (_name, handler, url) => {
        const response = await handler(post(url, {
            email: 'a@b.com', identifier: 'a@b.com', token: 't',
            password: 12345, currentPassword: 12345, newPassword: 12345,
        }));
        expect(response.status).toBe(400);
    });
});
