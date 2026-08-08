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

export async function readVaultCatalog(): Promise<VaultCatalog> {
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
    const filePath = CATALOG_PATH();
    await atomicWriteJson(filePath, catalog);
    try {
        const fileStat = await stat(filePath);
        catalogCache = { catalog, mtimeMs: fileStat.mtimeMs };
    } catch {
        catalogCache = null;
    }
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
