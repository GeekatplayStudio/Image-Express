'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    type VaultAlbum,
    type VaultOrganizeLens,
} from '@/features/asset-vault/domain/vaultAlbumTree';
import {
    sortVaultAlbums,
    sortVaultAssets,
    type VaultNaturalQuery,
    type VaultSortMode,
} from '@/features/asset-vault/domain/vaultNaturalQuery';
import {
    assetIdsInVaultFolder,
    buildVaultFolderTree,
    vaultFolderPath,
} from '@/features/asset-vault/domain/vaultFolderTree';
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
    const pendingFlatRematchRef = useRef(false);

    const [navMode, setNavMode] = useState<VaultNavMode>(savedUi?.navMode ?? 'groups');
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
    const [includeSubfolders, setIncludeSubfolders] = useState(true);

    /**
     * Building the tree is a full pass over the catalog — ~550 ms for 200k
     * assets — so it depends on `workingAssets` alone and is skipped entirely
     * while the folder sidebar is closed. Deliberately NOT keyed on `t` or
     * `language`: folder names come from the filesystem and never translate,
     * and those identities change far more often than the catalog does.
     */
    const folderTree = useMemo(() => {
        if (navMode !== 'folders') return null;
        return buildVaultFolderTree(workingAssets);
    }, [navMode, workingAssets]);

    const activeFolderPath = useMemo(() => (
        folderTree && activeFolderId ? vaultFolderPath(folderTree, activeFolderId) : []
    ), [folderTree, activeFolderId]);

    const folderAssetIds = useMemo(() => {
        if (!folderTree || !activeFolderId) return null;
        return new Set(assetIdsInVaultFolder(folderTree, activeFolderId, {
            recursive: includeSubfolders,
        }));
    }, [folderTree, activeFolderId, includeSubfolders]);

    const toggleFolderExpanded = useCallback((folderId: string) => {
        setExpandedFolderIds((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    }, []);

    /** Select a folder and reveal it by expanding every ancestor. */
    const selectFolder = useCallback((folderId: string) => {
        setActiveFolderId(folderId);
        onClearContextMenu();
        setExpandedFolderIds((prev) => {
            const next = new Set(prev);
            const segments = folderId.split('/');
            let walked = '';
            for (const segment of segments) {
                walked = walked ? `${walked}/${segment}` : segment;
                next.add(walked);
            }
            return next;
        });
    }, [onClearContextMenu]);

    const selectAllFolders = useCallback(() => {
        setActiveFolderId(null);
        onClearContextMenu();
    }, [onClearContextMenu]);

    const toggleIncludeSubfolders = useCallback(() => {
        setIncludeSubfolders((prev) => !prev);
    }, []);

    const effectiveSort = naturalQuery.sort !== 'relevance' ? naturalQuery.sort : sortMode;
    const effectiveLens = naturalQuery.lensHint || lens;
    const albumPageSize = pageSize === 'all'
        ? Math.max(workingAssets.length, 1)
        : pageSize;

    const albums = useMemo(() => {
        let assets = workingAssets;
        if (naturalQuery.typeFilter) {
            assets = assets.filter((asset) => asset.type === naturalQuery.typeFilter);
        }
        const tree = buildVaultAlbumTree(assets, effectiveLens, bookcases, {
            assetsPerPage: albumPageSize,
        });
        return sortVaultAlbums(tree, effectiveSort, (album) => resolveVaultLabel(album, t, language), language);
    }, [workingAssets, effectiveLens, bookcases, effectiveSort, naturalQuery.typeFilter, t, language, albumPageSize]);

    useEffect(() => {
        if (naturalQuery.lensHint && naturalQuery.lensHint !== lens) {
            pendingFlatRematchRef.current = !use3d;
            setLens(naturalQuery.lensHint);
            if (use3d) {
                setDepth('room');
                setActiveAlbumId(null);
                setActivePageId(null);
            } else {
                setActiveAlbumId(null);
                setActivePageId(null);
            }
        }
    }, [naturalQuery.lensHint, lens, use3d]);

    useEffect(() => {
        if (naturalQuery.sort !== 'relevance' && naturalQuery.sort !== sortMode) {
            setSortMode(naturalQuery.sort);
        }
    }, [naturalQuery.sort, sortMode]);

    const activeAlbum = useMemo(() => findVaultAlbum(albums, activeAlbumId), [albums, activeAlbumId]);
    const activePage = useMemo(() => findVaultPage(activeAlbum, activePageId), [activeAlbum, activePageId]);

    useEffect(() => {
        if (use3d || !pendingFlatRematchRef.current) return;
        const first = albums[0];
        if (first) {
            setActiveAlbumId(first.id);
            setActivePageId(first.pages[0]?.id ?? null);
            setDepth('page');
            setExpandedAlbumIds(new Set([first.id]));
        } else {
            setExpandedAlbumIds(new Set());
        }
        pendingFlatRematchRef.current = false;
    }, [albums, use3d, effectiveLens]);

    useEffect(() => {
        if (!activeAlbumId || use3d) return;
        setExpandedAlbumIds((prev) => {
            if (prev.has(activeAlbumId)) return prev;
            const next = new Set(prev);
            next.add(activeAlbumId);
            return next;
        });
    }, [activeAlbumId, use3d]);

    const fileManagerAssets = useMemo(() => {
        let list: VaultAssetRecord[] = [];
        if (searchHits) {
            list = searchHits;
        } else if (navMode === 'folders') {
            // Folder mode replaces the album/page path entirely: the grid shows
            // exactly what lives in the chosen folder (optionally recursively),
            // or the whole catalog when nothing is selected.
            list = folderAssetIds
                ? workingAssets.filter((asset) => folderAssetIds.has(asset.id))
                : workingAssets;
        } else if (activePage) {
            list = assetsForPage(workingAssets, activePage);
        } else if (!use3d && activeAlbum) {
            const ids = new Set(activeAlbum.pages.flatMap((page) => page.assetIds));
            list = workingAssets.filter((asset) => ids.has(asset.id));
        } else if (!use3d) {
            list = workingAssets;
        }
        if (naturalQuery.typeFilter) {
            list = list.filter((asset) => asset.type === naturalQuery.typeFilter);
        }
        return sortVaultAssets(list, effectiveSort, language);
    }, [activePage, activeAlbum, workingAssets, use3d, naturalQuery.typeFilter, effectiveSort, language, searchHits, navMode, folderAssetIds]);

    const displayedAssets = useMemo(() => {
        if (searchHits) return fileManagerAssets;
        const q = naturalQuery.text.toLowerCase();
        if (!q) return fileManagerAssets;
        return fileManagerAssets.filter((asset) => {
            const hay = [
                asset.name,
                asset.description || '',
                ...(asset.tags || []),
                asset.origin.displayPath,
            ].join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [fileManagerAssets, naturalQuery.text, searchHits]);

    const pagedAssets = useMemo(() => {
        if (pageSize === 'all') return displayedAssets;
        const start = pageIndex * pageSize;
        return displayedAssets.slice(start, start + pageSize);
    }, [displayedAssets, pageSize, pageIndex]);

    const totalPages = pageSize === 'all'
        ? 1
        : Math.max(1, Math.ceil(displayedAssets.length / pageSize));

    useEffect(() => {
        setPageIndex(0);
    }, [pageSize, activeAlbumId, activePageId, naturalQuery.text, effectiveLens, effectiveSort,
        activeFolderId, includeSubfolders, navMode]);

    useEffect(() => {
        if (!activeAlbumId) return;
        // An empty album list is a transient state, not a deleted album: it
        // happens while the catalog reloads or a re-index is in flight. Clearing
        // the selection here is what made the vault "disappear" — the browsing
        // position was destroyed by a momentary gap in the data and never came
        // back once the assets returned.
        if (albums.length === 0) return;

        const album = findVaultAlbum(albums, activeAlbumId);
        if (!album) {
            setActiveAlbumId(null);
            setActivePageId(null);
            return;
        }
        if (!activePageId || !album.pages.some((page) => page.id === activePageId)) {
            // Page ids are positional (`<album>::page_N`), so indexing more
            // assets or changing the page size renumbers them. Hold the reader's
            // place at the nearest surviving page instead of snapping to the
            // first one.
            const previousIndex = activePageId
                ? Math.max(0, Number.parseInt(activePageId.split('::page_')[1] ?? '1', 10) - 1)
                : 0;
            const clampedIndex = Math.min(previousIndex, album.pages.length - 1);
            setActivePageId(album.pages[clampedIndex]?.id ?? album.pages[0]?.id ?? null);
        }
    }, [albums, activeAlbumId, activePageId, pageSize]);

    useEffect(() => {
        if (pageIndex > totalPages - 1) setPageIndex(Math.max(0, totalPages - 1));
    }, [pageIndex, totalPages]);

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
        });
    }, [isOpen, smartSearch, lens, sortMode, query, pageSize, sourcesOpen, navMode]);

    useEffect(() => {
        if (!isOpen || use3d || activeAlbumId || albums.length === 0) return;
        const first = albums[0];
        setActiveAlbumId(first.id);
        setActivePageId(first.pages[0]?.id ?? null);
        setDepth('page');
        setExpandedAlbumIds(new Set([first.id]));
    }, [isOpen, use3d, activeAlbumId, albums]);

    useEffect(() => {
        if (depth === 'room') {
            setActiveAlbumId(null);
            setActivePageId(null);
        }
    }, [lens, depth]);

    const goRoom = useCallback(() => {
        setDepth('page');
        setActiveAlbumId(null);
        setActivePageId(null);
        setUse3d(false);
        onClearContextMenu();
    }, [onClearContextMenu]);

    const goAlbum = useCallback((albumId: string) => {
        setActiveAlbumId(albumId);
        setActivePageId(null);
        setDepth('page');
        setUse3d(false);
        onClearContextMenu();
    }, [onClearContextMenu]);

    const goPage = useCallback((albumId: string, pageId: string) => {
        setActiveAlbumId(albumId);
        setActivePageId(pageId);
        setDepth('page');
        setUse3d(false);
        onClearContextMenu();
    }, [onClearContextMenu]);

    const applyOrganizeLens = useCallback((value: VaultOrganizeLens) => {
        if (value === lens) return;
        setLens(value);
        onClearContextMenu();
        setOverflowOpen(false);
        if (use3d) {
            setDepth('room');
            setActiveAlbumId(null);
            setActivePageId(null);
            return;
        }
        pendingFlatRematchRef.current = true;
        setActiveAlbumId(null);
        setActivePageId(null);
        setDepth('page');
    }, [lens, use3d, onClearContextMenu]);

    const selectFlatAlbum = useCallback((album: VaultAlbum) => {
        setUse3d(false);
        setActiveAlbumId(album.id);
        setActivePageId(null);
        setDepth('page');
        setExpandedAlbumIds((prev) => {
            const next = new Set(prev);
            next.add(album.id);
            return next;
        });
        onClearContextMenu();
    }, [onClearContextMenu]);

    const selectFlatPage = useCallback((albumId: string, pageId: string) => {
        setUse3d(false);
        setActiveAlbumId(albumId);
        setActivePageId(pageId);
        setDepth('page');
        setExpandedAlbumIds((prev) => {
            const next = new Set(prev);
            next.add(albumId);
            return next;
        });
        onClearContextMenu();
    }, [onClearContextMenu]);

    const selectFlatAll = useCallback(() => {
        setUse3d(false);
        setActiveAlbumId(null);
        setActivePageId(null);
        setDepth('page');
        onClearContextMenu();
    }, [onClearContextMenu]);

    const toggleAlbumExpanded = useCallback((albumId: string) => {
        setExpandedAlbumIds((prev) => {
            const next = new Set(prev);
            if (next.has(albumId)) next.delete(albumId);
            else next.add(albumId);
            return next;
        });
    }, []);

    const requestFlatRematch = useCallback(() => {
        pendingFlatRematchRef.current = !use3d;
    }, [use3d]);

    useEffect(() => {
        if (isOpen) return;
        onClearContextMenu();
        setDepth('room');
        setActiveAlbumId(null);
        setActivePageId(null);
        setUse3d(true);
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
        expandedAlbumIds,
        navMode,
        setNavMode,
        folderTree,
        activeFolderId,
        activeFolderPath,
        expandedFolderIds,
        includeSubfolders,
        selectFolder,
        selectAllFolders,
        toggleFolderExpanded,
        toggleIncludeSubfolders,
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
        selectFlatAlbum,
        selectFlatPage,
        selectFlatAll,
        toggleAlbumExpanded,
        requestFlatRematch,
        labelOf,
    };
}
