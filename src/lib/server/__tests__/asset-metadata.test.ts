/** @jest-environment node */

import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';

type AssetMetadataModule = typeof import('@/lib/server/asset-metadata');

let getAssetMetadata: AssetMetadataModule['getAssetMetadata'];
let getAssetMetadataByFolder: AssetMetadataModule['getAssetMetadataByFolder'];
let removeAssetMetadata: AssetMetadataModule['removeAssetMetadata'];
let renameAssetMetadata: AssetMetadataModule['renameAssetMetadata'];
let upsertAssetMetadata: AssetMetadataModule['upsertAssetMetadata'];

const originalCwd = process.cwd();

const indexPath = () => path.join(process.cwd(), 'public', 'assets', 'asset-index.json');

const writeIndex = async (data: Record<string, unknown>) => {
    const target = indexPath();
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(data, null, 2), 'utf8');
};

const readIndex = async () => {
    const raw = await readFile(indexPath(), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
};

describe('asset-metadata', () => {
    let tempDir = '';

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'asset-metadata-test-'));
        process.chdir(tempDir);

        const assetMetadataModule = await import('@/lib/server/asset-metadata');
        getAssetMetadata = assetMetadataModule.getAssetMetadata;
        getAssetMetadataByFolder = assetMetadataModule.getAssetMetadataByFolder;
        removeAssetMetadata = assetMetadataModule.removeAssetMetadata;
        renameAssetMetadata = assetMetadataModule.renameAssetMetadata;
        upsertAssetMetadata = assetMetadataModule.upsertAssetMetadata;
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it('returns undefined metadata when index file does not exist', async () => {
        await expect(getAssetMetadata('uploads', 'images', 'cat.png')).resolves.toBeUndefined();
    });

    it('filters metadata by folder prefix', async () => {
        await writeIndex({
            'uploads/images/cat.png': { owner: 'alice', isPublic: false, createdAt: '1', updatedAt: '1' },
            'uploads/images/dog.png': { owner: 'bob', isPublic: true, createdAt: '2', updatedAt: '2' },
            'generated/images/sky.png': { owner: 'alice', isPublic: true, createdAt: '3', updatedAt: '3' },
        });

        await expect(getAssetMetadataByFolder('uploads', 'images')).resolves.toEqual({
            'cat.png': { owner: 'alice', isPublic: false, createdAt: '1', updatedAt: '1' },
            'dog.png': { owner: 'bob', isPublic: true, createdAt: '2', updatedAt: '2' },
        });
    });

    it('handles invalid index shapes and read errors', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const target = indexPath();
        await mkdir(path.dirname(target), { recursive: true });

        await writeFile(target, JSON.stringify([]), 'utf8');
        await expect(getAssetMetadataByFolder('uploads', 'images')).resolves.toEqual({});

        await writeFile(target, '{ bad json', 'utf8');
        await expect(getAssetMetadata('uploads', 'images', 'cat.png')).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalled();
    });

    it('upserts metadata with defaults and preserves existing createdAt fields', async () => {
        const first = await upsertAssetMetadata({
            category: 'uploads',
            type: 'images',
            name: 'cat.png',
        });

        expect(first.owner).toBe('Guest');
        expect(first.isPublic).toBe(false);

        const writtenFirst = await readIndex();
        expect((writtenFirst['uploads/images/cat.png'] as { owner: string }).owner).toBe('Guest');

        await writeIndex({
            'uploads/images/cat.png': {
                owner: 'alice@example.com',
                isPublic: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
            },
        });

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
        await writeIndex({
            'uploads/images/cat.png': { owner: 'alice', isPublic: false, createdAt: '1', updatedAt: '1' },
        });

        await renameAssetMetadata('uploads', 'images', 'cat.png', 'cat-renamed.png');
        const renamedPayload = await readIndex();
        expect(renamedPayload['uploads/images/cat.png']).toBeUndefined();
        expect(renamedPayload['uploads/images/cat-renamed.png']).toBeDefined();

        await removeAssetMetadata('uploads', 'images', 'cat-renamed.png');
        const removedPayload = await readIndex();
        expect(removedPayload['uploads/images/cat-renamed.png']).toBeUndefined();
    });

    it('keeps index unchanged when rename/remove target does not exist', async () => {
        await writeIndex({});

        await renameAssetMetadata('uploads', 'images', 'missing.png', 'next.png');
        await removeAssetMetadata('uploads', 'images', 'missing.png');

        await expect(readIndex()).resolves.toEqual({});
    });
});
