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
    readVaultCatalog,
    writeVaultCatalog,
} from '@/lib/server/vault-store';
import {
    buildAssetEmbeddingText,
    hashTextEmbedding,
    upsertVector,
} from '@/features/asset-vault/domain/vectorMath';
import { readVectorStore, writeVectorStore } from '@/lib/server/vaultWatchStore';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

export async function GET(request: Request) {
    const store = await readWatchRootStore();
    return jsonWithRequestId(request, { success: true as const, roots: store.roots });
}

const UpsertBodySchema = WatchRootSchema;

export async function POST(request: Request) {
    try {
        const root = await parseJsonRequest(request, UpsertBodySchema, 32_768);
        const store = await upsertWatchRoot(root);
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

        const scanning: typeof root = {
            ...root,
            lastScanStatus: 'scanning',
            updatedAt: new Date().toISOString(),
        };
        await upsertWatchRoot(scanning);

        let files: Awaited<ReturnType<typeof scanDirectoryRecursive>> = [];
        try {
            files = await scanDirectoryRecursive(root.rootUri, { maxFiles: 8000 });
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

        const catalog = await readVaultCatalog();
        const kept = catalog.assets.filter(
            (asset) => !(asset.origin.connector === 'local' && asset.origin.watchRootId === root.id),
        );
        const scannedAssets: VaultAssetRecord[] = files.map((file) => {
            const type = inferVaultAssetType(file.name);
            return {
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

        const nextCatalog = {
            version: 1 as const,
            updatedAt: new Date().toISOString(),
            assets: [...kept, ...scannedAssets],
        };
        await writeVaultCatalog(nextCatalog);

        if (body.embed) {
            let vectors = await readVectorStore();
            const now = new Date().toISOString();
            for (const asset of scannedAssets) {
                const text = buildAssetEmbeddingText(asset);
                vectors = upsertVector(vectors, {
                    assetId: asset.id,
                    model: 'hash-text-v1',
                    dims: 64,
                    vector: hashTextEmbedding(text, 64),
                    updatedAt: now,
                });
            }
            await writeVectorStore(vectors);
        }

        await upsertWatchRoot({
            ...root,
            lastScanAt: new Date().toISOString(),
            lastScanStatus: 'ready',
            estimatedFileCount: files.length,
            lastError: undefined,
            updatedAt: new Date().toISOString(),
        });

        return jsonWithRequestId(request, {
            success: true as const,
            fileCount: files.length,
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
