'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import DraggableResizablePanel from '@/components/ui/DraggableResizablePanel';
import VaultSourcesPanel from '@/components/AssetVault/VaultSourcesPanel';
import VaultModalToolbar from '@/components/AssetVault/VaultModalToolbar';
import VaultFlatSidebar from '@/components/AssetVault/VaultFlatSidebar';
import VaultFolderTreeSidebar from '@/components/AssetVault/VaultFolderTreeSidebar';
import VaultNavModeSwitch from '@/components/AssetVault/VaultNavModeSwitch';
import VaultSourceSwitch from '@/components/AssetVault/VaultSourceSwitch';
import VaultAssetGridPanel from '@/components/AssetVault/VaultAssetGridPanel';
import VaultAssetDetailsPanel from '@/components/AssetVault/VaultAssetDetailsPanel';
import VaultModalFooter from '@/components/AssetVault/VaultModalFooter';
import VaultModalOverlays from '@/components/AssetVault/VaultModalOverlays';
import { useVaultCatalog } from '@/components/AssetVault/useVaultCatalog';
import { useVaultBrowse } from '@/components/AssetVault/useVaultBrowse';
import { useVaultPreviews } from '@/components/AssetVault/useVaultPreviews';
import { useI18n } from '@/providers/I18nProvider';
import { useDialog } from '@/providers/DialogProvider';
import { buildSessionAuthorizationHeader } from '@/lib/authSession';
import {
    fetchBookcases,
    findSimilarVaultAssets,
} from '@/features/asset-vault/application/client/vaultApiClient';
import {
    preferredVaultTypeAlbumId,
    uploadFilesToVaultLocal,
} from '@/features/asset-vault/application/client/vaultUpload';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type { AssetVaultModalProps } from '@/components/AssetVault/vaultModalTypes';

