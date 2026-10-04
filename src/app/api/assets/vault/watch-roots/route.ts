import { z } from 'zod';
import { jsonWithRequestId, apiError, parseJsonRequest } from '@/lib/server/apiContract';
import {
    readWatchRootStore,
    upsertWatchRoot,
    removeWatchRoot,
} from '@/lib/server/vaultWatchStore';
import { WatchRootSchema } from '@/features/asset-vault/contracts/watchRoot';
import { requestWatchRootScan } from '@/lib/server/vaultEmbedQueue';
import { runWatchRootScan, WatchRootScanError } from '@/lib/server/vaultScanRunner';
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
    /**
     * Queue the scan and return at once with its job id. The scan then shows
     * its progress in the Activity panel and can be stopped there. Without it
     * the request waits for the scan, which is only reasonable for a small folder.
     */
    background: z.boolean().default(false),
});

/** Scan a registered watch root on the server filesystem and merge into the vault catalog. */
export async function PUT(request: Request) {
    try {
        const body = await parseJsonRequest(request, ScanBodySchema, 4096);

        if (body.background) {
            const store = await readWatchRootStore();
            const root = store.roots.find((entry) => entry.id === body.rootId);
            if (!root) {
                return apiError(request, { code: 'watch_root_not_found', message: 'Watch root not found.', status: 404 });
            }
            const queued = await requestWatchRootScan(root.id, root.label);
            return jsonWithRequestId(request, { success: true as const, queued: true as const, rootId: root.id, ...queued });
        }

        const outcome = await runWatchRootScan(body.rootId);
        return jsonWithRequestId(request, { success: true as const, ...outcome });
    } catch (error) {
        if (error instanceof WatchRootScanError) {
            return apiError(request, {
                code: error.code,
                message: error.message,
                status: error.status,
                retryable: error.code === 'watch_root_scan_failed',
            });
        }
        console.error('Watch root scan failed:', error);
        return apiError(request, {
            code: 'watch_root_scan_failed',
            message: 'Failed to scan watch root.',
            status: 500,
            retryable: true,
        });
    }
}
