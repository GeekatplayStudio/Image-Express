/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    closeCatalogDb,
    countAssets,
    deleteAssets,
    folderPathOf,
    isSqliteAvailable,
    migrateCatalogFromJson,
    queryAssets,
    readAllAssets,
    readMeta,
    upsertAssets,
} from '@/lib/server/vaultCatalogDb';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

const ORIGINAL_DATA_DIR = process.env.IMAGE_EXPRESS_DATA_DIR;
let tempDir: string;

const asset = (id: string, over: Partial<VaultAssetRecord> = {}): VaultAssetRecord => ({
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    type: 'images',
    category: 'uploads',
    sizeBytes: 10,
    origin: { connector: 'local', uri: `file://d:/pics/${id}.png`, displayPath: `d:/pics/${id}.png` },
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    ...over,
} as VaultAssetRecord);

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-catalogdb-'));
    process.env.IMAGE_EXPRESS_DATA_DIR = tempDir;
    closeCatalogDb();
});

afterEach(async () => {
    // Close before removing the directory: an open handle blocks rmdir on
    // Windows, which is the same class of failure that broke the toolchain.
    closeCatalogDb();
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.IMAGE_EXPRESS_DATA_DIR;
    else process.env.IMAGE_EXPRESS_DATA_DIR = ORIGINAL_DATA_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe('folderPathOf', () => {
    it('extracts the folder from a file uri', () => {
        expect(folderPathOf(asset('a', {
            origin: { connector: 'local', uri: 'file://d:/raw/cam1/x.png', displayPath: '' },
        } as Partial<VaultAssetRecord>))).toBe('d:/raw/cam1');
    });

    it('returns empty when there is no folder component', () => {
        expect(folderPathOf(asset('a', {
            origin: { connector: 'local', uri: 'file://x.png', displayPath: '' },
        } as Partial<VaultAssetRecord>))).toBe('');
    });
});

// Every DB test is skipped rather than failed when the runtime lacks
// node:sqlite — the store is designed to fall back, so its absence is a
// supported configuration, not a broken build.
const describeDb = isSqliteAvailable() ? describe : describe.skip;

describeDb('vaultCatalogDb', () => {
    it('upserts and reads back assets', async () => {
        await upsertAssets([asset('a1'), asset('a2')]);
        expect(await countAssets()).toBe(2);
        expect((await readAllAssets()).map((r) => r.id).sort()).toEqual(['a1', 'a2']);
    });

    it('updates in place rather than duplicating on re-upsert', async () => {
        await upsertAssets([asset('a1', { name: 'first.png' })]);
        await upsertAssets([asset('a1', { name: 'second.png' })]);
        expect(await countAssets()).toBe(1);
        expect((await readAllAssets())[0].name).toBe('second.png');
    });

    it('deletes by id', async () => {
        await upsertAssets([asset('a1'), asset('a2')]);
        await deleteAssets(['a1']);
        expect((await readAllAssets()).map((r) => r.id)).toEqual(['a2']);
    });

    it('filters by type in SQL instead of materialising everything', async () => {
        await upsertAssets([
            asset('i1'),
            asset('v1', { type: 'videos' }),
            asset('v2', { type: 'videos' }),
        ]);
        const videos = await queryAssets({ type: 'videos' });
        expect(videos.map((r) => r.id).sort()).toEqual(['v1', 'v2']);
    });

    it('filters by folder prefix, including nested folders', async () => {
        await upsertAssets([
            asset('top', { origin: { connector: 'local', uri: 'file://d:/raw/a.png', displayPath: '' } } as Partial<VaultAssetRecord>),
            asset('deep', { origin: { connector: 'local', uri: 'file://d:/raw/cam1/b.png', displayPath: '' } } as Partial<VaultAssetRecord>),
            asset('other', { origin: { connector: 'local', uri: 'file://d:/misc/c.png', displayPath: '' } } as Partial<VaultAssetRecord>),
        ]);
        const found = await queryAssets({ folderPrefix: 'd:/raw' });
        expect(found.map((r) => r.id).sort()).toEqual(['deep', 'top']);
    });

    it('does not treat a sibling folder as a child (prefix near-miss)', async () => {
        await upsertAssets([
            asset('inside', { origin: { connector: 'local', uri: 'file://d:/media/a.png', displayPath: '' } } as Partial<VaultAssetRecord>),
            asset('sibling', { origin: { connector: 'local', uri: 'file://d:/media-private/b.png', displayPath: '' } } as Partial<VaultAssetRecord>),
        ]);
        const found = await queryAssets({ folderPrefix: 'd:/media' });
        expect(found.map((r) => r.id)).toEqual(['inside']);
    });

    it('filters by watch root', async () => {
        await upsertAssets([
            asset('r1', { origin: { connector: 'local', uri: 'file://d:/a/1.png', displayPath: '', watchRootId: 'wr_1' } } as Partial<VaultAssetRecord>),
            asset('r2', { origin: { connector: 'local', uri: 'file://e:/b/2.png', displayPath: '', watchRootId: 'wr_2' } } as Partial<VaultAssetRecord>),
        ]);
        expect((await queryAssets({ watchRootId: 'wr_2' })).map((r) => r.id)).toEqual(['r2']);
    });

    it('honours the query limit', async () => {
        await upsertAssets(Array.from({ length: 50 }, (_, i) => asset(`a${i}`)));
        expect(await queryAssets({ limit: 10 })).toHaveLength(10);
    });

    it('imports a JSON catalog once and records the marker', async () => {
        const catalog = {
            version: 1 as const,
            updatedAt: '2026-08-01T00:00:00.000Z',
            assets: [asset('a1'), asset('a2')],
        };
        const first = await migrateCatalogFromJson(catalog);
        expect(first).toEqual({ migrated: true, assetCount: 2 });
        expect(await readMeta('migrated_from_json')).toBeTruthy();

        // Idempotent: a second run must not re-import or duplicate.
        const second = await migrateCatalogFromJson(catalog);
        expect(second.migrated).toBe(false);
        expect(await countAssets()).toBe(2);
    });

    it('writes one row per asset rather than rewriting everything', async () => {
        // The behaviour the migration exists for: adding an asset to a large
        // catalog must not rewrite the whole store.
        await upsertAssets(Array.from({ length: 2000 }, (_, i) => asset(`bulk${i}`)));
        const dbPath = path.join(tempDir, 'vault', 'catalog.db');
        const before = (await fs.stat(dbPath)).size;

        await upsertAssets([asset('one-more')]);
        const after = (await fs.stat(dbPath)).size;

        expect(await countAssets()).toBe(2001);
        // A full rewrite would scale with the whole catalog; a row insert does not.
        expect(after - before).toBeLessThan(before / 2);
    });
});
