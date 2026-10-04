import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { loadUserApiKeys, mergeUserApiKeys } from '@/lib/server/user-key-vault';
import { resolveRequestUser } from '@/lib/server/user-session';
import { assertTrustedCaller } from '@/lib/server/trustedCaller';

/**
 * Only the signed-in owner may read or change a vault.
 *
 * This route used to trust the name in the request: `?userId=someone` returned
 * that account's decrypted provider keys to anyone who could reach the server,
 * and a POST overwrote them. The owner is now taken from the session token and
 * the name in the request must be one of that account's own identifiers.
 *
 * Returns a response to send, or null to continue.
 */
async function authorizeVaultOwner(request: Request, ownerId: string): Promise<NextResponse | null> {
    const user = await resolveRequestUser(request);
    if (!user) {
        return NextResponse.json({ message: 'Sign in to sync API keys.' }, { status: 401 });
    }
    const requested = ownerId.trim().toLowerCase();
    const own = [user.id, user.email, user.username]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => value.toLowerCase());
    if (!own.includes(requested)) {
        return NextResponse.json({ message: 'You can only access your own API keys.' }, { status: 403 });
    }
    return null;
}

// A record of provider -> key. Values stay `unknown` because the vault does
// its own normalisation; the schema's job is to guarantee this is an object and
// not an array or a string, which the route previously had to check by hand.
const UserApiKeysSchema = z.object({
    username: z.string().max(320).optional(),
    userId: z.string().max(320).optional(),
    keys: z.record(z.string().max(200), z.unknown()).optional(),
});

/** Vaults hold many provider keys, so this is roomier than an auth body. */
const KEYS_BODY_LIMIT_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
    try {
        assertTrustedCaller(req);
        const body = await parseJsonRequest(req, UserApiKeysSchema, KEYS_BODY_LIMIT_BYTES);
        // Support both username and userId
        const ownerId = body.username || body.userId;

        if (!ownerId) {
            return NextResponse.json({ message: 'Username required' }, { status: 400 });
        }
        const denied = await authorizeVaultOwner(req, ownerId);
        if (denied) return denied;

        const keys = body.keys && typeof body.keys === 'object' && !Array.isArray(body.keys)
            ? body.keys
            : {};
        const result = await mergeUserApiKeys(ownerId, keys);

        return NextResponse.json({
            message: 'Keys saved successfully',
            keyCount: result.keyCount,
            updatedAt: result.updatedAt,
        });
    } catch (error) {
        const invalid = legacyValidationResponse(error);
        if (invalid) return invalid;
        // Log the detail, return a generic message: this endpoint handles the
        // key vault, and echoing an internal error back describes its internals
        // to whoever provoked it.
        console.error('Saving user API keys failed', error);
        return NextResponse.json({ message: 'Error saving keys' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        // Support both username and userId
        const ownerId = searchParams.get('username') || searchParams.get('userId');

        if (!ownerId) {
             return NextResponse.json({ message: 'Username required' }, { status: 400 });
        }
        const denied = await authorizeVaultOwner(req, ownerId);
        if (denied) return denied;

        const keys = await loadUserApiKeys(ownerId);
        // Decrypted credentials: never let a proxy or the browser keep a copy.
        return NextResponse.json({ keys }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Retrieving user API keys failed', error);
        return NextResponse.json({ message: 'Error retrieving keys' }, { status: 500 });
    }
}
