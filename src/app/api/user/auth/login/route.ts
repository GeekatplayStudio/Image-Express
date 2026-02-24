import { NextResponse } from 'next/server';
import { loadUsers, findUserByIdentifier, toPublicUser } from '@/lib/server/user-auth-store';
import { verifyPassword } from '@/lib/server/auth-utils';

type LoginPayload = {
    identifier?: string;
    password?: string;
};

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as LoginPayload;
        const identifier = (body.identifier || '').trim();
        const password = body.password || '';

        if (!identifier || !password) {
            return NextResponse.json({ success: false, message: 'Email and password are required.' }, { status: 400 });
        }

        const store = await loadUsers();
        const user = findUserByIdentifier(store.users, identifier);
        if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
            return NextResponse.json({ success: false, message: 'Invalid email or password.' }, { status: 401 });
        }

        if (user.status === 'pending') {
            return NextResponse.json({
                success: false,
                code: 'PENDING_APPROVAL',
                message: 'Account pending admin approval.'
            }, { status: 403 });
        }

        if (user.status === 'rejected') {
            return NextResponse.json({
                success: false,
                code: 'REJECTED',
                message: 'Your account request was rejected.'
            }, { status: 403 });
        }

        if (user.status === 'disabled') {
            return NextResponse.json({
                success: false,
                code: 'DISABLED',
                message: 'This account is disabled.'
            }, { status: 403 });
        }

        return NextResponse.json({
            success: true,
            user: toPublicUser(user)
        });
    } catch (error) {
        console.error('User login failed', error);
        return NextResponse.json({ success: false, message: 'Login failed.' }, { status: 500 });
    }
}
