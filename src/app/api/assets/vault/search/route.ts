import { parseJsonRequest, jsonWithRequestId, apiError } from '@/lib/server/apiContract';
import { readVaultCatalog } from '@/lib/server/vault-store';
import { readVectorStore, writeVectorStore } from '@/lib/server/vaultWatchStore';
import { VaultSearchRequestSchema } from '@/features/asset-vault/contracts/search';
import { ensureAssetVectors, runVaultSearch } from '@/features/asset-vault/application/vaultSearchService';
import { expandSearchQueryWithOllama, embedTextWithOllama } from '@/lib/server/ollamaEmbeddings';
import { buildAssetEmbeddingText, upsertVector } from '@/features/asset-vault/domain/vectorMath';

export async function POST(request: Request) {
    try {
        const payload = await parseJsonRequest(request, VaultSearchRequestSchema, 32_768);
        const catalog = await readVaultCatalog();
        let vectors = await readVectorStore();

        let expandedQuery = payload.query;
        let expandedTerms: string[] = [];

        if (payload.mode === 'smart' && payload.query.trim()) {
            try {
                expandedTerms = await expandSearchQueryWithOllama({ query: payload.query });
                if (expandedTerms.length > 1) {
                    expandedQuery = expandedTerms.join(' ');
                }
            } catch (error) {
                console.warn('Smart query expansion unavailable, using raw query', error);
                expandedTerms = [];
            }

            // Always bootstrap hash embeddings so contextual search works offline.
            vectors = ensureAssetVectors(catalog.assets, vectors);

            // Best-effort Ollama upgrades for a sample — never fail the search if Ollama is down.
            try {
                const sample = catalog.assets.slice(0, 40);
                const now = new Date().toISOString();
                for (const asset of sample) {
                    const embedded = await embedTextWithOllama({ text: buildAssetEmbeddingText(asset) });
                    vectors = upsertVector(vectors, {
                        assetId: asset.id,
                        model: embedded.model,
                        dims: embedded.vector.length,
                        vector: embedded.vector,
                        updatedAt: now,
                    });
                }
            } catch (error) {
                console.warn('Ollama embedding upgrade skipped', error);
            }

            try {
                await writeVectorStore(vectors);
            } catch (error) {
                console.warn('Could not persist vector store', error);
            }
        }

        const results = runVaultSearch(
            catalog.assets,
            { ...payload, query: expandedQuery || payload.query },
            vectors,
        );

        return jsonWithRequestId(request, {
            success: true as const,
            results,
            total: results.length,
            query: payload.query,
            expandedTerms,
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
