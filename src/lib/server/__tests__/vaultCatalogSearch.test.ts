/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { invalidateCatalogCaches, upsertVaultAssets } from '@/lib/server/vault-store';
import { closeCatalogDb } from '@/lib/server/vaultCatalogDb';
import { buildFtsQuery, listCatalogFolders, searchCatalog } from '@/lib/server/vaultCatalogSearch';
import { runIndexedVaultSearch } from '@/lib/server/vaultIndexedSearch';
import { markAssetsMissing } from '@/lib/server/vaultScanStore';

const ORIGINAL_DATA_DIR = process.env.IMAGE_EXPRESS_DATA_DIR;
let tempDir: string;

const asset = (id: string, over: Partial<VaultAssetRecord> = {}): VaultAssetRecord => ({
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    type: 'images',
    category: 'uploads',
    sizeBytes: 10,
    origin: { connector: 'local', uri: `file://d:/pics/${id}.png`, displayPath: `Pics / ${id}.png` },
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    isPublic: false,
    ...over,
} as VaultAssetRecord);

const ids = (page: Awaited<ReturnType<typeof searchCatalog>>) => page!.hits.map((hit) => hit.asset.id);

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-search-'));
    process.env.IMAGE_EXPRESS_DATA_DIR = tempDir;
    closeCatalogDb();
    invalidateCatalogCaches();
});

afterEach(async () => {
    closeCatalogDb();
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.IMAGE_EXPRESS_DATA_DIR;
    else process.env.IMAGE_EXPRESS_DATA_DIR = ORIGINAL_DATA_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe('buildFtsQuery', () => {
    it('quotes every word as a prefix term', () => {
        expect(buildFtsQuery('red kite')).toBe('"red"* OR "kite"*');
    });

    it('cannot be turned into FTS syntax by what the user types', () => {
        expect(buildFtsQuery('kite" OR name:x NEAR(')).toBe('"kite"* OR "OR"* OR "name:x"* OR "NEAR("*');
        expect(buildFtsQuery('"" -- **')).toBeNull();
    });
});

describe('searchCatalog', () => {
    it('browses newest first, in pages, with the full count', async () => {
        await upsertVaultAssets(Array.from({ length: 5 }, (_, index) => asset(`a${index}`, {
            modifiedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        })));

        const first = await searchCatalog({ limit: 2 });
        expect(ids(first)).toEqual(['a4', 'a3']);
        expect(first!.total).toBe(5);

        const second = await searchCatalog({ limit: 2, offset: 2 });
        expect(ids(second)).toEqual(['a2', 'a1']);
    });

    it('sorts by name and by oldest', async () => {
        await upsertVaultAssets([
            asset('x', { name: 'beta.png', modifiedAt: '2026-01-03T00:00:00.000Z' }),
            asset('y', { name: 'Alpha.png', modifiedAt: '2026-01-02T00:00:00.000Z' }),
        ]);
        expect(ids(await searchCatalog({ limit: 10, sort: 'name' }))).toEqual(['y', 'x']);
        expect(ids(await searchCatalog({ limit: 10, sort: 'oldest' }))).toEqual(['y', 'x']);
    });

    it('finds words in the name, description, tags and path, ranking name matches first', async () => {
        await upsertVaultAssets([
            asset('desc', { name: 'IMG_0001.png', description: 'a kite over the beach' }),
            asset('name', { name: 'kite-festival.png' }),
            asset('tag', { name: 'IMG_0002.png', tags: ['kites'] }),
            asset('other', { name: 'IMG_0003.png', description: 'a boat' }),
        ]);

        const page = await searchCatalog({ query: 'kite', limit: 10 });
        expect(ids(page)[0]).toBe('name');
        expect(ids(page).sort()).toEqual(['desc', 'name', 'tag']);
        expect(page!.total).toBe(3);
    });

    it('applies the bookcase filter in the query, not afterwards', async () => {
        await upsertVaultAssets([
            asset('img', { type: 'images' }),
            asset('vid', { type: 'videos', name: 'vid.mp4' }),
            asset('pub', { isPublic: true, owner: 'Ada' }),
        ]);
        expect(ids(await searchCatalog({ limit: 10, filter: { type: 'videos' } }))).toEqual(['vid']);
        expect(ids(await searchCatalog({ limit: 10, filter: { isPublic: true } }))).toEqual(['pub']);
        expect(ids(await searchCatalog({ limit: 10, filter: { owner: 'ADA' } }))).toEqual(['pub']);
        expect((await searchCatalog({ limit: 1, filter: { type: 'images' } }))!.total).toBe(2);
    });

    it('scopes to a folder and everything below it', async () => {
        await upsertVaultAssets([
            asset('top', { origin: { connector: 'local', uri: 'file://d:/pics/top.png', displayPath: 'x' } }),
            asset('deep', { origin: { connector: 'local', uri: 'file://d:/pics/trip/deep.png', displayPath: 'x' } }),
            asset('else', { origin: { connector: 'local', uri: 'file://d:/pics2/else.png', displayPath: 'x' } }),
        ]);
        expect(ids(await searchCatalog({ limit: 10, folderPrefix: 'd:/pics' })).sort()).toEqual(['deep', 'top']);
        expect(await listCatalogFolders()).toEqual([
            { path: 'd:/pics', count: 1 },
            { path: 'd:/pics/trip', count: 1 },
            { path: 'd:/pics2', count: 1 },
        ]);
    });

    it('leaves out files marked missing, and the index follows edits', async () => {
        await upsertVaultAssets([asset('a', { description: 'heron' }), asset('b', { description: 'heron' })]);
        await markAssetsMissing(['b']);
        expect(ids(await searchCatalog({ query: 'heron', limit: 10 }))).toEqual(['a']);

        await upsertVaultAssets([asset('a', { description: 'egret' })]);
        expect(ids(await searchCatalog({ query: 'heron', limit: 10 }))).toEqual([]);
        expect(ids(await searchCatalog({ query: 'egret', limit: 10 }))).toEqual(['a']);
    });
});

describe('runIndexedVaultSearch', () => {
    const request = { query: '', mode: 'keyword' as const, limit: 2, offset: 0 };

    it('reports whether another page exists', async () => {
        await upsertVaultAssets([asset('a'), asset('b'), asset('c')]);
        const first = await runIndexedVaultSearch(request);
        expect(first).toMatchObject({ total: 3, hasMore: true });
        const last = await runIndexedVaultSearch({ ...request, offset: 2 });
        expect(last).toMatchObject({ total: 3, hasMore: false });
        expect(last!.results[0].matchReasons).toEqual(['browse']);
    });

    it('fuses keyword hits with vector neighbours and loads only what was ranked', async () => {
        await upsertVaultAssets([
            asset('kw', { description: 'sunset' }),
            asset('vec', { description: 'dusk over water' }),
            asset('none'),
        ]);
        const result = await runIndexedVaultSearch(
            { ...request, query: 'sunset', mode: 'smart', limit: 10 },
            [[{ assetId: 'vec', score: 0.9 }, { assetId: 'kw', score: 0.8 }, { assetId: 'deleted', score: 0.7 }]],
        );
        expect(result!.results.map((entry) => entry.asset.id)).toEqual(['kw', 'vec']);
        expect(result!.results[0].matchReasons[0]).toBe('hybrid: keyword+vector');
        expect(result!.results[1].matchReasons).toEqual(['hybrid: vector-context']);
    });
});
