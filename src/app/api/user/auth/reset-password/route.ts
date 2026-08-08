import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidEmail, normalizeEmail } from '@/lib/server/auth-utils';
import { loadUsers, changePassword, verifyResetToken } from '@/lib/server/user-auth-store';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { AUTH_BODY_LIMIT_BYTES, credentialField, identifierField, tokenField } from '../authValidation';

const ResetPasswordSchema = z.object({
    email: identifierField.optional(),
    token: tokenField.optional(),
    password: credentialField.optional(),
});

export async function POST(request: Request) {
    try {
        const body = await parseJsonRequest(request, ResetPasswordSchema, AUTH_BODY_LIMIT_BYTES);
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
        const invalid = legacyValidationResponse(error);
        if (invalid) return invalid;
        console.error('Reset password failed', error);
        return NextResponse.json({ success: false, message: 'Password reset failed.' }, { status: 500 });
    }
}
