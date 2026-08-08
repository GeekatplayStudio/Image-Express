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
export type VaultAssetFilter = {
    /** Restrict to one asset type, from a parsed natural-language query. */
    typeFilter?: string | null;
    /** Text typed in the search box. */
    text?: string;
    /** True when the results already came from the server's search. */
    serverAnswered?: boolean;
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

    if (filter.typeFilter) {
        result = result.filter((asset) => asset.type === filter.typeFilter);
    }

    // Only stand in for the server when it has not answered.
    const text = filter.serverAnswered ? '' : (filter.text || '').trim().toLowerCase();
    if (!text) return result;

    return result.filter((asset) => haystack(asset).includes(text));
}
