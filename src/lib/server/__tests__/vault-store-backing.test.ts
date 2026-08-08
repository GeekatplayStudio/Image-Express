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
