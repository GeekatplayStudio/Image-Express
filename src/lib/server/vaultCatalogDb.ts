import path from 'node:path';
import { mkdir } from 'node:fs/promises';

import { getVaultDir } from '@/lib/server/appPaths';
import type { VaultAssetRecord, VaultCatalog } from '@/features/asset-vault/contracts/assetRecord';

/**
 * SQLite backing for the asset catalog.
 *
 * The JSON catalog measured **153 MB** at whole-drive scale, and every
 * mutation rewrote the entire file — adding one asset rewrote 153 MB, and the
 * whole set was parsed and Zod-validated into heap to answer any query.
 *
 * `node:sqlite` is used deliberately over `better-sqlite3`: it ships with Node,
 * so there is no native module to rebuild on every Electron major, which is the
 * recurring cost that matters for a desktop app. It is still flagged
 * experimental, so `isSqliteAvailable()` lets the caller fall back to the JSON
 * store rather than making the vault unusable on a runtime that lacks it.
 *
 * Assets are stored one row each with their full record as JSON. Queries that
 * the UI actually runs — by type, by watch root, by folder prefix — are indexed
 * columns, so they become real queries instead of full-array scans.
 */

type SqliteModule = {
    DatabaseSync: new (path: string) => SqliteDatabase;
};

type SqliteStatement = {
    run: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => Array<Record<string, unknown>>;
    get: (...params: unknown[]) => Record<string, unknown> | undefined;
};

type SqliteDatabase = {
    exec: (sql: string) => void;
    prepare: (sql: string) => SqliteStatement;
    close: () => void;
};

let sqliteModule: SqliteModule | null | undefined;

/**
 * Resolve `node:sqlite` once. Returns null when the runtime does not provide
 * it, which is a supported outcome rather than an error.
 */
function loadSqlite(): SqliteModule | null {
    if (sqliteModule !== undefined) return sqliteModule;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        sqliteModule = require('node:sqlite') as SqliteModule;
    } catch {
        sqliteModule = null;
    }
    return sqliteModule;
}

export function isSqliteAvailable(): boolean {
    return loadSqlite() !== null;
}

