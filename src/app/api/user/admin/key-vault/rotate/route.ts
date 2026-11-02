import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { assertTrustedCaller } from '@/lib/server/trustedCaller';
import { resolveRequestUser } from '@/lib/server/user-session';
import { isAdminUser } from '@/lib/server/user-auth-store';
import { rotateVaultSecret } from '@/lib/server/user-key-vault';

const RotateSchema = z.object({
    /** Required when the secret comes from the environment; see rotateVaultSecret. */
    nextSecret: z.string().min(32).max(512).optional(),
});

/**
 * Re-encrypt the whole vault under a new secret. Every account's keys are
 * touched, so this is an administrator's action, not an owner's.
 */
export async function POST(req: NextRequest) {
    try {
        assertTrustedCaller(req);
        const user = await resolveRequestUser(req);
        if (!user) {
            return NextResponse.json({ message: 'Sign in required.' }, { status: 401 });
        }
        if (!isAdminUser(user)) {
            return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
        }
        const body = await parseJsonRequest(req, RotateSchema, 4 * 1024);
        const result = await rotateVaultSecret({ nextSecret: body.nextSecret, source: `api:admin/key-vault/rotate:${user.id}` });
        return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        const invalid = legacyValidationResponse(error);
        if (invalid) return invalid;
        const message = error instanceof Error && /IMAGE_EXPRESS_KEY_VAULT_SECRET|at least 32/.test(error.message)
            ? error.message
            : 'Error rotating the key vault secret';
        console.error('Rotating the key vault secret failed', error);
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}
