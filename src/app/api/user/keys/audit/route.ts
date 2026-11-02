import { NextRequest, NextResponse } from 'next/server';
import { describeUserApiKeys, readUserVaultAudit } from '@/lib/server/user-key-vault';
import { authorizeVaultOwner } from '@/lib/server/keyVaultOwner';

/**
 * The owner's view of their vault without the values: which keys are held,
 * how old each is against the rotation policy, and the recent trail of who
 * read or changed them. Same authorisation as the keys themselves.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const ownerId = searchParams.get('username') || searchParams.get('userId');
        if (!ownerId) {
            return NextResponse.json({ message: 'Username required' }, { status: 400 });
        }
        const denied = await authorizeVaultOwner(req, ownerId);
        if (denied) return denied;

        const limit = Number.parseInt(searchParams.get('limit') ?? '', 10);
        const [description, events] = await Promise.all([
            describeUserApiKeys(ownerId),
            readUserVaultAudit(ownerId, Number.isFinite(limit) ? limit : 100),
        ]);
        return NextResponse.json({ ...description, events }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Reading the key vault audit failed', error);
        return NextResponse.json({ message: 'Error reading key audit' }, { status: 500 });
    }
}
