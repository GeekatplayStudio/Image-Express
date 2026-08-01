import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { runVaultSearch } from '@/features/asset-vault/application/vaultSearchService';

function makeAsset(partial: Partial<VaultAssetRecord> & Pick<VaultAssetRecord, 'id' | 'name'>): VaultAssetRecord {
    return {
        type: 'images',
        category: 'uploads',
        sizeBytes: 1000,
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        origin: {
            connector: 'server',
            uri: `server://${partial.id}`,
            displayPath: partial.name,
        },
        tags: [],
        ...partial,
    };
}

describe('runVaultSearch contextual', () => {
    const assets = [
        makeAsset({ id: 'a', name: 'IMG_101.jpg', description: 'golden sunset over ocean beach waves', tags: ['travel', 'evening'] }),
        makeAsset({ id: 'b', name: 'invoice-q3.pdf', description: 'quarterly tax spreadsheet totals', tags: ['finance'] }),
        makeAsset({ id: 'c', name: 'logo-draft.png', description: 'brand mark sketch', tags: ['design'] }),
    ];

    it('finds assets by meaning when filenames do not contain the query', () => {
        const hits = runVaultSearch(assets, {
            query: 'sunset beach',
            mode: 'smart',
            limit: 10,
        });
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].asset.id).toBe('a');
    });

    it('still supports keyword mode for exact name matches', () => {
        const hits = runVaultSearch(assets, {
            query: 'logo-draft',
            mode: 'keyword',
            limit: 10,
        });
        expect(hits.map((hit) => hit.asset.id)).toEqual(['c']);
    });
});
