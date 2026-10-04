/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isSqliteAvailable } from '@/lib/server/vaultCatalogDb';
import type { VaultAssetRecord, VaultCatalog } from '@/features/asset-vault/contracts/assetRecord';

// Which store answers reads and writes is decided per process, and the module
// caches both the migration promise and the parsed catalog. Each test gets a
// fresh module registry so the choice is actually re-evaluated.
const loadStore = async () => import('@/lib/server/vault-store');

const ORIGINAL_DATA_DIR = process.env.IMAGE_EXPRESS_DATA_DIR;
const ORIGINAL_BACKEND = process.env.IMAGE_EXPRESS_VAULT_STORE;
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

const catalogOf = (assets: VaultAssetRecord[], updatedAt = '2026-08-01T00:00:00.000Z'): VaultCatalog => ({
    version: 1,
    updatedAt,
    assets,
});

beforeEach(async () => {
    jest.resetModules();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-vaultstore-'));
    process.env.IMAGE_EXPRESS_DATA_DIR = tempDir;
});

afterEach(async () => {
    // Must close the *same* module instance the store used. resetModules gives
    // vault-store its own copy of vaultCatalogDb holding its own handle, so the
    // statically imported closeCatalogDb would close an unrelated one and leave
    // WAL files locked — which on Windows fails the rmdir below with EBUSY.
    (await import('@/lib/server/vaultCatalogDb')).closeCatalogDb();
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.IMAGE_EXPRESS_DATA_DIR;
    else process.env.IMAGE_EXPRESS_DATA_DIR = ORIGINAL_DATA_DIR;
    if (ORIGINAL_BACKEND === undefined) delete process.env.IMAGE_EXPRESS_VAULT_STORE;
    else process.env.IMAGE_EXPRESS_VAULT_STORE = ORIGINAL_BACKEND;
    await fs.rm(tempDir, { recursive: true, force: true });
});

const catalogJsonPath = () => path.join(tempDir, 'vault', 'catalog.json');

describe('vault-store backing selection', () => {
    it('round-trips through the JSON store when forced to it', async () => {
        process.env.IMAGE_EXPRESS_VAULT_STORE = 'json';
        const { readVaultCatalog, writeVaultCatalog } = await loadStore();

        await writeVaultCatalog(catalogOf([asset('a1'), asset('a2')]));
        const read = await readVaultCatalog();

        expect(read.assets.map((r) => r.id).sort()).toEqual(['a1', 'a2']);
        expect(read.updatedAt).toBe('2026-08-01T00:00:00.000Z');
        await expect(fs.stat(catalogJsonPath())).resolves.toBeTruthy();
    });

    it('returns an empty catalog rather than throwing when nothing exists yet', async () => {
        process.env.IMAGE_EXPRESS_VAULT_STORE = 'json';
        const { readVaultCatalog } = await loadStore();
        await expect(readVaultCatalog()).resolves.toMatchObject({ version: 1, assets: [] });
    });

    // The targeted helpers have a second, entirely separate implementation on
    // this path (read-modify-write rather than a row write). Covered directly,
    // because a divergence between the two would be silent.
    it('upserts and deletes through the JSON path with the same result', async () => {
        process.env.IMAGE_EXPRESS_VAULT_STORE = 'json';
        const { readVaultCatalog, writeVaultCatalog, upsertVaultAssets, deleteVaultAssets } = await loadStore();

        await writeVaultCatalog(catalogOf([asset('a1'), asset('a2'), asset('a3')]));
        await upsertVaultAssets([asset('a2', { name: 'renamed.png' }), asset('a4')]);
        await deleteVaultAssets(['a1']);

        const read = await readVaultCatalog();
        expect(read.assets.map((r) => r.id).sort()).toEqual(['a2', 'a3', 'a4']);
        expect(read.assets.find((r) => r.id === 'a2')?.name).toBe('renamed.png');
    });

    it('reads one watch root through the JSON path', async () => {
        process.env.IMAGE_EXPRESS_VAULT_STORE = 'json';
        const { writeVaultCatalog, readVaultAssetsByWatchRoot } = await loadStore();
        await writeVaultCatalog(catalogOf([
            asset('r1', {
                origin: { connector: 'local', uri: 'file://d:/w/1.png', displayPath: '', watchRootId: 'wr_1' },
            } as Partial<VaultAssetRecord>),
            asset('r2', {
                origin: { connector: 'local', uri: 'file://d:/w/2.png', displayPath: '', watchRootId: 'wr_2' },
            } as Partial<VaultAssetRecord>),
        ]));

        expect((await readVaultAssetsByWatchRoot('wr_1')).map((r) => r.id)).toEqual(['r1']);
    });
});

