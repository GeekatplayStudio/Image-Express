import crypto from 'crypto';

const HASH_ALGORITHM = 'sha512';
const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 64;

export function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
    // Lightweight email validation for UI/API guardrails.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function createSalt() {
    return crypto.randomBytes(16).toString('hex');
}

export function hashPassword(password: string, salt: string) {
    return crypto
        .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_ALGORITHM)
        .toString('hex');
}

export function createPasswordHash(password: string) {
    const salt = createSalt();
    const hash = hashPassword(password, salt);
    return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
    const actualHash = hashPassword(password, salt);
    const left = Buffer.from(actualHash, 'hex');
    const right = Buffer.from(expectedHash, 'hex');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

export function createOneTimeToken() {
    return crypto.randomBytes(20).toString('hex');
}
