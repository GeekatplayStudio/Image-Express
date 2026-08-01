import {
    parseVaultNaturalQuery,
    sortVaultAssets,
} from '@/features/asset-vault/domain/vaultNaturalQuery';
import { albumGridPose } from '@/features/asset-vault/domain/vaultAlbumTree';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

function sample(id: string, overrides: Partial<VaultAssetRecord> = {}): VaultAssetRecord {
    return {
        id,
        name: `${id}.jpg`,
        mimeType: 'image/jpeg',
        type: 'images',
        category: 'uploads',
        sizeBytes: 100,
        origin: { connector: 'server', uri: `server://${id}`, displayPath: id },
        aliases: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        isPublic: false,
        ...overrides,
    };
}

describe('vaultNaturalQuery', () => {
    it('parses newest photos into sort + type filter', () => {
        const parsed = parseVaultNaturalQuery('newest photos');
        expect(parsed.sort).toBe('newest');
        expect(parsed.typeFilter).toBe('images');
    });

    it('parses sort by name and by date lens', () => {
        const parsed = parseVaultNaturalQuery('sort by name by date sunset');
        expect(parsed.sort).toBe('name-asc');
        expect(parsed.lensHint).toBe('date');
        expect(parsed.text.toLowerCase()).toContain('sunset');
    });

    it('sorts assets by name and size', () => {
        const assets = [
            sample('b', { name: 'bravo.png', sizeBytes: 10 }),
            sample('a', { name: 'alpha.png', sizeBytes: 50 }),
        ];
        expect(sortVaultAssets(assets, 'name-asc')[0].name).toBe('alpha.png');
        expect(sortVaultAssets(assets, 'largest')[0].name).toBe('alpha.png');
    });
});

describe('albumGridPose', () => {
    it('keeps a flat floor grid aligned on Y for small sets', () => {
        const a = albumGridPose(0, 4);
        const b = albumGridPose(1, 4);
        const c = albumGridPose(2, 4);
        expect(a.cy).toBe(0);
        expect(b.cy).toBe(0);
        expect(a.cx).not.toEqual(b.cx);
        // Second row shares X column spacing, not a diagonal skew of Y+Z together.
        expect(c.cz).not.toEqual(a.cz);
        expect(c.cy).toBe(0);
    });

    it('uses vertical layers only when the set is large', () => {
        const ground = albumGridPose(0, 20);
        const upper = albumGridPose(19, 20);
        expect(ground.cy).toBeCloseTo(0);
        expect(upper.cy).toBeLessThan(0);
    });
});
