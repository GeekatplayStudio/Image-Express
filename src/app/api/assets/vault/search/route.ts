import { parseJsonRequest, jsonWithRequestId, apiError } from '@/lib/server/apiContract';
import { readVaultCatalog } from '@/lib/server/vault-store';
import { readVectorStore, writeVectorStore } from '@/lib/server/vaultWatchStore';
import { VaultSearchRequestSchema } from '@/features/asset-vault/contracts/search';
import { ensureAssetVectors, runVaultSearch } from '@/features/asset-vault/application/vaultSearchService';
import {
    expandSearchQueryFast,
    embedQueryWithOllama,
    embedTextsWithOllama,
    resolveEmbedModel,
} from '@/lib/server/ollamaEmbeddings';
import { ensureOllamaEmbedModelReady } from '@/lib/server/ollamaLifecycle';
import {
    buildAssetEmbeddingText,
    upsertVector,
    type VectorRecord,
} from '@/features/asset-vault/domain/vectorMath';
import type { VaultCatalog } from '@/features/asset-vault/contracts/assetRecord';

/** How many assets we upgrade from hash → real embeddings per search request. */
const EMBED_BACKFILL_BATCH = 32;

/**
 * Hash vectors are a pure function of the catalog, so they are derived rather
 * than stored. Deriving 200k of them costs real time, so memoise on the
 * catalog alone — crucially NOT on the persisted vectors, which change on
 * every backfill and would invalidate the cache each search.
 *
 * Real vectors are concatenated rather than merged: searchVectors matches on
 * dimension, so a hash record and a real record for the same asset never
 * compete, and each query vector only ever sees its own model's records.
 */
let derivedCache: { key: string; vectors: VectorRecord[] } | null = null;

function getDerivedHashVectors(catalog: VaultCatalog, persisted: VectorRecord[]): VectorRecord[] {
    const key = `${catalog.updatedAt}::${catalog.assets.length}`;
    if (!derivedCache || derivedCache.key !== key) {
        derivedCache = { key, vectors: ensureAssetVectors(catalog.assets, []) };
    }
    const real = persisted.filter((entry) => entry.model !== 'hash-text-v1');
    return real.length > 0 ? [...derivedCache.vectors, ...real] : derivedCache.vectors;
}

export async function POST(request: Request) {
    try {
        const payload = await parseJsonRequest(request, VaultSearchRequestSchema, 32_768);
        const catalog = await readVaultCatalog();
        let vectors = await readVectorStore();

        let expandedQuery = payload.query;
        let expandedTerms: string[] = [];
        const semanticQueryVectors: number[][] = [];
        let ollamaRunning = false;
        const embedModel = resolveEmbedModel();

        if (payload.mode === 'smart' && payload.query.trim()) {
            // Make sure Ollama is up (auto-start on local machines) and the
            // embedding model is resident — swapping it in now means every
            // call below hits a warm model instead of thrashing.
            const runtime = await ensureOllamaEmbedModelReady();
            ollamaRunning = runtime.running;

            // Hash embeddings are derived, never persisted — see
            // getDerivedHashVectors. Only real embeddings are written back.
            vectors = getDerivedHashVectors(catalog, vectors);
            let vectorsDirty = false;

            if (ollamaRunning) {
                // Embed the query with the SAME model as the stored asset
                // vectors — mismatched models/dimensions are never compared.
                const [terms, queryEmbed] = await Promise.all([
                    expandSearchQueryFast({ query: payload.query }).catch(() => [] as string[]),
                    embedQueryWithOllama({ text: payload.query }),
                ]);
                expandedTerms = terms;
                if (expandedTerms.length > 1) {
                    expandedQuery = expandedTerms.join(' ');
                }
                if (queryEmbed.source === 'ollama') {
                    semanticQueryVectors.push(queryEmbed.vector);
                }

                // Backfill real embeddings for assets that only have hash
                // vectors — one batched round-trip, skipping anything already
                // upgraded, so the index converges instead of re-embedding
                // the same sample forever.
                const upgraded = new Set(
                    vectors.filter((entry) => entry.model === embedModel).map((entry) => entry.assetId),
                );
                const pending = catalog.assets
                    .filter((asset) => !upgraded.has(asset.id))
                    .slice(0, EMBED_BACKFILL_BATCH);
                if (pending.length > 0) {
                    const batch = await embedTextsWithOllama({
                        texts: pending.map((asset) => buildAssetEmbeddingText(asset)),
                    });
                    if (batch) {
                        const now = new Date().toISOString();
                        pending.forEach((asset, index) => {
                            vectors = upsertVector(vectors, {
                                assetId: asset.id,
                                model: batch.model,
                                dims: batch.vectors[index].length,
                                vector: batch.vectors[index],
                                updatedAt: now,
                            });
                        });
                        vectorsDirty = true;
                    }
                }
            }

            if (vectorsDirty) {
                try {
                    // Persist ONLY real embeddings — derived hash vectors are
                    // recomputed on read and must never reach disk.
                    await writeVectorStore(vectors.filter((entry) => entry.model !== 'hash-text-v1'));
                } catch (error) {
                    console.warn('Could not persist vector store', error);
                }
            }
        }

        const results = runVaultSearch(
            catalog.assets,
            { ...payload, query: expandedQuery || payload.query },
            vectors,
            semanticQueryVectors,
        );

        const pendingSemantic = payload.mode === 'smart'
            ? catalog.assets.length - vectors.filter((entry) => entry.model === embedModel).length
            : 0;

        return jsonWithRequestId(request, {
            success: true as const,
            results,
            total: results.length,
            query: payload.query,
            expandedTerms,
            engine: {
                ollamaRunning,
                embedModel,
                semanticQuery: semanticQueryVectors.length > 0,
                pendingSemantic: Math.max(0, pendingSemantic),
            },
        });
    } catch (error) {
        console.error('Vault search failed:', error);
        return apiError(request, {
            code: 'vault_search_failed',
            message: 'Vault search failed.',
            status: 500,
            retryable: true,
        });
    }
}
