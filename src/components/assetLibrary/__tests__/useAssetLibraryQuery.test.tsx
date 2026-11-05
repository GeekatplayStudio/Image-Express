import { act, renderHook, waitFor } from '@testing-library/react';
import type { LocalAssetRecord } from '@/lib/localAssetStore';
import {
    invalidateAssetQueryCache,
    useAssetLibraryQuery,
} from '@/components/assetLibrary/useAssetLibraryQuery';

const mockListLocalAssets = jest.fn();
const mockLoadAssetStorageSettings = jest.fn();

jest.mock('@/lib/localAssetStore', () => ({
    listLocalAssets: (...args: unknown[]) => mockListLocalAssets(...args),
}));
jest.mock('@/lib/googleDrive', () => ({
    listDriveAssets: jest.fn(),
    loadDriveConfig: () => ({ enabled: false }),
}));
jest.mock('@/lib/authSession', () => ({ buildSessionAuthorizationHeader: () => null }));
jest.mock('@/lib/assetStorageSettings', () => ({
    isImplementedAssetCloudProvider: () => true,
    loadAssetStorageSettings: () => mockLoadAssetStorageSettings(),
}));

const record = (id: string, extra: Partial<LocalAssetRecord> = {}): LocalAssetRecord => ({
    id,
    name: `${id}.png`,
    type: 'images',
    category: 'uploads',
    owner: 'alice',
    isPublic: false,
    mimeType: 'image/png',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    sizeBytes: 1234,
    ...extra,
});

const baseArgs = {
    normalizedUser: 'alice',
    driveClientId: '',
    activeTab: 'images' as const,
    scopeTab: 'personal' as const,
    visibilityFilter: 'all' as const,
    showPublicAssets: true,
    searchQuery: '',
};

describe('useAssetLibraryQuery', () => {
    beforeEach(() => {
        invalidateAssetQueryCache();
        mockListLocalAssets.mockReset();
        mockLoadAssetStorageSettings.mockReturnValue({
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            includeLegacyServerAssetsInHybrid: true,
            hybridUploadToCloudByDefault: false,
        });
        global.fetch = jest.fn(async () => ({
            json: async () => ({ success: true, files: [{ path: '/api/assets/serve/uploads/images/s.png', name: 's.png', type: 'images', category: 'uploads' }] }),
        })) as unknown as typeof fetch;
    });

    it('loads at once, reports per-source counts and timing, and carries sizes through', async () => {
        mockListLocalAssets.mockResolvedValue([record('a')]);
        const { result } = renderHook(() => useAssetLibraryQuery(baseArgs));

        await waitFor(() => expect(result.current.assets).toHaveLength(2));
        expect(result.current.isLoading).toBe(false);
        expect(result.current.loadStats).toMatchObject({ counts: { local: 1, cloud: 0, server: 1 }, failed: [], fromCache: false });
        expect(result.current.loadStats?.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.current.assets.find((asset) => asset.storageProvider === 'local')?.sizeBytes).toBe(1234);
    });

    it('shows the cached list for a tab immediately while refreshing it', async () => {
        mockListLocalAssets.mockResolvedValue([record('a')]);
        const first = renderHook(() => useAssetLibraryQuery(baseArgs));
        await waitFor(() => expect(first.result.current.assets).toHaveLength(2));
        first.unmount();

        let release: () => void = () => undefined;
        mockListLocalAssets.mockImplementation(() => new Promise((resolve) => { release = () => resolve([record('a'), record('b')]); }));
        const second = renderHook(() => useAssetLibraryQuery(baseArgs));
        // No spinner: the previous list is on screen and marked as a refresh.
        await waitFor(() => expect(second.result.current.assets).toHaveLength(2));
        expect(second.result.current.isLoading).toBe(false);
        expect(second.result.current.isRefreshing).toBe(true);
        expect(second.result.current.loadStats?.fromCache).toBe(true);

        await act(async () => { release(); });
        await waitFor(() => expect(second.result.current.assets).toHaveLength(3));
        expect(second.result.current.isRefreshing).toBe(false);
        expect(second.result.current.loadStats?.fromCache).toBe(false);
    });

    it('drops a slow stale response that lands after a newer query', async () => {
        const pending: Array<(records: LocalAssetRecord[]) => void> = [];
        mockListLocalAssets.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));
        const { result, rerender } = renderHook(
            (props: typeof baseArgs) => useAssetLibraryQuery(props),
            { initialProps: baseArgs },
        );
        await waitFor(() => expect(pending).toHaveLength(1));

        rerender({ ...baseArgs, scopeTab: 'shared' });
        await waitFor(() => expect(pending).toHaveLength(2));

        // The newer (shared) query answers first; then the stale personal one.
        await act(async () => { pending[1]([record('shared-only', { owner: 'bob', isPublic: true })]); });
        await waitFor(() => expect(result.current.assets.map((asset) => asset.name)).toEqual(['shared-only.png', 's.png']));
        await act(async () => { pending[0]([record('stale')]); });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(result.current.assets.map((asset) => asset.name)).toEqual(['shared-only.png', 's.png']);
        expect(result.current.isLoading).toBe(false);
    });

    it('names a source that failed instead of silently showing fewer assets', async () => {
        mockListLocalAssets.mockResolvedValue([record('a')]);
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        global.fetch = jest.fn(async () => { throw new Error('server down'); }) as unknown as typeof fetch;
        const { result } = renderHook(() => useAssetLibraryQuery(baseArgs));
        await waitFor(() => expect(result.current.loadStats?.failed).toEqual(['server']));
        expect(result.current.assets).toHaveLength(1);
        consoleError.mockRestore();
    });
});