export type { AssetVaultModalProps } from '@/components/AssetVault/vaultModalTypes';

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
    const clearContextMenuRef = useRef<() => void>(() => {});
    const onClearContextMenu = useCallback(() => clearContextMenuRef.current(), []);

    const catalog = useVaultCatalog({ isOpen, owner, initialFilter, t });

    const browse = useVaultBrowse({
        isOpen,
        workingAssets: catalog.workingAssets,
        bookcases: catalog.bookcases,
        searchHits: catalog.searchHits,
        naturalQuery: catalog.naturalQuery,
        query: catalog.query,
        smartSearch: catalog.smartSearch,
        language,
        t,
        onClearContextMenu,
    });

    const previews = useVaultPreviews({
        isOpen,
        depth: browse.depth,
        use3d: browse.use3d,
        pagedAssets: browse.pagedAssets,
        onClose,
        onSelect,
        setStatusMessage: catalog.setStatusMessage,
        t,
    });

    clearContextMenuRef.current = () => previews.setContextMenu(null);

    /**
     * The asset shown in the details panel. Held here rather than in the grid
     * so it survives paging and lens changes — the panel should not blank
     * because the user moved to page 2.
     */
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

    /**
     * Resolved from the working set rather than stored, so the panel follows
     * the asset if the catalog reloads. Falls back to null when the selection
     * is no longer in the current results.
     */
    const selectedAsset = selectedAssetId
        ? catalog.workingAssets.find((entry) => entry.id === selectedAssetId) ?? null
        : null;
    const selectedMatch = selectedAssetId
        ? catalog.searchMatchById?.get(selectedAssetId) ?? null
        : null;

    const [isFindingSimilar, setIsFindingSimilar] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Always start with Sources closed — user opens Browse drive/folder explicitly.
    // Destructured because a member expression cannot be tracked as a
    // dependency; `setSourcesOpen` is a useState setter and so is stable.
    const { setSourcesOpen } = browse;
    useEffect(() => {
        if (!isOpen) return;
        setSourcesOpen(false);
    }, [isOpen, setSourcesOpen]);

    useEffect(() => {
        if (!isOpen || !focusSearch) return;
        const timer = window.setTimeout(() => searchRef.current?.focus(), 120);
        return () => window.clearTimeout(timer);
    }, [isOpen, focusSearch]);

    useEscapeKey(() => {
        if (previews.contextMenu) {
            previews.setContextMenu(null);
            return;
        }
        if (previews.detail) {
            previews.setDetail(null);
            return;
        }
        if (browse.overflowOpen) {
            browse.setOverflowOpen(false);
            return;
        }
        if (!browse.use3d) {
            if (browse.activePageId) {
                browse.setActivePageId(null);
                return;
            }
            if (browse.activeAlbumId) {
                browse.setActiveAlbumId(null);
                return;
            }
            onClose();
            return;
        }
        if (browse.depth === 'page') {
            browse.setDepth('album');
            browse.setActivePageId(null);
            return;
        }
        if (browse.depth === 'album') {
            browse.goRoom();
            return;
        }
        onClose();
    }, { enabled: isOpen });

    const handleFindSimilar = async (asset: VaultAssetRecord, createBookcase: boolean) => {
        setIsFindingSimilar(true);
        catalog.setStatusMessage(null);
        previews.setContextMenu(null);
        try {
            const result = await findSimilarVaultAssets({
                assetId: asset.id,
                limit: 24,
                createBookcase,
            });
            const similarAssets = [result.seed, ...result.results.map((entry) => entry.asset)];
            catalog.setAllAssets((prev) => {
                const byId = new Map(prev.map((entry) => [entry.id, entry]));
                for (const entry of similarAssets) byId.set(entry.id, entry);
                return Array.from(byId.values());
            });

            if (result.bookcase) {
                catalog.setBookcases(await fetchBookcases());
                browse.setLens('subject');
                browse.setUse3d(false);
                browse.goRoom();
                catalog.setStatusMessage(t('vault.clusterCreated', { name: result.bookcase.name }));
            } else {
                const bookcaseId = `similar_${asset.id}`;
                const albumId = `album_subject_${bookcaseId}`;
                const pageId = `${albumId}::page_1`;
                catalog.setBookcases((prev) => [
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
                browse.setLens('subject');
                browse.setActiveAlbumId(albumId);
                browse.setActivePageId(pageId);
                browse.setDepth('page');
                browse.setUse3d(false);
                catalog.setStatusMessage(t('vault.similarFound', { count: result.total }));
            }
            previews.setDetail(null);
        } catch (error) {
            console.error(error);
            catalog.setStatusMessage(t('vault.similarFailed'));
        } finally {
            setIsFindingSimilar(false);
        }
    };

    const createManualAlbum = async () => {
        browse.setOverflowOpen(false);
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
                    manualAssetIds: browse.displayedAssets.slice(0, 40).map((asset) => asset.id),
                }),
            });
            catalog.setBookcases(await fetchBookcases());
            browse.requestFlatRematch();
            browse.setLens('subject');
            if (browse.use3d) {
                browse.setDepth('room');
                browse.setActiveAlbumId(null);
                browse.setActivePageId(null);
            } else {
                browse.setActiveAlbumId(null);
                browse.setActivePageId(null);
                browse.setDepth('page');
            }
            catalog.setStatusMessage(t('vault.albumCreated', { name }));
        } catch (error) {
            console.error(error);
        }
    };

    const handleDropFiles = async (files: File[]) => {
        if (files.length === 0 || isUploading) return;
        setIsUploading(true);
        catalog.setStatusMessage(t('vault.uploading'));
        try {
            const result = await uploadFilesToVaultLocal(files, owner);
            await catalog.runLoad();
            browse.setLens('type');
            browse.setUse3d(false);
            const albumId = preferredVaultTypeAlbumId(result.uploadedTypes);
            if (albumId && result.successCount > 0) {
                browse.setActiveAlbumId(albumId);
                browse.setActivePageId(`${albumId}::page_1`);
                browse.setDepth('page');
            } else if (result.successCount > 0) {
                browse.selectFlatAll();
            }

            if (result.failedNames.length > 0) {
                catalog.setStatusMessage(
                    result.successCount === 0
                        ? t('vault.uploadFailed')
                        : t('vault.uploadPartial', {
                            ok: result.successCount,
                            fail: result.failedNames.length,
                        }),
                );
            } else {
                catalog.setStatusMessage(t('vault.uploadComplete', { count: result.successCount }));
            }
        } catch (error) {
            console.error(error);
            catalog.setStatusMessage(t('vault.uploadFailed'));
        } finally {
            setIsUploading(false);
        }
    };

    if (!isOpen) return null;


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
                        <VaultModalToolbar
                            searchRef={searchRef}
                            query={catalog.query}
                            onQueryChange={catalog.setQuery}
                            isSearching={catalog.isSearching}
                            smartSearch={catalog.smartSearch}
                            onSmartSearchChange={catalog.setSmartSearch}
                            sortMode={browse.sortMode}
                            onSortModeChange={browse.setSortMode}
                            effectiveLens={browse.effectiveLens}
                            onApplyLens={browse.applyOrganizeLens}
                            sourcesOpen={browse.sourcesOpen}
                            onToggleSources={() => browse.setSourcesOpen((prev) => !prev)}
                            isEnriching={catalog.isEnriching}
                            onEnrich={() => { browse.setOverflowOpen(false); void catalog.handleEnrich(); }}
                            isSyncing={catalog.isSyncing}
                            onSync={() => { browse.setOverflowOpen(false); void catalog.handleSync(); }}
                            onOpenClassicLibrary={onOpenClassicLibrary}
                            onClose={onClose}
                            overflowOpen={browse.overflowOpen}
                            onOverflowOpenChange={browse.setOverflowOpen}
                            onCreateAlbum={() => void createManualAlbum()}
                            onOpenSources={() => browse.setSourcesOpen(true)}
                            activeAlbum={browse.activeAlbum}
                            activePage={browse.activePage}
                            use3d={browse.use3d}
                            onGoRoom={browse.goRoom}
                            onGoAlbum={browse.goAlbum}
                            onSelectFlatAlbum={browse.selectFlatAlbum}
                            labelOf={browse.labelOf}
                        />

                        {browse.sourcesOpen && (
                            <VaultSourcesPanel
                                onClose={() => browse.setSourcesOpen(false)}
                                onIndexed={() => {
                                    void catalog.runLoad();
                                    catalog.setStatusMessage(t('vault.sourceIndexedRefresh'));
                                }}
                            />
                        )}

                        <main className="flex-1 min-h-0 p-2 overflow-hidden">
                            {catalog.isLoading && catalog.allAssets.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted-foreground gap-2 text-xs">
                                    <Loader2 size={16} className="animate-spin" />
                                    {t('common.loading')}
                                </div>
                            ) : (
                                <div className="h-full flex min-h-0 border border-border/60 rounded-md overflow-hidden bg-card/30">
                                    {/*
                                      * Shown during search too. The albums and
                                      * folder tree are derived from the working
                                      * set, which *is* the search results while
                                      * a search is active — so the sidebar
                                      * groups the hits and its lens buttons are
                                      * meaningful. Hiding it left the toolbar's
                                      * Type/Date/Location/Subject controls with
                                      * nothing to act on.
                                      */}
                                    <div className="flex flex-col min-h-0 shrink-0">
                                            <VaultNavModeSwitch
                                                navMode={browse.navMode}
                                                onChange={browse.setNavMode}
                                            />
                                            <div className="px-2 pb-2">
                                                <VaultSourceSwitch
                                                    source={browse.assetSource}
                                                    counts={browse.sourceCounts}
                                                    onChange={browse.setAssetSource}
                                                />
                                            </div>
                                            {browse.navMode === 'folders' && browse.folderTree ? (
                                                <VaultFolderTreeSidebar
                                                    tree={browse.folderTree}
                                                    totalAssetCount={browse.visibleAssetCount}
                                                    activeFolderId={browse.activeFolderId}
                                                    expandedFolderIds={browse.expandedFolderIds}
                                                    includeSubfolders={browse.includeSubfolders}
                                                    onSelectAll={browse.selectAllFolders}
                                                    onSelectFolder={browse.selectFolder}
                                                    onToggleExpanded={browse.toggleFolderExpanded}
                                                    onToggleIncludeSubfolders={browse.toggleIncludeSubfolders}
                                                />
                                            ) : (
                                                <VaultFlatSidebar
                                                    albums={browse.albums}
                                                    effectiveLens={browse.effectiveLens}
                                                    workingAssetsCount={browse.visibleAssetCount}
                                                    activeAlbumId={browse.activeAlbumId}
                                                    activePageId={browse.activePageId}
                                                    expandedAlbumIds={browse.expandedAlbumIds}
                                                    onSelectAll={browse.selectFlatAll}
                                                    onSelectAlbum={browse.selectFlatAlbum}
                                                    onSelectPage={browse.selectFlatPage}
                                                    onToggleExpanded={browse.toggleAlbumExpanded}
                                                    onAlbumContextMenu={(album, event) => previews.openContextMenu({ kind: 'album', album }, event)}
                                                    onPageContextMenu={(album, pageId, event) => {
                                                        const page = album.pages.find((entry) => entry.id === pageId);
                                                        if (!page) return;
                                                        previews.openContextMenu({ kind: 'page', page, album }, event);
                                                    }}
                                                    labelOf={browse.labelOf}
                                                />
                                            )}
                                        </div>
                                    <div className="flex-1 min-w-0 overflow-y-auto p-2">
                                        <VaultAssetGridPanel
                                            displayedAssets={browse.displayedAssets}
                                            pagedAssets={browse.pagedAssets}
                                            thumbnailUrls={previews.thumbnailUrls}
                                            sourceUrls={previews.sourceUrls}
                                            activeAlbum={browse.activeAlbum}
                                            activePageId={browse.activePageId}
                                            pageSize={browse.pageSize}
                                            pageIndex={browse.pageIndex}
                                            totalPages={browse.totalPages}
                                            isUploading={isUploading}
                                            onSetPageIndex={browse.setPageIndex}
                                            onSetActivePageId={browse.setActivePageId}
                                            onOpenSources={() => browse.setSourcesOpen(true)}
                                            onOpenAsset={(asset) => void previews.openDetail(asset)}
                                            onSelectAsset={(asset) => setSelectedAssetId(asset.id)}
                                            selectedAssetId={selectedAssetId}
                                            onAssetContextMenu={(asset, event) => previews.openContextMenu({ kind: 'asset', asset }, event)}
                                            onHoverStart={previews.handleCardHoverStart}
                                            onHoverEnd={previews.handleCardHoverEnd}
                                            onDropFiles={(files) => void handleDropFiles(files)}
                                        />
                                    </div>
                                    <VaultAssetDetailsPanel
                                        asset={selectedAsset}
                                        match={selectedMatch}
                                        thumbnailUrl={
                                            selectedAsset
                                                ? previews.thumbnailUrls[selectedAsset.id]
                                                : undefined
                                        }
                                        onOpenPreview={(asset) => void previews.openDetail(asset)}
                                        onAddToCanvas={(asset) => void previews.handleAddToCanvas(asset)}
                                        t={t}
                                        language={language}
                                    />
                                </div>
                            )}
                        </main>

                        <VaultModalFooter
                            statusMessage={catalog.statusMessage}
                            resultCount={browse.displayedAssets.length}
                            pageSize={browse.pageSize}
                            onPageSizeChange={browse.setPageSize}
                        />
                    </div>
                </DraggableResizablePanel>
            </div>

            <VaultModalOverlays
                detail={previews.detail}
                onCloseDetail={() => previews.setDetail(null)}
                isFindingSimilar={isFindingSimilar}
                onFindSimilar={(asset, createBookcase) => void handleFindSimilar(asset, createBookcase)}
                onAddToCanvas={(asset, url) => void previews.handleAddToCanvas(asset, url)}
                onOpenClassicLibrary={onOpenClassicLibrary}
                onClose={onClose}
                previewPopup={previews.previewPopup}
                onClosePreview={() => previews.setPreviewPopup(null)}
                onPreviewHover={previews.setPreviewHoverKey}
                contextMenu={previews.contextMenu}
                contextMenuRef={previews.contextMenuRef}
                onCloseContextMenu={() => previews.setContextMenu(null)}
                onSelectFlatAlbum={browse.selectFlatAlbum}
                onGoPage={browse.goPage}
                onOpenAsset={(asset) => void previews.openDetail(asset)}
            />
        </>
    );
}
