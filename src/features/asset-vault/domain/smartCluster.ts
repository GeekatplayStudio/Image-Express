import { z } from 'zod';
import type { VaultAssetRecord } from '../contracts/assetRecord';
import type { Bookcase } from '../contracts/bookcase';
import { searchVectors, type VectorRecord } from './vectorMath';

export function findSimilarAssetIds(
    seedAssetId: string,
    vectors: VectorRecord[],
    options?: { limit?: number; minScore?: number },
): Array<{ assetId: string; score: number }> {
    const seed = vectors.find((entry) => entry.assetId === seedAssetId);
    if (!seed) return [];
    const limit = options?.limit ?? 40;
    const minScore = options?.minScore ?? 0.35;
    return searchVectors(vectors, seed.vector, limit + 1)
        .filter((hit) => hit.assetId !== seedAssetId && hit.score >= minScore)
        .slice(0, limit);
}

export function buildSmartClusterBookcase(options: {
    seed: VaultAssetRecord;
    similarIds: string[];
    now?: string;
}): Bookcase {
    const now = options.now || new Date().toISOString();
    const id = `bc_cluster_${options.seed.id}`;
    return {
        id,
        name: `Similar to ${options.seed.name}`.slice(0, 80),
        kind: 'smart-cluster',
        manualAssetIds: [options.seed.id, ...options.similarIds],
        createdAt: now,
        updatedAt: now,
    };
}

export const SimilarRequestSchema = z.object({
    assetId: z.string().min(1),
    limit: z.number().int().min(1).max(100).default(24),
    createBookcase: z.boolean().default(false),
});

export type SimilarRequest = z.infer<typeof SimilarRequestSchema>;
