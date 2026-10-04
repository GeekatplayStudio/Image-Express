import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

/** What a scan can say about the folder it walked. */
export interface ScanCoverage {
    /** The walk stopped at the file ceiling: everything past the cut is unseen. */
    truncated: boolean;
    /** Folders the walk could not read (absolute paths). */
    unreadableDirs: readonly string[];
}

const comparablePath = (value: string) => (
    value.replace(/^file:\/\//i, '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
);

/**
 * Which previously indexed assets a rescan may drop.
 *
 * Only an asset the scan positively looked for and did not find. "Not in the
 * scan result" is not that: a scan that hit the file ceiling never reached the
 * rest, and a folder that could not be read says nothing about its contents.
 * Pruning those would throw away captions and tags for files that still exist.
 */
export function selectPrunableAssetIds(
    priorAssets: readonly VaultAssetRecord[],
    scannedIds: ReadonlySet<string>,
    coverage: ScanCoverage,
): string[] {
    if (coverage.truncated) return [];
    const unreadable = coverage.unreadableDirs.map((dir) => `${comparablePath(dir)}/`);
    return priorAssets
        .filter((asset) => {
            if (scannedIds.has(asset.id)) return false;
            if (unreadable.length === 0) return true;
            const assetPath = comparablePath(asset.origin?.uri ?? '');
            return !unreadable.some((dir) => assetPath.startsWith(dir));
        })
        .map((asset) => asset.id);
}
