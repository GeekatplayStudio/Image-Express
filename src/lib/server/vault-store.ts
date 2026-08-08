import path from 'node:path';
import { mkdir, readFile, writeFile, readdir, stat, rename } from 'node:fs/promises';
import { getAssetsDir, getVaultDir } from '@/lib/server/appPaths';
import {
    VALID_ASSET_TYPES,
    VALID_ASSET_CATEGORIES,
    getAssetMetadataByFolder,
    type AssetType,
    type AssetCategory,
} from '@/lib/server/asset-metadata';
import {
    VaultCatalogSchema,
    type VaultAssetRecord,
    type VaultCatalog,
} from '@/features/asset-vault/contracts/assetRecord';
import {
    BookcaseStoreSchema,
    DEFAULT_BOOKCASES,
    type BookcaseStore,
} from '@/features/asset-vault/contracts/bookcase';
import { stableVaultAssetId, inferVaultAssetType } from '@/features/asset-vault/domain/inferAssetType';
import {
    deleteAssets as deleteCatalogAssets,
    isSqliteAvailable,
    queryAssets as queryCatalogAssets,
    migrateCatalogFromJson,
    readCatalogSnapshot,
    readMeta as readCatalogMeta,
    syncCatalogAssets,
    upsertAssets as upsertCatalogAssets,
    writeMeta as writeCatalogMeta,
} from '@/lib/server/vaultCatalogDb';

const CATALOG_PATH = () => path.join(getVaultDir(), 'catalog.json');
const BOOKCASES_PATH = () => path.join(getVaultDir(), 'bookcases.json');

async function atomicWriteJson(filePath: string, data: unknown) {
    await mkdir(path.dirname(filePath), { recursive: true });
    // Serialize once, then rename into place. The previous version stringified
    // and wrote the payload twice and left the real file non-atomic, which on a
    // large catalog meant hundreds of MB of redundant IO per save.
    const tempPath = `${filePath}.${process.pid}.tmp`;
    // Not pretty-printed. Nothing reads the catalog by eye, and at whole-drive
    // scale the indentation alone measured ~29 MB of a 153 MB file — paid on
    // every write, and again on every parse.
    await writeFile(tempPath, JSON.stringify(data), 'utf8');
    await rename(tempPath, filePath);
}

// Parsing (and Zod-validating) a large catalog on every request dominates
// search latency once a whole drive is indexed. Cache in memory, keyed on the
// file's mtime so an external write is still picked up.
let catalogCache: { catalog: VaultCatalog; mtimeMs: number } | null = null;

/**
 * The SQLite equivalent of the cache above.
 *
 * Building a whole-catalog snapshot means one `JSON.parse` per row, and at 200k
 * assets that measured **903 ms against 257 ms** for parsing the single JSON
 * document — SQLite is 3.5x *dearer* on this particular operation, because the
 * per-row cost dominates. Row storage wins on writes and on scoped queries, not
 * on "give me everything".
 *
 * Search calls `readVaultCatalog` on every query, and the JSON path had an
 * mtime-keyed cache that made repeat reads free. Without an equivalent here the
 * migration would have made search markedly worse, not better.
 *
 * Safe to hold because this process is the only writer: every mutation goes
 * through the helpers below, which invalidate it. `inFlight` collapses a
 * stampede of concurrent searches into one build.
 */
let sqliteSnapshotCache: VaultCatalog | null = null;
let sqliteSnapshotInFlight: Promise<VaultCatalog | null> | null = null;

function invalidateCatalogCaches() {
    catalogCache = null;
    sqliteSnapshotCache = null;
    sqliteSnapshotInFlight = null;
}

/**
 * Which backing store answers catalog reads and writes.
 *
 * SQLite when the runtime provides `node:sqlite`, because the JSON catalog
 * rewrites the entire file — measured at 153 MB — on every mutation. Set
 * `IMAGE_EXPRESS_VAULT_STORE=json` to force the old path: `node:sqlite` is
 * still flagged experimental, so this needs an escape hatch that does not
 * require shipping a new build.
 */
function sqliteCatalogEnabled(): boolean {
    if (process.env.IMAGE_EXPRESS_VAULT_STORE === 'json') return false;
    return isSqliteAvailable();
}

/**
 * Import the JSON catalog on first use, once.
 *
 * The JSON file is deliberately left in place: it is the rollback path for one
 * release. Note that it stops being updated after this point, so rolling back
 * loses changes made since the migration — the tradeoff the migration exists
 * to make, since keeping both current would keep paying the 153 MB write.
 */
let migrationPromise: Promise<void> | null = null;

async function ensureCatalogMigrated(): Promise<void> {
    migrationPromise ??= (async () => {
        if (await readCatalogMeta('migrated_from_json')) return;
        const fromJson = await readVaultCatalogFromJson();
        const result = await migrateCatalogFromJson(fromJson);
        if (result.migrated && result.assetCount > 0) {
            console.info(`Vault catalog migrated to SQLite: ${result.assetCount} assets.`);
        }
    })();
    await migrationPromise;
}

