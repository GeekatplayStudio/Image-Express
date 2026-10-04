/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { WatchRoot } from '@/features/asset-vault/contracts/watchRoot';
import { applyMigrations, readSchemaVersion, SchemaTooNewError } from '@/lib/server/sqliteMigrations';
import { readVaultAssetsByWatchRoot, upsertVaultAssets, invalidateCatalogCaches } from '@/lib/server/vault-store';
import { closeCatalogDb, countAssets, openCatalogDb } from '@/lib/server/vaultCatalogDb';
import { CATALOG_MIGRATIONS, catalogHasFts } from '@/lib/server/vaultCatalogSchema';
import { applyWatchRootScan } from '@/lib/server/vaultRescan';
import { countMissingAssets, purgeMissingAssets } from '@/lib/server/vaultScanStore';
import type { ScanResult, ScannedFile } from '@/lib/server/vaultWatchStore';

const ORIGINAL_DATA_DIR = process.env.IMAGE_EXPRESS_DATA_DIR;
let tempDir: string;

const root: WatchRoot = {
    id: 'root1',
    label: 'Photos',
    rootUri: 'D:/Photos',
    connector: 'local',
    enabled: true,
    recursive: true,
    includeGlobs: [],
    excludeGlobs: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const file = (relativePath: string, over: Partial<ScannedFile> = {}): ScannedFile => ({
    absolutePath: `D:\\Photos\\${relativePath.replace(/\//g, '\\')}`,
    relativePath,
    name: relativePath.split('/').pop()!,
    sizeBytes: 10,
    modifiedAt: '2026-02-01T00:00:00.000Z',
    ...over,
});

const scanOf = (files: ScannedFile[], over: Partial<ScanResult> = {}): ScanResult => ({
    files, truncated: false, unreadableDirs: [], ...over,
});

const names = async () => (await readVaultAssetsByWatchRoot(root.id)).map((asset) => asset.name).sort();

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-rescan-'));
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

describe('applyWatchRootScan', () => {
    it('adds new files, then writes nothing when the folder has not changed', async () => {
        const first = await applyWatchRootScan(root, scanOf([file('a.png'), file('sub/b.png')]));
        expect(first).toMatchObject({ added: 2, updated: 0, unchanged: 0 });

        const second = await applyWatchRootScan(root, scanOf([file('a.png'), file('sub/b.png')]));
        expect(second).toMatchObject({ added: 0, updated: 0, unchanged: 2, missing: 0 });
    });

    it('rewrites only the file that changed, keeping its description and first-seen date', async () => {
        await applyWatchRootScan(root, scanOf([file('a.png'), file('b.png')]));
        const [a] = (await readVaultAssetsByWatchRoot(root.id)).filter((asset) => asset.name === 'a.png');
        await upsertVaultAssets([{ ...a, description: 'a red kite', tags: ['kite'] }]);

        const stats = await applyWatchRootScan(root, scanOf([
            file('a.png', { sizeBytes: 99, modifiedAt: '2026-03-01T00:00:00.000Z' }),
            file('b.png'),
        ]));

        expect(stats).toMatchObject({ added: 0, updated: 1, unchanged: 1 });
        const [after] = (await readVaultAssetsByWatchRoot(root.id)).filter((asset) => asset.name === 'a.png');
        expect(after.description).toBe('a red kite');
        expect(after.sizeBytes).toBe(99);
        expect(after.createdAt).toBe('2026-02-01T00:00:00.000Z');
    });

    it('marks a vanished file missing instead of deleting it, and restores it with its tags', async () => {
        await applyWatchRootScan(root, scanOf([file('a.png'), file('b.png')]));
        const [b] = (await readVaultAssetsByWatchRoot(root.id)).filter((asset) => asset.name === 'b.png');
        await upsertVaultAssets([{ ...b, tags: ['keep-me'] }]);

        const gone = await applyWatchRootScan(root, scanOf([file('a.png')]));
        expect(gone.missing).toBe(1);
        expect(await names()).toEqual(['a.png']);
        expect(await countMissingAssets(root.id)).toBe(1);

        const back = await applyWatchRootScan(root, scanOf([file('a.png'), file('b.png')]));
        expect(back.restored).toBe(1);
        const restored = (await readVaultAssetsByWatchRoot(root.id)).find((asset) => asset.name === 'b.png');
        expect(restored?.tags).toEqual(['keep-me']);
    });

    it('marks nothing missing when the scan was cut off by the file ceiling', async () => {
        await applyWatchRootScan(root, scanOf([file('a.png'), file('b.png')]));
        const stats = await applyWatchRootScan(root, scanOf([file('a.png')], { truncated: true }));
        expect(stats.missing).toBe(0);
        expect(await names()).toEqual(['a.png', 'b.png']);
    });

    it('keeps files under a folder the scan could not read', async () => {
        await applyWatchRootScan(root, scanOf([file('a.png'), file('locked/b.png'), file('c.png')]));
        const stats = await applyWatchRootScan(root, scanOf([file('a.png')], { unreadableDirs: ['D:\\Photos\\locked'] }));
        expect(stats.missing).toBe(1);
        expect(await names()).toEqual(['a.png', 'b.png']);
    });

    it('deletes a row only after it has been missing past the retention window', async () => {
        await applyWatchRootScan(root, scanOf([file('a.png'), file('b.png')]));
        await applyWatchRootScan(root, scanOf([file('a.png')]));

        expect(await purgeMissingAssets(Date.now() + 29 * 86_400_000)).toEqual([]);
        expect(await purgeMissingAssets(Date.now() + 31 * 86_400_000)).toHaveLength(1);
        expect(await countMissingAssets()).toBe(0);
        expect(await countAssets()).toBe(1);
    });
});

describe('catalog migrations', () => {
    it('brings a new catalog to the latest version with the search index', async () => {
        const database = (await openCatalogDb())!;
        expect(readSchemaVersion(database)).toBe(CATALOG_MIGRATIONS.length);
        expect(catalogHasFts(database)).toBe(true);
    });

    it('upgrades a catalog written before migrations existed, backfilling the new columns', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DatabaseSync } = require('node:sqlite');
        await fs.mkdir(path.join(tempDir, 'vault'), { recursive: true });
        const database = (await openCatalogDb())!;
        const dbPath = String(database.prepare('PRAGMA database_list').get()?.file);
        closeCatalogDb();
        await fs.rm(dbPath, { force: true });
        await fs.rm(`${dbPath}-wal`, { force: true });
        await fs.rm(`${dbPath}-shm`, { force: true });

        // The version-1 schema, at user_version 0, exactly as an old build left it.
        const legacy = new DatabaseSync(dbPath);
        CATALOG_MIGRATIONS[0].up(legacy);
        const record = {
            id: 'old', name: 'Sunset.png', type: 'images', owner: 'Ada', isPublic: true,
            description: 'orange sky', tags: ['beach'], modifiedAt: '2026-01-02T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
            origin: { connector: 'local', uri: 'file://d:/p/Sunset.png', displayPath: 'P / Sunset.png' },
        };
        legacy.prepare('INSERT INTO assets (id, type, name, record) VALUES (?, ?, ?, ?)')
            .run('old', 'images', 'Sunset.png', JSON.stringify(record));
        legacy.close();

        const upgraded = (await openCatalogDb())!;
        expect(readSchemaVersion(upgraded)).toBe(CATALOG_MIGRATIONS.length);
        const row = upgraded.prepare('SELECT connector, owner, is_public, asset_date, search_text FROM assets').get();
        expect(row).toMatchObject({ connector: 'local', owner: 'ada', is_public: 1, asset_date: '2026-01-02T00:00:00.000Z' });
        expect(String(row?.search_text)).toContain('orange sky');
        const hit = upgraded.prepare("SELECT rowid FROM assets_fts WHERE assets_fts MATCH 'beach'").get();
        expect(hit).toBeTruthy();
    });

    it('refuses a database from a newer build and runs each step once', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DatabaseSync } = require('node:sqlite');
        const database = new DatabaseSync(':memory:');
        const steps = [
            { version: 1, name: 'one', up: jest.fn((db: { exec: (sql: string) => void }) => db.exec('CREATE TABLE t (a)')) },
        ];
        expect(applyMigrations(database, steps)).toEqual([1]);
        expect(applyMigrations(database, steps)).toEqual([]);
        expect(steps[0].up).toHaveBeenCalledTimes(1);

        database.exec('PRAGMA user_version = 7');
        expect(() => applyMigrations(database, steps, 'The test file')).toThrow(SchemaTooNewError);
        database.close();
    });

    it('leaves the version unchanged when a step fails', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DatabaseSync } = require('node:sqlite');
        const database = new DatabaseSync(':memory:');
        const steps = [
            { version: 1, name: 'ok', up: (db: { exec: (sql: string) => void }) => db.exec('CREATE TABLE t (a)') },
            { version: 2, name: 'bad', up: (db: { exec: (sql: string) => void }) => db.exec('CREATE TABLE u (a); NOT SQL') },
        ];
        expect(() => applyMigrations(database, steps)).toThrow();
        expect(readSchemaVersion(database)).toBe(1);
        expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'u'").get()).toBeUndefined();
        database.close();
    });
});
