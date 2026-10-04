import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type { WatchRoot } from '@/features/asset-vault/contracts/watchRoot';
import { inferVaultAssetType, stableVaultAssetId } from '@/features/asset-vault/domain/inferAssetType';
import {
    deleteVaultAssets,
    invalidateCatalogCaches,
    readVaultAssetsByIds,
    readVaultAssetsByWatchRoot,
    sqliteCatalogReady,
    upsertVaultAssets,
} from '@/lib/server/vault-store';
import { mapWithConcurrency, readFileMeta, withFileMeta } from '@/lib/server/vaultFileMeta';
import { selectPrunableAssetIds } from '@/lib/server/vaultScanPrune';
import {
    checkpointCatalog,
    fileFingerprint,
    markAssetsMissing,
    purgeMissingAssets,
    readWatchRootFingerprints,
    restoreMissingAssets,
} from '@/lib/server/vaultScanStore';
import { deleteVectors } from '@/lib/server/vaultVectorDb';
import type { ScanResult, ScannedFile } from '@/lib/server/vaultWatchStore';

/**
 * Merging a folder scan into the catalog.
 *
 * A rescan used to rebuild and rewrite a record for every file it found —
 * 200,000 `JSON.stringify` + UPSERT for a folder where nothing had changed —
 * and delete on the spot anything it did not find. Both are replaced here with
 * what ComfyUIAssetManager's indexer does:
 *
 * - **Incremental.** A file whose size and modified time match what is stored
 *   is skipped. Only new and changed files are written.
 * - **File metadata.** What is written carries what the file says about itself
 *   (see `vaultFileMeta.ts`), so an AI image is searchable by its own prompt.
 * - **Soft delete.** A file that is gone is marked missing and kept for
 *   `MISSING_RETENTION_DAYS`, so captions and tags survive a folder that was
 *   moved and put back. Only what the scan actually looked for is marked.
 */

export interface WatchRootScanStats {
    added: number;
    updated: number;
    unchanged: number;
    /** Files that were marked missing and are back. */
    restored: number;
    /** Files newly marked missing by this scan. */
    missing: number;
    /** Rows deleted because they had been missing past the retention window. */
    purged: number;
}

const assetIdFor = (root: WatchRoot, file: ScannedFile) => (
    stableVaultAssetId('vdrv', `${root.id}:${file.relativePath}`)
);

/**
 * The record for a scanned file. `prior` carries everything a scan cannot
 * know — description, tags, embedding state, and when the file was first seen.
 */
export function buildScannedAssetRecord(
    root: WatchRoot,
    file: ScannedFile,
    prior?: VaultAssetRecord,
): VaultAssetRecord {
    return {
        ...(prior ?? {}),
        id: assetIdFor(root, file),
        name: file.name,
        mimeType: prior?.mimeType ?? 'application/octet-stream',
        type: inferVaultAssetType(file.name),
        category: 'uploads' as const,
        sizeBytes: file.sizeBytes,
        origin: {
            connector: 'local' as const,
            uri: `file://${file.absolutePath.replace(/\\/g, '/')}`,
            displayPath: `${root.label} / ${file.relativePath}`,
            watchRootId: root.id,
        },
        aliases: [],
        // First seen stays first seen: a rescan must not make an old file look new.
        createdAt: prior?.createdAt ?? file.modifiedAt,
        modifiedAt: file.modifiedAt,
        owner: 'Guest',
        isPublic: false,
        previewUrl: undefined,
    };
}

async function applyIncrementally(
    root: WatchRoot,
    scan: ScanResult,
    stored: NonNullable<Awaited<ReturnType<typeof readWatchRootFingerprints>>>,
): Promise<WatchRootScanStats> {
    const stats: WatchRootScanStats = { added: 0, updated: 0, unchanged: 0, restored: 0, missing: 0, purged: 0 };
    const scannedIds = new Set<string>();
    const toWrite: Array<{ id: string; file: ScannedFile; existed: boolean }> = [];
    const toRestore: string[] = [];

    for (const file of scan.files) {
        const id = assetIdFor(root, file);
        scannedIds.add(id);
        const known = stored.get(id);
        if (!known) {
            toWrite.push({ id, file, existed: false });
        } else if (known.fingerprint !== fileFingerprint(file.modifiedAt, file.sizeBytes)) {
            toWrite.push({ id, file, existed: true });
        } else if (known.missing) {
            toRestore.push(id);
        } else {
            stats.unchanged += 1;
        }
    }

    // Only changed files need their previous record, to carry enrichment over.
    const priorById = new Map(
        (await readVaultAssetsByIds(toWrite.filter((entry) => entry.existed).map((entry) => entry.id)))
            .map((asset) => [asset.id, asset]),
    );
    // New and changed files are read once, here: their type, and for a PNG its
    // size and whatever the generator wrote into it (prompt, model, seed).
    const records = await mapWithConcurrency(toWrite, 8, async (entry) => withFileMeta(
        buildScannedAssetRecord(root, entry.file, priorById.get(entry.id)),
        await readFileMeta(entry.file.absolutePath, entry.file.name),
    ));
    await upsertVaultAssets(records);
    stats.added = toWrite.filter((entry) => !entry.existed).length;
    stats.updated = toWrite.length - stats.added;

    stats.restored = await restoreMissingAssets(toRestore);

    // Candidates are rows not already missing; their records give the path the
    // unreadable-folder check needs.
    const vanishedIds = [...stored.entries()]
        .filter(([id, known]) => !known.missing && !scannedIds.has(id))
        .map(([id]) => id);
    const prunable = selectPrunableAssetIds(await readVaultAssetsByIds(vanishedIds), scannedIds, scan);
    stats.missing = await markAssetsMissing(prunable);

    const purged = await purgeMissingAssets();
    stats.purged = purged.length;
    if (purged.length > 0) {
        // Embeddings hang off asset ids; nothing else removes them.
        await deleteVectors(purged).catch((error) => console.warn('Vault vector clean-up skipped:', error));
    }

    if (stats.restored || stats.missing || stats.purged) invalidateCatalogCaches();
    await checkpointCatalog();
    return stats;
}

/** The JSON store has no columns to mark, so a vanished file is removed — but only a positively vanished one. */
async function applyWholeRoot(root: WatchRoot, scan: ScanResult): Promise<WatchRootScanStats> {
    const priorAssets = await readVaultAssetsByWatchRoot(root.id);
    const priorById = new Map(priorAssets.map((asset) => [asset.id, asset]));
    const scanned = scan.files.map((file) => buildScannedAssetRecord(root, file, priorById.get(assetIdFor(root, file))));
    const scannedIds = new Set(scanned.map((asset) => asset.id));
    const removed = selectPrunableAssetIds(priorAssets, scannedIds, scan);
    await upsertVaultAssets(scanned);
    await deleteVaultAssets(removed);
    const added = scanned.filter((asset) => !priorById.has(asset.id)).length;
    return { added, updated: scanned.length - added, unchanged: 0, restored: 0, missing: removed.length, purged: removed.length };
}

export async function applyWatchRootScan(root: WatchRoot, scan: ScanResult): Promise<WatchRootScanStats> {
    if (await sqliteCatalogReady()) {
        const stored = await readWatchRootFingerprints(root.id);
        if (stored) return applyIncrementally(root, scan, stored);
    }
    return applyWholeRoot(root, scan);
}
