/** @jest-environment node */

import {
    createOneTimeToken,
    createPasswordHash,
    createSalt,
    hashPassword,
    isValidEmail,
    normalizeEmail,
    verifyPassword,
} from '@/lib/server/auth-utils';

describe('auth-utils', () => {
    it('normalizes and validates email addresses', () => {
        expect(normalizeEmail('  TeSt@Example.Com  ')).toBe('test@example.com');
        expect(isValidEmail('valid@example.com')).toBe(true);
        expect(isValidEmail('not-an-email')).toBe(false);
    });

    it('creates salts and one-time tokens as hex strings', () => {
        expect(createSalt()).toMatch(/^[a-f0-9]{32}$/);
        expect(createOneTimeToken()).toMatch(/^[a-f0-9]{40}$/);
    });

    it('hashes and verifies passwords', () => {
        const { salt, hash } = createPasswordHash('super-secret');
        expect(salt).toHaveLength(32);
        expect(hash).toHaveLength(128);
        expect(hashPassword('super-secret', salt)).toBe(hash);
        expect(verifyPassword('super-secret', salt, hash)).toBe(true);
        expect(verifyPassword('wrong', salt, hash)).toBe(false);
    });

    it('returns false when expected hash has invalid length', () => {
        const { salt } = createPasswordHash('super-secret');
        expect(verifyPassword('super-secret', salt, 'abcd')).toBe(false);
    });
});
