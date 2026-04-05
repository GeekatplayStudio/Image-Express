/** @jest-environment node */

jest.mock('@/lib/server/user-auth-store', () => ({
    loadUsers: jest.fn(),
    findUserByIdentifier: jest.fn(),
}));

import { findUserByIdentifier, loadUsers } from '@/lib/server/user-auth-store';
import { createUserSessionToken, verifyUserSessionToken } from '@/lib/server/user-session';

describe('user session tokens', () => {
    const originalSessionSecret = process.env.IMAGE_EXPRESS_SESSION_SECRET;
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
        process.env.IMAGE_EXPRESS_SESSION_SECRET = 'test-session-secret';
        loadUsersMock.mockResolvedValue({
            version: 1,
            users: [approvedUser],
            updatedAt: approvedUser.updatedAt,
        } as Awaited<ReturnType<typeof loadUsers>>);
        findUserByIdentifierMock.mockReturnValue(approvedUser as Parameters<typeof findUserByIdentifier>[0][number]);
    });

    afterAll(() => {
        if (typeof originalSessionSecret === 'string') {
            process.env.IMAGE_EXPRESS_SESSION_SECRET = originalSessionSecret;
        } else {
            delete process.env.IMAGE_EXPRESS_SESSION_SECRET;
        }
    });

    it('creates a token that resolves back to the approved user', async () => {
        const token = createUserSessionToken(approvedUser);

        await expect(verifyUserSessionToken(token)).resolves.toEqual(approvedUser);
    });

    it('rejects a tampered token signature', async () => {
        const token = createUserSessionToken(approvedUser);
        const tampered = `${token}tampered`;

        await expect(verifyUserSessionToken(tampered)).resolves.toBeNull();
    });

    it('rejects a token after the user record changes materially', async () => {
        const token = createUserSessionToken(approvedUser);
        findUserByIdentifierMock.mockReturnValueOnce({
            ...approvedUser,
            updatedAt: new Date(Date.now() + 15_000).toISOString(),
        } as Parameters<typeof findUserByIdentifier>[0][number]);

        await expect(verifyUserSessionToken(token)).resolves.toBeNull();
    });
});