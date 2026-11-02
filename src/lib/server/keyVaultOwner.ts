import { NextResponse } from 'next/server';
import { resolveRequestUser } from '@/lib/server/user-session';

/**
 * Only the signed-in owner may read or change a vault.
 *
 * The keys route used to trust the name in the request: `?userId=someone`
 * returned that account's decrypted provider keys to anyone who could reach
 * the server, and a POST overwrote them. The owner is taken from the session
 * token and the name in the request must be one of that account's own
 * identifiers.
 *
 * Returns a response to send, or null to continue.
 */
export async function authorizeVaultOwner(request: Request, ownerId: string): Promise<NextResponse | null> {
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
