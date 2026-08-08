'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import type { AssetType } from '@/types';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { resolveVaultPreviewUrl, resolveVaultThumbnailUrl } from '@/features/asset-vault/application/client/vaultApiClient';
import {
    canRenderModelThumbnail,
    getCachedModelThumbnail,
    renderModelThumbnail,
} from '@/lib/modelThumbnail';
import { captureVideoPoster, getCachedVideoPoster } from '@/lib/videoPoster';
import {
    revokeRemovedBlobs,
    type ContextTarget,
    type NavDepth,
    type PreviewPopup,
} from '@/components/AssetVault/vaultModalTypes';

type UseVaultPreviewsArgs = {
    isOpen: boolean;
    depth: NavDepth;
    use3d: boolean;
    pagedAssets: VaultAssetRecord[];
    onClose: () => void;
    onSelect: (path: string, type: AssetType, name?: string) => void;
    setStatusMessage: (message: string | null) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
};

export function useVaultPreviews({
    isOpen,
    depth,
    use3d,
    pagedAssets,
    onClose,
    onSelect,
    setStatusMessage,
    t,
}: UseVaultPreviewsArgs) {
    const contextMenuRef = useRef<HTMLDivElement>(null);
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
    /** True while the pointer is over the floating preview for this asset id. */
    const previewHoverKeyRef = useRef<string | null>(null);
    /** True while the pointer is over the grid card that requested a hover preview. */
    const cardHoverAssetIdRef = useRef<string | null>(null);
    const hoverOpenTimerRef = useRef<number | null>(null);
    previewHoverKeyRef.current = previewHoverKey;

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

                const existingThumb = thumbnailUrlsRef.current[asset.id];

                // A drive-indexed still image needs nothing but a URL: the
                // server resizes it. Fetching the original here is what made a
                // page of 96 tiles pull ~170 MB, and on desktop it read and
                // base64-encoded every file through IPC as well.
                if (!existingThumb) {
                    const directThumb = resolveVaultThumbnailUrl(asset, 256);
                    if (directThumb) {
                        resolvedThumbs[asset.id] = directThumb;
                        // The full-size source is resolved only when something
                        // actually opens the asset.
                        continue;
                    }
                }

                let source = sourceUrlsRef.current[asset.id];
                if (!source) source = (await resolveVaultPreviewUrl(asset)) || '';
                if (!source) continue;
                resolvedSources[asset.id] = source;

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

    const clearPreviewState = useCallback(() => {
        setSourceUrls((previous) => {
            for (const url of Object.values(previous)) {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            }
            return {};
        });
        setThumbnailUrls({});
        setContextMenu(null);
        setDetail(null);
        setPreviewPopup(null);
    }, []);

    useEffect(() => {
        if (isOpen) return;
        if (hoverOpenTimerRef.current !== null) {
            window.clearTimeout(hoverOpenTimerRef.current);
            hoverOpenTimerRef.current = null;
        }
        clearPreviewState();
    }, [isOpen, clearPreviewState]);

    useEffect(() => {
        if (!contextMenu) return;
        const onPointerDown = (event: globalThis.MouseEvent) => {
            if (contextMenuRef.current?.contains(event.target as Node)) return;
            setContextMenu(null);
        };
        window.addEventListener('mousedown', onPointerDown);
        return () => window.removeEventListener('mousedown', onPointerDown);
    }, [contextMenu]);

    const resolveSourceUrl = useCallback(async (asset: VaultAssetRecord): Promise<string | null> => {
        if (sourceUrls[asset.id]) return sourceUrls[asset.id];
        const url = await resolveVaultPreviewUrl(asset);
        if (url) setSourceUrls((previous) => ({ ...previous, [asset.id]: url }));
        return url;
    }, [sourceUrls]);

    const openClassic3dViewer = useCallback(async (asset: VaultAssetRecord) => {
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
    }, [onClose, resolveSourceUrl, setStatusMessage, t]);

    const openClassicMediaPreview = useCallback(async (asset: VaultAssetRecord) => {
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
    }, [onClose, resolveSourceUrl, setStatusMessage, t]);

    const openDetail = useCallback(async (asset: VaultAssetRecord) => {
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
    }, [openClassic3dViewer, openClassicMediaPreview, resolveSourceUrl, setStatusMessage, t]);

    const openPreviewPopup = useCallback(async (asset: VaultAssetRecord, anchor: DOMRect) => {
        if (asset.type !== 'models' && asset.type !== 'videos' && asset.type !== 'audio') return;
        if (loadingPreviewKey === asset.id) return;
        if (previewPopup?.key === asset.id) return;
        try {
            setLoadingPreviewKey(asset.id);
            const sourceUrl = await resolveSourceUrl(asset);
            if (!sourceUrl) return;
            // Drop late results if the pointer already left the card (and is not on the popup).
            if (cardHoverAssetIdRef.current !== asset.id && previewHoverKeyRef.current !== asset.id) {
                return;
            }

            let displayUrl = sourceUrl;
            let display: PreviewPopup['display'] = 'media';

            // Still-frame only for models — never mount a live R3F Canvas on hover.
            // Thumbnail renders share one WebGL context (see modelThumbnail.ts).
            if (asset.type === 'models') {
                display = 'model-still';
                const existing = thumbnailUrlsRef.current[asset.id] || getCachedModelThumbnail(asset.id);
                if (existing) {
                    displayUrl = existing;
                } else if (canRenderModelThumbnail(asset.name)) {
                    try {
                        displayUrl = await renderModelThumbnail(asset.id, sourceUrl, 512);
                        setThumbnailUrls((previous) => (
                            previous[asset.id] ? previous : { ...previous, [asset.id]: displayUrl }
                        ));
                    } catch {
                        // Fall back to source URL as image will fail; overlay shows placeholder.
                        displayUrl = sourceUrl;
                    }
                }
                if (cardHoverAssetIdRef.current !== asset.id && previewHoverKeyRef.current !== asset.id) {
                    return;
                }
            }

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
                url: displayUrl,
                x,
                y,
                width: previewWidth,
                height: previewHeight,
                display,
            });
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingPreviewKey((current) => (current === asset.id ? null : current));
        }
    }, [loadingPreviewKey, previewPopup?.key, resolveSourceUrl]);

    /**
     * Match classic Asset Library hover semantics, with a short debounce for
     * models so fast roll-overs do not queue dozens of thumbnail jobs.
     */
    const handleCardHoverStart = useCallback((asset: VaultAssetRecord, rect: DOMRect) => {
        cardHoverAssetIdRef.current = asset.id;
        if (hoverOpenTimerRef.current !== null) {
            window.clearTimeout(hoverOpenTimerRef.current);
            hoverOpenTimerRef.current = null;
        }
        const delay = asset.type === 'models' ? 140 : 0;
        if (delay === 0) {
            void openPreviewPopup(asset, rect);
            return;
        }
        hoverOpenTimerRef.current = window.setTimeout(() => {
            hoverOpenTimerRef.current = null;
            if (cardHoverAssetIdRef.current !== asset.id) return;
            void openPreviewPopup(asset, rect);
        }, delay);
    }, [openPreviewPopup]);

    const handleCardHoverEnd = useCallback((assetId: string) => {
        if (cardHoverAssetIdRef.current === assetId) {
            cardHoverAssetIdRef.current = null;
        }
        if (hoverOpenTimerRef.current !== null) {
            window.clearTimeout(hoverOpenTimerRef.current);
            hoverOpenTimerRef.current = null;
        }
        window.setTimeout(() => {
            setPreviewPopup((current) => {
                if (!current || current.key !== assetId) return current;
                if (previewHoverKeyRef.current === assetId) return current;
                return null;
            });
        }, 80);
    }, []);

    const handleAddToCanvas = useCallback(async (asset: VaultAssetRecord, knownUrl?: string) => {
        const url = knownUrl || await resolveSourceUrl(asset);
        if (!url) {
            setStatusMessage(t('vault.previewUnavailable'));
            return;
        }
        onSelect(url, asset.type as AssetType, asset.name);
        onClose();
    }, [onClose, onSelect, resolveSourceUrl, setStatusMessage, t]);

    const openContextMenu = useCallback((target: ContextTarget, event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const menuWidth = 220;
        const menuHeight = 240;
        const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
        const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
        setContextMenu({ target, x: Math.max(8, x), y: Math.max(8, y) });
    }, []);

    return {
        contextMenuRef: contextMenuRef as RefObject<HTMLDivElement>,
        sourceUrls,
        thumbnailUrls,
        detail,
        setDetail,
        previewPopup,
        setPreviewPopup,
        previewHoverKey,
        setPreviewHoverKey,
        contextMenu,
        setContextMenu,
        clearPreviewState,
        openClassic3dViewer,
        openClassicMediaPreview,
        openDetail,
        openPreviewPopup,
        handleCardHoverStart,
        handleCardHoverEnd,
        handleAddToCanvas,
        openContextMenu,
    };
}
