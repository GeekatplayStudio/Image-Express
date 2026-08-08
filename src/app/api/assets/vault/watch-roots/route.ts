import { z } from 'zod';
import { jsonWithRequestId, apiError, parseJsonRequest } from '@/lib/server/apiContract';
import {
    readWatchRootStore,
    upsertWatchRoot,
    removeWatchRoot,
    scanDirectoryRecursive,
} from '@/lib/server/vaultWatchStore';
import { WatchRootSchema } from '@/features/asset-vault/contracts/watchRoot';
import { stableVaultAssetId, inferVaultAssetType } from '@/features/asset-vault/domain/inferAssetType';
import {
    deleteVaultAssets,
    readVaultAssetsByWatchRoot,
    upsertVaultAssets,
} from '@/lib/server/vault-store';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { decideVaultPathAccess } from '@/lib/server/vaultFilesystemPolicy';

export async function GET(request: Request) {
    const store = await readWatchRootStore();
    return jsonWithRequestId(request, { success: true as const, roots: store.roots });
}

const UpsertBodySchema = WatchRootSchema;

export async function POST(request: Request) {
    try {
        const root = await parseJsonRequest(request, UpsertBodySchema, 32_768);

        // On a local install this always passes; when self-hosted it enforces the
        // operator's authorised folders, so an arbitrary path cannot be registered.
        const decision = decideVaultPathAccess(root.rootUri);
        if (!decision.allowed) {
            return apiError(request, {
                code: 'watch_root_not_authorized',
                message: decision.reason,
                status: 403,
            });
        }

        const store = await upsertWatchRoot({ ...root, rootUri: decision.resolvedPath });
        return jsonWithRequestId(request, { success: true as const, roots: store.roots });
    } catch (error) {
        console.error('Watch root upsert failed:', error);
        return apiError(request, {
            code: 'watch_root_upsert_failed',
            message: 'Failed to save watch root.',
            status: 500,
            retryable: true,
        });
    }
}

const DeleteBodySchema = z.object({ id: z.string().min(1) });

export async function DELETE(request: Request) {
    try {
        const body = await parseJsonRequest(request, DeleteBodySchema, 4096);
        const store = await removeWatchRoot(body.id);
        return jsonWithRequestId(request, { success: true as const, roots: store.roots });
    } catch (error) {
        console.error('Watch root delete failed:', error);
        return apiError(request, {
            code: 'watch_root_delete_failed',
            message: 'Failed to remove watch root.',
            status: 500,
            retryable: true,
        });
    }
}

const ScanBodySchema = z.object({
    rootId: z.string().min(1),
    /** When true, also rebuild text embeddings for scanned assets. */
    embed: z.boolean().default(true),
});

/** Scan a registered watch root on the server filesystem and merge into the vault catalog. */
export async function PUT(request: Request) {
    try {
        const body = await parseJsonRequest(request, ScanBodySchema, 4096);
        const store = await readWatchRootStore();
        const root = store.roots.find((entry) => entry.id === body.rootId);
        if (!root) {
            return apiError(request, {
                code: 'watch_root_not_found',
                message: 'Watch root not found.',
                status: 404,
            });
        }

        // Re-check at scan time too: the allowlist may have been tightened after
        // this root was registered, and a stored root must never outlive the policy.
        const decision = decideVaultPathAccess(root.rootUri);
        if (!decision.allowed) {
            return apiError(request, {
                code: 'watch_root_not_authorized',
                message: decision.reason,
                status: 403,
            });
        }

        const scanning: typeof root = {
            ...root,
            lastScanStatus: 'scanning',
            updatedAt: new Date().toISOString(),
        };
        await upsertWatchRoot(scanning);

        let scan: Awaited<ReturnType<typeof scanDirectoryRecursive>> = { files: [], truncated: false };
        try {
            scan = await scanDirectoryRecursive(root.rootUri);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Scan failed';
            await upsertWatchRoot({
                ...scanning,
                lastScanStatus: 'error',
                lastError: message,
                updatedAt: new Date().toISOString(),
            });
            return apiError(request, {
                code: 'watch_root_scan_failed',
                message,
                status: 500,
                retryable: true,
            });
        }

        // Only this root's assets, not the whole catalog: a rescan of one folder
        // has no reason to materialise every other asset on the machine.
        const priorAssets = await readVaultAssetsByWatchRoot(root.id);
        // Asset ids are stable across rescans; keep prior AI enrichment
        // (descriptions, tags) instead of wiping it on every scan.
        const priorById = new Map(priorAssets.map((asset) => [asset.id, asset]));
        const scannedAssets: VaultAssetRecord[] = scan.files.map((file) => {
            const type = inferVaultAssetType(file.name);
            const prior = priorById.get(stableVaultAssetId('vdrv', `${root.id}:${file.relativePath}`));
            return {
                ...(prior ?? {}),
                id: stableVaultAssetId('vdrv', `${root.id}:${file.relativePath}`),
                name: file.name,
                mimeType: 'application/octet-stream',
                type,
                category: 'uploads' as const,
                sizeBytes: file.sizeBytes,
                origin: {
                    connector: 'local' as const,
                    uri: `file://${file.absolutePath.replace(/\\/g, '/')}`,
                    displayPath: `${root.label} / ${file.relativePath}`,
                    watchRootId: root.id,
                },
                aliases: [],
                createdAt: file.modifiedAt,
                modifiedAt: file.modifiedAt,
                owner: 'Guest',
                isPublic: false,
                previewUrl: undefined,
            };
        });

        // Replacing this root's contents = write what the scan found, drop what
        // it no longer finds. Equivalent to rewriting the catalog with
        // `[everything else, ...scanned]`, without touching everything else.
        const scannedIds = new Set(scannedAssets.map((asset) => asset.id));
        const removedIds = [...priorById.keys()].filter((id) => !scannedIds.has(id));
        await upsertVaultAssets(scannedAssets);
        await deleteVaultAssets(removedIds);

        // Hash vectors are a deterministic function of the asset text, so they
        // are derived at search time rather than persisted. Writing them here
        // produced a vector store hundreds of MB large that carried no
        // information the catalog did not already hold. Only real embedding
        // vectors (from Ollama) are worth storing, and those are backfilled by
        // the search/enrichment paths — which must not be clobbered here.

        await upsertWatchRoot({
            ...root,
            lastScanAt: new Date().toISOString(),
            lastScanStatus: 'ready',
            estimatedFileCount: scan.files.length,
            lastError: scan.truncated
                ? `Scan stopped at the ${scan.files.length} file limit; this folder has more to index.`
                : undefined,
            updatedAt: new Date().toISOString(),
        });

        return jsonWithRequestId(request, {
            success: true as const,
            fileCount: scan.files.length,
            truncated: scan.truncated,
            rootId: root.id,
        });
    } catch (error) {
        console.error('Watch root scan failed:', error);
        return apiError(request, {
            code: 'watch_root_scan_failed',
            message: 'Failed to scan watch root.',
            status: 500,
            retryable: true,
        });
    }
}
