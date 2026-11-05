import {
    cachePreviewUrl,
    downscaleImage,
    forgetPreview,
    getCachedPreviewUrl,
    resetPreviewCacheForTests,
    resolvePreviewUrl,
} from '@/lib/assetLibrary/thumbnailCache';

describe('thumbnailCache', () => {
    let urlCounter = 0;
    const revoked: string[] = [];

    beforeEach(() => {
        urlCounter = 0;
        revoked.length = 0;
        URL.createObjectURL = jest.fn(() => `blob:test-${++urlCounter}`);
        URL.revokeObjectURL = jest.fn((url: string) => { revoked.push(url); });
        resetPreviewCacheForTests();
    });

    it('reads the blob once and hands the same URL to every later caller', async () => {
        const loadBlob = jest.fn(async () => new Blob(['bytes'], { type: 'video/mp4' }));
        const [first, second] = await Promise.all([
            resolvePreviewUrl('local:a', loadBlob),
            resolvePreviewUrl('local:a', loadBlob),
        ]);
        expect(first).toBe('blob:test-1');
        expect(second).toBe(first);
        expect(loadBlob).toHaveBeenCalledTimes(1);

        expect(await resolvePreviewUrl('local:a', loadBlob)).toBe(first);
        expect(getCachedPreviewUrl('local:a')).toBe(first);
        expect(loadBlob).toHaveBeenCalledTimes(1);
    });

    it('does not cache a failed load, so the next attempt retries', async () => {
        const loadBlob = jest.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(new Blob(['ok']));
        await expect(resolvePreviewUrl('local:b', loadBlob)).rejects.toThrow('offline');
        expect(getCachedPreviewUrl('local:b')).toBeNull();
        expect(await resolvePreviewUrl('local:b', loadBlob)).toBe('blob:test-1');
    });

    it('keeps the original bytes when the browser cannot decode the image', async () => {
        // jsdom has no createImageBitmap: the fallback must be the input, not a throw.
        const blob = new Blob(['png'], { type: 'image/png' });
        expect(await downscaleImage(blob)).toBe(blob);
        const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' });
        expect(await downscaleImage(svg)).toBe(svg);
    });

    it('makes one session URL for inline bytes and forgets it on request', async () => {
        const blob = new Blob(['inline']);
        const url = cachePreviewUrl('local:c', blob);
        expect(cachePreviewUrl('local:c', blob)).toBe(url);
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

        await forgetPreview('local:c');
        expect(getCachedPreviewUrl('local:c')).toBeNull();
        expect(revoked).toEqual([url]);
    });
});
