import { parseJsonRequest, jsonWithRequestId, apiError } from '@/lib/server/apiContract';
import { readVaultCatalog, readBookcaseStore, writeBookcaseStore } from '@/lib/server/vault-store';
import { readVectorStore, writeVectorStore } from '@/lib/server/vaultWatchStore';
import { embedTextWithOllama } from '@/lib/server/ollamaEmbeddings';
import { buildAssetEmbeddingText, upsertVector } from '@/features/asset-vault/domain/vectorMath';
import {
    SimilarRequestSchema,
    buildSmartClusterBookcase,
    findSimilarAssetIds,
} from '@/features/asset-vault/domain/smartCluster';

export async function POST(request: Request) {
    try {
        const body = await parseJsonRequest(request, SimilarRequestSchema, 16_384);
        const catalog = await readVaultCatalog();
        const seed = catalog.assets.find((asset) => asset.id === body.assetId);
        if (!seed) {
            return apiError(request, {
                code: 'asset_not_found',
                message: 'Seed asset was not found in the vault catalog.',
                status: 404,
            });
        }

        let vectors = await readVectorStore();
        let seedVector = vectors.find((entry) => entry.assetId === seed.id);
        if (!seedVector) {
            const embedded = await embedTextWithOllama({ text: buildAssetEmbeddingText(seed) });
            seedVector = {
                assetId: seed.id,
                model: embedded.model,
                dims: embedded.vector.length,
                vector: embedded.vector,
                updatedAt: new Date().toISOString(),
            };
            vectors = upsertVector(vectors, seedVector);
            await writeVectorStore(vectors);
        }

        const similarHits = findSimilarAssetIds(seed.id, vectors, { limit: body.limit });
        const byId = new Map(catalog.assets.map((asset) => [asset.id, asset]));
        const results = similarHits
            .map((hit) => {
                const asset = byId.get(hit.assetId);
                if (!asset) return null;
                return {
                    asset,
                    score: hit.score,
                    matchReasons: [`similar to ${seed.name}`],
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

        let bookcase = null;
        if (body.createBookcase) {
            const store = await readBookcaseStore();
            bookcase = buildSmartClusterBookcase({
                seed,
                similarIds: results.map((entry) => entry.asset.id),
            });
            const next = {
                version: 1 as const,
                bookcases: [
                    ...store.bookcases.filter((entry) => entry.id !== bookcase!.id),
                    bookcase,
                ],
            };
            await writeBookcaseStore(next);
        }

        return jsonWithRequestId(request, {
            success: true as const,
            seed,
            results,
            total: results.length,
            bookcase,
        });
    } catch (error) {
        console.error('Vault similar failed:', error);
        return apiError(request, {
            code: 'vault_similar_failed',
            message: 'Failed to find similar assets.',
            status: 500,
            retryable: true,
        });
    }
}
