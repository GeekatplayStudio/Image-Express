import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { loadUserApiKeys, mergeUserApiKeys, removeUserApiKeys } from '@/lib/server/user-key-vault';
import { authorizeVaultOwner } from '@/lib/server/keyVaultOwner';
import { assertTrustedCaller } from '@/lib/server/trustedCaller';

const AUDIT_SOURCE = 'api:user/keys';

// A record of provider -> key. Values stay `unknown` because the vault does
// its own normalisation; the schema's job is to guarantee this is an object and
// not an array or a string, which the route previously had to check by hand.
const UserApiKeysSchema = z.object({
    username: z.string().max(320).optional(),
    userId: z.string().max(320).optional(),
    keys: z.record(z.string().max(200), z.unknown()).optional(),
    /** Key names to delete; applied after `keys`. */
    remove: z.array(z.string().min(1).max(200)).max(100).optional(),
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
        let result = await mergeUserApiKeys(ownerId, keys, { source: AUDIT_SOURCE });
        if (body.remove && body.remove.length > 0) {
            result = await removeUserApiKeys(ownerId, body.remove, { source: AUDIT_SOURCE });
        }

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

        const keys = await loadUserApiKeys(ownerId, { source: AUDIT_SOURCE });
        // Decrypted credentials: never let a proxy or the browser keep a copy.
        return NextResponse.json({ keys }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Retrieving user API keys failed', error);
        return NextResponse.json({ message: 'Error retrieving keys' }, { status: 500 });
    }
}
