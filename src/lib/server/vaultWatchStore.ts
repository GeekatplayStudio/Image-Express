import path from 'node:path';
import { mkdir, readFile, writeFile, readdir, stat, rename, realpath } from 'node:fs/promises';
import { getVaultDir } from '@/lib/server/appPaths';
import {
    WatchRootStoreSchema,
    type WatchRoot,
    type WatchRootStore,
    VAULT_INDEX_EXTENSIONS,
} from '@/features/asset-vault/contracts/watchRoot';
import type { VectorRecord } from '@/features/asset-vault/domain/vectorMath';
import {
    isVectorDbAvailable,
    migrateVectorsFromJson,
    readVectorAssetIds,
    readVectorMeta,
    searchVectorsInDb,
    upsertVectors,
} from '@/lib/server/vaultVectorDb';

const ROOTS_PATH = () => path.join(getVaultDir(), 'watch-roots.json');
const VECTORS_PATH = () => path.join(getVaultDir(), 'vectors.json');

async function atomicWriteJson(filePath: string, data: unknown) {
    await mkdir(path.dirname(filePath), { recursive: true });
    // Write to a temp file and rename so a crash mid-write can never leave a
    // truncated store (which would silently read back as an empty index).
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    // vectors.json is multi-megabyte and machine-read only; indentation is pure
    // cost. watch-roots.json is small enough that consistency wins over
    // readability here.
    await writeFile(tmpPath, JSON.stringify(data), 'utf8');
    await rename(tmpPath, filePath);
}

export async function readWatchRootStore(): Promise<WatchRootStore> {
    try {
        const raw = await readFile(ROOTS_PATH(), 'utf8');
        const parsed = WatchRootStoreSchema.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;
    } catch (error) {
        const maybeErr = error as NodeJS.ErrnoException;
        if (maybeErr.code !== 'ENOENT') console.error('Failed reading watch roots:', error);
    }
    return { version: 1, roots: [] };
}

export async function writeWatchRootStore(store: WatchRootStore): Promise<void> {
    await atomicWriteJson(ROOTS_PATH(), store);
}

export async function upsertWatchRoot(root: WatchRoot): Promise<WatchRootStore> {
    const store = await readWatchRootStore();
    const nextRoots = store.roots.filter((entry) => entry.id !== root.id);
    nextRoots.push(root);
    const next = { version: 1 as const, roots: nextRoots };
    await writeWatchRootStore(next);
    return next;
}

export async function removeWatchRoot(rootId: string): Promise<WatchRootStore> {
    const store = await readWatchRootStore();
    const next = { version: 1 as const, roots: store.roots.filter((entry) => entry.id !== rootId) };
    await writeWatchRootStore(next);
    return next;
}

// In-memory cache of the vector index. Parsing a multi-megabyte JSON file on
// every search request was the dominant cost; keep it hot and invalidate on
// file mtime so external edits are still picked up.
let vectorCache: { records: VectorRecord[]; mtimeMs: number } | null = null;

/**
 * Which store backs embeddings.
 *
 * `vectors.json` does not just get slow — it stops working. One 768-dim record
 * serialises to ~15.6 KB, so `JSON.stringify` hits V8's 536 MB string limit at
 * roughly **34,400 embedded assets** and throws. The caller catches and warns,
 * so past that point the index silently stopped persisting for good.
 *
 * `IMAGE_EXPRESS_VAULT_STORE=json` forces the old path, matching the catalog's
 * escape hatch.
 */
function sqliteVectorsEnabled(): boolean {
    if (process.env.IMAGE_EXPRESS_VAULT_STORE === 'json') return false;
    return isVectorDbAvailable();
}

let vectorMigrationPromise: Promise<void> | null = null;

