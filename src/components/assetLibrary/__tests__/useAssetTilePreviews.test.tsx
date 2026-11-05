import { act, renderHook, waitFor } from '@testing-library/react';
import type { LibraryAsset } from '@/lib/assetLibrary/assetMerging';
import { resetPreviewCacheForTests } from '@/lib/assetLibrary/thumbnailCache';
import {
    needsResolvedPreview,
    PREVIEW_CONCURRENCY,
    previewCacheKey,
    useAssetTilePreviews,
} from '@/components/assetLibrary/useAssetTilePreviews';

const makeLocal = (id: string, type: LibraryAsset['type'] = 'images'): LibraryAsset => ({
    path: `local-file://${id}`,
    name: `${id}.png`,
    type,
    category: 'uploads',
    owner: 'alice',
    isPublic: false,
    storageProvider: 'local',
    storageId: id,
    updatedAt: '2024-01-01T00:00:00.000Z',
});

const getAssetKey = (asset: LibraryAsset) => `${asset.storageProvider}:${asset.storageId}`;

describe('useAssetTilePreviews', () => {
    beforeEach(() => {
        let counter = 0;
        URL.createObjectURL = jest.fn(() => `blob:tile-${++counter}`);
        URL.revokeObjectURL = jest.fn();
        resetPreviewCacheForTests();
    });

    it('knows which assets need bytes read before they can show a tile', () => {
        expect(needsResolvedPreview(makeLocal('a'))).toBe(true);
        expect(needsResolvedPreview({ ...makeLocal('b'), previewPath: 'blob:x' })).toBe(false);
        expect(needsResolvedPreview({ ...makeLocal('c'), storageProvider: 'server', path: '/api/assets/serve/x.png' })).toBe(false);
        expect(needsResolvedPreview(makeLocal('d', 'models'))).toBe(false);
        // A rename must not throw the thumbnail away.
        expect(previewCacheKey(makeLocal('e'))).toBe(previewCacheKey({ ...makeLocal('e'), name: 'renamed.png', updatedAt: '2025-01-01T00:00:00.000Z' }));
    });

    it('resolves local tiles a few at a time, in grid order, and remembers them across re-renders', async () => {
        const assets = Array.from({ length: 10 }, (_, index) => makeLocal(`asset-${index}`));
        const pending: Array<() => void> = [];
        const loadBlob = jest.fn((asset: LibraryAsset) => new Promise<Blob>((resolve) => {
            pending.push(() => resolve(new Blob([asset.name], { type: 'image/png' })));
        }));

        const { result, rerender } = renderHook(
            (props: { assets: LibraryAsset[] }) => useAssetTilePreviews({ assets: props.assets, getAssetKey, loadBlob }),
            { initialProps: { assets } },
        );

        await waitFor(() => expect(loadBlob).toHaveBeenCalledTimes(PREVIEW_CONCURRENCY));
        expect(loadBlob.mock.calls.map(([asset]) => asset.storageId)).toEqual(['asset-0', 'asset-1', 'asset-2', 'asset-3']);

        await act(async () => { pending.splice(0).forEach((release) => release()); });
        await waitFor(() => expect(Object.keys(result.current.previewUrls)).toHaveLength(PREVIEW_CONCURRENCY));

        while (loadBlob.mock.calls.length < assets.length || pending.length > 0) {
            await act(async () => { pending.splice(0).forEach((release) => release()); });
            await waitFor(() => expect(pending.length + Object.keys(result.current.previewUrls).length).toBeGreaterThan(0));
        }
        await waitFor(() => expect(Object.keys(result.current.previewUrls)).toHaveLength(assets.length));
        expect(loadBlob).toHaveBeenCalledTimes(assets.length);

        // Same assets again (a refresh): nothing is re-read and nothing goes blank.
        rerender({ assets: [...assets] });
        await waitFor(() => expect(Object.keys(result.current.previewUrls)).toHaveLength(assets.length));
        expect(loadBlob).toHaveBeenCalledTimes(assets.length);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('marks an asset whose bytes cannot be read instead of retrying forever', async () => {
        const broken = makeLocal('broken');
        const loadBlob = jest.fn().mockRejectedValue(new Error('gone'));
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const { result, rerender } = renderHook(() => useAssetTilePreviews({ assets: [broken], getAssetKey, loadBlob }));

        await waitFor(() => expect(result.current.failedPreviewKeys['local:broken']).toBe(true));
        rerender();
        await new Promise((resolve) => setTimeout(resolve, 60));
        expect(loadBlob).toHaveBeenCalledTimes(1);
        consoleError.mockRestore();
    });
});
