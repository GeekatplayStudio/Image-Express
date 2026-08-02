import { preferredVaultTypeAlbumId } from '../application/client/vaultUpload';

describe('vaultUpload helpers', () => {
    it('returns a type album id for homogeneous batches', () => {
        expect(preferredVaultTypeAlbumId(['images', 'images'])).toBe('album_type_images');
        expect(preferredVaultTypeAlbumId(['videos'])).toBe('album_type_videos');
    });

    it('returns null for mixed or empty batches', () => {
        expect(preferredVaultTypeAlbumId(['images', 'videos'])).toBeNull();
        expect(preferredVaultTypeAlbumId([])).toBeNull();
    });
});
