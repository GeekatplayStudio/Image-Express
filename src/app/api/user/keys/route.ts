import { NextRequest, NextResponse } from 'next/server';
import { loadUserApiKeys, mergeUserApiKeys } from '@/lib/server/user-key-vault';

type UserApiKeysPayload = {
    username?: string;
    userId?: string;
    keys?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as UserApiKeysPayload;
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
        const description = error instanceof Error ? error.message : 'Error saving keys';
        return NextResponse.json({ message: description }, { status: 500 });
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
         const description = error instanceof Error ? error.message : 'Error retrieving keys';
         return NextResponse.json({ message: description }, { status: 500 });
    }
}
