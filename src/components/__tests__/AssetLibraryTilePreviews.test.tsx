import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AssetLibrary from '../AssetLibrary';
import type { LocalAssetRecord } from '@/lib/localAssetStore';
import { resetPreviewCacheForTests } from '@/lib/assetLibrary/thumbnailCache';
import { invalidateAssetQueryCache } from '@/components/assetLibrary/useAssetLibraryQuery';

const mockGetLocalAssetBlob = jest.fn();
const mockListLocalAssets = jest.fn();

jest.mock('@/providers/DialogProvider', () => ({ useDialog: () => ({ confirm: jest.fn() }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/localAssetStore', () => ({
    deleteLocalAsset: jest.fn(),
    getLocalAssetBlob: (...args: unknown[]) => mockGetLocalAssetBlob(...args),
    listLocalAssets: (...args: unknown[]) => mockListLocalAssets(...args),
    renameLocalAsset: jest.fn(),
    saveLocalAsset: jest.fn(),
    setLocalAssetVisibility: jest.fn(),
}));
jest.mock('@/lib/assetIndexer', () => ({
    backfillLocalAssetIndex: async () => ({ indexed: 0 }),
    indexLocalAsset: async () => undefined,
}));
jest.mock('@/lib/assetStorageSettings', () => ({
    getAssetCloudProviderLabel: () => 'Google Drive',
    isImplementedAssetCloudProvider: () => false,
    loadAssetStorageSettings: () => ({ mode: 'local', cloudProvider: 'google-drive', includeLegacyServerAssetsInHybrid: false, hybridUploadToCloudByDefault: false }),
    onAssetStorageSettingsChanged: () => () => undefined,
}));

/**
 * Records written after the blob split carry no inline bytes. The library used
 * to show those as a bare icon forever ("resolves lazily per tile" was a
 * comment, not code); this pins the tile actually getting its artwork.
 */
describe('AssetLibrary tile previews', () => {
    beforeEach(() => {
        let counter = 0;
        URL.createObjectURL = jest.fn(() => `blob:preview-${++counter}`);
        URL.revokeObjectURL = jest.fn();
        resetPreviewCacheForTests();
        invalidateAssetQueryCache();
        mockGetLocalAssetBlob.mockReset();
        mockListLocalAssets.mockReset();
    });

    it('shows a thumbnail for a local image stored without inline bytes, and its size', async () => {
        const stored: LocalAssetRecord = {
            id: 'split-1',
            name: 'split.png',
            type: 'images',
            category: 'uploads',
            owner: 'alice',
            isPublic: false,
            mimeType: 'image/png',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            sizeBytes: 2 * 1024 * 1024,
        };
        mockListLocalAssets.mockResolvedValue([stored]);
        mockGetLocalAssetBlob.mockResolvedValue(new Blob(['png-bytes'], { type: 'image/png' }));

        render(<AssetLibrary onSelect={jest.fn()} onClose={jest.fn()} currentUser="alice" />);

        const image = await screen.findByAltText('split.png');
        await waitFor(() => expect(image).toHaveAttribute('src', 'blob:preview-1'));
        expect(mockGetLocalAssetBlob).toHaveBeenCalledWith('split-1');
        expect(screen.getAllByText(/2\.0 MB/).length).toBeGreaterThan(0);
        expect(screen.getByRole('status')).toHaveTextContent('1 shown');
    });

    it('says so on the tile when the bytes cannot be read', async () => {
        mockListLocalAssets.mockResolvedValue([{
            id: 'gone-1', name: 'gone.png', type: 'images', category: 'uploads', owner: 'alice', isPublic: false,
            mimeType: 'image/png', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
        } satisfies LocalAssetRecord]);
        mockGetLocalAssetBlob.mockRejectedValue(new Error('missing blob'));
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        render(<AssetLibrary onSelect={jest.fn()} onClose={jest.fn()} currentUser="alice" />);

        expect(await screen.findByText('Preview unavailable')).toBeInTheDocument();
        expect(screen.queryByAltText('gone.png')).toBeNull();
        consoleError.mockRestore();
    });
});
