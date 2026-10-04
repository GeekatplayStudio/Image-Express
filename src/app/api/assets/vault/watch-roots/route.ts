import { z } from 'zod';
import { jsonWithRequestId, apiError, parseJsonRequest } from '@/lib/server/apiContract';
import {
    readWatchRootStore,
    upsertWatchRoot,
    removeWatchRoot,
    scanDirectoryRecursive,
} from '@/lib/server/vaultWatchStore';
import { WatchRootSchema } from '@/features/asset-vault/contracts/watchRoot';
import { applyWatchRootScan } from '@/lib/server/vaultRescan';
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

        let scan: Awaited<ReturnType<typeof scanDirectoryRecursive>> = { files: [], truncated: false, unreadableDirs: [] };
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

        // Write what changed, mark what vanished; an unchanged folder costs a
        // fingerprint comparison and nothing else. See vaultRescan.ts.
        const stats = await applyWatchRootScan(root, scan);

        await upsertWatchRoot({
            ...root,
            lastScanAt: new Date().toISOString(),
            lastScanStatus: 'ready',
            estimatedFileCount: scan.files.length,
            // A truncated scan is a partial success, not a failure — see
            // lastScanTruncated on the contract.
            lastScanTruncated: scan.truncated || undefined,
            lastError: undefined,
            updatedAt: new Date().toISOString(),
        });

        return jsonWithRequestId(request, {
            success: true as const,
            fileCount: scan.files.length,
            truncated: scan.truncated,
            unreadableFolders: scan.unreadableDirs.length,
            stats,
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
