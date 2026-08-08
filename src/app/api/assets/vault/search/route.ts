import { parseJsonRequest, jsonWithRequestId, apiError } from '@/lib/server/apiContract';
import { readVaultCatalog } from '@/lib/server/vault-store';
import {
    readEmbeddedAssetIds,
    readVectorStore,
    searchEmbeddings,
} from '@/lib/server/vaultWatchStore';
import { VaultSearchRequestSchema } from '@/features/asset-vault/contracts/search';
import { ensureAssetVectors, runVaultSearch } from '@/features/asset-vault/application/vaultSearchService';
import {
    expandSearchQueryFast,
    embedQueryWithOllama,
    resolveEmbedModel,
} from '@/lib/server/ollamaEmbeddings';
import { ensureOllamaEmbedModelReady } from '@/lib/server/ollamaLifecycle';
import { requestVaultEmbedding, requestVaultThumbnails } from '@/lib/server/vaultEmbedQueue';
import {
    hashTextEmbedding,
    searchVectors,
    type VectorRecord,
} from '@/features/asset-vault/domain/vectorMath';
import type { VaultCatalog } from '@/features/asset-vault/contracts/assetRecord';

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
        // Loaded only if the indexed path is unavailable: materialising every
        // embedding costs 1.2 GB at 200k assets, which is the whole reason the
        // SQLite store exists.
        let vectors: VectorRecord[] = [];

        let expandedQuery = payload.query;
        let expandedTerms: string[] = [];
        const semanticQueryVectors: number[][] = [];
        let ollamaRunning = false;
        const embedModel = resolveEmbedModel();
        let embeddedIds = new Set<string>();
        // Non-null while the indexed path is viable; set to null the moment the
        // SQLite store is unavailable, so ranking falls back rather than
        // silently searching nothing.
        let indexedHits: Array<Array<{ assetId: string; score: number }>> | null = [];

        if (payload.mode === 'smart' && payload.query.trim()) {
            // Make sure Ollama is up (auto-start on local machines) and the
            // embedding model is resident — swapping it in now means every
            // call below hits a warm model instead of thrashing.
            const runtime = await ensureOllamaEmbedModelReady();
            ollamaRunning = runtime.running;

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

                // Indexing is a background job, never part of answering a
                // search. Embedding 32 assets inline made smart search take
                // 5.4s cold and 0.7s warm against 0.005s for keyword — and with
                // hundreds of thousands of assets pending it would have taken
                // thousands of searches to finish, each one paying that cost.
                embeddedIds = await readEmbeddedAssetIds(embedModel);
                if (catalog.assets.length > embeddedIds.size) {
                    // Fire and forget: a queue outage must not fail a search.
                    void requestVaultEmbedding(catalog.assets.length - embeddedIds.size)
                        .catch(() => {});
                }
            }

            // Neighbours from the indexed store, which never loads every
            // embedding. Null means no SQLite, so the in-memory path below runs.
            for (const queryVector of semanticQueryVectors) {
                const hits = await searchEmbeddings(queryVector, {
                    model: embedModel,
                    limit: Math.max(payload.limit, 40),
                });
                if (hits === null) {
                    indexedHits = null;
                    break;
                }
                if (hits.length > 0) indexedHits?.push(hits);
            }

            if (indexedHits) {
                // Hash vectors stay in memory: they are 64-dim, derived rather
                // than stored, and exist so contextual search works before any
                // real embedding model is available.
                const hashHits = searchVectors(
                    getDerivedHashVectors(catalog, []),
                    hashTextEmbedding(payload.query, 64),
                    Math.max(payload.limit, 40),
                );
                if (hashHits.length > 0) indexedHits.push(hashHits);
            } else {
                // No SQLite: fall back to the old in-memory path, which is what
                // shipped before and still works below the ~34k ceiling.
                vectors = getDerivedHashVectors(catalog, await readVectorStore());
            }
        }

        // Warm the thumbnail cache in the background. Deduped against the
        // queue, so this is a no-op once a pass is already running.
        void requestVaultThumbnails().catch(() => {});

        const results = runVaultSearch(
            catalog.assets,
            { ...payload, query: expandedQuery || payload.query },
            vectors,
            semanticQueryVectors,
            indexedHits ?? undefined,
        );

        const pendingSemantic = payload.mode === 'smart'
            ? catalog.assets.length - embeddedIds.size
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