async function ensureVectorsMigrated(): Promise<void> {
    vectorMigrationPromise ??= (async () => {
        if (await readVectorMeta('migrated_from_json')) return;
        // A vault already past the ceiling has a stale or truncated JSON file.
        // Importing whatever survived still beats starting empty: the backfill
        // tops up the rest.
        const legacy = await readVectorStoreFromJson();
        const result = await migrateVectorsFromJson(legacy);
        if (result.migrated && result.count > 0) {
            console.info(`Vault vectors migrated to SQLite: ${result.count} embeddings.`);
        }
    })();
    await vectorMigrationPromise;
}

/**
 * Write only the embeddings that changed.
 *
 * The whole-store `writeVectorStore` rewrote a multi-hundred-megabyte file for
 * a batch of 32 — measured at 1.5 s against 2 ms for 32 row writes, and that is
 * the path that eventually threw outright.
 */
export async function upsertVectorRecords(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    if (sqliteVectorsEnabled()) {
        try {
            await ensureVectorsMigrated();
            await upsertVectors(records);
            return;
        } catch (error) {
            console.error('Vector SQLite upsert failed, falling back to JSON:', error);
        }
    }

    const existing = await readVectorStoreFromJson();
    const byId = new Map(existing.map((entry) => [entry.assetId, entry]));
    for (const record of records) byId.set(record.assetId, record);
    await writeVectorStoreToJson([...byId.values()]);
}

/** Asset ids that already have an embedding for this model. */
export async function readEmbeddedAssetIds(model: string): Promise<Set<string>> {
    if (sqliteVectorsEnabled()) {
        try {
            await ensureVectorsMigrated();
            return await readVectorAssetIds(model);
        } catch (error) {
            console.error('Vector SQLite read failed, falling back to JSON:', error);
        }
    }
    const existing = await readVectorStoreFromJson();
    return new Set(existing.filter((entry) => entry.model === model).map((entry) => entry.assetId));
}

/**
 * Nearest neighbours for a query, without materialising every embedding.
 * Returns null when the SQLite store is unavailable, so the caller can fall
 * back to the in-memory path rather than silently returning no matches.
 */
export async function searchEmbeddings(
    queryVector: number[],
    options: { model: string; limit?: number },
): Promise<Array<{ assetId: string; score: number }> | null> {
    if (!sqliteVectorsEnabled()) return null;
    try {
        await ensureVectorsMigrated();
        return await searchVectorsInDb(queryVector, options);
    } catch (error) {
        console.error('Vector SQLite search failed, falling back to JSON:', error);
        return null;
    }
}

export async function readVectorStore(): Promise<VectorRecord[]> {
    return readVectorStoreFromJson();
}

async function readVectorStoreFromJson(): Promise<VectorRecord[]> {
    const filePath = VECTORS_PATH();
    try {
        const fileStat = await stat(filePath);
        if (vectorCache && vectorCache.mtimeMs === fileStat.mtimeMs) {
            return vectorCache.records;
        }
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as { vectors?: VectorRecord[] };
        const records = Array.isArray(parsed.vectors) ? parsed.vectors : [];
        vectorCache = { records, mtimeMs: fileStat.mtimeMs };
        return records;
    } catch (error) {
        const maybeErr = error as NodeJS.ErrnoException;
        if (maybeErr.code !== 'ENOENT') console.error('Failed reading vector store:', error);
        return vectorCache?.records ?? [];
    }
}

export async function writeVectorStore(vectors: VectorRecord[]): Promise<void> {
    if (sqliteVectorsEnabled()) {
        try {
            await ensureVectorsMigrated();
            await upsertVectors(vectors);
            return;
        } catch (error) {
            console.error('Vector SQLite write failed, falling back to JSON:', error);
        }
    }
    await writeVectorStoreToJson(vectors);
}

async function writeVectorStoreToJson(vectors: VectorRecord[]): Promise<void> {
    const filePath = VECTORS_PATH();
    await atomicWriteJson(filePath, { version: 1, updatedAt: new Date().toISOString(), vectors });
    try {
        const fileStat = await stat(filePath);
        vectorCache = { records: vectors, mtimeMs: fileStat.mtimeMs };
    } catch {
        vectorCache = null;
    }
}

