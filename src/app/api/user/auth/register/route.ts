import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidEmail, normalizeEmail } from '@/lib/server/auth-utils';
import { createPendingUser } from '@/lib/server/user-auth-store';
import { notifyRegistrationApprovalRequest } from '@/lib/server/user-notifications';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { AUTH_BODY_LIMIT_BYTES, credentialField, displayNameField, identifierField } from '../authValidation';

const RegisterSchema = z.object({
    email: identifierField.optional(),
    password: credentialField.optional(),
    displayName: displayNameField.optional(),
});

export async function POST(request: Request) {
    try {
        const body = await parseJsonRequest(request, RegisterSchema, AUTH_BODY_LIMIT_BYTES);
        const email = (body.email || '').trim();
        const password = body.password || '';
        const displayName = (body.displayName || '').trim();

        if (!isValidEmail(email)) {
            return NextResponse.json({ success: false, message: 'Enter a valid email address.' }, { status: 400 });
        }

        if (password.length < 6) {
            return NextResponse.json({ success: false, message: 'Password must be at least 6 characters.' }, { status: 400 });
        }

        const result = await createPendingUser({
            email: normalizeEmail(email),
            password,
            displayName: displayName || email
        });

        if (!result.ok) {
            const existing = result.user;
            if (existing.status === 'pending') {
                return NextResponse.json({
                    success: true,
                    pending: true,
                    message: 'Registration already submitted. Awaiting approval.'
                });
            }
            return NextResponse.json({
                success: false,
                message: 'An account with this email already exists.'
            }, { status: 409 });
        }

        await notifyRegistrationApprovalRequest({
            email: result.user.email,
            displayName: result.user.displayName
        });

        return NextResponse.json({
            success: true,
            pending: true,
            message: 'Registration submitted. Approval email sent to admin.'
        });
    } catch (error) {
        const invalid = legacyValidationResponse(error);
        if (invalid) return invalid;
        console.error('User registration failed', error);
        return NextResponse.json({ success: false, message: 'Registration failed.' }, { status: 500 });
    }
}