// Skipped rather than failed without node:sqlite: falling back to JSON is a
// supported configuration, and the tests above already cover that path.
const describeDb = isSqliteAvailable() ? describe : describe.skip;

describeDb('vault-store on SQLite', () => {
    it('round-trips through SQLite by default', async () => {
        const { readVaultCatalog, writeVaultCatalog } = await loadStore();

        await writeVaultCatalog(catalogOf([asset('a1'), asset('a2')]));
        const read = await readVaultCatalog();

        expect(read.assets.map((r) => r.id).sort()).toEqual(['a1', 'a2']);
        expect(read.updatedAt).toBe('2026-08-01T00:00:00.000Z');
    });

    it('stops rewriting catalog.json once SQLite is in use', async () => {
        const { writeVaultCatalog } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1')]));

        // The whole point of the migration: the 153 MB document is no longer
        // written on every mutation.
        await expect(fs.stat(catalogJsonPath())).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('imports an existing JSON catalog on first read and leaves the file in place', async () => {
        await fs.mkdir(path.join(tempDir, 'vault'), { recursive: true });
        await fs.writeFile(
            catalogJsonPath(),
            JSON.stringify(catalogOf([asset('legacy1'), asset('legacy2')])),
            'utf8',
        );

        const { readVaultCatalog } = await loadStore();
        const read = await readVaultCatalog();

        expect(read.assets.map((r) => r.id).sort()).toEqual(['legacy1', 'legacy2']);
        // Retained as the rollback path for one release.
        await expect(fs.stat(catalogJsonPath())).resolves.toBeTruthy();
    });

    it('applies a later write as a delta against the migrated catalog', async () => {
        await fs.mkdir(path.join(tempDir, 'vault'), { recursive: true });
        await fs.writeFile(
            catalogJsonPath(),
            JSON.stringify(catalogOf([asset('keep'), asset('drop')])),
            'utf8',
        );

        const { readVaultCatalog, writeVaultCatalog } = await loadStore();
        await readVaultCatalog();
        await writeVaultCatalog(catalogOf([asset('keep'), asset('added')], '2026-08-05T00:00:00.000Z'));

        const read = await readVaultCatalog();
        expect(read.assets.map((r) => r.id).sort()).toEqual(['added', 'keep']);
        expect(read.updatedAt).toBe('2026-08-05T00:00:00.000Z');
    });

    it('upserts only the named assets, leaving the rest of the catalog alone', async () => {
        const { readVaultCatalog, writeVaultCatalog, upsertVaultAssets } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1'), asset('a2'), asset('a3')]));

        await upsertVaultAssets([asset('a2', { name: 'renamed.png' })]);

        const read = await readVaultCatalog();
        expect(read.assets).toHaveLength(3);
        expect(read.assets.find((r) => r.id === 'a2')?.name).toBe('renamed.png');
        expect(read.assets.find((r) => r.id === 'a1')?.name).toBe('a1.png');
    });

    it('inserts an unknown asset on upsert rather than silently dropping it', async () => {
        const { readVaultCatalog, writeVaultCatalog, upsertVaultAssets } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1')]));
        await upsertVaultAssets([asset('brand-new')]);
        expect((await readVaultCatalog()).assets.map((r) => r.id).sort()).toEqual(['a1', 'brand-new']);
    });

    it('deletes only the named assets', async () => {
        const { readVaultCatalog, writeVaultCatalog, deleteVaultAssets } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1'), asset('a2'), asset('a3')]));

        await deleteVaultAssets(['a2']);

        expect((await readVaultCatalog()).assets.map((r) => r.id).sort()).toEqual(['a1', 'a3']);
    });

    it('treats an empty upsert or delete as a no-op', async () => {
        const { readVaultCatalog, writeVaultCatalog, upsertVaultAssets, deleteVaultAssets } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1')]));

        await upsertVaultAssets([]);
        await deleteVaultAssets([]);

        expect((await readVaultCatalog()).assets.map((r) => r.id)).toEqual(['a1']);
    });

    it('reads back only one watch root, not the whole catalog', async () => {
        const { writeVaultCatalog, readVaultAssetsByWatchRoot } = await loadStore();
        const local = (id: string, watchRootId: string) => asset(id, {
            origin: {
                connector: 'local',
                uri: `file://d:/w/${id}.png`,
                displayPath: '',
                watchRootId,
            },
        } as Partial<VaultAssetRecord>);

        await writeVaultCatalog(catalogOf([local('r1a', 'wr_1'), local('r1b', 'wr_1'), local('r2', 'wr_2')]));

        expect((await readVaultAssetsByWatchRoot('wr_1')).map((r) => r.id).sort()).toEqual(['r1a', 'r1b']);
        expect(await readVaultAssetsByWatchRoot('wr_missing')).toEqual([]);
    });

    it('excludes non-local assets from a watch-root read', async () => {
        const { writeVaultCatalog, readVaultAssetsByWatchRoot } = await loadStore();
        await writeVaultCatalog(catalogOf([
            asset('server-side', {
                origin: { connector: 'server', uri: 'server://a.png', displayPath: '', watchRootId: 'wr_1' },
            } as Partial<VaultAssetRecord>),
        ]));

        expect(await readVaultAssetsByWatchRoot('wr_1')).toEqual([]);
    });

    // The snapshot is cached in memory because rebuilding it costs ~885 ms at
    // 200k assets and search reads it on every query. A cache that outlived a
    // write would keep showing deleted assets, so each write path is pinned.
    it('reflects a targeted upsert on the next read rather than serving a stale cache', async () => {
        const { readVaultCatalog, writeVaultCatalog, upsertVaultAssets } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1')]));
        await readVaultCatalog();

        await upsertVaultAssets([asset('a1', { name: 'changed.png' })]);

        expect((await readVaultCatalog()).assets[0].name).toBe('changed.png');
    });

    it('reflects a targeted delete on the next read', async () => {
        const { readVaultCatalog, writeVaultCatalog, deleteVaultAssets } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1'), asset('a2')]));
        await readVaultCatalog();

        await deleteVaultAssets(['a1']);

        expect((await readVaultCatalog()).assets.map((r) => r.id)).toEqual(['a2']);
    });

    it('reflects a whole-catalog write on the next read', async () => {
        const { readVaultCatalog, writeVaultCatalog } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1')]));
        await readVaultCatalog();

        await writeVaultCatalog(catalogOf([asset('a2')]));

        expect((await readVaultCatalog()).assets.map((r) => r.id)).toEqual(['a2']);
    });

    it('serves concurrent reads one consistent snapshot', async () => {
        const { readVaultCatalog, writeVaultCatalog } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1'), asset('a2')]));

        const [first, second, third] = await Promise.all([
            readVaultCatalog(), readVaultCatalog(), readVaultCatalog(),
        ]);

        expect(first.assets).toHaveLength(2);
        expect(second.assets.map((r) => r.id)).toEqual(first.assets.map((r) => r.id));
        expect(third.assets.map((r) => r.id)).toEqual(first.assets.map((r) => r.id));
    });

    it('does not re-import the JSON file after the first migration', async () => {
        await fs.mkdir(path.join(tempDir, 'vault'), { recursive: true });
        await fs.writeFile(catalogJsonPath(), JSON.stringify(catalogOf([asset('legacy')])), 'utf8');

        const { readVaultCatalog, writeVaultCatalog } = await loadStore();
        await readVaultCatalog();
        await writeVaultCatalog(catalogOf([]));

        // A second migration would resurrect the deleted asset. The marker is
        // what stops that, and it survives because it lives in the DB.
        expect((await readVaultCatalog()).assets).toEqual([]);
    });
});

// Scoped reads exist so callers stop loading the whole library for a count or
// a handful of rows. Both backings must give the same answers.
describe.each([
    ['json', 'json'],
    ['sqlite', undefined],
] as const)('scoped reads on the %s store', (label, backend) => {
    const run = label === 'sqlite' && !isSqliteAvailable() ? it.skip : it;

    beforeEach(() => {
        if (backend) process.env.IMAGE_EXPRESS_VAULT_STORE = backend;
        else delete process.env.IMAGE_EXPRESS_VAULT_STORE;
    });

    run('returns only the assets asked for, ignoring unknown and repeated ids', async () => {
        const { writeVaultCatalog, readVaultAssetsByIds } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1'), asset('a2'), asset('a3')]));

        const found = await readVaultAssetsByIds(['a3', 'missing', 'a1', 'a1']);

        expect(found.map((r) => r.id).sort()).toEqual(['a1', 'a3']);
        await expect(readVaultAssetsByIds([])).resolves.toEqual([]);
    });

    run('looks up more ids than one statement can bind', async () => {
        const { writeVaultCatalog, readVaultAssetsByIds } = await loadStore();
        const many = Array.from({ length: 1203 }, (_, index) => asset(`m${index}`));
        await writeVaultCatalog(catalogOf(many));

        const found = await readVaultAssetsByIds(many.map((r) => r.id));

        expect(found).toHaveLength(1203);
    });

    run('summarises the catalog as a count and a timestamp', async () => {
        const { writeVaultCatalog, readVaultCatalogSummary, getVaultStatus } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1'), asset('a2')], '2026-09-01T00:00:00.000Z'));

        await expect(readVaultCatalogSummary()).resolves.toEqual({
            assetCount: 2,
            updatedAt: '2026-09-01T00:00:00.000Z',
        });
        await expect(getVaultStatus()).resolves.toMatchObject({
            assetCount: 2,
            lastSyncAt: '2026-09-01T00:00:00.000Z',
        });
    });

    run('reports an empty vault as never synced', async () => {
        const { getVaultStatus } = await loadStore();
        await expect(getVaultStatus()).resolves.toMatchObject({ assetCount: 0, lastSyncAt: null });
    });

    run('sees a write made after an earlier scoped read', async () => {
        const { writeVaultCatalog, upsertVaultAssets, deleteVaultAssets, readVaultAssetsByIds, readVaultCatalogSummary } = await loadStore();
        await writeVaultCatalog(catalogOf([asset('a1')]));
        expect((await readVaultCatalogSummary()).assetCount).toBe(1);

        await upsertVaultAssets([asset('a1', { name: 'renamed.png' }), asset('a2')]);
        expect((await readVaultCatalogSummary()).assetCount).toBe(2);
        expect((await readVaultAssetsByIds(['a1']))[0].name).toBe('renamed.png');

        await deleteVaultAssets(['a1']);
        expect(await readVaultAssetsByIds(['a1'])).toEqual([]);
        expect((await readVaultCatalogSummary()).assetCount).toBe(1);
    });
});

describeDb('scoped reads do not build the whole-catalog snapshot', () => {
    it('answers a count and an id lookup without materialising every record', async () => {
        const first = await loadStore();
        await first.writeVaultCatalog(catalogOf([asset('a1'), asset('a2'), asset('a3')]));
        (await import('@/lib/server/vaultCatalogDb')).closeCatalogDb();

        // Fresh registry over the same DB file: nothing has built the snapshot
        // yet. The store builds it through readCatalogSnapshot, so count calls.
        jest.resetModules();
        const snapshotBuilds = jest.fn();
        jest.doMock('@/lib/server/vaultCatalogDb', () => {
            const actual = jest.requireActual('@/lib/server/vaultCatalogDb');
            return {
                ...actual,
                readCatalogSnapshot: (...args: unknown[]) => {
                    snapshotBuilds();
                    return actual.readCatalogSnapshot(...args);
                },
            };
        });
        const fresh = await loadStore();

        expect((await fresh.readVaultCatalogSummary()).assetCount).toBe(3);
        expect((await fresh.readVaultAssetsByIds(['a2'])).map((r) => r.id)).toEqual(['a2']);
        expect(snapshotBuilds).not.toHaveBeenCalled();

        // And the guard is live: a whole-catalog read does build it.
        await fresh.readVaultCatalog();
        expect(snapshotBuilds).toHaveBeenCalledTimes(1);
        jest.dontMock('@/lib/server/vaultCatalogDb');
    });
});
