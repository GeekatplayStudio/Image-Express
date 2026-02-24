/** @jest-environment node */

jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
    },
}));

import { promises as fs } from 'fs';
import { verifyPassword } from '@/lib/server/auth-utils';
import {
    changePassword,
    clearResetToken,
    createPendingUser,
    findUserByIdentifier,
    isAdminUser,
    loadUsers,
    saveUsers,
    setResetToken,
    toPublicUser,
    updateUser,
    verifyResetToken,
} from '@/lib/server/user-auth-store';

describe('user-auth-store', () => {
    const fsPromisesMock = fs as unknown as {
        mkdir: jest.Mock;
        readFile: jest.Mock;
        writeFile: jest.Mock;
    };
    let fileContent: string | null = null;

    const readPersistedStore = () => JSON.parse(fileContent || '{"version":1,"users":[],"updatedAt":""}');

    beforeEach(() => {
        jest.clearAllMocks();
        fileContent = null;

        fsPromisesMock.mkdir.mockResolvedValue(undefined);
        fsPromisesMock.readFile.mockImplementation(async () => {
            if (fileContent === null) {
                const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
                throw error;
            }
            return fileContent;
        });
        fsPromisesMock.writeFile.mockImplementation(async (_path: string, content: string) => {
            fileContent = content;
        });
    });

    it('seeds default admin and member users when store is missing', async () => {
        const store = await loadUsers();

        expect(store.users).toHaveLength(2);
        const admin = store.users.find((user) => user.email === 'geekatplay@gmail.com');
        const member = store.users.find((user) => user.email === 'iam@geekatplay.com');

        expect(admin?.status).toBe('approved');
        expect(admin?.roles).toContain('admin');
        expect(admin?.rights).toContain('users:manage');
        expect(member?.status).toBe('approved');
        expect(member?.roles).toContain('creator');
        expect(member?.rights).toContain('assets:own');
        expect(fsPromisesMock.writeFile).toHaveBeenCalled();
    });

    it('creates pending users and rejects duplicates', async () => {
        await loadUsers();

        const created = await createPendingUser({
            email: ' New.User+1@Example.com ',
            displayName: '   ',
            password: 'secret-123',
        });

        expect(created.ok).toBe(true);
        if (created.ok) {
            expect(created.user.email).toBe('new.user+1@example.com');
            expect(created.user.displayName).toBe('new.user+1@example.com');
            expect(created.user.username).toBe('new.user1');
            expect(created.user.status).toBe('pending');
            expect(created.user.roles).toEqual(['creator']);
        }

        const duplicate = await createPendingUser({
            email: 'new.user+1@example.com',
            displayName: 'Second',
            password: 'secret-456',
        });

        expect(duplicate.ok).toBe(false);
        if (!duplicate.ok) {
            expect(duplicate.reason).toBe('exists');
        }
    });

    it('updates users and normalizes updated email fields', async () => {
        await loadUsers();
        const created = await createPendingUser({
            email: 'rename.me@example.com',
            displayName: 'Rename Me',
            password: 'secret-123',
        });
        expect(created.ok).toBe(true);

        const missing = await updateUser('missing@example.com', (user) => user);
        expect(missing).toBeNull();

        const noUpdate = await updateUser('rename.me@example.com', () => null);
        expect(noUpdate).toBeNull();

        const updated = await updateUser('rename.me@example.com', (user) => ({
            ...user,
            email: 'MIXED@Example.com',
            displayName: 'Updated Name',
        }));

        expect(updated?.email).toBe('mixed@example.com');
        expect(updated?.displayName).toBe('Updated Name');
    });

    it('handles reset token lifecycle and password changes', async () => {
        await loadUsers();
        await createPendingUser({
            email: 'reset@example.com',
            displayName: 'Reset User',
            password: 'old-password',
        });

        const reset = await setResetToken('reset@example.com', 10);
        expect(reset).not.toBeNull();
        expect(reset?.token).toBeTruthy();

        const storeAfterReset = await loadUsers();
        const userAfterReset = storeAfterReset.users.find((user) => user.email === 'reset@example.com');
        expect(userAfterReset).toBeDefined();
        expect(userAfterReset?.resetTokenHash).toBeTruthy();
        expect(verifyResetToken(userAfterReset!, reset!.token)).toBe(true);
        expect(verifyResetToken(userAfterReset!, 'wrong-token')).toBe(false);

        const expiredReset = await setResetToken('reset@example.com', -1);
        const storeAfterExpired = await loadUsers();
        const expiredUser = storeAfterExpired.users.find((user) => user.email === 'reset@example.com');
        expect(verifyResetToken(expiredUser!, expiredReset!.token)).toBe(false);

        await clearResetToken('reset@example.com');
        const storeAfterClear = await loadUsers();
        const clearedUser = storeAfterClear.users.find((user) => user.email === 'reset@example.com');
        expect(clearedUser).toBeDefined();
        expect(verifyResetToken(clearedUser!, reset!.token)).toBe(false);

        const oldHash = clearedUser!.passwordHash;
        const oldSalt = clearedUser!.passwordSalt;
        const changed = await changePassword('reset@example.com', 'new-password');
        expect(changed).not.toBeNull();
        expect(changed?.passwordHash).not.toBe(oldHash);
        expect(changed?.passwordSalt).not.toBe(oldSalt);
        expect(verifyPassword('new-password', changed!.passwordSalt, changed!.passwordHash)).toBe(true);
        expect(changed?.resetTokenHash).toBeUndefined();
        expect(changed?.resetTokenExpiresAt).toBeUndefined();
    });

    it('supports helper utilities for public user shaping and lookup', async () => {
        const seeded = await loadUsers();
        await saveUsers(seeded.users);

        const admin = seeded.users.find((user) => user.email === 'geekatplay@gmail.com');
        expect(admin).toBeDefined();

        const byEmail = findUserByIdentifier(seeded.users, 'GEEKATPLAY@GMAIL.COM');
        expect(byEmail?.email).toBe('geekatplay@gmail.com');

        const byUsername = findUserByIdentifier(seeded.users, 'vovka');
        expect(byUsername?.email).toBe('geekatplay@gmail.com');

        expect(isAdminUser(admin)).toBe(true);
        expect(isAdminUser(undefined)).toBe(false);
        expect(
            isAdminUser({
                ...admin!,
                roles: [],
                rights: ['users:manage'],
            })
        ).toBe(true);

        const publicUser = toPublicUser(admin!);
        expect(publicUser.email).toBe('geekatplay@gmail.com');
        expect((publicUser as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();

        const persisted = readPersistedStore();
        expect(Array.isArray(persisted.users)).toBe(true);
        expect(fsPromisesMock.writeFile).toHaveBeenCalled();
    });
});
