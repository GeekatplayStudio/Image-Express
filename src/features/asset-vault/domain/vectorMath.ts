import type { VaultAssetRecord } from '../contracts/assetRecord';

/** Cosine similarity for equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || a.length !== b.length) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Deterministic text embedding stub used until CLIP/Ollama embedding models
 * are wired. Enough for hybrid ranking experiments and offline tests.
 */
export function hashTextEmbedding(text: string, dimensions = 64): number[] {
    const vector = new Array(dimensions).fill(0);
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return vector;
    for (let i = 0; i < normalized.length; i += 1) {
        const code = normalized.charCodeAt(i);
        const idx = (code * (i + 3)) % dimensions;
        vector[idx] += ((code % 13) - 6) / 6;
    }
    let mag = 0;
    for (const value of vector) mag += value * value;
    mag = Math.sqrt(mag) || 1;
    return vector.map((value) => value / mag);
}

export function buildAssetEmbeddingText(asset: VaultAssetRecord): string {
    return [
        asset.name,
        asset.type,
        asset.category,
        asset.description || '',
        asset.prompt || '',
        asset.origin.displayPath,
        ...(asset.tags || []),
    ].join(' ');
}

export type VectorRecord = {
    assetId: string;
    model: string;
    dims: number;
    vector: number[];
    updatedAt: string;
};

export function upsertVector(store: VectorRecord[], next: VectorRecord): VectorRecord[] {
    const without = store.filter((entry) => entry.assetId !== next.assetId);
    without.push(next);
    return without;
}

export function searchVectors(
    store: VectorRecord[],
    queryVector: number[],
    limit = 40,
): Array<{ assetId: string; score: number }> {
    return store
        .map((entry) => ({ assetId: entry.assetId, score: cosineSimilarity(queryVector, entry.vector) }))
        .filter((entry) => entry.score > 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

/** Reciprocal rank fusion of keyword + vector hit lists. */
export function reciprocalRankFusion(
    lists: Array<Array<{ id: string; score?: number }>>,
    k = 60,
): Array<{ id: string; score: number }> {
    const scores = new Map<string, number>();
    for (const list of lists) {
        list.forEach((entry, index) => {
            const add = 1 / (k + index + 1);
            scores.set(entry.id, (scores.get(entry.id) || 0) + add);
        });
    }
    return Array.from(scores.entries())
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score);
}
