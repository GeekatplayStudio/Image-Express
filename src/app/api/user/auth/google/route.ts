import { NextResponse } from 'next/server';
import { createOneTimeToken, isValidEmail, normalizeEmail } from '@/lib/server/auth-utils';
import { createUserSessionToken } from '@/lib/server/user-session';
import {
    createPendingUser,
    findUserByIdentifier,
    loadUsers,
    toPublicUser
} from '@/lib/server/user-auth-store';
import { notifyRegistrationApprovalRequest } from '@/lib/server/user-notifications';

type GoogleLoginPayload = {
    credential?: string;
    clientId?: string;
};

type GoogleTokenInfo = {
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    aud?: string;
};

async function fetchGoogleTokenInfo(credential: string) {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as GoogleTokenInfo | null;
    if (!res.ok || !data) {
        throw new Error('Invalid Google credential.');
    }
    return data;
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as GoogleLoginPayload;
        const credential = (body.credential || '').trim();
        const requestedClientId = (body.clientId || '').trim();
        if (!credential) {
            return NextResponse.json({ success: false, message: 'Missing Google credential.' }, { status: 400 });
        }

        const tokenInfo = await fetchGoogleTokenInfo(credential);
        const email = normalizeEmail(tokenInfo.email || '');
        if (!isValidEmail(email)) {
            return NextResponse.json({ success: false, message: 'Google account email is invalid.' }, { status: 400 });
        }

        const emailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';
        if (!emailVerified) {
            return NextResponse.json({ success: false, message: 'Google email is not verified.' }, { status: 403 });
        }

        const expectedAudience = (
            process.env.NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID
            || process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID
            || requestedClientId
            || ''
        ).trim();
        if (expectedAudience && tokenInfo.aud && tokenInfo.aud !== expectedAudience) {
            return NextResponse.json({ success: false, message: 'Google credential audience mismatch.' }, { status: 403 });
        }

        const store = await loadUsers();
        const user = findUserByIdentifier(store.users, email);

        if (user) {
            if (user.status === 'pending') {
                return NextResponse.json({
                    success: false,
                    code: 'PENDING_APPROVAL',
                    email,
                    message: 'Account pending admin approval.'
                }, { status: 403 });
            }
            if (user.status === 'rejected') {
                return NextResponse.json({
                    success: false,
                    code: 'REJECTED',
                    email,
                    message: 'Your account request was rejected.'
                }, { status: 403 });
            }
            if (user.status === 'disabled') {
                return NextResponse.json({
                    success: false,
                    code: 'DISABLED',
                    email,
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
        }

        const displayName = (tokenInfo.name || tokenInfo.given_name || email).trim();
        const tempPassword = `${createOneTimeToken()}${createOneTimeToken()}`;
        const created = await createPendingUser({
            email,
            displayName,
            password: tempPassword
        });

        if (!created.ok) {
            return NextResponse.json({
                success: false,
                code: 'EXISTS',
                email,
                message: 'An account with this email already exists.'
            }, { status: 409 });
        }

        await notifyRegistrationApprovalRequest({
            email: created.user.email,
            displayName: created.user.displayName
        });

        return NextResponse.json({
            success: false,
            code: 'REQUEST_SUBMITTED',
            email,
            message: 'Access request submitted. Await admin approval at geekatplay@gmail.com.'
        }, { status: 403 });
    } catch (error) {
        console.error('Google auth failed', error);
        return NextResponse.json({ success: false, message: 'Google authentication failed.' }, { status: 500 });
    }
}
