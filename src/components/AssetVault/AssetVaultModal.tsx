'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
    Archive, Box, ChevronDown, ChevronRight, Folder, FolderPlus, Globe, HardDrive, Image as ImageIcon,
    ImagePlus, LayoutGrid, Loader2, MoreVertical, Music, Plus, RefreshCw, Search, Sparkles,
    Video, Wand2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import useEscapeKey from '@/hooks/useEscapeKey';
import DraggableResizablePanel from '@/components/ui/DraggableResizablePanel';
import Asset3DPreview from '@/components/Asset3DPreview';
import VaultSourcesPanel from '@/components/AssetVault/VaultSourcesPanel';
import { useI18n } from '@/providers/I18nProvider';
import { useDialog } from '@/providers/DialogProvider';
import type { AssetType } from '@/types';
import type { Bookcase, BookcaseFilter } from '@/features/asset-vault/contracts/bookcase';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import {
    canRenderModelThumbnail,
    getCachedModelThumbnail,
    renderModelThumbnail,
} from '@/lib/modelThumbnail';
import { captureVideoPoster, getCachedVideoPoster } from '@/lib/videoPoster';
import {
    enrichVaultCatalog,
    fetchBookcases,
    findSimilarVaultAssets,
    resolveVaultPreviewUrl,
    searchVaultUnified,
    syncVaultCatalog,
} from '@/features/asset-vault/application/client/vaultApiClient';
import {
    loadVaultUiState,
    saveVaultUiState,
    type VaultPageSize,
} from '@/features/asset-vault/application/client/vaultUiState';
import { buildSessionAuthorizationHeader } from '@/lib/authSession';
import {
    assetsForPage,
    buildVaultAlbumTree,
    findVaultAlbum,
    findVaultPage,
    resolveVaultLabel,
    VAULT_ORGANIZE_LENSES,
    type VaultAlbum,
    type VaultOrganizeLens,
    type VaultPage,
} from '@/features/asset-vault/domain/vaultAlbumTree';
import {
    parseVaultNaturalQuery,
    sortVaultAlbums,
    sortVaultAssets,
    type VaultSortMode,
} from '@/features/asset-vault/domain/vaultNaturalQuery';

const CONNECTOR_KEYS: Record<string, string> = {
    server: 'vault.connector.server',
    'indexeddb-legacy': 'vault.connector.localLibrary',
    'google-drive': 'vault.connector.googleDrive',
    local: 'vault.connector.localDrive',
    network: 'vault.connector.network',
};

export type AssetVaultModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (path: string, type: AssetType, name?: string) => void;
    onOpenClassicLibrary?: () => void;
    currentUser?: string;
    initialFilter?: BookcaseFilter;
    initialBookcaseId?: string;
    focusSearch?: boolean;
};

type NavDepth = 'room' | 'album' | 'page';

type ContextTarget =
    | { kind: 'asset'; asset: VaultAssetRecord }
    | { kind: 'album'; album: VaultAlbum }
    | { kind: 'page'; page: VaultPage; album: VaultAlbum };

function revokeRemovedBlobs(previous: Record<string, string>, next: Record<string, string>) {
    const kept = new Set(Object.values(next));
    for (const url of Object.values(previous)) {
        if (url.startsWith('blob:') && !kept.has(url)) URL.revokeObjectURL(url);
    }
}

function videoSrcWithPosterSeek(url: string) {
    if (url.startsWith('blob:') || url.includes('#')) return url;
    return `${url}#t=0.1`;
}

