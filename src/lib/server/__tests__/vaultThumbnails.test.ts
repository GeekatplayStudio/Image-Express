/**
 * @jest-environment node
 */

import {
    getVaultThumbnail,
    isThumbnailerAvailable,
    normalizeThumbnailWidth,
    thumbnailCacheKey,
} from '@/lib/server/vaultThumbnails';

/**
 * The grid used each original file as its own thumbnail: 1.3-2.0 MB per tile,
 * ~171 MB for a page of 96, all decoded in the browser to draw 200-pixel
 * squares. These cover the parts that decide correctness rather than speed —
 * cache identity above all, since a key that ignores edits shows a stale image
 * forever with no way for the user to force a refresh.
 */

describe('normalizeThumbnailWidth', () => {
    it('snaps to the nearest supported width', () => {
        expect(normalizeThumbnailWidth(200)).toBe(256);
        expect(normalizeThumbnailWidth(300)).toBe(256);
        expect(normalizeThumbnailWidth(400)).toBe(384);
        expect(normalizeThumbnailWidth(1000)).toBe(512);
    });

    it('defaults for missing or nonsense input', () => {
        // An arbitrary width per caller would let the cache fill with a
        // thousand near-identical renditions.
        expect(normalizeThumbnailWidth(undefined)).toBe(256);
        expect(normalizeThumbnailWidth(Number.NaN)).toBe(256);
        expect(normalizeThumbnailWidth(0)).toBe(256);
        expect(normalizeThumbnailWidth(-50)).toBe(256);
    });
});

describe('thumbnailCacheKey', () => {
    const stats = { size: 1024, mtimeMs: 1_700_000_000_000 };

    it('is stable for the same file and width', () => {
        expect(thumbnailCacheKey('d:/a.jpg', 256, stats))
            .toBe(thumbnailCacheKey('d:/a.jpg', 256, stats));
    });

    it('changes when the file is edited in place', () => {
        // Same path, same width, new mtime — must not reuse the old rendition.
        expect(thumbnailCacheKey('d:/a.jpg', 256, stats))
            .not.toBe(thumbnailCacheKey('d:/a.jpg', 256, { ...stats, mtimeMs: stats.mtimeMs + 1000 }));
    });

    it('changes when the size changes even at the same mtime', () => {
        expect(thumbnailCacheKey('d:/a.jpg', 256, stats))
            .not.toBe(thumbnailCacheKey('d:/a.jpg', 256, { ...stats, size: 2048 }));
    });

    it('separates widths and paths', () => {
        expect(thumbnailCacheKey('d:/a.jpg', 256, stats)).not.toBe(thumbnailCacheKey('d:/a.jpg', 512, stats));
        expect(thumbnailCacheKey('d:/a.jpg', 256, stats)).not.toBe(thumbnailCacheKey('d:/b.jpg', 256, stats));
    });

    it('produces a filesystem-safe name', () => {
        expect(thumbnailCacheKey('d:/some dir/a b.jpg', 256, stats)).toMatch(/^[0-9a-f]{40}\.webp$/);
    });
});

describe('getVaultThumbnail', () => {
    it('returns null for a file that does not exist', async () => {
        // The caller falls back to the original; a broken tile would be worse
        // than a slow one.
        await expect(getVaultThumbnail('d:/definitely/not/here.jpg', 256)).resolves.toBeNull();
    });

    it('returns null for something that is not a decodable image', async () => {
        // A PSD, a RAW file or a corrupt JPEG must degrade, not throw.
        await expect(getVaultThumbnail(__filename, 256)).resolves.toBeNull();
    });
});

describe('isThumbnailerAvailable', () => {
    it('answers without throwing when the codec is missing', () => {
        expect(typeof isThumbnailerAvailable()).toBe('boolean');
    });
});
