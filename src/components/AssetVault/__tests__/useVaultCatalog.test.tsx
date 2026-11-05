import { act, renderHook, waitFor } from '@testing-library/react';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { resetVaultCatalogCacheForTests, useVaultCatalog } from '@/components/AssetVault/useVaultCatalog';

const mockSearchVaultUnified = jest.fn();

jest.mock('@/features/asset-vault/application/client/vaultApiClient', () => ({
    enrichVaultCatalog: jest.fn(),
    fetchBookcases: async () => [],
    searchVaultUnified: (...args: unknown[]) => mockSearchVaultUnified(...args),
    syncVaultCatalog: jest.fn(),
}));
jest.mock('@/features/asset-vault/application/client/vaultUiState', () => ({
    loadVaultUiState: () => null,
}));

const asset = (id: string): VaultAssetRecord => ({
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    type: 'images',
    category: 'uploads',
    sizeBytes: 1,
    origin: { connector: 'indexeddb-legacy', uri: `local://${id}`, displayPath: id },
    aliases: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    modifiedAt: '2024-01-01T00:00:00.000Z',
});

const page = (ids: string[]) => ({ results: ids.map((id) => ({ asset: asset(id), score: 1 })), total: ids.length, hasMore: false });
const t = (key: string) => key;

describe('useVaultCatalog', () => {
    beforeEach(() => {
        resetVaultCatalogCacheForTests();
        mockSearchVaultUnified.mockReset();
    });

    it('reopens on the last page immediately and swaps in the fresh one', async () => {
        mockSearchVaultUnified.mockResolvedValue(page(['a']));
        const first = renderHook(() => useVaultCatalog({ isOpen: true, owner: 'alice', t }));
        await waitFor(() => expect(first.result.current.allAssets).toHaveLength(1));
        first.unmount();

        let release: () => void = () => undefined;
        mockSearchVaultUnified.mockImplementation(() => new Promise((resolve) => { release = () => resolve(page(['a', 'b'])); }));
        const second = renderHook(() => useVaultCatalog({ isOpen: true, owner: 'alice', t }));
        await waitFor(() => expect(second.result.current.allAssets).toHaveLength(1));
        expect(second.result.current.isLoading).toBe(false);

        await act(async () => { release(); });
        await waitFor(() => expect(second.result.current.allAssets).toHaveLength(2));
    });

    it('keeps the cached page when the refresh fails, and spins only with nothing to show', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockSearchVaultUnified.mockRejectedValueOnce(new Error('offline'));
        const cold = renderHook(() => useVaultCatalog({ isOpen: true, owner: 'bob', t }));
        await waitFor(() => expect(cold.result.current.isLoading).toBe(false));
        expect(cold.result.current.allAssets).toEqual([]);
        cold.unmount();

        mockSearchVaultUnified.mockResolvedValueOnce(page(['x']));
        const warm = renderHook(() => useVaultCatalog({ isOpen: true, owner: 'bob', t }));
        await waitFor(() => expect(warm.result.current.allAssets).toHaveLength(1));
        warm.unmount();

        mockSearchVaultUnified.mockRejectedValueOnce(new Error('offline again'));
        const again = renderHook(() => useVaultCatalog({ isOpen: true, owner: 'bob', t }));
        await waitFor(() => expect(mockSearchVaultUnified).toHaveBeenCalledTimes(3));
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(again.result.current.allAssets).toHaveLength(1);
        consoleError.mockRestore();
    });
});