const DB_PATH = () => path.join(getVaultDir(), 'catalog.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS assets (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    category     TEXT,
    name         TEXT,
    uri          TEXT,
    folder_path  TEXT,
    watch_root   TEXT,
    modified_at  TEXT,
    size_bytes   INTEGER,
    record       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_type        ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_watch_root  ON assets(watch_root);
CREATE INDEX IF NOT EXISTS idx_assets_folder      ON assets(folder_path);
CREATE INDEX IF NOT EXISTS idx_assets_modified    ON assets(modified_at);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

let db: SqliteDatabase | null = null;

async function openDb(): Promise<SqliteDatabase | null> {
    if (db) return db;
    const sqlite = loadSqlite();
    if (!sqlite) return null;

    await mkdir(getVaultDir(), { recursive: true });
    const database = new sqlite.DatabaseSync(DB_PATH());
    // WAL keeps readers running while the indexer writes; NORMAL trades an
    // fsync per commit for throughput, which is the right call for a rebuildable
    // index of files that still exist on disk.
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA synchronous = NORMAL;');
    database.exec(SCHEMA);
    db = database;
    return db;
}

/** Folder portion of an asset URI, used for prefix queries. */
export function folderPathOf(record: VaultAssetRecord): string {
    const uri = record.origin?.uri ?? '';
    const withoutScheme = uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const parts = withoutScheme.split(/[\\/]+/).filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

function rowFor(record: VaultAssetRecord) {
    return [
        record.id,
        record.type,
        record.category ?? null,
        record.name ?? null,
        record.origin?.uri ?? null,
        folderPathOf(record),
        record.origin?.watchRootId ?? null,
        record.modifiedAt ?? null,
        record.sizeBytes ?? 0,
        JSON.stringify(record),
    ];
}

const INSERT_SQL = `
INSERT INTO assets (id, type, category, name, uri, folder_path, watch_root, modified_at, size_bytes, record)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    type=excluded.type, category=excluded.category, name=excluded.name,
    uri=excluded.uri, folder_path=excluded.folder_path, watch_root=excluded.watch_root,
    modified_at=excluded.modified_at, size_bytes=excluded.size_bytes, record=excluded.record
`;

/**
 * Upsert assets. This is the whole point of the migration: adding one asset
 * writes one row rather than rewriting a 153 MB document.
 */
export async function upsertAssets(records: VaultAssetRecord[]): Promise<number> {
    const database = await openDb();
    if (!database) return 0;
    const statement = database.prepare(INSERT_SQL);
    database.exec('BEGIN');
    try {
        for (const record of records) statement.run(...rowFor(record));
        database.exec('COMMIT');
    } catch (error) {
        database.exec('ROLLBACK');
        throw error;
    }
    return records.length;
}

export async function deleteAssets(ids: string[]): Promise<number> {
    const database = await openDb();
    if (!database || ids.length === 0) return 0;
    const statement = database.prepare('DELETE FROM assets WHERE id = ?');
    database.exec('BEGIN');
    try {
        for (const id of ids) statement.run(id);
        database.exec('COMMIT');
    } catch (error) {
        database.exec('ROLLBACK');
        throw error;
    }
    return ids.length;
}

export async function countAssets(): Promise<number> {
    const database = await openDb();
    if (!database) return 0;
    const row = database.prepare('SELECT COUNT(*) AS n FROM assets').get();
    return Number(row?.n ?? 0);
}

const parseRecord = (row: Record<string, unknown>): VaultAssetRecord | null => {
    try {
        return JSON.parse(String(row.record)) as VaultAssetRecord;
    } catch {
        return null;
    }
};

/** Every asset. Kept for the JSON-compatible read path during migration. */
export async function readAllAssets(): Promise<VaultAssetRecord[]> {
    const database = await openDb();
    if (!database) return [];
    return database.prepare('SELECT record FROM assets')
        .all()
        .map(parseRecord)
        .filter((record): record is VaultAssetRecord => record !== null);
};

/**
 * Targeted query — the reason for the schema. Filtering in SQL avoids
 * materialising 200k records to answer "images under this folder".
 */
export async function queryAssets(filter: {
    type?: string;
    watchRootId?: string;
    folderPrefix?: string;
    limit?: number;
}): Promise<VaultAssetRecord[]> {
    const database = await openDb();
    if (!database) return [];

    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.type) { where.push('type = ?'); params.push(filter.type); }
    if (filter.watchRootId) { where.push('watch_root = ?'); params.push(filter.watchRootId); }
    if (filter.folderPrefix) {
        // LIKE with an escaped prefix; the folder index makes this a range scan.
        where.push('(folder_path = ? OR folder_path LIKE ?)');
        params.push(filter.folderPrefix, `${filter.folderPrefix}/%`);
    }
    const sql = `SELECT record FROM assets${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`
        + ` LIMIT ${Math.max(1, Math.min(filter.limit ?? 500, 100_000))}`;

    return database.prepare(sql).all(...params)
        .map(parseRecord)
        .filter((record): record is VaultAssetRecord => record !== null);
}

export async function readMeta(key: string): Promise<string | null> {
    const database = await openDb();
    if (!database) return null;
    const row = database.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? String(row.value) : null;
}

export async function writeMeta(key: string, value: string): Promise<void> {
    const database = await openDb();
    if (!database) return;
    database.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).run(key, value);
}

/**
 * One-time import of the JSON catalog.
 *
 * Idempotent: the source file is left untouched so a release can roll back to
 * the JSON store, and a marker records that the import already ran.
 */
export async function migrateCatalogFromJson(catalog: VaultCatalog): Promise<{
    migrated: boolean;
    assetCount: number;
}> {
    const database = await openDb();
    if (!database) return { migrated: false, assetCount: 0 };

    if (await readMeta('migrated_from_json')) {
        return { migrated: false, assetCount: await countAssets() };
    }

    await upsertAssets(catalog.assets);
    await writeMeta('migrated_from_json', new Date().toISOString());
    await writeMeta('catalog_updated_at', catalog.updatedAt);
    return { migrated: true, assetCount: catalog.assets.length };
}

/** Close the handle. Tests need this before removing a temp directory. */
export function closeCatalogDb(): void {
    if (!db) return;
    try {
        db.close();
    } finally {
        db = null;
    }
}
