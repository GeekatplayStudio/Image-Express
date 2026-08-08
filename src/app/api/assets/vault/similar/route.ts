import { parseJsonRequest, jsonWithRequestId, apiError } from '@/lib/server/apiContract';
import { readVaultCatalog, readBookcaseStore, writeBookcaseStore } from '@/lib/server/vault-store';
import {
    readEmbeddingForAsset,
    searchEmbeddings,
    upsertVectorRecords,
} from '@/lib/server/vaultWatchStore';
import { findAffineAssets } from '@/features/asset-vault/domain/assetAffinity';
import { embedTextWithOllama, resolveEmbedModel } from '@/lib/server/ollamaEmbeddings';
import { buildAssetEmbeddingText } from '@/features/asset-vault/domain/vectorMath';
import type { VectorRecord } from '@/features/asset-vault/domain/vectorMath';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import {
    SimilarRequestSchema,
    buildSmartClusterBookcase,
} from '@/features/asset-vault/domain/smartCluster';

/**
 * Nearest neighbours for one asset.
 *
 * This read the legacy `vectors.json` while every embedding written since the
 * SQLite switch went to `vectors.db`, so it searched a store that search itself
 * had stopped filling — and returned nothing for almost every asset.
 *
 * Two tiers now, in order:
 *  1. The **indexed store**, the same one search uses. Needs the seed to have a
 *     real embedding; if it does not, one is generated and kept.
 *  2. **Metadata affinity** — folder, type, filename, date. Works with no
 *     indexing at all, so a vault mid-backfill still answers usefully.
 *
 * Hash-text vectors were tried as tier 2 and removed: they took 45 s per call
 * against a 240k catalog and ranked `River Stereo.wav` as the nearest match for
 * `underwater.mov`, because a character hash of a filename carries no meaning.
 *
 * The tier that answered is reported, because "no similar assets" and "not
 * indexed yet" look identical to the user otherwise.
 */
type SimilarSource = 'indexed' | 'metadata';

/** How long a click will wait for the embedding model before falling back. */
const SEED_EMBED_TIMEOUT_MS = 2_500;

async function seedVectorFor(
    seed: VaultAssetRecord,
    model: string,
): Promise<VectorRecord | null> {
    const stored = await readEmbeddingForAsset(seed.id);
    if (stored && stored.model === model) return stored;

    // Not embedded yet. Generate one now — a single asset, so unlike a search
    // this is not paying for a backfill inline. Keeping it also means the
    // second request for the same seed skips this entirely.
    try {
        const embedded = await embedTextWithOllama({
            text: buildAssetEmbeddingText(seed),
            // A click, not a batch job. The default 45 s budget is for a cold
            // model load during backfill; here it is the whole wait the user
            // sees before an answer the metadata tier already has.
            timeoutMs: SEED_EMBED_TIMEOUT_MS,
        });
        // A hash fallback is not comparable with stored model vectors, and
        // storing one would make the backfill skip this asset forever.
        if (embedded.model === 'hash-text-v1') return null;

        const record: VectorRecord = {
            assetId: seed.id,
            model: embedded.model,
            dims: embedded.vector.length,
            vector: embedded.vector,
            updatedAt: new Date().toISOString(),
        };
        await upsertVectorRecords([record]).catch(() => {});
        return record;
    } catch {
        // Ollama down or the model missing: fall through to the derived tier.
        return null;
    }
}

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

        const model = resolveEmbedModel();
        let source: SimilarSource = 'indexed';
        let hits: Array<{ assetId: string; score: number }> = [];

        const seedVector = await seedVectorFor(seed, model);
        if (seedVector) {
            const indexed = await searchEmbeddings(seedVector.vector, {
                model,
                // One extra, because the seed matches itself perfectly and is
                // filtered out below.
                limit: body.limit + 1,
            });
            if (indexed) hits = indexed.filter((hit) => hit.assetId !== seed.id);
        }

        let reasonsById = new Map<string, string[]>();
        if (hits.length === 0) {
            // Nothing indexed nearby — fall back to what the file itself says.
            source = 'metadata';
            const affine = findAffineAssets(seed, catalog.assets, { limit: body.limit });
            hits = affine.map((hit) => ({ assetId: hit.assetId, score: hit.score }));
            reasonsById = new Map(affine.map((hit) => [hit.assetId, hit.reasons]));
        }

        const byId = new Map(catalog.assets.map((asset) => [asset.id, asset]));
        const results = hits
            .slice(0, body.limit)
            .map((hit) => {
                const asset = byId.get(hit.assetId);
                if (!asset) return null;
                return {
                    asset,
                    score: hit.score,
                    // The metadata tier can say *why*; the indexed tier only
                    // knows that the embeddings were close.
                    matchReasons: reasonsById.get(hit.assetId)
                        ?? [`similar to ${seed.name}`],
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

        let bookcase = null;
        if (body.createBookcase && results.length > 0) {
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
            // Lets the UI say "matched on names and folders, semantic index
            // still building" rather than presenting both tiers as equal.
            source,
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
