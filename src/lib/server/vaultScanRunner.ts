import type { WatchRoot } from '@/features/asset-vault/contracts/watchRoot';
import { backfillVaultFileMeta } from '@/lib/server/vaultFileMeta';
import { decideVaultPathAccess } from '@/lib/server/vaultFilesystemPolicy';
import { applyWatchRootScan, type WatchRootScanStats } from '@/lib/server/vaultRescan';
import {
    readWatchRootStore,
    scanDirectoryRecursive,
    upsertWatchRoot,
    type ScanProgress,
} from '@/lib/server/vaultWatchStore';

/**
 * One scan of one watch root, start to finish.
 *
 * Shared by the request that waits for it and the queue job that does not.
 * The job is the normal way: a whole-drive scan takes minutes, and holding a
 * web request open that long meant no progress, no way to stop it, and a
 * timeout away from a half-finished index. (ComfyUIAssetManager's
 * `IndexerService`: one scan at a time, visible, cancellable.)
 */

export class WatchRootScanError extends Error {
    constructor(
        public readonly code: 'watch_root_not_found' | 'watch_root_not_authorized' | 'watch_root_scan_failed',
        message: string,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'WatchRootScanError';
    }
}

export interface WatchRootScanOutcome {
    rootId: string;
    fileCount: number;
    truncated: boolean;
    /** The scan was stopped by the user: what it found is kept, nothing is pruned. */
    stopped: boolean;
    unreadableFolders: number;
    stats: WatchRootScanStats;
}

export async function runWatchRootScan(
    rootId: string,
    hooks: { onProgress?: (progress: ScanProgress) => void; shouldStop?: () => boolean } = {},
): Promise<WatchRootScanOutcome> {
    const store = await readWatchRootStore();
    const root: WatchRoot | undefined = store.roots.find((entry) => entry.id === rootId);
    if (!root) throw new WatchRootScanError('watch_root_not_found', 'Watch root not found.', 404);

    // Re-check at scan time too: the allowlist may have been tightened after
    // this root was registered, and a stored root must never outlive the policy.
    const decision = decideVaultPathAccess(root.rootUri);
    if (!decision.allowed) throw new WatchRootScanError('watch_root_not_authorized', decision.reason, 403);

    await upsertWatchRoot({ ...root, lastScanStatus: 'scanning', updatedAt: new Date().toISOString() });

    try {
        const scan = await scanDirectoryRecursive(root.rootUri, hooks);
        // Write what changed, mark what vanished; an unchanged folder costs a
        // fingerprint comparison and nothing else. See vaultRescan.ts.
        const stats = await applyWatchRootScan(root, scan);

        await upsertWatchRoot({
            ...root,
            lastScanAt: new Date().toISOString(),
            lastScanStatus: 'ready',
            estimatedFileCount: scan.stopped ? root.estimatedFileCount : scan.files.length,
            // A truncated scan is a partial success, not a failure — see
            // lastScanTruncated on the contract.
            lastScanTruncated: (scan.truncated && !scan.stopped) || undefined,
            lastError: undefined,
            updatedAt: new Date().toISOString(),
        });

        // Files indexed before the metadata reader existed are caught up in the
        // background; the scan does not wait for them.
        void backfillVaultFileMeta().catch((error) => console.warn('Vault metadata backfill stopped:', error));

        return {
            rootId: root.id,
            fileCount: scan.files.length,
            truncated: scan.truncated && !scan.stopped,
            stopped: scan.stopped,
            unreadableFolders: scan.unreadableDirs.length,
            stats,
        };
    } catch (error) {
        // Nothing is pruned on this path: an unreachable root leaves the
        // catalog exactly as it was.
        const message = error instanceof Error ? error.message : 'Scan failed';
        await upsertWatchRoot({
            ...root,
            lastScanStatus: 'error',
            lastError: message,
            updatedAt: new Date().toISOString(),
        });
        throw new WatchRootScanError('watch_root_scan_failed', message, 500);
    }
}
