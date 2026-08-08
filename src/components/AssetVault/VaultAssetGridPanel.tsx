'use client';

import { useRef, useState } from 'react';
import { HardDrive, ImagePlus, Loader2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type { VaultAlbum } from '@/features/asset-vault/domain/vaultAlbumTree';
import type { VaultPageSize } from '@/features/asset-vault/application/client/vaultUiState';
import VaultAssetCard from '@/components/AssetVault/VaultAssetCard';

type VaultAssetGridPanelProps = {
    displayedAssets: VaultAssetRecord[];
    pagedAssets: VaultAssetRecord[];
    thumbnailUrls: Record<string, string>;
    sourceUrls: Record<string, string>;
    activeAlbum: VaultAlbum | null | undefined;
    activePageId: string | null;
    pageSize: VaultPageSize;
    pageIndex: number;
    totalPages: number;
    isUploading?: boolean;
    onSetPageIndex: (updater: (prev: number) => number) => void;
    onSetActivePageId: (pageId: string) => void;
    onOpenSources: () => void;
    onOpenAsset: (asset: VaultAssetRecord) => void;
    onSelectAsset: (asset: VaultAssetRecord) => void;
    selectedAssetId: string | null;
    onAssetContextMenu: (asset: VaultAssetRecord, event: React.MouseEvent) => void;
    onHoverStart: (asset: VaultAssetRecord, rect: DOMRect) => void;
    onHoverEnd: (assetId: string) => void;
    onDropFiles: (files: File[]) => void;
};

export default function VaultAssetGridPanel({
    displayedAssets,
    pagedAssets,
    thumbnailUrls,
    sourceUrls,
    activeAlbum,
    activePageId,
    pageSize,
    pageIndex,
    totalPages,
    isUploading = false,
    onSetPageIndex,
    onSetActivePageId,
    onOpenSources,
    onOpenAsset,
    onSelectAsset,
    selectedAssetId,
    onAssetContextMenu,
    onHoverStart,
    onHoverEnd,
    onDropFiles,
}: VaultAssetGridPanelProps) {
    const { t } = useI18n();
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const dragDepthRef = useRef(0);

    const dropHandlers = {
        onDragEnter: (event: React.DragEvent) => {
            if (!Array.from(event.dataTransfer.types).includes('Files')) return;
            event.preventDefault();
            dragDepthRef.current += 1;
            setIsDraggingOver(true);
        },
        onDragOver: (event: React.DragEvent) => {
            if (!Array.from(event.dataTransfer.types).includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: () => {
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setIsDraggingOver(false);
        },
        onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            dragDepthRef.current = 0;
            setIsDraggingOver(false);
            const files = Array.from(event.dataTransfer.files || []);
            if (files.length > 0) onDropFiles(files);
        },
    };

    return (
        <div className="relative min-h-full" {...dropHandlers} data-testid="vault-asset-drop-zone">
            {(isDraggingOver || isUploading) && (
                <div className="absolute inset-2 z-40 rounded-lg border-2 border-dashed border-primary bg-primary/10 flex flex-col items-center justify-center gap-2 pointer-events-none">
                    {isUploading
                        ? <Loader2 size={28} className="text-primary animate-spin" />
                        : <ImagePlus size={28} className="text-primary" />}
                    <span className="text-xs font-semibold text-primary">
                        {isUploading ? t('vault.uploading') : t('vault.dropToUpload')}
                    </span>
                </div>
            )}

            {displayedAssets.length === 0 ? (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-muted-foreground gap-2 px-6 text-center">
                    <HardDrive size={28} className="opacity-40" />
                    <p className="text-sm">{t('vault.empty')}</p>
                    <p className="text-xs max-w-sm">{t('vault.emptyHintDrop')}</p>
                    <button
                        type="button"
                        onClick={onOpenSources}
                        className="mt-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold inline-flex items-center gap-1.5"
                    >
                        <HardDrive size={12} />
                        {t('vault.browseDriveFolder')}
                    </button>
                </div>
            ) : (
                <div className="min-h-0">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 pb-2">
                        {pagedAssets.map((asset) => (
                            <VaultAssetCard
                                key={asset.id}
                                asset={asset}
                                thumb={thumbnailUrls[asset.id]}
                                source={sourceUrls[asset.id]}
                                onOpen={onOpenAsset}
                                onSelect={onSelectAsset}
                                isSelected={asset.id === selectedAssetId}
                                onContextMenu={onAssetContextMenu}
                                onHoverStart={onHoverStart}
                                onHoverEnd={onHoverEnd}
                            />
                        ))}
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
                                        if (prev) onSetActivePageId(prev.id);
                                        return;
                                    }
                                    onSetPageIndex((prev) => Math.max(0, prev - 1));
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
                                {pageSize}
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
                                        if (next) onSetActivePageId(next.id);
                                        return;
                                    }
                                    onSetPageIndex((prev) => Math.min(totalPages - 1, prev + 1));
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
    );
}
