import {
    buildSmartClusterBookcase,
    findSimilarAssetIds,
} from '@/features/asset-vault/domain/smartCluster';
import { hashTextEmbedding } from '@/features/asset-vault/domain/vectorMath';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

function makeAsset(id: string, name: string): VaultAssetRecord {
    return {
        id,
        name,
        mimeType: 'image/jpeg',
        type: 'images',
        category: 'uploads',
        sizeBytes: 100,
        origin: {
            connector: 'server',
            uri: `server://${name}`,
            displayPath: name,
        },
        aliases: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        isPublic: false,
    };
}

describe('smartCluster', () => {
    it('finds similar assets by vector proximity', () => {
        const vectors = [
            { assetId: 'seed', model: 'hash-text-v1', dims: 64, vector: hashTextEmbedding('red sports car'), updatedAt: '2026-01-01T00:00:00.000Z' },
            { assetId: 'near', model: 'hash-text-v1', dims: 64, vector: hashTextEmbedding('red sports car photo'), updatedAt: '2026-01-01T00:00:00.000Z' },
            { assetId: 'far', model: 'hash-text-v1', dims: 64, vector: hashTextEmbedding('invoice spreadsheet tax'), updatedAt: '2026-01-01T00:00:00.000Z' },
        ];
        const hits = findSimilarAssetIds('seed', vectors, { limit: 5, minScore: 0.1 });
        expect(hits.map((hit) => hit.assetId)).toContain('near');
        expect(hits[0].assetId).toBe('near');
        expect(hits.every((hit) => hit.assetId !== 'seed')).toBe(true);
    });

    it('builds a smart-cluster bookcase from seed + similar ids', () => {
        const seed = makeAsset('seed', 'hero.jpg');
        const bookcase = buildSmartClusterBookcase({
            seed,
            similarIds: ['a', 'b'],
            now: '2026-07-31T00:00:00.000Z',
        });
        expect(bookcase.kind).toBe('smart-cluster');
        expect(bookcase.manualAssetIds).toEqual(['seed', 'a', 'b']);
        expect(bookcase.name).toContain('hero.jpg');
    });
});
