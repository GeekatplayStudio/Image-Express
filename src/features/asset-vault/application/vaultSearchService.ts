import type { VaultSearchRequest, VaultSearchResult } from '../contracts/search';
import type { VaultAssetRecord } from '../contracts/assetRecord';
import { dedupeVaultAssets, searchAssetsKeyword } from '../domain/bookcaseEngine';
import {
    buildAssetEmbeddingText,
    hashTextEmbedding,
    reciprocalRankFusion,
    searchVectors,
    type VectorRecord,
} from '../domain/vectorMath';

export function mergeCatalogAssets(...sources: VaultAssetRecord[][]): VaultAssetRecord[] {
    return dedupeVaultAssets(sources.flat());
}

export function runVaultSearch(
    assets: VaultAssetRecord[],
    request: VaultSearchRequest,
    vectors: VectorRecord[] = [],
    /**
     * Optional model-native query vectors (e.g. Ollama nomic-embed-text).
     * Each is searched only against store records of the same dimension, so
     * hash vectors and real embeddings never cross-compare.
     */
    semanticQueryVectors: number[][] = [],
): VaultSearchResult[] {
    const keywordHits = searchAssetsKeyword(assets, request.query, request.filter, request.limit);

    if (request.mode !== 'smart' || !request.query.trim()) {
        return keywordHits;
    }

    // Always ensure hash embeddings so contextual search works even before Ollama/CLIP.
    const ensured = vectors.length >= assets.length
        ? vectors
        : ensureAssetVectors(assets, vectors);

    const vectorLimit = Math.max(request.limit, 40);
    const queryVectors = [...semanticQueryVectors, hashTextEmbedding(request.query, 64)];
    const vectorHitLists = queryVectors
        .map((queryVector) => searchVectors(ensured, queryVector, vectorLimit))
        .filter((hits) => hits.length > 0);
    const vectorHits = vectorHitLists.flat();
    const byId = new Map(assets.map((asset) => [asset.id, asset]));

    const fused = reciprocalRankFusion([
        keywordHits.map((hit) => ({ id: hit.asset.id, score: hit.score })),
        ...vectorHitLists.map((hits) => hits.map((hit) => ({ id: hit.assetId, score: hit.score }))),
    ]);

    const ranked = fused
        .map((entry) => {
            const asset = byId.get(entry.id);
            if (!asset) return null;
            if (request.filter) {
                const filtered = searchAssetsKeyword([asset], '', request.filter, 1);
                if (filtered.length === 0) return null;
            }
            const fromKeyword = keywordHits.find((hit) => hit.asset.id === entry.id);
            return {
                asset,
                score: entry.score,
                matchReasons: fromKeyword
                    ? ['hybrid: keyword+vector', ...fromKeyword.matchReasons]
                    : ['hybrid: vector-context'],
            };
        })
        .filter((entry): entry is VaultSearchResult => entry !== null)
        .slice(0, request.limit);

    // Never return empty when vectors found neighbors but RRF/filter dropped them.
    if (ranked.length === 0 && vectorHits.length > 0) {
        const bestByAsset = new Map<string, number>();
        for (const hit of vectorHits) {
            const prev = bestByAsset.get(hit.assetId);
            if (prev === undefined || hit.score > prev) bestByAsset.set(hit.assetId, hit.score);
        }
        return Array.from(bestByAsset.entries())
            .map(([assetId, score]) => ({ assetId, score }))
            .sort((a, b) => b.score - a.score)
            .map((hit) => {
                const asset = byId.get(hit.assetId);
                if (!asset) return null;
                return {
                    asset,
                    score: hit.score,
                    matchReasons: ['vector-context'],
                };
            })
            .filter((entry): entry is VaultSearchResult => entry !== null)
            .slice(0, request.limit);
    }

    return ranked.length > 0 ? ranked : keywordHits;
}

export function ensureAssetVectors(assets: VaultAssetRecord[], existing: VectorRecord[]): VectorRecord[] {
    const byId = new Map(existing.map((entry) => [entry.assetId, entry]));
    const now = new Date().toISOString();
    for (const asset of assets) {
        if (byId.has(asset.id)) continue;
        byId.set(asset.id, {
            assetId: asset.id,
            model: 'hash-text-v1',
            dims: 64,
            vector: hashTextEmbedding(buildAssetEmbeddingText(asset), 64),
            updatedAt: now,
        });
    }
    return Array.from(byId.values());
}
