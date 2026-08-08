import type { VaultAssetRecord } from '../contracts/assetRecord';

/**
 * Narrow a working set to what the vault should actually display.
 *
 * This has to be the single place it happens. It used to run only where the
 * grid was built, while the sidebar counted the unfiltered set — so the sidebar
 * would offer an album of 35 assets and the grid would then render nothing,
 * because none of those 35 matched the typed text.
 *
 * `serverAnswered` is the important input. When a search has come back from the
 * server, its results are already the answer and must not be filtered again:
 * semantic search returns assets whose names do not contain the query at all,
 * and a substring pass would throw exactly those away.
 */
/**
 * Which assets belong to the user's own working set.
 *
 * `library` is everything brought into the app deliberately — uploaded,
 * generated, or saved from a design. `indexed` is everything discovered by
 * scanning a drive. The distinction matters because the two differ by orders of
 * magnitude: one real vault held 81 library assets against 239,688 indexed
 * ones, so the things the user actually works with were 0.03% of what they had
 * to scroll past.
 *
 * `category` cannot express this — a scanned file is also 'uploads'. What
 * separates them is whether a watch root discovered the asset.
 */
export type VaultAssetSource = 'all' | 'library' | 'indexed';

export function isLibraryAsset(asset: VaultAssetRecord): boolean {
    return !asset.origin?.watchRootId;
}

export type VaultAssetFilter = {
    /** Restrict to one asset type, from a parsed natural-language query. */
    typeFilter?: string | null;
    /** Text typed in the search box. */
    text?: string;
    /** True when the results already came from the server's search. */
    serverAnswered?: boolean;
    /** Library-only, drive-only, or everything. Defaults to everything. */
    source?: VaultAssetSource;
};

/** The fields a local text match looks at. */
function haystack(asset: VaultAssetRecord): string {
    return [
        asset.name,
        asset.description || '',
        ...(asset.tags || []),
        asset.origin?.displayPath || '',
    ].join(' ').toLowerCase();
}

export function filterVaultAssets(
    assets: VaultAssetRecord[],
    filter: VaultAssetFilter,
): VaultAssetRecord[] {
    let result = assets;

    // Applied before everything else: it is the coarsest cut, and on a large
    // vault it removes the most.
    if (filter.source === 'library') {
        result = result.filter(isLibraryAsset);
    } else if (filter.source === 'indexed') {
        result = result.filter((asset) => !isLibraryAsset(asset));
    }

    if (filter.typeFilter) {
        result = result.filter((asset) => asset.type === filter.typeFilter);
    }

    // Only stand in for the server when it has not answered.
    const text = filter.serverAnswered ? '' : (filter.text || '').trim().toLowerCase();
    if (!text) return result;

    return result.filter((asset) => haystack(asset).includes(text));
}

export type VaultSourceCounts = { all: number; library: number; indexed: number };

/**
 * How many assets each source choice would show.
 *
 * The control labels itself with these so the user can see that "library" means
 * 81 and "all" means 239,769 without having to switch and find out.
 */
export function countVaultAssetSources(assets: VaultAssetRecord[]): VaultSourceCounts {
    let library = 0;
    for (const asset of assets) {
        if (isLibraryAsset(asset)) library += 1;
    }
    return { all: assets.length, library, indexed: assets.length - library };
}
