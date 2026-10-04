import type { VaultSearchRequest, VaultSearchResult } from '@/features/asset-vault/contracts/search';
import { searchAssetsKeyword } from '@/features/asset-vault/domain/bookcaseEngine';
import { reciprocalRankFusion } from '@/features/asset-vault/domain/vectorMath';
import { readVaultAssetsByIds, sqliteCatalogReady } from '@/lib/server/vault-store';
import { folderPathOf } from '@/lib/server/vaultCatalogDb';
import { searchCatalog } from '@/lib/server/vaultCatalogSearch';

/**
 * Vault search that never loads the catalog.
 *
 * Keyword hits come from SQLite's full-text index, semantic neighbours from the
 * vector store, the two lists are fused by reciprocal rank, and only the fused
 * ids are hydrated — the arrangement ComfyUIAssetManager's `search/hybrid.py`
 * uses. Returns null when SQLite is not the active store; the caller then runs
 * the whole-catalog path, which is what the JSON fallback has always done.
 */

export interface IndexedSearchResult {
    results: VaultSearchResult[];
    total: number;
    hasMore: boolean;
}

export async function runIndexedVaultSearch(
    request: VaultSearchRequest,
    /** Neighbour lists from the vector store, best first. Empty for keyword search. */
    vectorHitLists: Array<Array<{ assetId: string; score: number }>> = [],
): Promise<IndexedSearchResult | null> {
    if (!(await sqliteCatalogReady())) return null;
    const text = request.query.trim();
    const semantic = vectorHitLists.filter((hits) => hits.length > 0);

    if (semantic.length === 0) {
        const page = await searchCatalog({
            query: text,
            filter: request.filter,
            limit: request.limit,
            offset: request.offset,
            sort: request.sort,
            folderPrefix: request.folderPrefix,
        });
        if (!page) return null;
        const reason = text ? `keyword: ${text}` : 'browse';
        return {
            results: page.hits.map((hit) => ({ asset: hit.asset, score: hit.score, matchReasons: [reason] })),
            total: page.total,
            hasMore: request.offset + page.hits.length < page.total,
        };
    }

    // Hybrid: rank fusion needs each arm's best N, not a page of one of them.
    const depth = Math.max(request.limit, 40);
    const keyword = await searchCatalog({
        query: text,
        filter: request.filter,
        limit: depth,
        sort: 'relevance',
        folderPrefix: request.folderPrefix,
    });
    if (!keyword) return null;

    const keywordIds = new Set(keyword.hits.map((hit) => hit.asset.id));
    const fused = reciprocalRankFusion([
        keyword.hits.map((hit) => ({ id: hit.asset.id, score: hit.score })),
        ...semantic.map((hits) => hits.map((hit) => ({ id: hit.assetId, score: hit.score }))),
    ]);

    const known = new Map(keyword.hits.map((hit) => [hit.asset.id, hit.asset]));
    const toFetch = fused.map((entry) => entry.id).filter((id) => !known.has(id));
    for (const asset of await readVaultAssetsByIds(toFetch)) known.set(asset.id, asset);

    const results: VaultSearchResult[] = [];
    for (const entry of fused) {
        const asset = known.get(entry.id);
        // Not in the catalog any more (deleted or missing), or outside the filter.
        if (!asset) continue;
        if (request.filter && searchAssetsKeyword([asset], '', request.filter, 1).length === 0) continue;
        if (request.folderPrefix) {
            const folder = folderPathOf(asset);
            if (folder !== request.folderPrefix && !folder.startsWith(`${request.folderPrefix}/`)) continue;
        }
        results.push({
            asset,
            score: entry.score,
            matchReasons: keywordIds.has(entry.id)
                ? ['hybrid: keyword+vector', `keyword: ${text}`]
                : ['hybrid: vector-context'],
        });
        if (results.length >= request.limit) break;
    }

    if (results.length === 0) {
        return {
            results: keyword.hits.slice(0, request.limit)
                .map((hit) => ({ asset: hit.asset, score: hit.score, matchReasons: [`keyword: ${text}`] })),
            total: keyword.total,
            hasMore: false,
        };
    }
    // A fused list has no meaningful "everything that matches"; it is what was ranked.
    return { results, total: results.length, hasMore: false };
}
