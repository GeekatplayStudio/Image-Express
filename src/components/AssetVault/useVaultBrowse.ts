'use client';
import { useVaultAlbumNav } from '@/components/AssetVault/useVaultAlbumNav';
import {
    countVaultAssetSources,
    filterVaultAssets,
    type VaultAssetSource,
} from '@/features/asset-vault/domain/filterVaultAssets';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    loadVaultUiState,
    saveVaultUiState,
    type VaultPageSize,
} from '@/features/asset-vault/application/client/vaultUiState';
import type { Bookcase } from '@/features/asset-vault/contracts/bookcase';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import {
    assetsForPage,
    buildVaultAlbumTree,
    findVaultAlbum,
    findVaultPage,
    resolveVaultLabel,
    type VaultOrganizeLens,
} from '@/features/asset-vault/domain/vaultAlbumTree';
import {
    sortVaultAlbums,
    sortVaultAssets,
    type VaultNaturalQuery,
    type VaultSortMode,
} from '@/features/asset-vault/domain/vaultNaturalQuery';
import { useVaultFolderNav } from '@/components/AssetVault/useVaultFolderNav';
import type { NavDepth } from '@/components/AssetVault/vaultModalTypes';
import type { VaultNavMode } from '@/features/asset-vault/application/client/vaultUiState';

export type { VaultNavMode };

type Translate = (key: string, params?: Record<string, string | number>) => string;

type UseVaultBrowseArgs = {
    isOpen: boolean;
    workingAssets: VaultAssetRecord[];
    bookcases: Bookcase[];
    searchHits: VaultAssetRecord[] | null;
    naturalQuery: VaultNaturalQuery;
    query: string;
    smartSearch: boolean;
    language: string;
    t: Translate;
    onClearContextMenu: () => void;
};

