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
    thumbnailWidthForSize,
    type VaultThumbSize,
} from '@/features/asset-vault/application/client/vaultUiState';
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
    /** Tile size, so the grid asks for a rendition that matches it. */
    thumbSize: VaultThumbSize;
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
    thumbSize,
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

    /**
     * Fill in tile artwork for the visible page.
     *
     * Staged rather than one pass, because the stages differ by orders of
     * magnitude in cost. A still image needs only a URL string; a video poster
     * needs a decode. Running them together in one sequential loop meant a
     * single slow clip held up every image behind it, so a page of photos sat
     * on spinners while one video was being decoded — with 16,136 videos
     * indexed, that was most pages.
     *
     * Each stage publishes as soon as it has something, so tiles appear
     * progressively instead of all at the end.
     */
    useEffect(() => {
        if (!isOpen) return;
        if (depth !== 'page' && use3d) return;
        let cancelled = false;
        const assets = pagedAssets.slice(0, 96);
        const activeIds = new Set(assets.map((asset) => asset.id));

        /** Publish a partial result, keeping only what is still on the page. */
        const publishThumbs = (additions: Record<string, string>) => {
            if (cancelled) return;
            setThumbnailUrls((previous) => {
                const merged: Record<string, string> = {};
                for (const id of activeIds) {
                    const url = additions[id] || previous[id];
                    if (url) merged[id] = url;
                }
                return merged;
            });
        };

        // Stage 1: everything already known, published synchronously. No await
        // anywhere in here — this is what makes a page of photos draw at once.
        const immediate: Record<string, string> = {};
        const needsSource: VaultAssetRecord[] = [];
        for (const asset of assets) {
            const existing = thumbnailUrlsRef.current[asset.id];
            if (existing) {
                immediate[asset.id] = existing;
                continue;
            }
            // A drive-indexed still needs nothing but a URL: the server
            // resizes it. Fetching the original here is what made a page of 96
            // tiles pull ~170 MB.
            const directThumb = resolveVaultThumbnailUrl(asset, thumbnailWidthForSize(thumbSize));
            if (directThumb) {
                immediate[asset.id] = directThumb;
                continue;
            }
            const cached = asset.type === 'models'
                ? getCachedModelThumbnail(asset.id)
                : asset.type === 'videos'
                    ? getCachedVideoPoster(asset.id)
                    : null;
            if (cached) {
                immediate[asset.id] = cached;
                continue;
            }
            if (asset.type !== 'audio') needsSource.push(asset);
        }
        publishThumbs(immediate);

        void (async () => {
            // Stage 2: source URLs for whatever is left. For a local file this
            // is a string; only cloud connectors do real work, so resolve them
            // together rather than one after another.
            const resolved = await Promise.all(needsSource.map(async (asset) => {
                const known = sourceUrlsRef.current[asset.id];
                const url = known || (await resolveVaultPreviewUrl(asset).catch(() => null)) || '';
                return [asset, url] as const;
            }));
            if (cancelled) return;

            const sources: Record<string, string> = {};
            for (const [asset, url] of resolved) if (url) sources[asset.id] = url;
            setSourceUrls((previous) => {
                const merged: Record<string, string> = {};
                for (const id of activeIds) {
                    const url = sources[id] || previous[id];
                    if (url) merged[id] = url;
                }
                revokeRemovedBlobs(previous, merged);
                return merged;
            });

            // A server-hosted still is its own thumbnail; publish before the
            // expensive stage so those tiles do not wait on video decoding.
            const direct: Record<string, string> = {};
            for (const [asset, url] of resolved) {
                if (url && asset.type !== 'models' && asset.type !== 'videos') direct[asset.id] = url;
            }
            if (Object.keys(direct).length > 0) publishThumbs(direct);

            // Stage 3: the expensive ones, published one at a time. Kept
            // sequential on purpose — model renders share a single WebGL
            // context, and decoding several videos at once competes for the
            // same hardware decoder.
            for (const [asset, url] of resolved) {
                if (cancelled) return;
                if (!url) continue;
                try {
                    if (asset.type === 'models' && canRenderModelThumbnail(asset.name)) {
                        publishThumbs({ [asset.id]: await renderModelThumbnail(asset.id, url, 256) });
                    } else if (asset.type === 'videos') {
                        publishThumbs({ [asset.id]: await captureVideoPoster(asset.id, url, 256) });
                    }
                } catch {
                    // A poster that cannot be produced falls back to the card's
                    // own glyph; it must not stop the rest of the page.
                }
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, depth, use3d, pagedAssets, thumbSize]);

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
