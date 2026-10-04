import path from 'node:path';
import { mkdir } from 'node:fs/promises';

import { getVaultDir } from '@/lib/server/appPaths';
import type { VaultAssetRecord, VaultCatalog } from '@/features/asset-vault/contracts/assetRecord';
import { loadNodeSqlite } from '@/lib/server/nodeSqlite';
import { applyMigrations } from '@/lib/server/sqliteMigrations';
import { CATALOG_MIGRATIONS } from '@/lib/server/vaultCatalogSchema';

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
 *
 * The schema and its history live in `vaultCatalogSchema.ts`. A row whose file
 * a scan no longer finds carries `missing_since`; every read here leaves those
 * out, so "missing" behaves like "gone" to callers until it is restored or
 * purged (see `vaultScanStore.ts`).
 */

type SqliteModule = {
    DatabaseSync: new (path: string) => SqliteDatabase;
};

type SqliteStatement = {
    run: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => Array<Record<string, unknown>>;
    get: (...params: unknown[]) => Record<string, unknown> | undefined;
};

export type SqliteDatabase = {
    exec: (sql: string) => void;
    prepare: (sql: string) => SqliteStatement;
    close: () => void;
};

/**
 * Resolve `node:sqlite` once. Returns null when the runtime does not provide
 * it, which is a supported outcome rather than an error.
 */
const loadSqlite = () => loadNodeSqlite<SqliteModule>();

export function isSqliteAvailable(): boolean {
    return loadSqlite() !== null;
}

const DB_PATH = () => path.join(getVaultDir(), 'catalog.db');

let db: SqliteDatabase | null = null;

export async function openCatalogDb(): Promise<SqliteDatabase | null> {
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
    // A second process on the same file (a second dev server, the desktop app
    // next to `next dev`) waits for the writer instead of failing at once.
    database.exec('PRAGMA busy_timeout = 5000;');
    try {
        applyMigrations(database, CATALOG_MIGRATIONS, 'The vault catalog');
    } catch (error) {
        database.close();
        throw error;
    }
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
        record.origin?.connector ?? null,
        (record.owner || 'Guest').toLowerCase(),
        record.isPublic ? 1 : 0,
        record.capturedAt || record.modifiedAt || record.createdAt || null,
        searchTextOf(record),
        record.metaVersion ?? 0,
    ];
}

/** What keyword search reads besides the name. Mirrors the v2 backfill. */
export function searchTextOf(record: VaultAssetRecord): string {
    return [
        record.owner ?? '',
        record.description ?? '',
        record.prompt ?? '',
        record.generation?.model ?? '',
        record.generation?.sampler ?? '',
        record.origin?.displayPath ?? '',
        (record.tags ?? []).join(' '),
    ].join(' ').replace(/\s+/g, ' ').trim();
}

/** Appended to every read: a missing file is not listed. */
export const PRESENT = 'missing_since IS NULL';

const INSERT_SQL = `
INSERT INTO assets (id, type, category, name, uri, folder_path, watch_root, modified_at, size_bytes, record,
    connector, owner, is_public, asset_date, search_text, meta_version)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    type=excluded.type, category=excluded.category, name=excluded.name,
    uri=excluded.uri, folder_path=excluded.folder_path, watch_root=excluded.watch_root,
    modified_at=excluded.modified_at, size_bytes=excluded.size_bytes, record=excluded.record,
    connector=excluded.connector, owner=excluded.owner, is_public=excluded.is_public,
    asset_date=excluded.asset_date, search_text=excluded.search_text,
    meta_version=excluded.meta_version,
    -- Written again means seen again: a file that came back is no longer missing.
    missing_since=NULL
`;

/**
 * Upsert assets. This is the whole point of the migration: adding one asset
 * writes one row rather than rewriting a 153 MB document.
 */
export async function upsertAssets(records: VaultAssetRecord[]): Promise<number> {
    const database = await openCatalogDb();
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
    const database = await openCatalogDb();
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
    const database = await openCatalogDb();
    if (!database) return 0;
    const row = database.prepare(`SELECT COUNT(*) AS n FROM assets WHERE ${PRESENT}`).get();
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
    const database = await openCatalogDb();
    if (!database) return [];
    return database.prepare(`SELECT record FROM assets WHERE ${PRESENT}`)
        .all()
        .map(parseRecord)
        .filter((record): record is VaultAssetRecord => record !== null);
};

/**
 * Specific assets by id — a primary-key lookup per id.
 *
 * Bound parameters are capped per statement in SQLite, so ids go in chunks.
 * Order of the result is not the order of `ids`; callers that care index it.
 */
