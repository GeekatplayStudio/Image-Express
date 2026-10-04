import { openCatalogDb } from '@/lib/server/vaultCatalogDb';

/**
 * What a rescan needs from the catalog, without loading records.
 *
 * Follows ComfyUIAssetManager's indexer (`phases/outputs.py`, `phases/prune.py`):
 * a scan compares cheap fingerprints to decide what to write, and a file it no
 * longer finds is marked missing and kept for a while instead of being deleted
 * on the spot.
 */

/** How long a missing file's row (and its captions and tags) is kept. */
export const MISSING_RETENTION_DAYS = 30;

export interface StoredFingerprint {
    /** `modifiedAt|sizeBytes` — the same pair a scan reads from `stat`. */
    fingerprint: string;
    missing: boolean;
}

export const fileFingerprint = (modifiedAt: string | null | undefined, sizeBytes: number | null | undefined) => (
    `${modifiedAt ?? ''}|${sizeBytes ?? 0}`
);

/**
 * Fingerprints of everything indexed under one watch root, missing rows
 * included (a scan has to see them to notice a file came back).
 *
 * Reads three indexed columns and never the record JSON: for 200k files this is
 * the difference between a scan that costs a few hundred milliseconds when
 * nothing changed and one that rewrites every row.
 */
export async function readWatchRootFingerprints(watchRootId: string): Promise<Map<string, StoredFingerprint> | null> {
    const database = await openCatalogDb();
    if (!database) return null;
    const result = new Map<string, StoredFingerprint>();
    const rows = database
        .prepare('SELECT id, modified_at, size_bytes, missing_since FROM assets WHERE watch_root = ?')
        .all(watchRootId);
    for (const row of rows) {
        result.set(String(row.id), {
            fingerprint: fileFingerprint(row.modified_at as string | null, Number(row.size_bytes ?? 0)),
            missing: row.missing_since != null,
        });
    }
    return result;
}

function runForEach(database: NonNullable<Awaited<ReturnType<typeof openCatalogDb>>>, sql: string, ids: readonly string[], ...leading: unknown[]) {
    const statement = database.prepare(sql);
    database.exec('BEGIN');
    try {
        for (const id of ids) statement.run(...leading, id);
        database.exec('COMMIT');
    } catch (error) {
        database.exec('ROLLBACK');
        throw error;
    }
}

/** Mark files a scan looked for and did not find. Already-missing rows keep their first date. */
export async function markAssetsMissing(ids: readonly string[], at = new Date().toISOString()): Promise<number> {
    const database = await openCatalogDb();
    if (!database || ids.length === 0) return 0;
    runForEach(database, 'UPDATE assets SET missing_since = ? WHERE id = ? AND missing_since IS NULL', ids, at);
    return ids.length;
}

/** A file that is back, unchanged: clear the mark without rewriting the row. */
export async function restoreMissingAssets(ids: readonly string[]): Promise<number> {
    const database = await openCatalogDb();
    if (!database || ids.length === 0) return 0;
    runForEach(database, 'UPDATE assets SET missing_since = NULL WHERE id = ?', ids);
    return ids.length;
}

/**
 * Delete rows that have been missing longer than the retention window.
 * Returns their ids so the caller can drop what hangs off them (embeddings).
 */
export async function purgeMissingAssets(
    now = Date.now(),
    retentionDays = MISSING_RETENTION_DAYS,
): Promise<string[]> {
    const database = await openCatalogDb();
    if (!database) return [];
    const cutoff = new Date(now - retentionDays * 86_400_000).toISOString();
    const ids = database
        .prepare('SELECT id FROM assets WHERE missing_since IS NOT NULL AND missing_since < ?')
        .all(cutoff)
        .map((row) => String(row.id));
    if (ids.length > 0) runForEach(database, 'DELETE FROM assets WHERE id = ?', ids);
    return ids;
}

export async function countMissingAssets(watchRootId?: string): Promise<number> {
    const database = await openCatalogDb();
    if (!database) return 0;
    const row = watchRootId
        ? database.prepare('SELECT COUNT(*) AS n FROM assets WHERE missing_since IS NOT NULL AND watch_root = ?').get(watchRootId)
        : database.prepare('SELECT COUNT(*) AS n FROM assets WHERE missing_since IS NOT NULL').get();
    return Number(row?.n ?? 0);
}

/**
 * Fold the write-ahead log back into the database file.
 *
 * WAL only shrinks on a checkpoint that finds no reader in the way, and a scan
 * is the one thing that writes a lot at once. The asset manager measured a
 * 2 GB log beside a 36 MB database before it started doing this after each scan.
 */
export async function checkpointCatalog(): Promise<void> {
    const database = await openCatalogDb();
    if (!database) return;
    try {
        database.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (error) {
        console.warn('Vault catalog checkpoint skipped:', error);
    }
}
