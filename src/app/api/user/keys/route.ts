import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { loadUserApiKeys, mergeUserApiKeys } from '@/lib/server/user-key-vault';

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
        const body = await parseJsonRequest(req, UserApiKeysSchema, KEYS_BODY_LIMIT_BYTES);
        // Support both username and userId
        const ownerId = body.username || body.userId;

        if (!ownerId) {
            return NextResponse.json({ message: 'Username required' }, { status: 400 });
        }

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

        const keys = await loadUserApiKeys(ownerId);
        return NextResponse.json({ keys });
    } catch (error) {
        console.error('Retrieving user API keys failed', error);
        return NextResponse.json({ message: 'Error retrieving keys' }, { status: 500 });
    }
}
