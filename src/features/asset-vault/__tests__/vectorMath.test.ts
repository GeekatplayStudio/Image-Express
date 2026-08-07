import {
    cosineSimilarity,
    hashTextEmbedding,
    reciprocalRankFusion,
    searchVectors,
} from '@/features/asset-vault/domain/vectorMath';

describe('vectorMath', () => {
    it('returns high cosine similarity for identical embeddings', () => {
        const vector = hashTextEmbedding('sunset beach photo');
        expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
    });

    it('ranks related text closer than unrelated text', () => {
        const query = hashTextEmbedding('dragon sculpture model glb');
        const related = hashTextEmbedding('dragon sculpture model glb asset');
        const unrelated = hashTextEmbedding('invoice tax spreadsheet finance');
        expect(cosineSimilarity(query, related)).toBeGreaterThan(cosineSimilarity(query, unrelated));
    });

    it('searches vector store by similarity', () => {
        const store = [
            { assetId: 'a', model: 'hash-text-v1', dims: 64, vector: hashTextEmbedding('cat'), updatedAt: '2026-01-01T00:00:00.000Z' },
            { assetId: 'b', model: 'hash-text-v1', dims: 64, vector: hashTextEmbedding('dog'), updatedAt: '2026-01-01T00:00:00.000Z' },
        ];
        const hits = searchVectors(store, hashTextEmbedding('cat'), 2);
        expect(hits[0].assetId).toBe('a');
    });

    it('never cross-compares vectors from different-dimension models', () => {
        // Regression: a 64-dim hash query against a 768-dim Ollama record used
        // to score 0 and silently hide every enriched asset from smart search.
        const ollamaVector = new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0));
        const store = [
            { assetId: 'enriched', model: 'nomic-embed-text', dims: 768, vector: ollamaVector, updatedAt: '2026-01-01T00:00:00.000Z' },
            { assetId: 'hash', model: 'hash-text-v1', dims: 64, vector: hashTextEmbedding('cat'), updatedAt: '2026-01-01T00:00:00.000Z' },
        ];
        const hashHits = searchVectors(store, hashTextEmbedding('cat'), 10);
        expect(hashHits.map((hit) => hit.assetId)).toEqual(['hash']);
        const ollamaHits = searchVectors(store, ollamaVector, 10);
        expect(ollamaHits.map((hit) => hit.assetId)).toEqual(['enriched']);
    });

    it('fuses ranked lists with RRF', () => {
        const fused = reciprocalRankFusion([
            [{ id: 'a' }, { id: 'b' }],
            [{ id: 'b' }, { id: 'c' }],
        ]);
        expect(fused[0].id).toBe('b');
    });
});
