/** @jest-environment node */

jest.mock('@/lib/server/auth-utils', () => ({
    verifyPassword: jest.fn(),
}));

jest.mock('@/lib/server/user-session', () => ({
    createUserSessionToken: jest.fn(() => 'session-token'),
}));

jest.mock('@/lib/server/user-auth-store', () => ({
    loadUsers: jest.fn(),
    findUserByIdentifier: jest.fn(),
    toPublicUser: jest.fn((user: unknown) => user),
}));

import { POST } from '@/app/api/user/auth/login/route';
import { verifyPassword } from '@/lib/server/auth-utils';
import { createUserSessionToken } from '@/lib/server/user-session';
import { findUserByIdentifier, loadUsers } from '@/lib/server/user-auth-store';

describe('/api/user/auth/login', () => {
    const verifyPasswordMock = verifyPassword as jest.MockedFunction<typeof verifyPassword>;
    const createUserSessionTokenMock = createUserSessionToken as jest.MockedFunction<typeof createUserSessionToken>;
    const loadUsersMock = loadUsers as jest.MockedFunction<typeof loadUsers>;
    const findUserByIdentifierMock = findUserByIdentifier as jest.MockedFunction<typeof findUserByIdentifier>;

    const approvedUser = {
        id: 'usr_1',
        email: 'artist@example.com',
        displayName: 'Artist',
        username: 'artist',
        passwordHash: 'hash',
        passwordSalt: 'salt',
        status: 'approved',
        roles: ['creator'],
        rights: ['assets:own'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        loadUsersMock.mockResolvedValue({
            version: 1,
            users: [approvedUser],
            updatedAt: approvedUser.updatedAt,
        } as Awaited<ReturnType<typeof loadUsers>>);
        findUserByIdentifierMock.mockReturnValue(approvedUser as Parameters<typeof findUserByIdentifier>[0][number]);
        verifyPasswordMock.mockReturnValue(true);
    });

    it('returns a session token for an approved user login', async () => {
        const response = await POST(new Request('http://localhost/api/user/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'artist@example.com', password: 'secret123' }),
        }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            success: true,
            user: expect.objectContaining({
                email: 'artist@example.com',
                sessionToken: 'session-token',
            }),
        });
        expect(createUserSessionTokenMock).toHaveBeenCalledWith(approvedUser);
    });
});