export async function readVaultCatalog(): Promise<VaultCatalog> {
    if (sqliteCatalogEnabled()) {
        try {
            await ensureCatalogMigrated();
            if (sqliteSnapshotCache) return sqliteSnapshotCache;
            sqliteSnapshotInFlight ??= readCatalogSnapshot();
            const snapshot = await sqliteSnapshotInFlight;
            sqliteSnapshotInFlight = null;
            if (snapshot) {
                sqliteSnapshotCache = snapshot;
                return snapshot;
            }
        } catch (error) {
            // A broken DB must not make the vault unusable — fall through to
            // the JSON file, which is still on disk.
            sqliteSnapshotInFlight = null;
            console.error('Vault catalog SQLite read failed, falling back to JSON:', error);
        }
    }
    return readVaultCatalogFromJson();
}

async function readVaultCatalogFromJson(): Promise<VaultCatalog> {
    const filePath = CATALOG_PATH();
    try {
        const fileStat = await stat(filePath);
        if (catalogCache && catalogCache.mtimeMs === fileStat.mtimeMs) {
            return catalogCache.catalog;
        }
        const raw = await readFile(filePath, 'utf8');
        const parsed = VaultCatalogSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
            catalogCache = { catalog: parsed.data, mtimeMs: fileStat.mtimeMs };
            return parsed.data;
        }
    } catch (error) {
        const maybeErr = error as NodeJS.ErrnoException;
        if (maybeErr.code !== 'ENOENT') {
            console.error('Failed reading vault catalog:', error);
        }
    }
    return { version: 1, updatedAt: new Date(0).toISOString(), assets: [] };
}

export async function writeVaultCatalog(catalog: VaultCatalog): Promise<void> {
    if (sqliteCatalogEnabled()) {
        try {
            await ensureCatalogMigrated();
            await syncCatalogAssets(catalog.assets);
            await writeCatalogMeta('catalog_updated_at', catalog.updatedAt);
            // Both caches are stale by definition; reads go to the DB.
            invalidateCatalogCaches();
            return;
        } catch (error) {
            console.error('Vault catalog SQLite write failed, falling back to JSON:', error);
        }
    }
    await writeVaultCatalogToJson(catalog);
}

async function writeVaultCatalogToJson(catalog: VaultCatalog): Promise<void> {
    const filePath = CATALOG_PATH();
    await atomicWriteJson(filePath, catalog);
    try {
        const fileStat = await stat(filePath);
        catalogCache = { catalog, mtimeMs: fileStat.mtimeMs };
    } catch {
        catalogCache = null;
    }
}

/**
 * Write specific assets without handing over the whole catalog.
 *
 * This is the entry point that makes the SQLite migration pay off. Going
 * through `writeVaultCatalog` costs a full change-detection scan — measured at
 * 313 ms over 200k assets — to rediscover changes the caller already knew
 * about. Callers that mutate a known set (enrichment, indexing) should use this
 * instead; it writes one row per changed asset and nothing else.
 *
 * On the JSON fallback this is still a whole-file rewrite, because a JSON
 * document cannot be updated in place. Same result, same cost as before.
 */
export async function upsertVaultAssets(records: VaultAssetRecord[]): Promise<void> {
    if (records.length === 0) return;
    const updatedAt = new Date().toISOString();

    if (sqliteCatalogEnabled()) {
        try {
            await ensureCatalogMigrated();
            await upsertCatalogAssets(records);
            await writeCatalogMeta('catalog_updated_at', updatedAt);
            invalidateCatalogCaches();
            return;
        } catch (error) {
            console.error('Vault catalog SQLite upsert failed, falling back to JSON:', error);
        }
    }

    const catalog = await readVaultCatalogFromJson();
    const byId = new Map(catalog.assets.map((asset) => [asset.id, asset]));
    for (const record of records) byId.set(record.id, record);
    await writeVaultCatalogToJson({
        version: 1,
        updatedAt,
        assets: Array.from(byId.values()),
    });
}

/**
 * Assets belonging to one watch root.
 *
 * Rescanning a single folder does not need the other 199,000 assets in memory.
 * On SQLite this is an indexed query; on JSON it still loads and filters the
 * whole catalog, which is the cost the fallback carries by definition.
 */
export async function readVaultAssetsByWatchRoot(watchRootId: string): Promise<VaultAssetRecord[]> {
    if (sqliteCatalogEnabled()) {
        try {
            await ensureCatalogMigrated();
            const rows = await queryCatalogAssets({ watchRootId, limit: 100_000 });
            // The column is only ever set for local assets, but filter anyway so
            // the two paths cannot drift.
            return rows.filter((asset) => asset.origin?.connector === 'local');
        } catch (error) {
            console.error('Vault catalog SQLite query failed, falling back to JSON:', error);
        }
    }

    const catalog = await readVaultCatalogFromJson();
    return catalog.assets.filter((asset) => (
        asset.origin?.connector === 'local' && asset.origin?.watchRootId === watchRootId
    ));
}

