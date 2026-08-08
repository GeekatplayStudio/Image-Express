import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidEmail, normalizeEmail } from '@/lib/server/auth-utils';
import { loadUsers, setResetToken } from '@/lib/server/user-auth-store';
import { notifyPasswordResetToken } from '@/lib/server/user-notifications';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { AUTH_BODY_LIMIT_BYTES, identifierField } from '../authValidation';

const RequestResetSchema = z.object({
    email: identifierField.optional(),
});

export async function POST(request: Request) {
    try {
        const body = await parseJsonRequest(request, RequestResetSchema, AUTH_BODY_LIMIT_BYTES);
        const email = normalizeEmail(body.email || '');
        if (!isValidEmail(email)) {
            return NextResponse.json({ success: false, message: 'Enter a valid email address.' }, { status: 400 });
        }

        const store = await loadUsers();
        const user = store.users.find((item) => item.email === email);
        if (!user) {
            return NextResponse.json({
                success: true,
                message: 'If that email exists, reset instructions were sent.'
            });
        }

        const tokenData = await setResetToken(email, 30);
        if (tokenData) {
            await notifyPasswordResetToken({
                email,
                token: tokenData.token,
                expiresAt: tokenData.expiresAt
            });
        }

        return NextResponse.json({
            success: true,
            message: 'If that email exists, reset instructions were sent.',
            // For local/dev workflows without SMTP, return token to unblock testing.
            debugToken: process.env.NODE_ENV === 'production' ? undefined : tokenData?.token
        });
    } catch (error) {
        const invalid = legacyValidationResponse(error);
        if (invalid) return invalid;
        console.error('Request reset failed', error);
        return NextResponse.json({ success: false, message: 'Reset request failed.' }, { status: 500 });
    }
}
