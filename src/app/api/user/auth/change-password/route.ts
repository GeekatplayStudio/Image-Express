import { NextResponse } from 'next/server';

import { verifyPassword } from '@/lib/server/auth-utils';
import { changePassword, findUserByIdentifier, loadUsers } from '@/lib/server/user-auth-store';

type ChangePasswordPayload = {
    identifier?: string;
    currentPassword?: string;
    newPassword?: string;
};

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as ChangePasswordPayload;
        const identifier = (body.identifier || '').trim();
        const currentPassword = body.currentPassword || '';
        const newPassword = body.newPassword || '';

        if (!identifier) {
            return NextResponse.json({ success: false, message: 'Account identifier is required.' }, { status: 400 });
        }
        if (!currentPassword) {
            return NextResponse.json({ success: false, message: 'Current password is required.' }, { status: 400 });
        }
        if (newPassword.length < 6) {
            return NextResponse.json({ success: false, message: 'New password must be at least 6 characters.' }, { status: 400 });
        }

        const store = await loadUsers();
        const user = findUserByIdentifier(store.users, identifier);
        if (!user || !verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
            return NextResponse.json({ success: false, message: 'Current password is incorrect.' }, { status: 401 });
        }

        if (verifyPassword(newPassword, user.passwordSalt, user.passwordHash)) {
            return NextResponse.json({ success: false, message: 'New password must be different from the current password.' }, { status: 400 });
        }

        if (user.status === 'pending') {
            return NextResponse.json({ success: false, message: 'Account pending admin approval.' }, { status: 403 });
        }
        if (user.status === 'rejected') {
            return NextResponse.json({ success: false, message: 'Your account request was rejected.' }, { status: 403 });
        }
        if (user.status === 'disabled') {
            return NextResponse.json({ success: false, message: 'This account is disabled.' }, { status: 403 });
        }

        await changePassword(user.email, newPassword);
        return NextResponse.json({ success: true, message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Change password failed', error);
        return NextResponse.json({ success: false, message: 'Password change failed.' }, { status: 500 });
    }
}