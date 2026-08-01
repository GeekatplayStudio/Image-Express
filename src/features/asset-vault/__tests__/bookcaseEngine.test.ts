import {
    dedupeVaultAssets,
    filterAssetsByBookcase,
    groupAssetsByTimelineMonth,
    searchAssetsKeyword,
} from '@/features/asset-vault/domain/bookcaseEngine';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type { Bookcase } from '@/features/asset-vault/contracts/bookcase';

const sample = (overrides: Partial<VaultAssetRecord> = {}): VaultAssetRecord => ({
    id: overrides.id || 'vast_1',
    name: overrides.name || 'photo.jpg',
    mimeType: 'image/jpeg',
    type: 'images',
    category: 'uploads',
    sizeBytes: 1000,
    origin: {
        connector: 'server',
        uri: 'server://uploads/images/photo.jpg',
        displayPath: 'uploads/images/photo.jpg',
    },
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-02T00:00:00.000Z',
    isPublic: false,
    ...overrides,
});

describe('bookcaseEngine', () => {
    it('filters assets by bookcase type rule', () => {
        const assets = [
            sample({ id: 'a', type: 'images' }),
            sample({ id: 'b', type: 'videos', name: 'clip.mp4' }),
        ];
        const bookcase: Bookcase = {
            id: 'bc_videos',
            name: 'Videos',
            kind: 'type',
            filter: { type: 'videos' },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        };
        const filtered = filterAssetsByBookcase(assets, bookcase);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe('b');
    });

    it('filters Google Drive location bookcase', () => {
        const assets = [
            sample({
                id: 'a',
                origin: { connector: 'google-drive', uri: 'gdrive://1', displayPath: 'Drive/a' },
            }),
            sample({ id: 'b' }),
        ];
        const bookcase: Bookcase = {
            id: 'bc_drive',
            name: 'Google Drive',
            kind: 'location',
            filter: { connector: 'google-drive' },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        };
        expect(filterAssetsByBookcase(assets, bookcase)).toHaveLength(1);
    });

    it('searches by keyword across metadata', () => {
        const assets = [
            sample({ description: 'sunset beach panorama' }),
            sample({ id: 'vast_2', name: 'other.png', description: 'city skyline' }),
        ];
        const results = searchAssetsKeyword(assets, 'sunset beach');
        expect(results).toHaveLength(1);
        expect(results[0].asset.description).toContain('sunset');
    });

    it('dedupes assets by content hash', () => {
        const assets = [
            sample({ id: 'a', contentHash: 'abc' }),
            sample({
                id: 'b',
                contentHash: 'abc',
                origin: { connector: 'indexeddb-legacy', uri: 'local://x', displayPath: 'Local/x' },
            }),
        ];
        const deduped = dedupeVaultAssets(assets);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].aliases.length).toBeGreaterThan(0);
    });

    it('dedupes same name across connectors via merge key', () => {
        const assets = [
            sample({
                id: 'local',
                name: 'hero.png',
                origin: { connector: 'indexeddb-legacy', uri: 'local://1', displayPath: 'Local/hero.png' },
            }),
            sample({
                id: 'drive',
                name: 'hero.png',
                origin: { connector: 'google-drive', uri: 'gdrive://2', displayPath: 'Drive/hero.png', legacyId: '2' },
            }),
        ];
        const deduped = dedupeVaultAssets(assets);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].origin.connector).toBe('indexeddb-legacy');
        expect(deduped[0].aliases.some((alias) => alias.connector === 'google-drive')).toBe(true);
    });

    it('filters smart-cluster bookcases by manualAssetIds', () => {
        const assets = [
            sample({ id: 'seed' }),
            sample({ id: 'near', name: 'near.jpg' }),
            sample({ id: 'other', name: 'other.jpg' }),
        ];
        const bookcase: Bookcase = {
            id: 'bc_cluster_seed',
            name: 'Similar to seed',
            kind: 'smart-cluster',
            manualAssetIds: ['seed', 'near'],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        };
        expect(filterAssetsByBookcase(assets, bookcase).map((asset) => asset.id)).toEqual(['seed', 'near']);
    });
});
