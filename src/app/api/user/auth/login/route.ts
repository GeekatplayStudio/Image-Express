import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadUsers, findUserByIdentifier, toPublicUser } from '@/lib/server/user-auth-store';
import { verifyPassword } from '@/lib/server/auth-utils';
import { createUserSessionToken } from '@/lib/server/user-session';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import { AUTH_BODY_LIMIT_BYTES, credentialField, identifierField } from '../authValidation';

// Fields stay optional so the route keeps answering with its own "required"
// message; the schema is here to reject wrong types and absurd lengths, which
// previously reached the password hasher unchecked.
const LoginSchema = z.object({
    identifier: identifierField.optional(),
    password: credentialField.optional(),
});

export async function POST(request: Request) {
    try {
        const body = await parseJsonRequest(request, LoginSchema, AUTH_BODY_LIMIT_BYTES);
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
            user: {
                ...toPublicUser(user),
                sessionToken: createUserSessionToken(user),
            }
        });
    } catch (error) {
        const invalid = legacyValidationResponse(error);
        if (invalid) return invalid;
        console.error('User login failed', error);
        return NextResponse.json({ success: false, message: 'Login failed.' }, { status: 500 });
    }
}
