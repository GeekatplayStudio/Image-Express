import crypto from 'crypto';

import { normalizeEmail } from '@/lib/server/auth-utils';
import { findUserByIdentifier, loadUsers, type ManagedUser } from '@/lib/server/user-auth-store';

const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;
const USER_UPDATE_DRIFT_MS = 5000;

type SessionPayload = {
    v: number;
    sub: string;
    email: string;
    iat: number;
    exp: number;
};

function getSessionSecret() {
    return process.env.IMAGE_EXPRESS_SESSION_SECRET || 'image-express-dev-session-secret';
}

function encodeBase64Url(value: string) {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(encodedPayload: string) {
    return crypto.createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url');
}

function safeTokenPartEqual(leftValue: string, rightValue: string) {
    const left = Buffer.from(leftValue, 'utf8');
    const right = Buffer.from(rightValue, 'utf8');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function parsePayload(encodedPayload: string): SessionPayload | null {
    try {
        const raw = decodeBase64Url(encodedPayload);
        const value = JSON.parse(raw) as Partial<SessionPayload>;
        if (
            value.v !== TOKEN_VERSION
            || typeof value.sub !== 'string'
            || typeof value.email !== 'string'
            || typeof value.iat !== 'number'
            || typeof value.exp !== 'number'
        ) {
            return null;
        }

        return {
            v: value.v,
            sub: value.sub,
            email: normalizeEmail(value.email),
            iat: value.iat,
            exp: value.exp,
        };
    } catch {
        return null;
    }
}

export function createUserSessionToken(
    user: Pick<ManagedUser, 'id' | 'email'>,
    options?: { ttlSeconds?: number },
) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload: SessionPayload = {
        v: TOKEN_VERSION,
        sub: user.id,
        email: normalizeEmail(user.email),
        iat: issuedAt,
        exp: issuedAt + Math.max(60, options?.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    };
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = signPayload(encodedPayload);
    return `${encodedPayload}.${signature}`;
}

export async function verifyUserSessionToken(token: string): Promise<ManagedUser | null> {
    const normalized = token.trim();
    if (!normalized) return null;

    const parts = normalized.split('.');
    if (parts.length !== 2) return null;

    const [encodedPayload, providedSignature] = parts;
    const expectedSignature = signPayload(encodedPayload);
    if (!safeTokenPartEqual(providedSignature, expectedSignature)) {
        return null;
    }

    const payload = parsePayload(encodedPayload);
    if (!payload) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
        return null;
    }

    const store = await loadUsers();
    const user = findUserByIdentifier(store.users, payload.email);
    if (!user) return null;
    if (user.id !== payload.sub) return null;
    if (user.status !== 'approved') return null;

    const updatedAtMs = Date.parse(user.updatedAt || '');
    if (Number.isFinite(updatedAtMs) && updatedAtMs - USER_UPDATE_DRIFT_MS > payload.iat * 1000) {
        return null;
    }

    return user;
}

export function getBearerTokenFromRequest(request: Request) {
    const headerValue = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!headerValue) return null;
    const match = headerValue.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

export async function resolveRequestUser(request: Request) {
    const token = getBearerTokenFromRequest(request);
    if (!token) return null;
    return verifyUserSessionToken(token);
}