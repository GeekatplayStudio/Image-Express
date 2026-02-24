/** @jest-environment node */

jest.mock('fs/promises', () => ({
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
}));

type AssetMetadataModule = typeof import('@/lib/server/asset-metadata');

let getAssetMetadata: AssetMetadataModule['getAssetMetadata'];
let getAssetMetadataByFolder: AssetMetadataModule['getAssetMetadataByFolder'];
let removeAssetMetadata: AssetMetadataModule['removeAssetMetadata'];
let renameAssetMetadata: AssetMetadataModule['renameAssetMetadata'];
let upsertAssetMetadata: AssetMetadataModule['upsertAssetMetadata'];

const fsPromises = jest.requireMock('fs/promises') as {
    mkdir: jest.Mock;
    readFile: jest.Mock;
    writeFile: jest.Mock;
};

describe('asset-metadata', () => {
    let mkdirMock: jest.Mock;
    let readFileMock: jest.Mock;
    let writeFileMock: jest.Mock;

    beforeAll(async () => {
        const module = await import('@/lib/server/asset-metadata');
        getAssetMetadata = module.getAssetMetadata;
        getAssetMetadataByFolder = module.getAssetMetadataByFolder;
        removeAssetMetadata = module.removeAssetMetadata;
        renameAssetMetadata = module.renameAssetMetadata;
        upsertAssetMetadata = module.upsertAssetMetadata;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mkdirMock = fsPromises.mkdir;
        readFileMock = fsPromises.readFile;
        writeFileMock = fsPromises.writeFile;
        mkdirMock.mockResolvedValue(undefined);
        writeFileMock.mockResolvedValue(undefined);
    });

    it('returns undefined metadata when index file does not exist', async () => {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
        readFileMock.mockRejectedValue(error);

        await expect(getAssetMetadata('uploads', 'images', 'cat.png')).resolves.toBeUndefined();
    });

    it('filters metadata by folder prefix', async () => {
        readFileMock.mockResolvedValue(
            JSON.stringify({
                'uploads/images/cat.png': { owner: 'alice', isPublic: false, createdAt: '1', updatedAt: '1' },
                'uploads/images/dog.png': { owner: 'bob', isPublic: true, createdAt: '2', updatedAt: '2' },
                'generated/images/sky.png': { owner: 'alice', isPublic: true, createdAt: '3', updatedAt: '3' },
            })
        );

        await expect(getAssetMetadataByFolder('uploads', 'images')).resolves.toEqual({
            'cat.png': { owner: 'alice', isPublic: false, createdAt: '1', updatedAt: '1' },
            'dog.png': { owner: 'bob', isPublic: true, createdAt: '2', updatedAt: '2' },
        });
    });

    it('handles invalid index shapes and read errors', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        readFileMock.mockResolvedValueOnce(JSON.stringify([]));
        await expect(getAssetMetadataByFolder('uploads', 'images')).resolves.toEqual({});

        readFileMock.mockRejectedValueOnce(new Error('boom'));
        await expect(getAssetMetadata('uploads', 'images', 'cat.png')).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalled();
    });

    it('upserts metadata with defaults and preserves existing createdAt fields', async () => {
        const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
        readFileMock.mockRejectedValueOnce(missing);

        const first = await upsertAssetMetadata({
            category: 'uploads',
            type: 'images',
            name: 'cat.png',
        });

        expect(first.owner).toBe('Guest');
        expect(first.isPublic).toBe(false);
        expect(mkdirMock).toHaveBeenCalled();
        expect(writeFileMock).toHaveBeenCalledTimes(1);

        const writtenFirst = JSON.parse(String(writeFileMock.mock.calls[0]?.[1]));
        expect(writtenFirst['uploads/images/cat.png'].owner).toBe('Guest');

        readFileMock.mockResolvedValueOnce(
            JSON.stringify({
                'uploads/images/cat.png': {
                    owner: 'alice@example.com',
                    isPublic: true,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            })
        );

        const second = await upsertAssetMetadata({
            category: 'uploads',
            type: 'images',
            name: 'cat.png',
        });

        expect(second.owner).toBe('alice@example.com');
        expect(second.isPublic).toBe(true);
        expect(second.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('renames and removes metadata entries', async () => {
        readFileMock.mockResolvedValueOnce(
            JSON.stringify({
                'uploads/images/cat.png': { owner: 'alice', isPublic: false, createdAt: '1', updatedAt: '1' },
            })
        );

        await renameAssetMetadata('uploads', 'images', 'cat.png', 'cat-renamed.png');
        const renamedPayload = JSON.parse(String(writeFileMock.mock.calls[0]?.[1]));
        expect(renamedPayload['uploads/images/cat.png']).toBeUndefined();
        expect(renamedPayload['uploads/images/cat-renamed.png']).toBeDefined();

        readFileMock.mockResolvedValueOnce(
            JSON.stringify({
                'uploads/images/cat-renamed.png': { owner: 'alice', isPublic: false, createdAt: '1', updatedAt: '1' },
            })
        );
        await removeAssetMetadata('uploads', 'images', 'cat-renamed.png');
        const removedPayload = JSON.parse(String(writeFileMock.mock.calls[1]?.[1]));
        expect(removedPayload['uploads/images/cat-renamed.png']).toBeUndefined();
    });

    it('skips writes when rename/remove target does not exist', async () => {
        readFileMock.mockResolvedValue(JSON.stringify({}));

        await renameAssetMetadata('uploads', 'images', 'missing.png', 'next.png');
        await removeAssetMetadata('uploads', 'images', 'missing.png');

        expect(writeFileMock).not.toHaveBeenCalled();
    });
});