/** Remove specific assets. Same reasoning as `upsertVaultAssets`. */
export async function deleteVaultAssets(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const updatedAt = new Date().toISOString();

    if (sqliteCatalogEnabled()) {
        try {
            await ensureCatalogMigrated();
            await deleteCatalogAssets(ids);
            await writeCatalogMeta('catalog_updated_at', updatedAt);
            invalidateCatalogCaches();
            return;
        } catch (error) {
            console.error('Vault catalog SQLite delete failed, falling back to JSON:', error);
        }
    }

    const catalog = await readVaultCatalogFromJson();
    const removing = new Set(ids);
    await writeVaultCatalogToJson({
        version: 1,
        updatedAt,
        assets: catalog.assets.filter((asset) => !removing.has(asset.id)),
    });
}

export async function readBookcaseStore(): Promise<BookcaseStore> {
    try {
        const raw = await readFile(BOOKCASES_PATH(), 'utf8');
        const parsed = BookcaseStoreSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
            const byId = new Map(parsed.data.bookcases.map((bc) => [bc.id, bc]));
            let changed = false;
            for (const defaults of DEFAULT_BOOKCASES) {
                if (!byId.has(defaults.id)) {
                    byId.set(defaults.id, { ...defaults, updatedAt: new Date().toISOString() });
                    changed = true;
                }
            }
            const merged: BookcaseStore = {
                version: 1,
                bookcases: Array.from(byId.values()),
            };
            if (changed) await writeBookcaseStore(merged);
            return merged;
        }
    } catch (error) {
        const maybeErr = error as NodeJS.ErrnoException;
        if (maybeErr.code !== 'ENOENT') {
            console.error('Failed reading bookcase store:', error);
        }
    }
    const now = new Date().toISOString();
    const initial: BookcaseStore = {
        version: 1,
        bookcases: DEFAULT_BOOKCASES.map((bc) => ({ ...bc, updatedAt: now })),
    };
    await writeBookcaseStore(initial);
    return initial;
}

export async function writeBookcaseStore(store: BookcaseStore): Promise<void> {
    await atomicWriteJson(BOOKCASES_PATH(), store);
}

function serverPreviewUrl(category: AssetCategory, type: AssetType, filename: string) {
    return `/api/assets/serve/${category}/${type}/${encodeURIComponent(filename)}`;
}

export async function syncServerAssetsToCatalog(): Promise<VaultCatalog> {
    const assets: VaultAssetRecord[] = [];
    const assetsDir = getAssetsDir();

    for (const category of VALID_ASSET_CATEGORIES) {
        for (const type of VALID_ASSET_TYPES) {
            const dirPath = path.join(assetsDir, category, type);
            let files: string[] = [];
            try {
                files = await readdir(dirPath);
            } catch {
                continue;
            }
            const metadataByName = await getAssetMetadataByFolder(category, type);
            for (const filename of files) {
                if (filename.startsWith('.')) continue;
                const filePath = path.join(dirPath, filename);
                let sizeBytes = 0;
                let modifiedAt = new Date().toISOString();
                try {
                    const fileStat = await stat(filePath);
                    sizeBytes = fileStat.size;
                    modifiedAt = fileStat.mtime.toISOString();
                } catch {
                    // skip unreadable
                }
                const meta = metadataByName[filename];
                const owner = meta?.owner || 'Guest';
                const record: VaultAssetRecord = {
                    id: stableVaultAssetId('vast', `${category}/${type}/${filename}`),
                    name: filename,
                    mimeType: 'application/octet-stream',
                    type,
                    category,
                    sizeBytes,
                    origin: {
                        connector: 'server',
                        uri: `server://${category}/${type}/${filename}`,
                        displayPath: `${category}/${type}/${filename}`,
                    },
                    aliases: [],
                    createdAt: meta?.createdAt || modifiedAt,
                    modifiedAt: meta?.updatedAt || modifiedAt,
                    owner,
                    isPublic: meta?.isPublic ?? false,
                    previewUrl: serverPreviewUrl(category, type, filename),
                };
                record.type = inferVaultAssetType(filename, record.mimeType);
                assets.push(record);
            }
        }
    }

    const catalog: VaultCatalog = {
        version: 1,
        updatedAt: new Date().toISOString(),
        assets,
    };
    await writeVaultCatalog(catalog);
    return catalog;
}

export async function getVaultStatus() {
    const catalog = await readVaultCatalog();
    const bookcases = await readBookcaseStore();
    return {
        assetCount: catalog.assets.length,
        lastSyncAt: catalog.updatedAt === new Date(0).toISOString() ? null : catalog.updatedAt,
        indexing: false,
        bookcases: bookcases.bookcases.length,
    };
}
