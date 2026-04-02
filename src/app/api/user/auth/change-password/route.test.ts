/** @jest-environment node */

jest.mock('@/lib/server/auth-utils', () => ({
    verifyPassword: jest.fn(),
}));

jest.mock('@/lib/server/user-auth-store', () => ({
    loadUsers: jest.fn(),
    findUserByIdentifier: jest.fn(),
    changePassword: jest.fn(),
}));

import { POST } from '@/app/api/user/auth/change-password/route';
import { verifyPassword } from '@/lib/server/auth-utils';
import { changePassword, findUserByIdentifier, loadUsers } from '@/lib/server/user-auth-store';

describe('/api/user/auth/change-password', () => {
    const verifyPasswordMock = verifyPassword as jest.MockedFunction<typeof verifyPassword>;
    const loadUsersMock = loadUsers as jest.MockedFunction<typeof loadUsers>;
    const findUserByIdentifierMock = findUserByIdentifier as jest.MockedFunction<typeof findUserByIdentifier>;
    const changePasswordMock = changePassword as jest.MockedFunction<typeof changePassword>;

    const approvedUser = {
        id: 'usr_1',
        email: 'artist@example.com',
        displayName: 'Artist',
        username: 'artist',
        passwordSalt: 'salt',
        passwordHash: 'hash',
        status: 'approved',
        roles: ['creator'],
        rights: ['assets:own'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        loadUsersMock.mockResolvedValue({ version: 1, users: [approvedUser], updatedAt: approvedUser.updatedAt } as Awaited<ReturnType<typeof loadUsers>>);
        findUserByIdentifierMock.mockReturnValue(approvedUser as Parameters<typeof findUserByIdentifier>[0][number]);
        verifyPasswordMock.mockReturnValue(true);
        changePasswordMock.mockResolvedValue(approvedUser as Awaited<ReturnType<typeof changePassword>>);
    });

    it('rejects missing current password', async () => {
        const response = await POST(new Request('http://localhost/api/user/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'artist@example.com', newPassword: 'new-secret' }),
        }));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ success: false, message: 'Current password is required.' });
    });

    it('rejects incorrect current password', async () => {
        verifyPasswordMock.mockReturnValueOnce(false);

        const response = await POST(new Request('http://localhost/api/user/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'artist@example.com', currentPassword: 'bad', newPassword: 'new-secret' }),
        }));

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ success: false, message: 'Current password is incorrect.' });
        expect(changePasswordMock).not.toHaveBeenCalled();
    });

    it('rejects reusing the same password', async () => {
        verifyPasswordMock.mockReturnValueOnce(true).mockReturnValueOnce(true);

        const response = await POST(new Request('http://localhost/api/user/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'artist@example.com', currentPassword: 'same-secret', newPassword: 'same-secret' }),
        }));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ success: false, message: 'New password must be different from the current password.' });
        expect(changePasswordMock).not.toHaveBeenCalled();
    });

    it('changes password for an approved user', async () => {
        verifyPasswordMock.mockReturnValueOnce(true).mockReturnValueOnce(false);

        const response = await POST(new Request('http://localhost/api/user/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'artist@example.com', currentPassword: 'old-secret', newPassword: 'new-secret' }),
        }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ success: true, message: 'Password changed successfully.' });
        expect(changePasswordMock).toHaveBeenCalledWith('artist@example.com', 'new-secret');
    });
});