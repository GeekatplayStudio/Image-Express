/** @jest-environment node */

jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        appendFile: jest.fn(),
    },
}));

import { promises as fs } from 'fs';
import {
    notifyPasswordResetToken,
    notifyRegistrationApprovalRequest,
} from '@/lib/server/user-notifications';

describe('user-notifications', () => {
    const fsPromisesMock = fs as unknown as {
        mkdir: jest.Mock;
        appendFile: jest.Mock;
    };
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env.RESEND_API_KEY;
        delete process.env.RESEND_FROM_EMAIL;
        fsPromisesMock.mkdir.mockResolvedValue(undefined);
        fsPromisesMock.appendFile.mockResolvedValue(undefined);
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('logs registration requests in log-only mode when email config is missing', async () => {
        await notifyRegistrationApprovalRequest({
            email: 'user@example.com',
            displayName: 'Test "Display"',
        });

        expect(fsPromisesMock.appendFile).toHaveBeenCalledWith(
            expect.stringContaining('approval-requests.log'),
            expect.stringContaining('mode="log-only"'),
            'utf8'
        );
        expect(fsPromisesMock.appendFile).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining(`displayName="Test 'Display'"`),
            'utf8'
        );
    });

    it('sends via resend and logs as email+log when provider responds ok', async () => {
        process.env.RESEND_API_KEY = 'resend-key';
        process.env.RESEND_FROM_EMAIL = 'noreply@example.com';
        const fetchMock = jest.fn().mockResolvedValue({ ok: true });
        (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

        await notifyPasswordResetToken({
            email: 'user@example.com',
            token: 'token-123',
            expiresAt: '2026-02-14T00:00:00.000Z',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.resend.com/emails',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer resend-key',
                }),
            })
        );
        expect(fsPromisesMock.appendFile).toHaveBeenCalledWith(
            expect.stringContaining('password-reset.log'),
            expect.stringContaining('mode="email+log"'),
            'utf8'
        );
    });

    it('falls back to log-only when sending fails and still appends logs when mkdir fails', async () => {
        process.env.RESEND_API_KEY = 'resend-key';
        process.env.RESEND_FROM_EMAIL = 'noreply@example.com';
        fsPromisesMock.mkdir.mockRejectedValueOnce(new Error('mkdir failed'));
        const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
        (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;

        await notifyPasswordResetToken({
            email: 'user@example.com',
            token: 'token-456',
            expiresAt: '2026-02-14T00:00:00.000Z',
        });

        expect(fsPromisesMock.appendFile).toHaveBeenCalledWith(
            expect.stringContaining('password-reset.log'),
            expect.stringContaining('mode="log-only"'),
            'utf8'
        );
    });
});
