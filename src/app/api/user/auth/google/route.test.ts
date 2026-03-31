const mockCreateOneTimeToken = jest.fn(() => 'token');
const mockIsValidEmail = jest.fn(() => true);
const mockNormalizeEmail = jest.fn((email: string) => email.trim().toLowerCase());
const mockLoadUsers = jest.fn();
const mockFindUserByIdentifier = jest.fn();
const mockToPublicUser = jest.fn((user: unknown) => user);
const mockCreatePendingUser = jest.fn();
const mockNotifyRegistrationApprovalRequest = jest.fn();

jest.mock('@/lib/server/auth-utils', () => ({
    createOneTimeToken: (...args: unknown[]) => mockCreateOneTimeToken(...args),
    isValidEmail: (...args: unknown[]) => mockIsValidEmail(...args),
    normalizeEmail: (...args: unknown[]) => mockNormalizeEmail(...args),
}));

jest.mock('@/lib/server/user-auth-store', () => ({
    createPendingUser: (...args: unknown[]) => mockCreatePendingUser(...args),
    findUserByIdentifier: (...args: unknown[]) => mockFindUserByIdentifier(...args),
    loadUsers: (...args: unknown[]) => mockLoadUsers(...args),
    toPublicUser: (...args: unknown[]) => mockToPublicUser(...args),
}));

jest.mock('@/lib/server/user-notifications', () => ({
    notifyRegistrationApprovalRequest: (...args: unknown[]) => mockNotifyRegistrationApprovalRequest(...args),
}));

describe('/api/user/auth/google', () => {
    const originalFetch = global.fetch;
    const originalRequest = global.Request;
    const originalResponse = global.Response;
    const originalHeaders = global.Headers;
    const originalTextEncoder = global.TextEncoder;
    const originalTextDecoder = global.TextDecoder;
    const originalReadableStream = global.ReadableStream;
    const originalTransformStream = global.TransformStream;
    const originalMessagePort = global.MessagePort;
    const originalMessageChannel = global.MessageChannel;
    const originalGoogleAuthClientId = process.env.NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID;
    const originalGoogleDriveClientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID;
    let POST: typeof import('@/app/api/user/auth/google/route').POST;

    beforeEach(async () => {
        jest.clearAllMocks();
        if (!global.TextEncoder || !global.TextDecoder) {
            const { TextEncoder, TextDecoder } = await import('util');
            Object.assign(global, { TextEncoder, TextDecoder });
        }
        if (!global.ReadableStream || !global.TransformStream) {
            const { ReadableStream, TransformStream } = await import('stream/web');
            Object.assign(global, { ReadableStream, TransformStream });
        }
        if (!global.MessagePort || !global.MessageChannel) {
            const { MessagePort, MessageChannel } = await import('worker_threads');
            Object.assign(global, { MessagePort, MessageChannel });
        }
        if (!global.Request || !global.Response || !global.Headers) {
            const { Request, Response, Headers } = await import('undici');
            Object.assign(global, { Request, Response, Headers });
        }
        ({ POST } = await import('@/app/api/user/auth/google/route'));
        delete process.env.NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID;
        delete process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID;
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                email: 'artist@example.com',
                email_verified: true,
                name: 'Artist',
                aud: 'client-1.apps.googleusercontent.com',
            }),
        }) as typeof global.fetch;
        mockLoadUsers.mockResolvedValue({ users: [] });
        mockFindUserByIdentifier.mockReturnValue({
            id: 'user-1',
            email: 'artist@example.com',
            displayName: 'Artist',
            status: 'approved',
            roles: ['user'],
            rights: [],
        });
    });

    afterAll(() => {
        global.fetch = originalFetch;
        global.Request = originalRequest;
        global.Response = originalResponse;
        global.Headers = originalHeaders;
        global.TextEncoder = originalTextEncoder;
        global.TextDecoder = originalTextDecoder;
        global.ReadableStream = originalReadableStream;
        global.TransformStream = originalTransformStream;
        global.MessagePort = originalMessagePort;
        global.MessageChannel = originalMessageChannel;
        if (typeof originalGoogleAuthClientId === 'string') {
            process.env.NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID = originalGoogleAuthClientId;
        }
        if (typeof originalGoogleDriveClientId === 'string') {
            process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID = originalGoogleDriveClientId;
        }
    });

    it('accepts the request client ID as the audience fallback when env config is absent', async () => {
        const request = new Request('http://localhost:3000/api/user/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                credential: 'google-credential-123',
                clientId: 'client-1.apps.googleusercontent.com',
            }),
        });

        const response = await POST(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            user: expect.objectContaining({
                email: 'artist@example.com',
                displayName: 'Artist',
            }),
        });
    });
});