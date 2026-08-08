import { act, renderHook } from '@testing-library/react';

import { useVaultBrowse } from '@/components/AssetVault/useVaultBrowse';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type { VaultNaturalQuery } from '@/features/asset-vault/domain/vaultNaturalQuery';

/**
 * Behavioural contract for the vault's browsing state machine.
 *
 * These exist because the hook was refactored from eight effects to
 * render-time derivation, and it had no direct coverage at the time — the
 * "vault disappears" report came out of exactly this code. Each test below
 * pins a rule that was previously only implied by an effect.
 */

const asset = (id: string, type: VaultAssetRecord['type'] = 'images'): VaultAssetRecord => ({
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    type,
    category: 'uploads',
    sizeBytes: 1,
    origin: { connector: 'local', uri: `file://d:/pics/${id}.png`, displayPath: `d:/pics/${id}.png` },
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
} as VaultAssetRecord);

const naturalQuery = (over: Partial<VaultNaturalQuery> = {}): VaultNaturalQuery => ({
    text: '',
    sort: 'relevance',
    lensHint: null,
    typeFilter: null,
    ...over,
} as VaultNaturalQuery);

const baseArgs = (over: Record<string, unknown> = {}) => ({
    isOpen: true,
    workingAssets: [asset('a1'), asset('a2'), asset('a3')],
    bookcases: [],
    searchHits: null,
    naturalQuery: naturalQuery(),
    query: '',
    smartSearch: false,
    language: 'en',
    t: (key: string) => key,
    onClearContextMenu: jest.fn(),
    ...over,
});

describe('useVaultBrowse', () => {
    beforeEach(() => window.localStorage.clear());

    it('selects an album on open instead of showing an empty grid', () => {
        const { result } = renderHook(() => useVaultBrowse(baseArgs()));
        expect(result.current.activeAlbumId).toBeTruthy();
        expect(result.current.displayedAssets.length).toBeGreaterThan(0);
    });

    /**
     * The regression that caused "the vault disappears". An empty album list is
     * transient — the catalog reloading, or a re-index in flight — not a
     * deletion, so the browsing position must survive it.
     */
    it('keeps the selection when the catalog momentarily empties', () => {
        const { result, rerender } = renderHook(
            (props: ReturnType<typeof baseArgs>) => useVaultBrowse(props),
            { initialProps: baseArgs() },
        );
        const selected = result.current.activeAlbumId;
        expect(selected).toBeTruthy();

        rerender(baseArgs({ workingAssets: [] }));
        expect(result.current.activeAlbumId).toBe(selected);

        rerender(baseArgs());
        expect(result.current.activeAlbumId).toBe(selected);
    });

    it('replaces a selection that genuinely no longer exists with a valid one', () => {
        const { result, rerender } = renderHook(
            (props: ReturnType<typeof baseArgs>) => useVaultBrowse(props),
            { initialProps: baseArgs() },
        );
        act(() => result.current.setActiveAlbumId('album_type_does_not_exist'));
        rerender(baseArgs());

        // Cleared, then re-seeded in the same pass — the user is never left
        // pointing at a missing album, and never left with an empty grid.
        expect(result.current.activeAlbumId).not.toBe('album_type_does_not_exist');
        expect(result.current.activeAlbumId).toBeTruthy();
        expect(result.current.displayedAssets.length).toBeGreaterThan(0);
    });

    it('never exposes a page index past the last page', () => {
        const { result, rerender } = renderHook(
            (props: ReturnType<typeof baseArgs>) => useVaultBrowse(props),
            { initialProps: baseArgs({ workingAssets: Array.from({ length: 60 }, (_, i) => asset(`a${i}`)) }) },
        );
        act(() => result.current.setPageSize(24));
        act(() => result.current.setPageIndex(2));
        expect(result.current.pagedAssets.length).toBeGreaterThan(0);

        // Collapsing the result set must not leave an out-of-range page rendered.
        rerender(baseArgs({ workingAssets: [asset('only')] }));
        expect(result.current.pagedAssets.length).toBeGreaterThan(0);
        expect(result.current.totalPages).toBe(1);
    });

    it('returns to page 1 when the thing being listed changes', () => {
        const { result } = renderHook(() => useVaultBrowse(
            baseArgs({ workingAssets: Array.from({ length: 60 }, (_, i) => asset(`a${i}`)) }),
        ));
        act(() => result.current.setPageSize(24));
        act(() => result.current.setPageIndex(1));
        expect(result.current.pageIndex).toBe(1);

        act(() => result.current.setNavMode('folders'));
        expect(result.current.pageIndex).toBe(0);
    });

    it('reports the active album as expanded without needing a second render', () => {
        const { result } = renderHook(() => useVaultBrowse(baseArgs()));
        const active = result.current.activeAlbumId!;
        expect(result.current.expandedAlbumIds.has(active)).toBe(true);
    });

    it('adopts a lens hint parsed from the query', () => {
        const { result, rerender } = renderHook(
            (props: ReturnType<typeof baseArgs>) => useVaultBrowse(props),
            { initialProps: baseArgs() },
        );
        rerender(baseArgs({ naturalQuery: naturalQuery({ lensHint: 'date' }) }));
        expect(result.current.effectiveLens).toBe('date');
    });

    it('lets a hand-picked lens stand after a hint has been applied', () => {
        const { result, rerender } = renderHook(
            (props: ReturnType<typeof baseArgs>) => useVaultBrowse(props),
            { initialProps: baseArgs({ naturalQuery: naturalQuery({ lensHint: 'date' }) }) },
        );
        expect(result.current.effectiveLens).toBe('date');

        // Same hint still present; a manual choice must not be re-overridden.
        act(() => result.current.setLens('location'));
        rerender(baseArgs({ naturalQuery: naturalQuery({ lensHint: 'date' }) }));
        expect(result.current.lens).toBe('location');
    });

    it('resets to a clean state when the modal closes', () => {
        const { result, rerender } = renderHook(
            (props: ReturnType<typeof baseArgs>) => useVaultBrowse(props),
            { initialProps: baseArgs() },
        );
        expect(result.current.activeAlbumId).toBeTruthy();

        rerender(baseArgs({ isOpen: false }));
        expect(result.current.activeAlbumId).toBeNull();
        expect(result.current.activePageId).toBeNull();
        expect(result.current.depth).toBe('room');
    });

    it('switches the grid to folder contents in folder mode', () => {
        const { result } = renderHook(() => useVaultBrowse(baseArgs()));
        act(() => result.current.setNavMode('folders'));
        expect(result.current.folderTree).not.toBeNull();

        act(() => result.current.selectFolder('d:/pics'));
        expect(result.current.activeFolderId).toBe('d:/pics');
        expect(result.current.displayedAssets.length).toBe(3);
    });
});

