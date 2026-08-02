'use client';

import { Archive, Box, FolderPlus, Globe, Image as ImageIcon, ImagePlus, LayoutGrid, Music, Plus, Sparkles, Video, X } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type { VaultAlbum } from '@/features/asset-vault/domain/vaultAlbumTree';
import type { ContextTarget, PreviewPopup } from '@/components/AssetVault/vaultModalTypes';

type VaultModalOverlaysProps = {
    detail: { asset: VaultAssetRecord; url: string } | null;
    onCloseDetail: () => void;
    isFindingSimilar: boolean;
    onFindSimilar: (asset: VaultAssetRecord, createBookcase: boolean) => void;
    onAddToCanvas: (asset: VaultAssetRecord, url?: string) => void;
    onOpenClassicLibrary?: () => void;
    onClose: () => void;
    previewPopup: PreviewPopup | null;
    onClosePreview: () => void;
    onPreviewHover: (key: string | null) => void;
    contextMenu: { target: ContextTarget; x: number; y: number } | null;
    contextMenuRef: React.RefObject<HTMLDivElement | null>;
    onCloseContextMenu: () => void;
    onSelectFlatAlbum: (album: VaultAlbum) => void;
    onGoPage: (albumId: string, pageId: string) => void;
    onOpenAsset: (asset: VaultAssetRecord) => void;
};

export default function VaultModalOverlays({
    detail,
    onCloseDetail,
    isFindingSimilar,
    onFindSimilar,
    onAddToCanvas,
    onOpenClassicLibrary,
    onClose,
    previewPopup,
    onClosePreview,
    onPreviewHover,
    contextMenu,
    contextMenuRef,
    onCloseContextMenu,
    onSelectFlatAlbum,
    onGoPage,
    onOpenAsset,
}: VaultModalOverlaysProps) {
    const { t } = useI18n();

    return (
        <>
            {detail && (
                <div
                    className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
                    onClick={onCloseDetail}
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
                            <button type="button" onClick={onCloseDetail} className="p-1 hover:bg-secondary rounded-full">
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
                                    onClick={() => void onFindSimilar(detail.asset, false)}
                                    disabled={isFindingSimilar}
                                    className="h-8 px-2.5 rounded-md border border-border text-[11px] hover:bg-secondary inline-flex items-center gap-1 disabled:opacity-50"
                                >
                                    <Sparkles size={12} /> {t('vault.findSimilar')}
                                </button>
                                {onOpenClassicLibrary && (
                                    <button
                                        type="button"
                                        onClick={() => { onOpenClassicLibrary(); onCloseDetail(); onClose(); }}
                                        className="h-8 px-2.5 rounded-md border border-border text-[11px] hover:bg-secondary"
                                    >
                                        {t('vault.manageClassic')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => void onAddToCanvas(detail.asset, detail.url)}
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
                    onMouseEnter={() => onPreviewHover(previewPopup.key)}
                    onMouseLeave={() => {
                        onPreviewHover(null);
                        onClosePreview();
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
                            onClick={onClosePreview}
                            className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground"
                            aria-label={t('common.close')}
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <div className="h-[calc(100%-41px)] p-2 bg-secondary/10 relative min-h-0">
                        {previewPopup.asset.type === 'videos' ? (
                            <video src={previewPopup.url} className="max-w-full max-h-full mx-auto block" controls autoPlay muted playsInline />
                        ) : previewPopup.asset.type === 'audio' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                <Music size={32} />
                                <audio src={previewPopup.url} className="w-full" controls autoPlay />
                            </div>
                        ) : previewPopup.display === 'model-still' || previewPopup.asset.type === 'models' ? (
                            <div className="absolute inset-2 flex flex-col items-center justify-center gap-2 bg-secondary/30 rounded-md overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={previewPopup.url}
                                    alt={previewPopup.asset.name}
                                    className="max-w-full max-h-[calc(100%-28px)] object-contain"
                                />
                                <p className="text-[10px] text-muted-foreground px-2 text-center">
                                    {t('vault.hover3dStillHint')}
                                </p>
                            </div>
                        ) : null}
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
                                    onSelectFlatAlbum(contextMenu.target.album);
                                    onCloseContextMenu();
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
                                    if (page) onGoPage(album.id, page.id);
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
                                onGoPage(contextMenu.target.album.id, contextMenu.target.page.id);
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
                                    void onOpenAsset(contextMenu.target.asset);
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
                                    void onAddToCanvas(contextMenu.target.asset);
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
                                    void onFindSimilar(contextMenu.target.asset, false);
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
                                    void onFindSimilar(contextMenu.target.asset, true);
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
                                onCloseContextMenu();
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
