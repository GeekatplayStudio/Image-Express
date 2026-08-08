import { NextResponse } from 'next/server';
import { z } from 'zod';
import { legacyValidationResponse, parseJsonRequest } from '@/lib/server/apiContract';
import {
    isAdminUser,
    loadUsers,
    toPublicUser,
    updateUser
} from '@/lib/server/user-auth-store';
import { normalizeEmail } from '@/lib/server/auth-utils';

const AdminUpdateSchema = z.object({
    requesterEmail: z.string().max(320).optional(),
    targetEmail: z.string().max(320).optional(),
    // The action decides what the route does to another user's account, so it
    // is the one field worth constraining to a closed set rather than a string.
    action: z.enum([
        'approve', 'reject', 'disable', 'enable',
        'set-roles', 'set-rights', 'set-display-name',
    ]).optional(),
    roles: z.array(z.string().max(100)).max(50).optional(),
    rights: z.array(z.string().max(100)).max(200).optional(),
    displayName: z.string().max(200).optional(),
});

const ADMIN_BODY_LIMIT_BYTES = 32 * 1024;

function normalizeStringList(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    return values
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const requesterEmail = normalizeEmail(searchParams.get('requesterEmail') || '');
        if (!requesterEmail) {
            return NextResponse.json({ success: false, message: 'requesterEmail is required.' }, { status: 400 });
        }

        const store = await loadUsers();
        const requester = store.users.find((user) => user.email === requesterEmail);
        if (!isAdminUser(requester)) {
            return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
        }

        const users = store.users.map(toPublicUser);
        return NextResponse.json({ success: true, users });
    } catch (error) {
        console.error('Admin list users failed', error);
        return NextResponse.json({ success: false, message: 'Failed to list users.' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await parseJsonRequest(request, AdminUpdateSchema, ADMIN_BODY_LIMIT_BYTES);
        const requesterEmail = normalizeEmail(body.requesterEmail || '');
        const targetEmail = normalizeEmail(body.targetEmail || '');
        const action = body.action;

        if (!requesterEmail || !targetEmail || !action) {
            return NextResponse.json({ success: false, message: 'requesterEmail, targetEmail, and action are required.' }, { status: 400 });
        }

        const store = await loadUsers();
        const requester = store.users.find((user) => user.email === requesterEmail);
        if (!isAdminUser(requester)) {
            return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
        }

        const updated = await updateUser(targetEmail, (user) => {
            if (action === 'approve') {
                return {
                    ...user,
                    status: 'approved',
                    approvedAt: new Date().toISOString(),
                    approvedBy: requesterEmail
                };
            }
            if (action === 'reject') {
                return { ...user, status: 'rejected' };
            }
            if (action === 'disable') {
                return { ...user, status: 'disabled' };
            }
            if (action === 'enable') {
                return { ...user, status: 'approved' };
            }
            if (action === 'set-roles') {
                return { ...user, roles: normalizeStringList(body.roles) };
            }
            if (action === 'set-rights') {
                return { ...user, rights: normalizeStringList(body.rights) };
            }
            if (action === 'set-display-name') {
                const displayName = (body.displayName || '').trim();
                if (!displayName) return user;
                return { ...user, displayName };
            }
            return user;
        });

        if (!updated) {
            return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 });
        }

        return NextResponse.json({ success: true, user: toPublicUser(updated) });
    } catch (error) {
        const invalid = legacyValidationResponse(error);
        if (invalid) return invalid;
        console.error('Admin update user failed', error);
        return NextResponse.json({ success: false, message: 'Failed to update user.' }, { status: 500 });
    }
}
