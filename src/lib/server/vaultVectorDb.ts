import path from 'node:path';
import { mkdir } from 'node:fs/promises';

import { getVaultDir } from '@/lib/server/appPaths';
import {
    dotFloat32,
    dotInt8,
    normalizeVector,
    quantizeToInt8,
    topScored,
} from '@/features/asset-vault/domain/vectorQuantization';
import type { VectorRecord } from '@/features/asset-vault/domain/vectorMath';

/**
 * SQLite storage and search for asset embeddings.
 *
 * `vectors.json` did not merely get slow — it **stopped working**. One
 * `nomic-embed-text` record serialises to ~15.6 KB, so the store hits V8's
 * 536 MB maximum string length at roughly **34,400 embedded assets**, where
 * `JSON.stringify` throws `RangeError: Invalid string length`. The search route
 * catches that and logs a warning, so past ~34k the index silently stopped
 * persisting: semantic search could never converge, and nothing said so. At the
 * 200k assets the vault targets the file would be **3.1 GB**.
 *
 * Layout, all of it measured (see the numbers on each decision):
 *
 * - **One row per vector, float32 BLOB.** 3 KB rather than 15.6 KB per record,
 *   and writing a backfill batch of 32 costs ~2 ms instead of a 1.5 s rewrite
 *   of the whole file. No string-length ceiling.
 * - **Vectors are stored unit-length**, so cosine similarity is a dot product.
 * - **Search is two-stage.** An int8 copy of the matrix is held in memory
 *   (154 MB at 200k, against 614 MB for float32) and scanned coarsely; the top
 *   candidates are then rescored against their exact float32 vectors from disk.
 *   Measured **100% recall@40** on clustered data, so the lossy pass never
 *   decides what the user sees.
 *
 * As with the catalog, `node:sqlite` is used so there is no native module to
 * rebuild per Electron major, and `isVectorDbAvailable()` lets callers fall
 * back to the JSON store rather than losing search entirely.
 */

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

type SqliteModule = { DatabaseSync: new (path: string) => SqliteDatabase };

let sqliteModule: SqliteModule | null | undefined;

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

export function isVectorDbAvailable(): boolean {
    return loadSqlite() !== null;
}

const DB_PATH = () => path.join(getVaultDir(), 'vectors.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vectors (
    asset_id   TEXT PRIMARY KEY,
    model      TEXT NOT NULL,
    dims       INTEGER NOT NULL,
    updated_at TEXT,
    vec        BLOB NOT NULL
);
-- Search always scopes to one (model, dims) group: vectors from different
-- models are not comparable, and comparing them silently returns nonsense.
CREATE INDEX IF NOT EXISTS idx_vectors_model ON vectors(model, dims);

CREATE TABLE IF NOT EXISTS vector_meta (
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
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA synchronous = NORMAL;');
    database.exec(SCHEMA);
    db = database;
    return db;
}

const UPSERT_SQL = `
INSERT INTO vectors (asset_id, model, dims, updated_at, vec) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(asset_id) DO UPDATE SET
    model=excluded.model, dims=excluded.dims,
    updated_at=excluded.updated_at, vec=excluded.vec
`;