/**
 * Search used to short-circuit the grid to the flat hit list, so the folder
 * tree, the album list and the lens buttons all became inert the moment a
 * search ran — which is what "the vault UI breaks after search" meant.
 */
describe('navigating within search results', () => {
    // This block sits outside the suite above, so it needs its own reset:
    // saved vault UI state (lens, last album) otherwise leaks in and changes
    // which albums are built.
    beforeEach(() => window.localStorage.clear());

    const hits = [asset('h1'), asset('h2', 'videos'), asset('h3')];
    // While a search is active the working set *is* the hits.
    const searchArgs = (over: Record<string, unknown> = {}) => baseArgs({
        workingAssets: hits,
        searchHits: hits,
        naturalQuery: naturalQuery({ text: 'cowboy' }),
        query: 'cowboy',
        ...over,
    });

    it('still shows every hit when nothing is selected', () => {
        const { result } = renderHook(() => useVaultBrowse(searchArgs()));
        expect(result.current.displayedAssets).toHaveLength(3);
    });

    it('groups the hits into albums, so the sidebar has something to show', () => {
        const { result } = renderHook(() => useVaultBrowse(searchArgs()));
        expect(result.current.albums.length).toBeGreaterThan(0);
    });

    it('narrows the grid to the chosen album instead of ignoring the click', () => {
        const { result } = renderHook(() => useVaultBrowse(searchArgs()));

        const album = result.current.albums.find((entry) => entry.pages.length > 0);
        expect(album).toBeTruthy();
        act(() => result.current.selectFlatAlbum(album!));

        const idsInAlbum = new Set(album!.pages.flatMap((page) => page.assetIds));
        expect(result.current.displayedAssets.length).toBe(idsInAlbum.size);
        expect(result.current.displayedAssets.every((entry) => idsInAlbum.has(entry.id))).toBe(true);
    });

    it('responds to a lens change rather than staying on one grouping', () => {
        const { result } = renderHook(() => useVaultBrowse(searchArgs()));
        const byType = result.current.albums.map((entry) => entry.id).join('|');

        act(() => result.current.setLens('date'));

        expect(result.current.albums.map((entry) => entry.id).join('|')).not.toBe(byType);
    });

    it('narrows to a folder in folder mode', () => {
        const { result } = renderHook(() => useVaultBrowse(searchArgs()));
        act(() => result.current.setNavMode('folders'));
        expect(result.current.folderTree).toBeTruthy();
        // Every hit lives under d:/pics, so selecting it keeps all three —
        // the point is that the folder path runs at all during a search.
        expect(result.current.displayedAssets).toHaveLength(3);
    });

    it('never renders an empty grid in 3D mode during a search', () => {
        // The 3D room only draws a selected album; search forces the flat path
        // so a hit list with nothing selected still shows results.
        const { result } = renderHook(() => useVaultBrowse(searchArgs()));
        act(() => result.current.setUse3d(true));
        expect(result.current.displayedAssets.length).toBeGreaterThan(0);
    });
});

describe('starting a search', () => {
    beforeEach(() => window.localStorage.clear());

    it('drops a previously selected album so every hit is shown', () => {
        const browsing = [asset('a1'), asset('a2', 'videos')];
        const { result, rerender } = renderHook(
            (props: Record<string, unknown>) => useVaultBrowse(props as never),
            { initialProps: baseArgs({ workingAssets: browsing }) },
        );

        const album = result.current.albums.find((entry) => entry.pages.length > 0)!;
        act(() => result.current.selectFlatAlbum(album));
        expect(result.current.activeAlbumId).toBe(album.id);

        const hits = [asset('h1'), asset('h2', 'videos'), asset('h3')];
        rerender(baseArgs({
            workingAssets: hits,
            searchHits: hits,
            naturalQuery: naturalQuery({ text: 'cowboy' }),
            query: 'cowboy',
        }));

        // Otherwise the old album keeps filtering the results and the grid
        // disagrees with the "N matches" count in the footer.
        expect(result.current.activeAlbumId).toBeNull();
        expect(result.current.displayedAssets).toHaveLength(3);
    });
});
