import { act, renderHook, waitFor } from '@testing-library/react';

import { useVaultPreviews } from '../useVaultPreviews';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

const mockResolvePreviewUrl = jest.fn();

jest.mock('@/features/asset-vault/application/client/vaultApiClient', () => ({
    resolveVaultPreviewUrl: (...args: unknown[]) => mockResolvePreviewUrl(...args),
    resolveVaultThumbnailUrl: () => null,
}));

jest.mock('@/lib/modelThumbnail', () => ({
    canRenderModelThumbnail: () => false,
    getCachedModelThumbnail: () => null,
    renderModelThumbnail: jest.fn(),
}));

jest.mock('@/lib/videoPoster', () => ({
    captureVideoPoster: jest.fn(),
    getCachedVideoPoster: () => null,
}));

function makeAsset(overrides: Partial<VaultAssetRecord> = {}): VaultAssetRecord {
    return {
        id: 'asset-1',
        name: 'logo.png',
        type: 'images',
        origin: { kind: 'local', legacyId: 'local-1' },
        ...overrides,
    } as unknown as VaultAssetRecord;
}

/** Stable identity: the tile effect keys off this array, so a fresh one each render loops. */
const NO_PAGED_ASSETS: VaultAssetRecord[] = [];

function renderPreviews(overrides: Partial<Parameters<typeof useVaultPreviews>[0]> = {}) {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const view = renderHook(() => useVaultPreviews({
        isOpen: true,
        depth: 'page',
        use3d: false,
        pagedAssets: NO_PAGED_ASSETS,
        thumbSize: 'medium',
        onClose,
        onSelect,
        setStatusMessage: jest.fn(),
        t: (key: string) => key,
        ...overrides,
    } as Parameters<typeof useVaultPreviews>[0]));
    return { ...view, onSelect, onClose };
}

describe('useVaultPreviews add-to-canvas URL ownership', () => {
    beforeEach(() => {
        mockResolvePreviewUrl.mockReset();
    });

    it('hands the canvas a freshly minted blob URL, not the one the modal revokes', async () => {
        // The grid's preview URLs are revoked on close and when assets scroll off
        // the page. Passing one to the canvas revoked it mid-decode, so the layer
        // silently never appeared.
        mockResolvePreviewUrl
            .mockResolvedValueOnce('blob:grid-preview')
            .mockResolvedValueOnce('blob:canvas-owned');

        const { result, onSelect, onClose } = renderPreviews();
        const asset = makeAsset();

        await act(async () => {
            await result.current.handleAddToCanvas(asset);
        });

        expect(onSelect).toHaveBeenCalledWith('blob:canvas-owned', 'images', 'logo.png');
        expect(onSelect).not.toHaveBeenCalledWith('blob:grid-preview', expect.anything(), expect.anything());
        expect(onClose).toHaveBeenCalled();
    });

    it('passes through a server URL untouched', async () => {
        mockResolvePreviewUrl.mockResolvedValue('/api/assets/serve/uploads/images/logo.png');

        const { result, onSelect } = renderPreviews();

        await act(async () => {
            await result.current.handleAddToCanvas(makeAsset());
        });

        expect(onSelect).toHaveBeenCalledWith(
            '/api/assets/serve/uploads/images/logo.png',
            'images',
            'logo.png',
        );
        // A plain URL needs no second resolve.
        expect(mockResolvePreviewUrl).toHaveBeenCalledTimes(1);
    });

    it('reports when no preview URL can be resolved instead of adding nothing', async () => {
        mockResolvePreviewUrl.mockResolvedValue(null);
        const setStatusMessage = jest.fn();

        const { result, onSelect, onClose } = renderPreviews({ setStatusMessage });

        await act(async () => {
            await result.current.handleAddToCanvas(makeAsset());
        });

        expect(onSelect).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(setStatusMessage).toHaveBeenCalledWith('vault.previewUnavailable');
    });

    it('mints an owned URL for the 3D editor too', async () => {
        mockResolvePreviewUrl
            .mockResolvedValueOnce('blob:grid-preview')
            .mockResolvedValueOnce('blob:editor-owned');
        const dispatched: CustomEvent[] = [];
        const listener = (event: Event) => dispatched.push(event as CustomEvent);
        window.addEventListener('iex:open-3d-editor', listener);

        const { result } = renderPreviews();

        await act(async () => {
            await result.current.openClassic3dViewer(makeAsset({ name: 'can.glb', type: 'models' }));
        });

        await waitFor(() => expect(dispatched).toHaveLength(1));
        expect(dispatched[0].detail.url).toBe('blob:editor-owned');
        window.removeEventListener('iex:open-3d-editor', listener);
    });
});