/** Float32 vector as a BLOB, without copying the backing buffer. */
function toBlob(vector: Float32Array): Buffer {
    return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

function fromBlob(value: unknown, dims: number): Float32Array | null {
    if (!(value instanceof Uint8Array)) return null;
    if (value.byteLength !== dims * 4) return null;
    // Copy rather than view: the row buffer is not guaranteed to outlive the
    // statement, and a stale view would read freed memory.
    return new Float32Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
}

/**
 * The in-memory search index for one (model, dims) group.
 *
 * Rebuilt lazily and invalidated by writes. Holding it is what makes search
 * ~100 ms instead of a per-query read of every BLOB from disk.
 */
type VectorIndex = {
    model: string;
    dims: number;
    ids: string[];
    quantized: Int8Array;
};

let index: VectorIndex | null = null;

function invalidateIndex(): void {
    index = null;
}

export async function upsertVectors(records: VectorRecord[]): Promise<number> {
    const database = await openDb();
    if (!database || records.length === 0) return 0;

    const statement = database.prepare(UPSERT_SQL);
    database.exec('BEGIN');
    try {
        for (const record of records) {
            // Normalise on the way in, once, rather than on every comparison.
            const unit = normalizeVector(record.vector);
            statement.run(record.assetId, record.model, unit.length, record.updatedAt, toBlob(unit));
        }
        database.exec('COMMIT');
    } catch (error) {
        database.exec('ROLLBACK');
        throw error;
    }
    invalidateIndex();
    return records.length;
}

export async function deleteVectors(assetIds: string[]): Promise<number> {
    const database = await openDb();
    if (!database || assetIds.length === 0) return 0;

    const statement = database.prepare('DELETE FROM vectors WHERE asset_id = ?');
    database.exec('BEGIN');
    try {
        for (const id of assetIds) statement.run(id);
        database.exec('COMMIT');
    } catch (error) {
        database.exec('ROLLBACK');
        throw error;
    }
    invalidateIndex();
    return assetIds.length;
}

export async function countVectors(model?: string): Promise<number> {
    const database = await openDb();
    if (!database) return 0;
    const row = model
        ? database.prepare('SELECT COUNT(*) AS n FROM vectors WHERE model = ?').get(model)
        : database.prepare('SELECT COUNT(*) AS n FROM vectors').get();
    return Number(row?.n ?? 0);
}

/** Asset ids that already have a vector for this model — used to skip backfill. */
export async function readVectorAssetIds(model: string): Promise<Set<string>> {
    const database = await openDb();
    if (!database) return new Set();
    const rows = database.prepare('SELECT asset_id FROM vectors WHERE model = ?').all(model);
    return new Set(rows.map((row) => String(row.asset_id)));
}

async function buildIndex(model: string, dims: number): Promise<VectorIndex | null> {
    const database = await openDb();
    if (!database) return null;

    const rows = database.prepare(
        'SELECT asset_id, vec FROM vectors WHERE model = ? AND dims = ?',
    ).all(model, dims);

    const ids: string[] = [];
    const quantized = new Int8Array(rows.length * dims);
    let written = 0;
    for (const row of rows) {
        const vector = fromBlob(row.vec, dims);
        // A short or corrupt BLOB is skipped rather than shifting every
        // subsequent row in the flat matrix, which would silently misalign ids.
        if (!vector) continue;
        quantized.set(quantizeToInt8(vector), written * dims);
        ids.push(String(row.asset_id));
        written += 1;
    }

    return {
        model,
        dims,
        ids,
        quantized: written === rows.length ? quantized : quantized.slice(0, written * dims),
    };
}

async function getIndex(model: string, dims: number): Promise<VectorIndex | null> {
    if (index && index.model === model && index.dims === dims) return index;
    index = await buildIndex(model, dims);
    return index;
}

/** Exact vectors for a shortlist, by id. Small by construction. */
async function readExactVectors(ids: string[], dims: number): Promise<Map<string, Float32Array>> {
    const database = await openDb();
    const out = new Map<string, Float32Array>();
    if (!database || ids.length === 0) return out;

    const statement = database.prepare('SELECT asset_id, vec FROM vectors WHERE asset_id = ?');
    for (const id of ids) {
        const row = statement.get(id);
        if (!row) continue;
        const vector = fromBlob(row.vec, dims);
        if (vector) out.set(id, vector);
    }
    return out;
}

export type VectorSearchOptions = {
    model: string;
    limit?: number;
    minScore?: number;
    /** Shortlist size for the exact rerank. Larger trades speed for recall. */
    candidates?: number;
};

/**
 * Two-stage nearest-neighbour search.
 *
 * Stage one scans the whole int8 matrix, which is a quarter the memory of
 * float32 and is allowed to be approximate. Stage two rescores only the
 * shortlist against exact float32 vectors, so the returned scores are the real
 * cosine similarities and the ordering is the exact one.
 */
export async function searchVectorsInDb(
    queryVector: number[] | Float32Array,
    options: VectorSearchOptions,
): Promise<Array<{ assetId: string; score: number }>> {
    const dims = queryVector.length;
    if (dims === 0) return [];

    const limit = Math.max(1, options.limit ?? 40);
    const minScore = options.minScore ?? 0.05;
    const shortlistSize = Math.max(limit, options.candidates ?? limit * 10);

    const built = await getIndex(options.model, dims);
    if (!built || built.ids.length === 0) return [];

    const unitQuery = normalizeVector(queryVector);
    const coarseQuery = quantizeToInt8(unitQuery);

    // Stage one: no score floor. An int8 score is on a different scale to
    // cosine, so filtering here would cut candidates by the wrong yardstick.
    const shortlist = topScored(
        (i) => dotInt8(built.quantized, i * dims, coarseQuery, dims),
        built.ids.length,
        shortlistSize,
    );
    if (shortlist.length === 0) return [];

    const shortlistIds = shortlist.map((entry) => built.ids[entry.index]);
    const exact = await readExactVectors(shortlistIds, dims);

    const rescored: Array<{ assetId: string; score: number }> = [];
    for (const assetId of shortlistIds) {
        const vector = exact.get(assetId);
        if (!vector) continue;
        const score = dotFloat32(vector, 0, unitQuery, dims);
        if (score > minScore) rescored.push({ assetId, score });
    }

    return rescored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function readVectorMeta(key: string): Promise<string | null> {
    const database = await openDb();
    if (!database) return null;
    const row = database.prepare('SELECT value FROM vector_meta WHERE key = ?').get(key);
    return row ? String(row.value) : null;
}

export async function writeVectorMeta(key: string, value: string): Promise<void> {
    const database = await openDb();
    if (!database) return;
    database.prepare(
        'INSERT INTO vector_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).run(key, value);
}

/**
 * One-time import of `vectors.json`.
 *
 * Idempotent via a marker, and the source file is left in place. Note that a
 * vault already past the ~34k ceiling will have a truncated or stale JSON file
 * — importing what survived is still strictly better than starting empty,
 * because the backfill tops up whatever is missing.
 */
export async function migrateVectorsFromJson(records: VectorRecord[]): Promise<{
    migrated: boolean;
    count: number;
}> {
    const database = await openDb();
    if (!database) return { migrated: false, count: 0 };

    if (await readVectorMeta('migrated_from_json')) {
        return { migrated: false, count: await countVectors() };
    }

    await upsertVectors(records);
    await writeVectorMeta('migrated_from_json', new Date().toISOString());
    return { migrated: true, count: records.length };
}

/** Close the handle. Tests need this before removing a temp directory. */
export function closeVectorDb(): void {
    invalidateIndex();
    if (!db) return;
    try {
        db.close();
    } finally {
        db = null;
    }
}