const DEFAULT_EXTENSIONS = new Set(VAULT_INDEX_EXTENSIONS.map((ext) => ext.toLowerCase()));

// Whole-drive scans otherwise spend most of their budget inside OS and
// toolchain folders that never contain user assets.
const SKIP_FOLDERS = new Set([
    'node_modules',
    '.git',
    'system volume information',
    '$recycle.bin',
    'windows',
    'program files',
    'program files (x86)',
    'programdata',
    'appdata',
    'recovery',
    '__pycache__',
    'venv',
    '.venv',
    'site-packages',
    'dist-info',
]);

export type ScannedFile = {
    absolutePath: string;
    relativePath: string;
    name: string;
    sizeBytes: number;
    modifiedAt: string;
};

export type ScanResult = {
    files: ScannedFile[];
    /** True when the walk stopped at maxFiles — the root has more to index. */
    truncated: boolean;
};

/**
 * Ceiling for one root's scan. Override with `IMAGE_EXPRESS_VAULT_MAX_SCAN_FILES`.
 *
 * This is **per watch root**, not per catalog: adding a second drive gets its
 * own budget. The old 200,000 default existed because the catalog was a single
 * JSON document that had to be rewritten whole, and it broke outright at scale.
 * Storage is SQLite now, so that reason is gone.
 *
 * What still bounds it is the read path: `readVaultCatalog` materialises every
 * asset, measured at ~900 ms for 200k. That result is cached per process, so
 * the cost is paid once — but heap is not cached away, so a multi-million-asset
 * catalog would still hurt. 500,000 per root keeps a single large drive whole
 * while staying inside what the current read path carries comfortably.
 *
 * Raise it if you have the RAM; the honest ceiling moves once search and the
 * remaining whole-catalog callers use scoped queries (F-03 in ROADMAP.md).
 */
export const DEFAULT_MAX_SCAN_FILES = (() => {
    const configured = Number.parseInt(process.env.IMAGE_EXPRESS_VAULT_MAX_SCAN_FILES ?? '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 500_000;
})();

export async function scanDirectoryRecursive(
    rootPath: string,
    options?: { maxFiles?: number },
): Promise<ScanResult> {
    const maxFiles = options?.maxFiles ?? DEFAULT_MAX_SCAN_FILES;
    const results: ScannedFile[] = [];
    let truncated = false;
    // Guard against symlink loops: a directory link pointing at an ancestor
    // would otherwise recurse until maxFiles, wasting the whole budget.
    const visitedDirs = new Set<string>();

    async function walk(current: string, relative: string) {
        if (results.length >= maxFiles) { truncated = true; return; }
        let realCurrent = current;
        try {
            realCurrent = await realpath(current);
        } catch {
            return;
        }
        if (visitedDirs.has(realCurrent)) return;
        visitedDirs.add(realCurrent);
        let entries;
        try {
            entries = await readdir(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (results.length >= maxFiles) { truncated = true; return; }
            const name = entry.name;
            if (name.startsWith('.')) continue;
            const lower = name.toLowerCase();
            if (SKIP_FOLDERS.has(lower)) continue;
            const absolutePath = path.join(current, name);
            const relativePath = relative ? path.join(relative, name) : name;
            if (entry.isDirectory()) {
                await walk(absolutePath, relativePath);
                continue;
            }
            if (!entry.isFile()) continue;
            const dot = lower.lastIndexOf('.');
            const ext = dot >= 0 ? lower.slice(dot) : '';
            if (!DEFAULT_EXTENSIONS.has(ext)) continue;
            try {
                const fileStat = await stat(absolutePath);
                results.push({
                    absolutePath,
                    relativePath: relativePath.replace(/\\/g, '/'),
                    name,
                    sizeBytes: fileStat.size,
                    modifiedAt: fileStat.mtime.toISOString(),
                });
            } catch {
                // skip unreadable
            }
        }
    }

    await walk(rootPath, '');
    return { files: results, truncated };
}
