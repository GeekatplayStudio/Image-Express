/** @jest-environment node */

jest.mock('fs/promises', () => ({
    writeFile: jest.fn(),
    mkdir: jest.fn(),
}));

jest.mock('@/lib/server/asset-metadata', () => ({
    VALID_ASSET_CATEGORIES: ['uploads', 'generated'],
    upsertAssetMetadata: jest.fn(),
}));

jest.mock('@/lib/server/user-session', () => ({
    resolveRequestUser: jest.fn(),
}));

import { POST } from '@/app/api/assets/upload/route';
import { upsertAssetMetadata } from '@/lib/server/asset-metadata';
import { resolveRequestUser } from '@/lib/server/user-session';

describe('/api/assets/upload', () => {
    const fsPromisesMock = jest.requireMock('fs/promises') as {
        mkdir: jest.Mock;
        writeFile: jest.Mock;
    };
    const mkdirMock = fsPromisesMock.mkdir;
    const writeFileMock = fsPromisesMock.writeFile;
    const upsertAssetMetadataMock = upsertAssetMetadata as jest.MockedFunction<typeof upsertAssetMetadata>;
    const resolveRequestUserMock = resolveRequestUser as jest.MockedFunction<typeof resolveRequestUser>;

    beforeEach(() => {
        jest.clearAllMocks();
        resolveRequestUserMock.mockResolvedValue(null);
        mkdirMock.mockResolvedValue(undefined);
        writeFileMock.mockResolvedValue(undefined);
        upsertAssetMetadataMock.mockResolvedValue({
            category: 'uploads',
            type: 'images',
            name: 'capture-1.png',
            owner: 'Guest',
            isPublic: false,
            createdAt: '2026-04-04T00:00:00.000Z',
            updatedAt: '2026-04-04T00:00:00.000Z',
        } as Awaited<ReturnType<typeof upsertAssetMetadata>>);
    });

    function buildRequest(params?: { owner?: string; fileName?: string; type?: string; body?: string }) {
        const fileContents = params?.body || 'image-bytes';
        const file = {
            name: params?.fileName || 'capture.png',
            type: params?.type || 'image/png',
            size: Buffer.byteLength(fileContents),
            arrayBuffer: async () => Buffer.from(fileContents),
        };
        return {
            formData: async () => ({
                get: (key: string) => {
                    if (key === 'file') return file;
                    if (key === 'category') return 'uploads';
                    if (key === 'owner') return params?.owner || 'Guest';
                    return null;
                },
            }),
        } as unknown as Request;
    }

    it('allows a guest upload without authentication', async () => {
        const response = await POST(buildRequest());

        expect(response.status).toBe(200);
        expect(upsertAssetMetadataMock).toHaveBeenCalledWith(expect.objectContaining({ owner: 'Guest' }));
    });

    it('rejects a user-owned upload without authentication', async () => {
        const response = await POST(buildRequest({ owner: 'alice@example.com' }));

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({
            success: false,
            message: 'Authentication required for user-owned uploads.',
        });
        expect(writeFileMock).not.toHaveBeenCalled();
    });

    it('uses the authenticated user as the owner for user-owned uploads', async () => {
        resolveRequestUserMock.mockResolvedValue({ email: 'alice@example.com' } as Awaited<ReturnType<typeof resolveRequestUser>>);

        const response = await POST(buildRequest({ owner: 'alice@example.com' }));

        expect(response.status).toBe(200);
        expect(upsertAssetMetadataMock).toHaveBeenCalledWith(expect.objectContaining({ owner: 'alice@example.com' }));
    });

    it('rejects unsupported file types', async () => {
        const response = await POST(buildRequest({ fileName: 'capture.xyz', type: 'application/octet-stream' }));

        expect(response.status).toBe(415);
        await expect(response.json()).resolves.toEqual({
            success: false,
            message: 'Unsupported file type.',
        });
    });
});