export async function readAssetsByIds(ids: string[]): Promise<VaultAssetRecord[]> {
    const database = await openCatalogDb();
    if (!database || ids.length === 0) return [];
    const unique = Array.from(new Set(ids));
    const found: VaultAssetRecord[] = [];
    const CHUNK = 500;
    for (let start = 0; start < unique.length; start += CHUNK) {
        const chunk = unique.slice(start, start + CHUNK);
        const rows = database
            .prepare(`SELECT record FROM assets WHERE ${PRESENT} AND id IN (${chunk.map(() => '?').join(',')})`)
            .all(...chunk);
        for (const row of rows) {
            const record = parseRecord(row);
            if (record) found.push(record);
        }
    }
    return found;
}

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
    const database = await openCatalogDb();
    if (!database) return [];

    const where: string[] = [PRESENT];
    const params: unknown[] = [];
    if (filter.type) { where.push('type = ?'); params.push(filter.type); }
    if (filter.watchRootId) { where.push('watch_root = ?'); params.push(filter.watchRootId); }
    if (filter.folderPrefix) {
        // LIKE with an escaped prefix; the folder index makes this a range scan.
        where.push('(folder_path = ? OR folder_path LIKE ?)');
        params.push(filter.folderPrefix, `${filter.folderPrefix}/%`);
    }
    const sql = `SELECT record FROM assets WHERE ${where.join(' AND ')}`
        + ` LIMIT ${Math.max(1, Math.min(filter.limit ?? 500, 100_000))}`;

    return database.prepare(sql).all(...params)
        .map(parseRecord)
        .filter((record): record is VaultAssetRecord => record !== null);
}

/**
 * Reconcile the DB against a whole-catalog snapshot.
 *
 * The store's public interface is whole-catalog read/write, so this is what
 * turns a 153 MB rewrite into O(changes): compare a cheap projection of what is
 * already stored — id, mtime, size, never the record JSON — and touch only the
 * rows that actually differ. Reading `record` here would reintroduce exactly
 * the full-materialisation cost the migration exists to remove.
 */
export async function syncCatalogAssets(records: VaultAssetRecord[]): Promise<{
    inserted: number;
    updated: number;
    deleted: number;
    unchanged: number;
}> {
    const database = await openCatalogDb();
    if (!database) return { inserted: 0, updated: 0, deleted: 0, unchanged: 0 };

    const existing = new Map<string, string>();
    for (const row of database.prepare('SELECT id, modified_at, size_bytes FROM assets').all()) {
        existing.set(String(row.id), `${row.modified_at ?? ''}|${row.size_bytes ?? 0}`);
    }

    const changed: VaultAssetRecord[] = [];
    const seen = new Set<string>();
    let unchanged = 0;
    let inserted = 0;
    for (const record of records) {
        seen.add(record.id);
        const fingerprint = `${record.modifiedAt ?? ''}|${record.sizeBytes ?? 0}`;
        const previous = existing.get(record.id);
        if (previous === undefined) {
            inserted += 1;
            changed.push(record);
        } else if (previous !== fingerprint) {
            changed.push(record);
        } else {
            unchanged += 1;
        }
    }

    const removed = [...existing.keys()].filter((id) => !seen.has(id));
    if (changed.length) await upsertAssets(changed);
    if (removed.length) await deleteAssets(removed);

    return { inserted, updated: changed.length - inserted, deleted: removed.length, unchanged };
}

export async function readMeta(key: string): Promise<string | null> {
    const database = await openCatalogDb();
    if (!database) return null;
    const row = database.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? String(row.value) : null;
}

export async function writeMeta(key: string, value: string): Promise<void> {
    const database = await openCatalogDb();
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
    const database = await openCatalogDb();
    if (!database) return { migrated: false, assetCount: 0 };

    if (await readMeta('migrated_from_json')) {
        return { migrated: false, assetCount: await countAssets() };
    }

    await upsertAssets(catalog.assets);
    await writeMeta('migrated_from_json', new Date().toISOString());
    await writeMeta('catalog_updated_at', catalog.updatedAt);
    return { migrated: true, assetCount: catalog.assets.length };
}

/**
 * The whole catalog in the shape the JSON store returned, so callers that
 * expect `VaultCatalog` keep working unchanged.
 *
 * This still materialises every asset — the win here is skipping a 153 MB
 * parse and full Zod validation, not bounded memory. Reducing the working set
 * needs callers to move to `queryAssets`, which is a separate change.
 */
export async function readCatalogSnapshot(): Promise<VaultCatalog | null> {
    const database = await openCatalogDb();
    if (!database) return null;
    return {
        version: 1,
        updatedAt: (await readMeta('catalog_updated_at')) ?? new Date(0).toISOString(),
        assets: await readAllAssets(),
    };
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