export function useVaultBrowse({
    isOpen,
    workingAssets,
    bookcases,
    searchHits,
    naturalQuery,
    query,
    smartSearch,
    language,
    t,
    onClearContextMenu,
}: UseVaultBrowseArgs) {
    const savedUi = useMemo(() => (typeof window === 'undefined' ? null : loadVaultUiState()), []);

    const [use3d, setUse3d] = useState(false);
    const [assetSource, setAssetSource] = useState<VaultAssetSource>(savedUi?.assetSource ?? 'library');
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const [lens, setLens] = useState<VaultOrganizeLens>(savedUi?.lens ?? 'type');
    const [sortMode, setSortMode] = useState<VaultSortMode>(savedUi?.sortMode ?? 'relevance');
    const [pageSize, setPageSize] = useState<VaultPageSize>(savedUi?.pageSize ?? 48);
    const [pageIndex, setPageIndex] = useState(0);
    const [depth, setDepth] = useState<NavDepth>('page');
    const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
    const [activePageId, setActivePageId] = useState<string | null>(null);
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [expandedAlbumIds, setExpandedAlbumIds] = useState<Set<string>>(() => new Set());
    /**
     * "After the album tree next rebuilds, jump to the first album." Held as
     * state rather than a ref because the reconciliation below reads and clears
     * it during render, and a ref mutated in render is not safe under
     * concurrent rendering.
     */
    const [pendingFlatRematch, setPendingFlatRematch] = useState(false);

    /**
     * The assets everything else derives from — sidebar counts, folder tree and
     * grid alike, so they cannot disagree. See filterVaultAssets for why a
     * server-answered search is not filtered again.
     */
    const filteredAssets = useMemo(() => filterVaultAssets(workingAssets, {
        typeFilter: naturalQuery.typeFilter,
        text: naturalQuery.text,
        serverAnswered: Boolean(searchHits),
        source: assetSource,
    }), [workingAssets, naturalQuery.typeFilter, naturalQuery.text, searchHits, assetSource]);

    const sourceCounts = useMemo(() => countVaultAssetSources(workingAssets), [workingAssets]);

    const folderNav = useVaultFolderNav({
        workingAssets: filteredAssets,
        initialNavMode: savedUi?.navMode ?? 'groups',
        onClearContextMenu,
    });
    const { navMode, folderAssetIds } = folderNav;
    const { activeFolderId, includeSubfolders } = folderNav;

    const effectiveSort = naturalQuery.sort !== 'relevance' ? naturalQuery.sort : sortMode;
    const effectiveLens = naturalQuery.lensHint || lens;
    const albumPageSize = pageSize === 'all'
        ? Math.max(workingAssets.length, 1)
        : pageSize;

    const albums = useMemo(() => {
        const assets = filteredAssets;
        const tree = buildVaultAlbumTree(assets, effectiveLens, bookcases, {
            assetsPerPage: albumPageSize,
        });
        return sortVaultAlbums(tree, effectiveSort, (album) => resolveVaultLabel(album, t, language), language);
    }, [filteredAssets, effectiveLens, bookcases, effectiveSort, t, language, albumPageSize]);

    /**
     * Adopt lens/sort hints parsed out of the search query.
     *
     * Adjusted during render (React's documented pattern for state derived from
     * changing inputs) rather than in effects. The effect version rendered the
     * old lens once, then re-rendered with the new one, so typing a query like
     * "photos by date" visibly rebuilt the sidebar twice. Guarded on the
     * previous hint, so a user who then picks a lens by hand is not overridden
     * on every keystroke.
     */
    const [lastLensHint, setLastLensHint] = useState<VaultOrganizeLens | null>(null);
    if (naturalQuery.lensHint && naturalQuery.lensHint !== lastLensHint) {
        setLastLensHint(naturalQuery.lensHint);
        if (naturalQuery.lensHint !== lens) {
            setLens(naturalQuery.lensHint);
            setPendingFlatRematch(!use3d);
            if (use3d) setDepth('room');
            setActiveAlbumId(null);
            setActivePageId(null);
        }
    }

    const [lastSortHint, setLastSortHint] = useState<VaultSortMode | null>(null);
    if (naturalQuery.sort !== 'relevance' && naturalQuery.sort !== lastSortHint) {
        setLastSortHint(naturalQuery.sort);
        if (naturalQuery.sort !== sortMode) setSortMode(naturalQuery.sort);
    }

    const activeAlbum = useMemo(() => findVaultAlbum(albums, activeAlbumId), [albums, activeAlbumId]);
    const activePage = useMemo(() => findVaultPage(activeAlbum, activePageId), [activeAlbum, activePageId]);

    /**
     * Honour a pending "jump to the first album" request once the tree has
     * rebuilt under the new lens.
     */
    if (!use3d && pendingFlatRematch) {
        setPendingFlatRematch(false);
        const first = albums[0];
        if (first) {
            setActiveAlbumId(first.id);
            setActivePageId(first.pages[0]?.id ?? null);
            setDepth('page');
            setExpandedAlbumIds(new Set([first.id]));
        } else {
            setExpandedAlbumIds(new Set());
        }
    }

    /**
     * The active album is always shown expanded. Derived rather than pushed
     * into state by an effect: the effect version rendered once with the album
     * collapsed and then again expanded, so selecting an album visibly
     * flickered its children.
     */
    const visibleExpandedAlbumIds = useMemo(() => {
        if (!activeAlbumId || use3d || expandedAlbumIds.has(activeAlbumId)) {
            return expandedAlbumIds;
        }
        const next = new Set(expandedAlbumIds);
        next.add(activeAlbumId);
        return next;
    }, [expandedAlbumIds, activeAlbumId, use3d]);

    const fileManagerAssets = useMemo(() => {
        let list: VaultAssetRecord[] = [];
        // `workingAssets` is already the search hits while a search is active, so
        // the branches below narrow *within* the results. Search used to
        // short-circuit to the flat hit list here, which is why choosing a
        // folder, an album or a different lens did nothing after searching.
        //
        // Search also forces the flat path: the 3D room only renders a selected
        // album, so a search with nothing selected would have shown an empty grid.
        const flat = !use3d || Boolean(searchHits);
        // Everything narrows `filteredAssets`, the same set the sidebar counts,
        // so an album that advertises 35 cannot hand back an empty grid.
        if (navMode === 'folders') {
            // Folder mode replaces the album/page path entirely: the grid shows
            // exactly what lives in the chosen folder (optionally recursively),
            // or everything when nothing is selected.
            list = folderAssetIds
                ? filteredAssets.filter((asset) => folderAssetIds.has(asset.id))
                : filteredAssets;
        } else if (activePage) {
            list = assetsForPage(filteredAssets, activePage);
        } else if (flat && activeAlbum) {
            const ids = new Set(activeAlbum.pages.flatMap((page) => page.assetIds));
            list = filteredAssets.filter((asset) => ids.has(asset.id));
        } else if (flat) {
            list = filteredAssets;
        }
        return sortVaultAssets(list, effectiveSort, language);
    }, [activePage, activeAlbum, filteredAssets, use3d, effectiveSort, language, searchHits, navMode, folderAssetIds]);

    // The text filter now happens once, in `filteredAssets`. Re-applying it here
    // was what let the sidebar and the grid disagree.
    const displayedAssets = fileManagerAssets;

    const totalPages = pageSize === 'all'
        ? 1
        : Math.max(1, Math.ceil(displayedAssets.length / pageSize));

    /**
     * Clamped on read instead of corrected by an effect. When the result set
     * shrank — a narrower filter, a smaller folder — the effect version
     * rendered one frame of an out-of-range page (an empty grid) before
     * snapping back. Deriving it means the out-of-range state never renders.
     */
    const safePageIndex = Math.min(Math.max(pageIndex, 0), totalPages - 1);

    const pagedAssets = useMemo(() => {
        if (pageSize === 'all') return displayedAssets;
        const start = safePageIndex * pageSize;
        return displayedAssets.slice(start, start + pageSize);
    }, [displayedAssets, pageSize, safePageIndex]);

    /**
     * Any change of *what is being listed* returns to page 1. Collapsed into a
     * single key compared during render: as an effect this reset landed a frame
     * late, so switching folders briefly showed page 3 of the previous folder.
     */
    const viewKey = [
        pageSize, activeAlbumId, activePageId, naturalQuery.text,
        effectiveLens, effectiveSort, activeFolderId, includeSubfolders, navMode,
    ].join('|');
    const [lastViewKey, setLastViewKey] = useState(viewKey);
    if (viewKey !== lastViewKey) {
        setLastViewKey(viewKey);
        if (pageIndex !== 0) setPageIndex(0);
    }

    /**
     * Starting a search returns to "all hits".
     *
     * Without this, an album selected before searching keeps narrowing the
     * results afterwards — the user searches, sees a handful of assets while
     * the footer reports the full count, and reads it as results going
     * missing. Adjusted during render, like the resets above, so the narrowed
     * grid is never painted.
     */
    const isSearchActive = Boolean(searchHits);
    const [lastSearchActive, setLastSearchActive] = useState(isSearchActive);
    if (isSearchActive !== lastSearchActive) {
        setLastSearchActive(isSearchActive);
        if (isSearchActive && activeAlbumId) {
            setActiveAlbumId(null);
            setActivePageId(null);
        }
    }

    /**
     * Keep the selection valid as the album tree rebuilds.
     *
     * Runs during render so an invalid selection is never painted. Two rules
     * this must preserve, both of them past bugs:
     *
     *  - An empty album list is a *transient* state (catalog reloading, or a
     *    re-index in flight), not a deleted album. Clearing the selection here
     *    is what made the vault "disappear": the browsing position was
     *    destroyed by a momentary gap and never came back with the data.
     *  - Page ids are positional (`<album>::page_N`), so indexing more assets
     *    renumbers them. Hold the reader's place at the nearest surviving page
     *    rather than snapping to the first.
     */
    if (activeAlbumId && albums.length > 0) {
        const album = findVaultAlbum(albums, activeAlbumId);
        if (!album) {
            setActiveAlbumId(null);
            setActivePageId(null);
        } else if (!activePageId || !album.pages.some((page) => page.id === activePageId)) {
            const previousIndex = activePageId
                ? Math.max(0, Number.parseInt(activePageId.split('::page_')[1] ?? '1', 10) - 1)
                : 0;
            const clampedIndex = Math.min(previousIndex, album.pages.length - 1);
            const nextPageId = album.pages[clampedIndex]?.id ?? album.pages[0]?.id ?? null;
            if (nextPageId !== activePageId) setActivePageId(nextPageId);
        }
    }

    // (Removed: an effect that clamped pageIndex to totalPages. `safePageIndex`
    // above derives the same value without a correcting render.)

    useEffect(() => {
        if (!isOpen) return;
        saveVaultUiState({
            use3d: false,
            smartSearch,
            lens,
            sortMode,
            query,
            pageSize,
            sourcesOpen,
            navMode,
            assetSource,
        });
    }, [isOpen, smartSearch, lens, sortMode, query, pageSize, sourcesOpen, navMode, assetSource]);

    // Open with something selected rather than an empty grid — but never during
    // a search. Auto-selecting the first album there would show one album's
    // worth of hits while the footer reported the full count, which reads as
    // results going missing. A search starts on "all hits"; the sidebar is
    // there to narrow from.
    if (isOpen && !use3d && !searchHits && !activeAlbumId && albums.length > 0) {
        const first = albums[0];
        setActiveAlbumId(first.id);
        setActivePageId(first.pages[0]?.id ?? null);
        setDepth('page');
        setExpandedAlbumIds(new Set([first.id]));
    }

    // (Removed: an effect that cleared the selection whenever depth became
    // 'room'. Every call site that sets 'room' — applyOrganizeLens, the
    // lens-hint path, close, and the album-created handler in the modal —
    // already clears activeAlbumId/activePageId in the same action, so the
    // effect only ever ran a second render to redo work that was already done.)

    const albumNav = useVaultAlbumNav({
        lens,
        use3d,
        onClearContextMenu,
        setLens,
        setDepth,
        setActiveAlbumId,
        setActivePageId,
        setUse3d,
        setExpandedAlbumIds,
        setOverflowOpen,
        setPendingFlatRematch,
    });
    const {
        goRoom, goAlbum, goPage, applyOrganizeLens,
        selectFlatAlbum, selectFlatPage, selectFlatAll,
        toggleAlbumExpanded, requestFlatRematch,
    } = albumNav;

    /**
     * Reset to a clean state when the modal closes, so reopening never shows
     * the previous session's selection. State is adjusted on the open→closed
     * transition during render; dismissing the context menu stays in an effect
     * because it calls out to the parent rather than setting local state.
     */
    const [wasOpen, setWasOpen] = useState(isOpen);
    if (wasOpen !== isOpen) {
        setWasOpen(isOpen);
        if (!isOpen) {
            setDepth('room');
            setActiveAlbumId(null);
            setActivePageId(null);
            setUse3d(true);
        }
    }

    useEffect(() => {
        if (isOpen) return;
        onClearContextMenu();
    }, [isOpen, onClearContextMenu]);

    const labelOf = useCallback(
        (entry: { label: string; labelKey?: string; labelParams?: Record<string, string | number> }) => (
            resolveVaultLabel(entry, t, language)
        ),
        [t, language],
    );

    return {
        use3d,
        setUse3d,
        sourcesOpen,
        setSourcesOpen,
        lens,
        setLens,
        sortMode,
        setSortMode,
        pageSize,
        setPageSize,
        pageIndex,
        setPageIndex,
        depth,
        setDepth,
        activeAlbumId,
        setActiveAlbumId,
        activePageId,
        setActivePageId,
        overflowOpen,
        setOverflowOpen,
        // Consumers get the derived set, so the active album always renders
        // expanded without a second render to make it so.
        expandedAlbumIds: visibleExpandedAlbumIds,
        ...folderNav,
        effectiveSort,
        effectiveLens,
        albums,
        activeAlbum,
        activePage,
        displayedAssets,
        pagedAssets,
        totalPages,
        goRoom,
        goAlbum,
        goPage,
        applyOrganizeLens,
        visibleAssetCount: filteredAssets.length,
        assetSource,
        setAssetSource,
        sourceCounts,
        selectFlatAlbum,
        selectFlatPage,
        selectFlatAll,
        toggleAlbumExpanded,
        requestFlatRematch,
        labelOf,
    };
}
