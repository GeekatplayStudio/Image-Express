import { NextResponse } from 'next/server';
import { isValidEmail, normalizeEmail } from '@/lib/server/auth-utils';
import { loadUsers, changePassword, verifyResetToken } from '@/lib/server/user-auth-store';

type ResetPasswordPayload = {
    email?: string;
    token?: string;
    password?: string;
};

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as ResetPasswordPayload;
        const email = normalizeEmail(body.email || '');
        const token = (body.token || '').trim();
        const password = body.password || '';

        if (!isValidEmail(email)) {
            return NextResponse.json({ success: false, message: 'Enter a valid email address.' }, { status: 400 });
        }
        if (!token) {
            return NextResponse.json({ success: false, message: 'Reset code is required.' }, { status: 400 });
        }
        if (password.length < 6) {
            return NextResponse.json({ success: false, message: 'Password must be at least 6 characters.' }, { status: 400 });
        }

        const store = await loadUsers();
        const user = store.users.find((item) => item.email === email);
        if (!user) {
            return NextResponse.json({ success: false, message: 'Invalid reset request.' }, { status: 400 });
        }

        if (!verifyResetToken(user, token)) {
            return NextResponse.json({ success: false, message: 'Invalid or expired reset code.' }, { status: 400 });
        }

        await changePassword(email, password);
        return NextResponse.json({ success: true, message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Reset password failed', error);
        return NextResponse.json({ success: false, message: 'Password reset failed.' }, { status: 500 });
    }
}
