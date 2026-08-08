import crypto from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { getDataDir } from '@/lib/server/appPaths';

/**
 * A shared secret proving a caller is a local tool the user themselves set up.
 *
 * The MCP bridge is not a browser and has no session, so before this it called
 * the API as an anonymous stranger — indistinguishable from any other process,
 * or from a web page in the user's browser reaching localhost.
 *
 * The token lives in the app's data directory. That is deliberately the same
 * trust boundary as the app itself: a process able to read it could already
 * read the design files, the user store and the encrypted key vault sitting
 * beside it. The token therefore grants nothing new — what it buys is the
 * ability to tell an *authorised local tool* apart from an unauthenticated
 * caller, which is what makes it safe to refuse the latter on routes that
 * delete or install.
 *
 * It is explicitly **not** a defence against local malware, and nothing here
 * should be described as though it were.
 */

const TOKEN_FILENAME = 'local-api-token';
const TOKEN_BYTES = 32;

export function getLocalApiTokenPath(): string {
    return path.join(getDataDir(), TOKEN_FILENAME);
}

let cachedToken: string | null = null;

/** Read the token, creating it on first use. Returns null if it cannot be stored. */
export function ensureLocalApiToken(): string | null {
    if (cachedToken) return cachedToken;

    const tokenPath = getLocalApiTokenPath();
    try {
        if (existsSync(tokenPath)) {
            const existing = readFileSync(tokenPath, 'utf8').trim();
            // A truncated or empty file means an interrupted write; replace it
            // rather than running with a weak secret.
            if (existing.length >= 32) {
                cachedToken = existing;
                return cachedToken;
            }
        }

        const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
        mkdirSync(path.dirname(tokenPath), { recursive: true });
        writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
        try {
            // writeFileSync's mode is ignored when the file already existed.
            chmodSync(tokenPath, 0o600);
        } catch {
            // Best effort: Windows ignores POSIX modes, and the directory
            // permissions are the real boundary there.
        }
        cachedToken = token;
        return cachedToken;
    } catch (error) {
        console.error('Could not establish the local API token:', error);
        return null;
    }
}

/** Read without creating. Used by request verification, which must not write. */
export function readLocalApiToken(): string | null {
    if (cachedToken) return cachedToken;
    try {
        const existing = readFileSync(getLocalApiTokenPath(), 'utf8').trim();
        if (existing.length < 32) return null;
        cachedToken = existing;
        return cachedToken;
    } catch {
        return null;
    }
}

/**
 * Whether a request carries the local token. Compared in constant time so the
 * endpoint cannot be used as an oracle to recover the token byte by byte.
 */
export function requestHasLocalApiToken(request: Request): boolean {
    const header = request.headers.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) return false;

    const expected = readLocalApiToken();
    if (!expected) return false;

    const provided = Buffer.from(match[1].trim(), 'utf8');
    const target = Buffer.from(expected, 'utf8');
    if (provided.length !== target.length) return false;
    return crypto.timingSafeEqual(provided, target);
}

/** Test seam — clears the process-level cache. */
export function resetLocalApiTokenCache(): void {
    cachedToken = null;
}
