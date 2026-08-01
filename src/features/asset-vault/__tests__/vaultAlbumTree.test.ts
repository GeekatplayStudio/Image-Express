import {
    buildVaultAlbumTree,
    findVaultAlbum,
    findVaultPage,
    albumGridPose,
    type VaultAlbum,
} from '@/features/asset-vault/domain/vaultAlbumTree';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

function sample(id: string, overrides: Partial<VaultAssetRecord> = {}): VaultAssetRecord {
    return {
        id,
        name: `${id}.jpg`,
        mimeType: 'image/jpeg',
        type: 'images',
        category: 'uploads',
        sizeBytes: 100,
        origin: {
            connector: 'server',
            uri: `server://${id}`,
            displayPath: id,
        },
        aliases: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        isPublic: false,
        ...overrides,
    };
}

describe('vaultAlbumTree', () => {
    const assets: VaultAssetRecord[] = [
        sample('a', { type: 'images', modifiedAt: '2026-07-01T00:00:00.000Z', tags: ['sunset'] }),
        sample('b', { type: 'videos', name: 'clip.mp4', modifiedAt: '2026-07-15T00:00:00.000Z' }),
        sample('c', {
            type: 'images',
            modifiedAt: '2026-01-10T00:00:00.000Z',
            origin: { connector: 'google-drive', uri: 'gdrive://1', displayPath: 'Drive/c' },
            tags: ['sunset'],
        }),
        sample('d', { type: 'models', name: 'hero.glb', modifiedAt: '2026-03-01T00:00:00.000Z' }),
    ];

    it('builds type albums with pages', () => {
        const albums = buildVaultAlbumTree(assets, 'type');
        expect(albums.map((album) => album.labelKey)).toEqual(
            expect.arrayContaining(['vault.albumTypePhotos', 'vault.albumTypeVideos', 'vault.albumTypeModels']),
        );
        const photos = albums.find((album) => album.id === 'album_type_images');
        expect(photos?.assetCount).toBe(2);
        expect(photos?.pages.length).toBeGreaterThanOrEqual(1);
    });

    it('builds date albums newest first', () => {
        const albums = buildVaultAlbumTree(assets, 'date');
        expect(albums[0].id).toContain('2026-07');
        expect(findVaultAlbum(albums, albums[0].id)?.pages[0]).toBeTruthy();
    });

    it('builds location albums', () => {
        const albums = buildVaultAlbumTree(assets, 'location');
        expect(albums.some((album) => album.id === 'album_loc_google-drive')).toBe(true);
        expect(albums.some((album) => album.id === 'album_loc_server')).toBe(true);
    });

    it('builds subject albums from tags', () => {
        const albums = buildVaultAlbumTree(assets, 'subject');
        const sunset = albums.find((album) => album.id === 'album_subject_tag_sunset');
        expect(sunset?.assetCount).toBe(2);
        const page = findVaultPage(sunset || null, sunset?.pages[0]?.id);
        expect(page?.assetIds).toEqual(expect.arrayContaining(['a', 'c']));
    });

    it('places albums on a dense axis-aligned grid', () => {
        const p0 = albumGridPose(0, 4);
        const p1 = albumGridPose(1, 4);
        expect(p0.cx).not.toEqual(p1.cx);
        expect(p0.cy).toBe(0);
        expect(p1.cy).toBe(0);
    });

    it('chunks large albums into multiple pages', () => {
        const many = Array.from({ length: 30 }, (_, i) => sample(`x${i}`));
        const albums = buildVaultAlbumTree(many, 'type', [], { assetsPerPage: 12 });
        const photos = albums.find((a: VaultAlbum) => a.id === 'album_type_images');
        expect(photos?.pageCount).toBeGreaterThan(1);
    });

    it('respects custom assetsPerPage when chunking', () => {
        const many = Array.from({ length: 100 }, (_, i) => sample(`y${i}`));
        const albums24 = buildVaultAlbumTree(many, 'type', [], { assetsPerPage: 24 });
        const albums96 = buildVaultAlbumTree(many, 'type', [], { assetsPerPage: 96 });
        const photos24 = albums24.find((a: VaultAlbum) => a.id === 'album_type_images');
        const photos96 = albums96.find((a: VaultAlbum) => a.id === 'album_type_images');
        expect(photos24?.pageCount).toBe(Math.ceil(100 / 24));
        expect(photos96?.pageCount).toBe(Math.ceil(100 / 96));
        expect(photos24?.pages[0]?.assetIds.length).toBe(24);
    });
});