type PreviewPopup = {
    key: string;
    asset: VaultAssetRecord;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

export default function AssetVaultModal({
    isOpen,
    onClose,
    onSelect,
    onOpenClassicLibrary,
    currentUser,
    initialFilter,
    focusSearch = false,
}: AssetVaultModalProps) {
    const { t, language } = useI18n();
    const dialog = useDialog();
    const owner = currentUser?.trim() || 'Guest';
    const searchRef = useRef<HTMLInputElement>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const savedUi = useMemo(() => (typeof window === 'undefined' ? null : loadVaultUiState()), []);

    const [bookcases, setBookcases] = useState<Bookcase[]>([]);
    const [query, setQuery] = useState(savedUi?.query ?? '');
    const [allAssets, setAllAssets] = useState<VaultAssetRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    const [isFindingSimilar, setIsFindingSimilar] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const [use3d, setUse3d] = useState(false);
    /** Contextual hybrid search (keyword + vectors) — the vault’s primary discovery mode. */
    const [smartSearch, setSmartSearch] = useState(savedUi?.smartSearch ?? true);
    const [sourcesOpen, setSourcesOpen] = useState(savedUi?.sourcesOpen ?? false);
    /** When set, browse/search results come from vector/smart search hits instead of the full catalog. */
    const [searchHits, setSearchHits] = useState<VaultAssetRecord[] | null>(null);
    const [lens, setLens] = useState<VaultOrganizeLens>(savedUi?.lens ?? 'type');
    const [sortMode, setSortMode] = useState<VaultSortMode>(savedUi?.sortMode ?? 'relevance');
    const [pageSize, setPageSize] = useState<VaultPageSize>(savedUi?.pageSize ?? 48);
    const [pageIndex, setPageIndex] = useState(0);
    const [depth, setDepth] = useState<NavDepth>('page');
    const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
    const [activePageId, setActivePageId] = useState<string | null>(null);

    const [sourceUrls, setSourceUrls] = useState<Record<string, string>>({});
    const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
    const sourceUrlsRef = useRef(sourceUrls);
    const thumbnailUrlsRef = useRef(thumbnailUrls);
    sourceUrlsRef.current = sourceUrls;
    thumbnailUrlsRef.current = thumbnailUrls;

    const [detail, setDetail] = useState<{ asset: VaultAssetRecord; url: string } | null>(null);
    const [previewPopup, setPreviewPopup] = useState<PreviewPopup | null>(null);
    const [previewHoverKey, setPreviewHoverKey] = useState<string | null>(null);
    const [loadingPreviewKey, setLoadingPreviewKey] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ target: ContextTarget; x: number; y: number } | null>(null);
    const [overflowOpen, setOverflowOpen] = useState(false);
    /** Expanded album ids in the flat sidebar tree (collapsible categories). */
    const [expandedAlbumIds, setExpandedAlbumIds] = useState<Set<string>>(() => new Set());
    /** After a lens change, rematch flat selection once albums rebuild — never force 3D. */
    const pendingFlatRematchRef = useRef(false);

    const naturalQuery = useMemo(() => parseVaultNaturalQuery(query), [query]);

    const effectiveSort = naturalQuery.sort !== 'relevance' ? naturalQuery.sort : sortMode;
    const effectiveLens = naturalQuery.lensHint || lens;
    const workingAssets = searchHits ?? allAssets;
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

    // Keep lens chip in sync when NL asks for a lens (preserve 3D/flat mode).
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

    // Prefer explicit NL sort when detected.
    useEffect(() => {
        if (naturalQuery.sort !== 'relevance' && naturalQuery.sort !== sortMode) {
            setSortMode(naturalQuery.sort);
        }
    }, [naturalQuery.sort, sortMode]);

    const activeAlbum = useMemo(() => findVaultAlbum(albums, activeAlbumId), [albums, activeAlbumId]);
    const activePage = useMemo(() => findVaultPage(activeAlbum, activePageId), [activeAlbum, activePageId]);

    // Flat view: after lens change, pick the first album/page so the sidebar stays usable.
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

    // Keep the active album expanded so its pages stay visible while browsing.
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
        // Active contextual search is global — never trap hits inside the current album/page.
        if (searchHits) {
            list = searchHits;
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
    }, [activePage, activeAlbum, workingAssets, use3d, naturalQuery.typeFilter, effectiveSort, language, searchHits]);

    const displayedAssets = useMemo(() => {
        // Smart/vector hits are already ranked for the query.
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
    }, [pageSize, activeAlbumId, activePageId, naturalQuery.text, effectiveLens, effectiveSort]);

    // When items-per-page changes, album Page chunks rebuild — keep the same album on page 1.
    useEffect(() => {
        if (!activeAlbumId) return;
        const album = findVaultAlbum(albums, activeAlbumId);
        if (!album) {
            setActiveAlbumId(null);
            setActivePageId(null);
            return;
        }
        if (!activePageId || !album.pages.some((page) => page.id === activePageId)) {
            setActivePageId(album.pages[0]?.id ?? null);
        }
    }, [albums, activeAlbumId, activePageId, pageSize]);

    useEffect(() => {
        if (pageIndex > totalPages - 1) setPageIndex(Math.max(0, totalPages - 1));
    }, [pageIndex, totalPages]);

    // Remember last vault chrome state across sessions.
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
        });
    }, [isOpen, smartSearch, lens, sortMode, query, pageSize, sourcesOpen]);

    const goRoom = useCallback(() => {
        setDepth('page');
        setActiveAlbumId(null);
        setActivePageId(null);
        setUse3d(false);
        setContextMenu(null);
    }, []);

    const goAlbum = useCallback((albumId: string) => {
        setActiveAlbumId(albumId);
        setActivePageId(null);
        setDepth('page');
        setUse3d(false);
        setContextMenu(null);
    }, []);

    const goPage = useCallback((albumId: string, pageId: string) => {
        setActiveAlbumId(albumId);
        setActivePageId(pageId);
        setDepth('page');
        setUse3d(false);
        setContextMenu(null);
    }, []);

    /** Switch organize lens without forcing 3D or remounting the scene camera. */
    const applyOrganizeLens = useCallback((value: VaultOrganizeLens) => {
        if (value === lens) return;
        setLens(value);
        setContextMenu(null);
        setOverflowOpen(false);
        if (use3d) {
            // Album ids change with the lens — return to room, keep camera/orbit state.
            setDepth('room');
            setActiveAlbumId(null);
            setActivePageId(null);
            return;
        }
        pendingFlatRematchRef.current = true;
        setActiveAlbumId(null);
        setActivePageId(null);
        setDepth('page');
    }, [lens, use3d]);

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
        setContextMenu(null);
    }, []);

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
        setContextMenu(null);
    }, []);

    const selectFlatAll = useCallback(() => {
        setUse3d(false);
        setActiveAlbumId(null);
        setActivePageId(null);
        setDepth('page');
        setContextMenu(null);
    }, []);

    const toggleAlbumExpanded = useCallback((albumId: string) => {
        setExpandedAlbumIds((prev) => {
            const next = new Set(prev);
            if (next.has(albumId)) next.delete(albumId);
            else next.add(albumId);
            return next;
        });
    }, []);

    useEscapeKey(() => {
        if (contextMenu) {
            setContextMenu(null);
            return;
        }
        if (detail) {
            setDetail(null);
            return;
        }
        if (overflowOpen) {
            setOverflowOpen(false);
            return;
        }
        if (!use3d) {
            if (activePageId) {
                setActivePageId(null);
                return;
            }
            if (activeAlbumId) {
                setActiveAlbumId(null);
                return;
            }
            onClose();
            return;
        }
        if (depth === 'page') {
            setDepth('album');
            setActivePageId(null);
            return;
        }
        if (depth === 'album') {
            goRoom();
            return;
        }
        onClose();
    }, { enabled: isOpen });

    const runLoad = useCallback(async () => {
        setIsLoading(true);
        try {
            const [list, response] = await Promise.all([
                fetchBookcases().catch(() => [] as Bookcase[]),
                searchVaultUnified({
                    query: '',
                    mode: 'keyword',
                    filter: initialFilter,
                    limit: 200,
                }, owner),
            ]);
            setBookcases(list);
            setAllAssets(response.results.map((entry) => entry.asset));
        } catch (error) {
            console.error('Vault load failed', error);
            setAllAssets([]);
        } finally {
            setIsLoading(false);
        }
    }, [initialFilter, owner]);

    useEffect(() => {
        if (!isOpen) return;
        void runLoad();
    }, [isOpen, runLoad]);

    // First-time empty vault: open Sources so indexing is the obvious next step.
    useEffect(() => {
        if (!isOpen || isLoading) return;
        if (allAssets.length === 0) setSourcesOpen(true);
    }, [isOpen, isLoading, allAssets.length]);

    // Restore flat browse selection when reopening in Files mode.
    useEffect(() => {
        if (!isOpen || use3d || activeAlbumId || albums.length === 0) return;
        const first = albums[0];
        setActiveAlbumId(first.id);
        setActivePageId(first.pages[0]?.id ?? null);
        setDepth('page');
        setExpandedAlbumIds(new Set([first.id]));
    }, [isOpen, use3d, activeAlbumId, albums]);

    // Contextual smart/vector search — the vault’s primary discovery path.
    useEffect(() => {
        if (!isOpen) return;
        const q = naturalQuery.text.trim();
        if (!q) {
            setSearchHits(null);
            setIsSearching(false);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void (async () => {
                setIsSearching(true);
                try {
                    const response = await searchVaultUnified({
                        query: q,
                        mode: smartSearch ? 'smart' : 'keyword',
                        filter: initialFilter,
                        limit: 120,
                    }, owner);
                    if (!cancelled) {
                        setSearchHits(response.results.map((entry) => entry.asset));
                        if (response.expandedTerms?.length) {
                            setStatusMessage(t('vault.smartExpanded', { terms: response.expandedTerms.slice(0, 4).join(', ') }));
                        } else {
                            setStatusMessage(t('vault.searchResultCount', { count: response.results.length }));
                        }
                    }
                } catch (error) {
                    console.error(error);
                    if (!cancelled) {
                        setSearchHits([]);
                        setStatusMessage(t('vault.searchFailed'));
                    }
                } finally {
                    if (!cancelled) setIsSearching(false);
                }
            })();
        }, 280);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [isOpen, naturalQuery.text, smartSearch, initialFilter, owner, t]);

    useEffect(() => {
        if (!isOpen || !focusSearch) return;
        const timer = window.setTimeout(() => searchRef.current?.focus(), 120);
        return () => window.clearTimeout(timer);
    }, [isOpen, focusSearch]);

    // Preview pipeline for file-manager assets
    useEffect(() => {
        if (!isOpen) return;
        if (depth !== 'page' && use3d) return;
        let cancelled = false;
        const assets = pagedAssets.slice(0, 96);
        const activeIds = new Set(assets.map((asset) => asset.id));

        void (async () => {
            const resolvedSources: Record<string, string> = {};
            const resolvedThumbs: Record<string, string> = {};
            for (const asset of assets) {
                if (cancelled) return;
                let source = sourceUrlsRef.current[asset.id];
                if (!source) source = (await resolveVaultPreviewUrl(asset)) || '';
                if (!source) continue;
                resolvedSources[asset.id] = source;

                const existingThumb = thumbnailUrlsRef.current[asset.id];
                if (existingThumb) {
                    resolvedThumbs[asset.id] = existingThumb;
                    continue;
                }
                if (asset.type === 'models' && canRenderModelThumbnail(asset.name)) {
                    try {
                        resolvedThumbs[asset.id] = getCachedModelThumbnail(asset.id)
                            || await renderModelThumbnail(asset.id, source, 256);
                    } catch { /* glyph */ }
                } else if (asset.type === 'videos') {
                    try {
                        resolvedThumbs[asset.id] = getCachedVideoPoster(asset.id)
                            || await captureVideoPoster(asset.id, source, 256);
                    } catch { /* video fallback */ }
                } else if (asset.type !== 'audio') {
                    resolvedThumbs[asset.id] = source;
                }
            }
            if (cancelled) return;
            setSourceUrls((previous) => {
                const merged: Record<string, string> = {};
                for (const id of activeIds) {
                    const url = resolvedSources[id] || previous[id];
                    if (url) merged[id] = url;
                }
                revokeRemovedBlobs(previous, merged);
                return merged;
            });
            setThumbnailUrls((previous) => {
                const merged: Record<string, string> = {};
                for (const id of activeIds) {
                    const url = resolvedThumbs[id] || previous[id];
                    if (url) merged[id] = url;
                }
                return merged;
            });
        })();
        return () => { cancelled = true; };
    }, [isOpen, depth, use3d, pagedAssets]);

    useEffect(() => {
        if (isOpen) return;
        setSourceUrls((previous) => {
            for (const url of Object.values(previous)) {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            }
            return {};
        });
        setThumbnailUrls({});
        setContextMenu(null);
        setDetail(null);
        setDepth('room');
        setActiveAlbumId(null);
        setActivePageId(null);
        setUse3d(true);
    }, [isOpen]);

    useEffect(() => {
        if (!contextMenu) return;
        const onPointerDown = (event: globalThis.MouseEvent) => {
            if (contextMenuRef.current?.contains(event.target as Node)) return;
            setContextMenu(null);
        };
        window.addEventListener('mousedown', onPointerDown);
        return () => window.removeEventListener('mousedown', onPointerDown);
    }, [contextMenu]);

    // When lens changes in room, keep depth at room and clear drill-down
    useEffect(() => {
        if (depth === 'room') {
            setActiveAlbumId(null);
            setActivePageId(null);
        }
    }, [lens, depth]);

    const resolveSourceUrl = async (asset: VaultAssetRecord): Promise<string | null> => {
        if (sourceUrls[asset.id]) return sourceUrls[asset.id];
        const url = await resolveVaultPreviewUrl(asset);
        if (url) setSourceUrls((previous) => ({ ...previous, [asset.id]: url }));
        return url;
    };

    /** Opens classic ThreeDLayerEditor (Studio / Golden Hour / sun gizmo) via the editor event. */
    const openClassic3dViewer = async (asset: VaultAssetRecord) => {
        setContextMenu(null);
        setPreviewPopup(null);
        setDetail(null);
        const url = await resolveSourceUrl(asset);
        if (!url) {
            setStatusMessage(t('vault.previewUnavailable'));
            return;
        }
        window.dispatchEvent(new CustomEvent('iex:open-3d-editor', { detail: { url } }));
        onClose();
    };

    /** Opens classic editor media player (scrub + Capture Frame) — same as canvas media preview. */
    const openClassicMediaPreview = async (asset: VaultAssetRecord) => {
        if (asset.type !== 'videos' && asset.type !== 'audio') return;
        setContextMenu(null);
        setPreviewPopup(null);
        setDetail(null);
        const url = await resolveSourceUrl(asset);
        if (!url) {
            setStatusMessage(t('vault.previewUnavailable'));
            return;
        }
        window.dispatchEvent(new CustomEvent('iex:open-media-preview', {
            detail: { type: asset.type === 'videos' ? 'video' : 'audio', url },
        }));
        onClose();
    };

    const openDetail = async (asset: VaultAssetRecord) => {
        setContextMenu(null);
        setPreviewPopup(null);
        if (asset.type === 'models') {
            await openClassic3dViewer(asset);
            return;
        }
        if (asset.type === 'videos' || asset.type === 'audio') {
            await openClassicMediaPreview(asset);
            return;
        }
        const url = await resolveSourceUrl(asset);
        if (!url) {
            setStatusMessage(t('vault.previewUnavailable'));
            return;
        }
        setDetail({ asset, url });
    };

    const openPreviewPopup = async (asset: VaultAssetRecord, anchor: DOMRect) => {
        if (asset.type !== 'models' && asset.type !== 'videos' && asset.type !== 'audio') return;
        if (loadingPreviewKey === asset.id || previewPopup?.key === asset.id) return;
        try {
            setLoadingPreviewKey(asset.id);
            const url = await resolveSourceUrl(asset);
            if (!url) return;
            const previewWidth = Math.max(280, Math.round(anchor.width * 2.2));
            const previewHeight = Math.max(280, Math.round(anchor.height * 2.2));
            const pad = 12;
            const maxX = Math.max(pad, window.innerWidth - previewWidth - pad);
            const maxY = Math.max(pad, window.innerHeight - previewHeight - pad);
            const x = Math.min(maxX, anchor.right + 12);
            const y = Math.max(pad, Math.min(maxY, anchor.top + Math.round((anchor.height - previewHeight) / 2)));
            setPreviewPopup({
                key: asset.id,
                asset,
                url,
                x,
                y,
                width: previewWidth,
                height: previewHeight,
            });
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingPreviewKey((current) => (current === asset.id ? null : current));
        }
    };

    const handleAddToCanvas = async (asset: VaultAssetRecord, knownUrl?: string) => {
        const url = knownUrl || await resolveSourceUrl(asset);
        if (!url) {
            setStatusMessage(t('vault.previewUnavailable'));
            return;
        }
        onSelect(url, asset.type as AssetType, asset.name);
        onClose();
    };

    const handleFindSimilar = async (asset: VaultAssetRecord, createBookcase: boolean) => {
        setIsFindingSimilar(true);
        setStatusMessage(null);
        setContextMenu(null);
        try {
            const result = await findSimilarVaultAssets({
                assetId: asset.id,
                limit: 24,
                createBookcase,
            });
            const similarAssets = [result.seed, ...result.results.map((entry) => entry.asset)];
            setAllAssets((prev) => {
                const byId = new Map(prev.map((entry) => [entry.id, entry]));
                for (const entry of similarAssets) byId.set(entry.id, entry);
                return Array.from(byId.values());
            });

            if (result.bookcase) {
                setBookcases(await fetchBookcases());
                setLens('subject');
                setUse3d(false);
                goRoom();
                setStatusMessage(t('vault.clusterCreated', { name: result.bookcase.name }));
            } else {
                const bookcaseId = `similar_${asset.id}`;
                const albumId = `album_subject_${bookcaseId}`;
                const pageId = `${albumId}::page_1`;
                setBookcases((prev) => [
                    ...prev.filter((bc) => bc.id !== bookcaseId),
                    {
                        id: bookcaseId,
                        name: t('vault.similarTo', { name: asset.name }),
                        kind: 'search-result',
                        manualAssetIds: similarAssets.map((entry) => entry.id),
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                ]);
                setLens('subject');
                setActiveAlbumId(albumId);
                setActivePageId(pageId);
                setDepth('page');
                setUse3d(false);
                setStatusMessage(t('vault.similarFound', { count: result.total }));
            }
            setDetail(null);
        } catch (error) {
            console.error(error);
            setStatusMessage(t('vault.similarFailed'));
        } finally {
            setIsFindingSimilar(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setOverflowOpen(false);
        try {
            await syncVaultCatalog();
            await runLoad();
        } finally {
            setIsSyncing(false);
        }
    };

    const handleEnrich = async () => {
        setIsEnriching(true);
        setOverflowOpen(false);
        setStatusMessage(null);
        try {
            const result = await enrichVaultCatalog({ limit: 12, caption: true, embed: true });
            setStatusMessage(t('vault.enrichDone', { captioned: result.captioned, embedded: result.embedded }));
            await runLoad();
        } catch (error) {
            console.error(error);
            setStatusMessage(t('vault.enrichFailed'));
        } finally {
            setIsEnriching(false);
        }
    };

    const createManualAlbum = async () => {
        setOverflowOpen(false);
        const name = (await dialog.prompt(t('vault.newAlbumPrompt'), {
            title: t('vault.newAlbumTitle'),
            placeholder: t('vault.newAlbumPlaceholder'),
            confirmText: t('vault.createAlbum'),
            cancelText: t('common.cancel'),
        }))?.trim();
        if (!name) return;
        try {
            const authorization = buildSessionAuthorizationHeader();
            await fetch('/api/assets/vault/bookcases', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(authorization ? { Authorization: authorization } : {}),
                },
                body: JSON.stringify({
                    name,
                    kind: 'manual',
                    manualAssetIds: displayedAssets.slice(0, 40).map((asset) => asset.id),
                }),
            });
            setBookcases(await fetchBookcases());
            pendingFlatRematchRef.current = !use3d;
            setLens('subject');
            if (use3d) {
                setDepth('room');
                setActiveAlbumId(null);
                setActivePageId(null);
            } else {
                setActiveAlbumId(null);
                setActivePageId(null);
                setDepth('page');
            }
            setStatusMessage(t('vault.albumCreated', { name }));
        } catch (error) {
            console.error(error);
        }
    };

    const openContextMenu = (target: ContextTarget, event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const menuWidth = 220;
        const menuHeight = 240;
        const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
        const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
        setContextMenu({ target, x: Math.max(8, x), y: Math.max(8, y) });
    };

    const labelOf = useCallback(
        (entry: { label: string; labelKey?: string; labelParams?: Record<string, string | number> }) => (
            resolveVaultLabel(entry, t, language)
        ),
        [t, language],
    );

    const lensLabel = (value: VaultOrganizeLens) => {
        switch (value) {
            case 'type': return t('vault.lensType');
            case 'date': return t('vault.lensDate');
            case 'location': return t('vault.lensLocation');
            case 'subject': return t('vault.lensSubject');
            default: return value;
        }
    };

    const renderAssetCard = (asset: VaultAssetRecord) => {
        const thumb = thumbnailUrls[asset.id];
        const source = sourceUrls[asset.id];
        const supportsHoverPreview = asset.type === 'models' || asset.type === 'videos' || asset.type === 'audio';
        return (
            <div
                key={asset.id}
                className="group relative rounded-md border border-border bg-card overflow-hidden hover:border-primary/40 transition-all text-left"
                onContextMenu={(event) => openContextMenu({ kind: 'asset', asset }, event)}
                onMouseEnter={(event) => {
                    if (!supportsHoverPreview) return;
                    setPreviewHoverKey(asset.id);
                    void openPreviewPopup(asset, event.currentTarget.getBoundingClientRect());
                }}
                onMouseLeave={() => {
                    if (!supportsHoverPreview) return;
                    window.setTimeout(() => {
                        setPreviewPopup((current) => {
                            if (!current || current.key !== asset.id) return current;
                            if (previewHoverKey === asset.id) return current;
                            return null;
                        });
                    }, 60);
                }}
            >
                <button
                    type="button"
                    onClick={() => {
                        if (asset.type === 'models') {
                            void openClassic3dViewer(asset);
                            return;
                        }
                        if (asset.type === 'videos' || asset.type === 'audio') {
                            void openClassicMediaPreview(asset);
                            return;
                        }
                        void openDetail(asset);
                    }}
                    onDoubleClick={() => void handleAddToCanvas(asset)}
                    className="w-full text-left"
                >
                    <div className="aspect-square bg-secondary/20 flex items-center justify-center relative overflow-hidden">
                        {!thumb && !source && asset.type !== 'audio' && (
                            <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        )}
                        {asset.type === 'videos' && (thumb || source) && (
                            thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt={asset.name} className="w-full h-full object-cover" />
                            ) : (
                                <video src={videoSrcWithPosterSeek(source!)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                            )
                        )}
                        {asset.type === 'models' && (
                            thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt={asset.name} className="w-full h-full object-contain bg-secondary/30" />
                            ) : <Box size={24} className="text-muted-foreground" />
                        )}
                        {asset.type === 'images' && (thumb || source) && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb || source} alt={asset.name} className="w-full h-full object-cover" />
                        )}
                        {asset.type === 'audio' && <Music size={24} className="text-muted-foreground" />}
                        <span className="absolute bottom-1 left-1 text-[9px] px-1 py-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100">
                            {t(CONNECTOR_KEYS[asset.origin.connector] || 'vault.connector.server')}
                        </span>
                    </div>
                    <div className="p-1.5 pr-6">
                        <p className="text-[11px] font-medium truncate" title={asset.name}>{asset.name}</p>
                    </div>
                </button>
                <button
                    type="button"
                    onClick={(event) => openContextMenu({ kind: 'asset', asset }, event)}
                    className="absolute top-1 right-1 h-5 w-5 rounded bg-black/45 text-white opacity-0 group-hover:opacity-100 inline-flex items-center justify-center"
                    aria-label={t('vault.assetActions')}
                >
                    <MoreVertical size={11} />
                </button>
            </div>
        );
    };

    if (!isOpen) return null;

    const showSearchResults = searchHits !== null;
    const showFileManager = true;

    return (
        <>
            <div className="fixed inset-0 z-[120] pointer-events-none">
                <DraggableResizablePanel
                    className="pointer-events-auto bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200"
                    initialPosition={{ x: 72, y: 96 }}
                    initialSize={{ width: 960, height: 640 }}
                    minWidth={720}
                    minHeight={480}
                >
                    <div className="flex flex-col h-full min-h-0 bg-background">
                        {/* Compact header */}
                        <div className="h-8 px-2 border-b border-border flex items-center gap-2 bg-secondary/10 draggable-handle cursor-move shrink-0">
                            <Archive size={12} className="text-primary shrink-0" />
                            <span className="text-xs font-semibold shrink-0">{t('vault.title')}</span>
                            <div className="flex items-center gap-0.5 min-w-0 text-[10px] text-muted-foreground">
                                <button type="button" className="hover:text-foreground truncate" onClick={goRoom}>
                                    {t('vault.title')}
                                </button>
                                {activeAlbum && (
                                    <>
                                        <ChevronRight size={10} className="shrink-0 opacity-60" />
                                        <button
                                            type="button"
                                            className="hover:text-foreground truncate max-w-[120px]"
                                            onClick={() => {
                                                if (use3d) {
                                                    goAlbum(activeAlbum.id);
                                                } else {
                                                    selectFlatAlbum(activeAlbum);
                                                }
                                            }}
                                        >
                                            {labelOf(activeAlbum)}
                                        </button>
                                    </>
                                )}
                                {activePage && (
                                    <>
                                        <ChevronRight size={10} className="shrink-0 opacity-60" />
                                        <span className="truncate max-w-[120px] text-foreground/80">{labelOf(activePage)}</span>
                                    </>
                                )}
                            </div>
                            <div className="flex-1" />
                            <button
                                type="button"
                                onClick={onClose}
                                className="h-6 w-6 rounded inline-flex items-center justify-center text-muted-foreground hover:bg-secondary"
                                aria-label={t('common.close')}
                            >
                                <X size={12} />
                            </button>
                        </div>

                        {/* Compact toolbar */}
                        <div className="h-9 px-2 border-b border-border flex items-center gap-1.5 bg-secondary/5 shrink-0">
                            <div className="relative flex-1 min-w-[120px] max-w-xs">
                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    ref={searchRef}
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder={t('vault.searchPlaceholderContext')}
                                    className="w-full h-7 pl-7 pr-2 rounded-md bg-background border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                                />
                                {isSearching && (
                                    <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                                )}
                            </div>

                            <label
                                className={cn(
                                    'h-7 px-2 rounded-md border text-[10px] inline-flex items-center gap-1 cursor-pointer select-none shrink-0',
                                    smartSearch ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary',
                                )}
                                title={t('vault.smartSearch')}
                            >
                                <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={smartSearch}
                                    onChange={(event) => setSmartSearch(event.target.checked)}
                                />
                                <Sparkles size={11} />
                                {t('vault.smart')}
                            </label>

                            <select
                                value={sortMode}
                                onChange={(event) => setSortMode(event.target.value as VaultSortMode)}
                                className="h-7 max-w-[112px] rounded-md border border-border bg-background px-1.5 text-[10px] text-foreground"
                                title={t('vault.sortLabel')}
                                aria-label={t('vault.sortLabel')}
                            >
                                <option value="relevance">{t('vault.sortRelevance')}</option>
                                <option value="name-asc">{t('vault.sortNameAsc')}</option>
                                <option value="name-desc">{t('vault.sortNameDesc')}</option>
                                <option value="newest">{t('vault.sortNewest')}</option>
                                <option value="oldest">{t('vault.sortOldest')}</option>
                                <option value="largest">{t('vault.sortLargest')}</option>
                                <option value="smallest">{t('vault.sortSmallest')}</option>
                                <option value="type">{t('vault.sortType')}</option>
                            </select>

                            <div className="flex items-center rounded-md border border-border overflow-hidden">
                                {VAULT_ORGANIZE_LENSES.map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => applyOrganizeLens(value)}
                                        className={cn(
                                            'h-7 px-2 text-[10px] font-medium',
                                            effectiveLens === value ? 'bg-primary/15 text-primary' : 'hover:bg-secondary text-muted-foreground',
                                        )}
                                        title={lensLabel(value)}
                                    >
                                        {lensLabel(value)}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => setSourcesOpen((prev) => !prev)}
                                className={cn(
                                    'h-7 px-2 rounded-md border text-[10px] inline-flex items-center gap-1',
                                    sourcesOpen ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border hover:bg-secondary text-muted-foreground',
                                )}
                                title={t('vault.browseDriveFolder')}
                            >
                                <HardDrive size={11} />
                                <span className="hidden sm:inline">{t('vault.browseDriveFolder')}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => void handleEnrich()}
                                disabled={isEnriching}
                                className="h-7 px-2 rounded-md border border-border text-[10px] inline-flex items-center gap-1 hover:bg-secondary text-muted-foreground disabled:opacity-50"
                                title={t('vault.aiIndex')}
                            >
                                {isEnriching ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                                <span className="hidden md:inline">{t('vault.aiIndex')}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => void handleSync()}
                                disabled={isSyncing}
                                className="h-7 px-2 rounded-md border border-border text-[10px] inline-flex items-center gap-1 hover:bg-secondary text-muted-foreground disabled:opacity-50"
                                title={t('vault.sync')}
                            >
                                {isSyncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                            </button>

                            {onOpenClassicLibrary && (
                                <button
                                    type="button"
                                    onClick={() => { onOpenClassicLibrary(); onClose(); }}
                                    className="h-7 px-2 rounded-md border border-border text-[10px] inline-flex items-center gap-1 hover:bg-secondary text-muted-foreground"
                                    title={t('vault.classicLibrary')}
                                >
                                    <Archive size={11} />
                                    <span className="hidden sm:inline">{t('vault.classicLibrary')}</span>
                                </button>
                            )}

                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setOverflowOpen((prev) => !prev)}
                                    className="h-7 w-7 rounded-md border border-border inline-flex items-center justify-center hover:bg-secondary text-muted-foreground"
                                    title={t('vault.moreActions')}
                                >
                                    <MoreVertical size={12} />
                                </button>
                                {overflowOpen && (
                                    <div className="absolute right-0 top-8 z-20 w-48 rounded-md border border-border bg-popover shadow-lg p-1">
                                        <button type="button" className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2" onClick={() => { setOverflowOpen(false); setSourcesOpen(true); }}>
                                            <HardDrive size={12} /> {t('vault.sourcesTitle')}
                                        </button>
                                        <button type="button" className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2" onClick={() => void createManualAlbum()}>
                                            <FolderPlus size={12} /> {t('vault.newAlbum')}
                                        </button>
                                        <button type="button" className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2" onClick={() => void handleEnrich()} disabled={isEnriching}>
                                            {isEnriching ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} {t('vault.aiIndex')}
                                        </button>
                                        <button type="button" className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2" onClick={() => void handleSync()} disabled={isSyncing}>
                                            {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {t('vault.sync')}
                                        </button>
                                        {onOpenClassicLibrary && (
                                            <button
                                                type="button"
                                                className="w-full h-7 px-2 rounded text-[11px] text-left hover:bg-secondary inline-flex items-center gap-2"
                                                onClick={() => { setOverflowOpen(false); onOpenClassicLibrary(); onClose(); }}
                                            >
                                                <Archive size={12} /> {t('vault.classicLibrary')}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {sourcesOpen && (
                            <VaultSourcesPanel
                                onClose={() => setSourcesOpen(false)}
                                onIndexed={() => {
                                    void runLoad();
                                    setStatusMessage(t('vault.sourceIndexedRefresh'));
                                }}
                            />
                        )}

                        <main className="flex-1 min-h-0 p-2 overflow-hidden">
                            {isLoading && allAssets.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted-foreground gap-2 text-xs">
                                    <Loader2 size={16} className="animate-spin" />
                                    {t('common.loading')}
                                </div>
                            ) : (
                                <div className="h-full flex min-h-0 border border-border/60 rounded-md overflow-hidden bg-card/30">
                                    {!showSearchResults && (
                                        <aside
                                            className="w-48 shrink-0 border-r border-border/50 bg-card/50 flex flex-col min-h-0"
                                            data-testid="vault-flat-sidebar"
                                        >
                                            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/40">
                                                {t('vault.albums')} · {lensLabel(effectiveLens)}
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                                                <button
                                                    type="button"
                                                    onClick={selectFlatAll}
                                                    className={cn(
                                                        'w-full h-7 px-2 rounded text-[11px] text-left inline-flex items-center gap-1.5',
                                                        !activeAlbumId
                                                            ? 'bg-primary/15 text-primary'
                                                            : 'hover:bg-secondary text-muted-foreground',
                                                    )}
                                                >
                                                    <Archive size={12} className="shrink-0" />
                                                    <span className="truncate flex-1">{t('vault.allAssets')}</span>
                                                    <span className="text-[9px] opacity-70">{workingAssets.length}</span>
                                                </button>
                                                {albums.map((album) => {
                                                    const albumActive = album.id === activeAlbumId;
                                                    const expanded = expandedAlbumIds.has(album.id);
                                                    const hasPages = album.pages.length > 0;
                                                    return (
                                                        <div key={album.id} className="space-y-0.5">
                                                            <div className="flex items-center gap-0.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => hasPages && toggleAlbumExpanded(album.id)}
                                                                    className={cn(
                                                                        'h-7 w-5 shrink-0 rounded inline-flex items-center justify-center text-muted-foreground',
                                                                        hasPages ? 'hover:bg-secondary hover:text-foreground' : 'opacity-30 pointer-events-none',
                                                                    )}
                                                                    aria-expanded={expanded}
                                                                    aria-label={expanded ? t('vault.collapseAlbum') : t('vault.expandAlbum')}
                                                                    title={expanded ? t('vault.collapseAlbum') : t('vault.expandAlbum')}
                                                                >
                                                                    {expanded
                                                                        ? <ChevronDown size={12} />
                                                                        : <ChevronRight size={12} />}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => selectFlatAlbum(album)}
                                                                    onDoubleClick={() => hasPages && toggleAlbumExpanded(album.id)}
                                                                    onContextMenu={(event) => openContextMenu({ kind: 'album', album }, event)}
                                                                    className={cn(
                                                                        'flex-1 min-w-0 h-7 px-1.5 rounded text-[11px] text-left inline-flex items-center gap-1.5',
                                                                        albumActive && !activePageId
                                                                            ? 'bg-primary/15 text-primary'
                                                                            : albumActive
                                                                                ? 'bg-secondary/80 text-foreground'
                                                                                : 'hover:bg-secondary text-muted-foreground',
                                                                    )}
                                                                    title={labelOf(album)}
                                                                >
                                                                    <Folder size={12} className="shrink-0" />
                                                                    <span className="truncate flex-1">{labelOf(album)}</span>
                                                                    <span className="text-[9px] opacity-70">{album.assetCount}</span>
                                                                </button>
                                                            </div>
                                                            {expanded && album.pages.map((page) => (
                                                                <button
                                                                    key={page.id}
                                                                    type="button"
                                                                    onClick={() => selectFlatPage(album.id, page.id)}
                                                                    onContextMenu={(event) => openContextMenu({ kind: 'page', page, album }, event)}
                                                                    className={cn(
                                                                        'w-full h-6 pl-7 pr-2 rounded text-[10px] text-left inline-flex items-center gap-1.5',
                                                                        page.id === activePageId
                                                                            ? 'bg-primary/15 text-primary'
                                                                            : 'hover:bg-secondary text-muted-foreground',
                                                                    )}
                                                                    title={labelOf(page)}
                                                                >
                                                                    <span className="truncate flex-1">{labelOf(page)}</span>
                                                                    <span className="text-[9px] opacity-70">{page.assetIds.length}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </aside>
                                    )}
                                    <div className="flex-1 min-w-0 overflow-y-auto p-2">
                                        {displayedAssets.length === 0 ? (
                                            <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-muted-foreground gap-2 px-6 text-center">
                                                <HardDrive size={28} className="opacity-40" />
                                                <p className="text-sm">{t('vault.empty')}</p>
                                                <p className="text-xs max-w-sm">{t('vault.emptyHintSources')}</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setSourcesOpen(true)}
                                                    className="mt-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold inline-flex items-center gap-1.5"
                                                >
                                                    <HardDrive size={12} />
                                                    {t('vault.browseDriveFolder')}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="min-h-0">
                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 pb-2">
                                                    {pagedAssets.map(renderAssetCard)}
                                                </div>
                                                {pageSize !== 'all' && (totalPages > 1 || (activeAlbum && activeAlbum.pageCount > 1)) && (
                                                    <div className="sticky bottom-0 flex items-center justify-center gap-2 py-2 bg-background/90 border-t border-border/40">
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                activeAlbum && activeAlbum.pageCount > 1
                                                                    ? (activeAlbum.pages.findIndex((page) => page.id === activePageId) <= 0)
                                                                    : pageIndex <= 0
                                                            }
                                                            onClick={() => {
                                                                if (activeAlbum && activeAlbum.pageCount > 1) {
                                                                    const idx = activeAlbum.pages.findIndex((page) => page.id === activePageId);
                                                                    const prev = activeAlbum.pages[Math.max(0, idx - 1)];
                                                                    if (prev) setActivePageId(prev.id);
                                                                    return;
                                                                }
                                                                setPageIndex((prev) => Math.max(0, prev - 1));
                                                            }}
                                                            className="h-6 px-2 rounded border border-border text-[10px] disabled:opacity-40 hover:bg-secondary"
                                                        >
                                                            {t('common.back')}
                                                        </button>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {activeAlbum && activeAlbum.pageCount > 1
                                                                ? t('vault.pageOf', {
                                                                    page: Math.max(1, activeAlbum.pages.findIndex((page) => page.id === activePageId) + 1),
                                                                    total: activeAlbum.pageCount,
                                                                })
                                                                : t('vault.pageOf', { page: pageIndex + 1, total: totalPages })}
                                                            {' · '}
                                                            {t('vault.resultCount', { count: displayedAssets.length })}
                                                            {' / '}
                                                            {pageSize === 'all' ? t('vault.pageSizeAll') : pageSize}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                activeAlbum && activeAlbum.pageCount > 1
                                                                    ? (activeAlbum.pages.findIndex((page) => page.id === activePageId) >= activeAlbum.pageCount - 1)
                                                                    : pageIndex >= totalPages - 1
                                                            }
                                                            onClick={() => {
                                                                if (activeAlbum && activeAlbum.pageCount > 1) {
                                                                    const idx = activeAlbum.pages.findIndex((page) => page.id === activePageId);
                                                                    const next = activeAlbum.pages[Math.min(activeAlbum.pageCount - 1, idx + 1)];
                                                                    if (next) setActivePageId(next.id);
                                                                    return;
                                                                }
                                                                setPageIndex((prev) => Math.min(totalPages - 1, prev + 1));
                                                            }}
                                                            className="h-6 px-2 rounded border border-border text-[10px] disabled:opacity-40 hover:bg-secondary"
                                                        >
                                                            {t('common.next')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </main>

                        <div className="h-6 px-2 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between gap-2 shrink-0">
                            <span className="truncate">
                                {statusMessage
                                    || (showFileManager
                                        ? t('vault.resultCount', { count: displayedAssets.length })
                                        : t('vault.albumCount', { count: albums.length }))}
                            </span>
                            <div className="inline-flex items-center gap-2 shrink-0">
                                {showFileManager && (
                                    <label className="inline-flex items-center gap-1" title={t('vault.pageSize')}>
                                        <span className="hidden sm:inline">{t('vault.pageSize')}</span>
                                        <select
                                            value={String(pageSize)}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setPageSize(value === 'all' ? 'all' : Number(value) as 24 | 48 | 96);
                                            }}
                                            className="h-5 max-w-[72px] rounded border border-border bg-background px-1 text-[10px] text-foreground"
                                            aria-label={t('vault.pageSize')}
                                        >
                                            <option value="24">24</option>
                                            <option value="48">48</option>
                                            <option value="96">96</option>
                                            <option value="all">{t('vault.pageSizeAll')}</option>
                                        </select>
                                    </label>
                                )}
                                <span className="inline-flex items-center gap-1">
                                    <HardDrive size={10} /> {t('vault.betaNote')}
                                </span>
                            </div>
                        </div>
                    </div>
                </DraggableResizablePanel>
            </div>

            {detail && (
                <div
                    className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
                    onClick={() => setDetail(null)}
                >
                    <div
                        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="p-2.5 border-b border-border flex items-center justify-between shrink-0">
                            <h3 className="font-semibold text-sm flex items-center gap-2 min-w-0">
                                <ImageIcon size={14} className="text-primary" />
                                <span className="truncate">{detail.asset.name}</span>
                            </h3>
                            <button type="button" onClick={() => setDetail(null)} className="p-1 hover:bg-secondary rounded-full">
                                <X size={14} />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 p-3 bg-secondary/10 flex items-center justify-center overflow-visible">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={detail.url} alt={detail.asset.name} className="max-w-full max-h-[60vh] object-contain rounded-md" />
                        </div>
                        <div className="p-2.5 border-t border-border flex items-center justify-between gap-2 shrink-0">
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2 min-w-0">
                                <Globe size={11} />
                                <span className="truncate">{detail.asset.origin.displayPath}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                <button
                                    type="button"
                                    onClick={() => void handleFindSimilar(detail.asset, false)}
                                    disabled={isFindingSimilar}
                                    className="h-8 px-2.5 rounded-md border border-border text-[11px] hover:bg-secondary inline-flex items-center gap-1 disabled:opacity-50"
                                >
                                    <Sparkles size={12} /> {t('vault.findSimilar')}
                                </button>
                                {onOpenClassicLibrary && (
                                    <button
                                        type="button"
                                        onClick={() => { onOpenClassicLibrary(); setDetail(null); onClose(); }}
                                        className="h-8 px-2.5 rounded-md border border-border text-[11px] hover:bg-secondary"
                                    >
                                        {t('vault.manageClassic')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => void handleAddToCanvas(detail.asset, detail.url)}
                                    className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold inline-flex items-center gap-1.5"
                                >
                                    <Plus size={12} /> {t('assets.addToCanvas')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {previewPopup && (
                <div
                    className="fixed z-[135] bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        left: previewPopup.x,
                        top: previewPopup.y,
                        width: previewPopup.width,
                        height: previewPopup.height,
                    }}
                    onMouseEnter={() => setPreviewHoverKey(previewPopup.key)}
                    onMouseLeave={() => {
                        setPreviewHoverKey(null);
                        setPreviewPopup(null);
                    }}
                >
                    <div className="p-2 border-b border-border flex items-center justify-between bg-secondary/10">
                        <h3 className="font-semibold text-xs flex items-center gap-2 min-w-0">
                            {previewPopup.asset.type === 'videos' ? <Video size={14} className="text-primary shrink-0" />
                                : previewPopup.asset.type === 'audio' ? <Music size={14} className="text-primary shrink-0" />
                                : <Box size={14} className="text-primary shrink-0" />}
                            <span className="truncate" title={previewPopup.asset.name}>{previewPopup.asset.name}</span>
                        </h3>
                        <button
                            type="button"
                            onClick={() => setPreviewPopup(null)}
                            className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground"
                            aria-label={t('common.close')}
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <div className="h-[calc(100%-41px)] p-2 bg-secondary/10 flex items-center justify-center overflow-visible">
                        {previewPopup.asset.type === 'videos' ? (
                            <video src={previewPopup.url} className="max-w-full max-h-full" controls autoPlay muted playsInline />
                        ) : previewPopup.asset.type === 'audio' ? (
                            <div className="w-full flex flex-col items-center gap-3 text-muted-foreground">
                                <Music size={32} />
                                <audio src={previewPopup.url} className="w-full" controls autoPlay />
                            </div>
                        ) : (
                            <Asset3DPreview url={previewPopup.url} className="h-full" />
                        )}
                    </div>
                </div>
            )}

            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-[140] w-56 rounded-lg border border-border bg-popover shadow-xl p-1"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onContextMenu={(event) => event.preventDefault()}
                    role="menu"
                >
                    {contextMenu.target.kind === 'album' && (
                        <>
                            <button
                                type="button"
                                role="menuitem"
                                className="w-full h-8 px-2 rounded-md text-xs text-left hover:bg-secondary inline-flex items-center gap-2"
                                onClick={() => {
                                    if (contextMenu.target.kind !== 'album') return;
                                    selectFlatAlbum(contextMenu.target.album);
                                    setContextMenu(null);
                                }}
                            >
                                <Box size={13} /> {t('vault.openAlbum')}
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                className="w-full h-8 px-2 rounded-md text-xs text-left hover:bg-secondary inline-flex items-center gap-2"
                                onClick={() => {
                                    if (contextMenu.target.kind !== 'album') return;
                                    const album = contextMenu.target.album;
                                    const page = album.pages[0];
                                    if (page) goPage(album.id, page.id);
                                }}
                            >
                                <LayoutGrid size={13} /> {t('vault.browseAssets')}
                            </button>
                        </>
                    )}
                    {contextMenu.target.kind === 'page' && (
                        <button
                            type="button"
                            role="menuitem"
                            className="w-full h-8 px-2 rounded-md text-xs text-left hover:bg-secondary inline-flex items-center gap-2"
                            onClick={() => {
                                if (contextMenu.target.kind !== 'page') return;
                                goPage(contextMenu.target.album.id, contextMenu.target.page.id);
                            }}
                        >
                            <LayoutGrid size={13} /> {t('vault.openPage')}
                        </button>
                    )}
                    {contextMenu.target.kind === 'asset' && (
                        <>
                            <button
                                type="button"
                                role="menuitem"
                                className="w-full h-8 px-2 rounded-md text-xs text-left hover:bg-secondary inline-flex items-center gap-2"
                                onClick={() => {
                                    if (contextMenu.target.kind !== 'asset') return;
                                    const asset = contextMenu.target.asset;
                                    if (asset.type === 'models') {
                                        void openClassic3dViewer(asset);
                                        return;
                                    }
                                    if (asset.type === 'videos' || asset.type === 'audio') {
                                        void openClassicMediaPreview(asset);
                                        return;
                                    }
                                    void openDetail(asset);
                                }}
                            >
                                <ImageIcon size={13} />
                                {contextMenu.target.asset.type === 'models' ? t('vault.open3dPreview') : t('vault.openPreview')}
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                className="w-full h-8 px-2 rounded-md text-xs text-left hover:bg-secondary inline-flex items-center gap-2"
                                onClick={() => {
                                    if (contextMenu.target.kind !== 'asset') return;
                                    void handleAddToCanvas(contextMenu.target.asset);
                                }}
                            >
                                <ImagePlus size={13} /> {t('assets.addToCanvas')}
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                className="w-full h-8 px-2 rounded-md text-xs text-left hover:bg-secondary inline-flex items-center gap-2"
                                onClick={() => {
                                    if (contextMenu.target.kind !== 'asset') return;
                                    void handleFindSimilar(contextMenu.target.asset, false);
                                }}
                            >
                                <Sparkles size={13} /> {t('vault.findSimilar')}
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                className="w-full h-8 px-2 rounded-md text-xs text-left hover:bg-secondary inline-flex items-center gap-2"
                                onClick={() => {
                                    if (contextMenu.target.kind !== 'asset') return;
                                    void handleFindSimilar(contextMenu.target.asset, true);
                                }}
                            >
                                <FolderPlus size={13} /> {t('vault.createCluster')}
                            </button>
                        </>
                    )}
                    <div className="my-1 border-t border-border" />
                    {onOpenClassicLibrary && (
                        <button
                            type="button"
                            role="menuitem"
                            className="w-full h-8 px-2 rounded-md text-xs text-left hover:bg-secondary inline-flex items-center gap-2"
                            onClick={() => {
                                setContextMenu(null);
                                onOpenClassicLibrary();
                                onClose();
                            }}
                        >
                            <Archive size={13} /> {t('vault.manageClassic')}
                        </button>
                    )}
                    <p className="px-2 py-1.5 text-[10px] text-muted-foreground leading-snug">
                        {t('vault.crudInClassic')}
                    </p>
                </div>
            )}
        </>
    );
}
