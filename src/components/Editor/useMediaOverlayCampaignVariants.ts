import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ToastOptions } from '@/providers/ToastProvider';
import type { RectBounds } from '@/components/Editor/editorView.types';
import type {
    CampaignVariant,
    CampaignWorkspace,
    MediaOverlayFrameConfig,
} from '@/components/Editor/mediaOverlayTypes';
import type * as fabric from 'fabric';
import { serializeCanvas } from '@/lib/fabric-utils';
import {
    buildCampaignWorkspaceStorageKey,
    createEmptyCampaignWorkspace,
    duplicateCampaignVariant,
    normalizeCampaignWorkspace,
    removeCampaignVariant,
    renameCampaignVariant,
    upsertCampaignVariantFromFrame,
} from '@/components/Editor/mediaOverlayCampaignVariantUtils';
import {
    exportVariantBlob,
    exportVariantsZip,
    variantFileName,
    type VariantRenderer,
} from '@/components/Editor/campaignVariantExport';

type Toast = (options: ToastOptions) => void;

/** Longest side of the thumbnail stored with a variant. */
const THUMBNAIL_SIZE = 160;

type UseMediaOverlayCampaignVariantsArgs = {
    mediaOverlayStorageKey: string;
    canvas: fabric.Canvas | null;
    customHistoryProps: string[];
    mediaOverlayFrames: MediaOverlayFrameConfig[];
    activeMediaOverlayFrameId: string | null;
    resolveMediaOverlayFrameBounds: (frame: MediaOverlayFrameConfig) => RectBounds | null;
    toast: Toast;
    designId?: string | null;
    designName?: string;
    /** Receives a finished file; defaults to a browser download. Injectable for tests. */
    deliver?: (blob: Blob, fileName: string) => void;
    /** Renders a snapshot to a data URL; defaults to the offscreen fabric renderer. */
    render?: VariantRenderer;
};

const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

/** A small PNG of the frame region, or nothing if the canvas cannot rasterise (tests, headless). */
const captureThumbnail = (canvas: fabric.Canvas, bounds: RectBounds): string | undefined => {
    if (typeof canvas.toDataURL !== 'function' || bounds.width <= 0 || bounds.height <= 0) return undefined;
    try {
        return canvas.toDataURL({
            format: 'png',
            multiplier: Math.min(1, THUMBNAIL_SIZE / Math.max(bounds.width, bounds.height)),
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
        });
    } catch {
        return undefined;
    }
};

export function useMediaOverlayCampaignVariants({
    mediaOverlayStorageKey,
    canvas,
    customHistoryProps,
    mediaOverlayFrames,
    activeMediaOverlayFrameId,
    resolveMediaOverlayFrameBounds,
    toast,
    designId = null,
    designName = 'Untitled Page',
    deliver = downloadBlob,
    render,
}: UseMediaOverlayCampaignVariantsArgs) {
    const storageKey = useMemo(
        () => buildCampaignWorkspaceStorageKey(mediaOverlayStorageKey),
        [mediaOverlayStorageKey],
    );
    const [campaignWorkspace, setCampaignWorkspace] = useState<CampaignWorkspace>(createEmptyCampaignWorkspace);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') {
            setHasLoaded(true);
            return;
        }

        try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) {
                setCampaignWorkspace(createEmptyCampaignWorkspace());
            } else {
                setCampaignWorkspace(normalizeCampaignWorkspace(JSON.parse(raw)));
            }
        } catch {
            setCampaignWorkspace(createEmptyCampaignWorkspace());
        } finally {
            setHasLoaded(true);
        }
    }, [storageKey]);

    useEffect(() => {
        if (typeof window === 'undefined' || !hasLoaded) return;

        try {
            if (campaignWorkspace.variants.length === 0) {
                window.localStorage.removeItem(storageKey);
                return;
            }
            window.localStorage.setItem(storageKey, JSON.stringify(campaignWorkspace));
        } catch {
            // ignore storage write failures
        }
    }, [campaignWorkspace, hasLoaded, storageKey]);

    const activeFrame = useMemo(() => {
        if (mediaOverlayFrames.length === 0) return null;
        if (!activeMediaOverlayFrameId) return mediaOverlayFrames[0] ?? null;
        return mediaOverlayFrames.find((frame) => frame.id === activeMediaOverlayFrameId) ?? mediaOverlayFrames[0] ?? null;
    }, [activeMediaOverlayFrameId, mediaOverlayFrames]);

    const activeCampaignVariant = useMemo<CampaignVariant | null>(() => {
        if (campaignWorkspace.variants.length === 0) return null;
        const requestedId = campaignWorkspace.activeVariantId;
        if (!requestedId) return campaignWorkspace.variants[0] ?? null;
        return campaignWorkspace.variants.find((variant) => variant.id === requestedId) ?? campaignWorkspace.variants[0] ?? null;
    }, [campaignWorkspace]);

    const handleConvertActiveMediaOverlayFrameToVariant = useCallback(() => {
        if (!canvas) {
            toast({
                title: 'Variant conversion unavailable',
                description: 'Editor canvas is not ready yet.',
                variant: 'warning',
            });
            return false;
        }

        if (!activeFrame) {
            toast({
                title: 'Variant conversion unavailable',
                description: 'Add and select a media overlay frame first.',
                variant: 'warning',
            });
            return false;
        }

        const bounds = resolveMediaOverlayFrameBounds(activeFrame);
        if (!bounds) {
            toast({
                title: 'Variant conversion unavailable',
                description: 'The active frame does not have valid bounds yet.',
                variant: 'warning',
            });
            return false;
        }

        const frameIndex = Math.max(0, mediaOverlayFrames.findIndex((frame) => frame.id === activeFrame.id));
        const snapshot = serializeCanvas(canvas, customHistoryProps);
        const result = upsertCampaignVariantFromFrame({
            workspace: campaignWorkspace,
            frame: activeFrame,
            frameBounds: bounds,
            snapshot,
            frameIndex,
            now: new Date().toISOString(),
            thumbnail: captureThumbnail(canvas, bounds),
            meta: {
                designId,
                designName,
                canvasWidth: typeof canvas.getWidth === 'function' ? canvas.getWidth() : bounds.left + bounds.width,
                canvasHeight: typeof canvas.getHeight === 'function' ? canvas.getHeight() : bounds.top + bounds.height,
            },
        });

        setCampaignWorkspace(result.workspace);
        toast({
            title: result.didCreate ? 'Variant snapshot created' : 'Variant snapshot updated',
            description: `${result.variant.name} is in the campaign workspace.`,
            variant: 'success',
        });
        return true;
    }, [
        activeFrame,
        campaignWorkspace,
        canvas,
        customHistoryProps,
        designId,
        designName,
        mediaOverlayFrames,
        resolveMediaOverlayFrameBounds,
        toast,
    ]);

    const handleSelectCampaignVariant = useCallback((variantId: string) => {
        setCampaignWorkspace((currentWorkspace) => {
            if (!currentWorkspace.variants.some((variant) => variant.id === variantId)) {
                return currentWorkspace;
            }
            return {
                ...currentWorkspace,
                activeVariantId: variantId,
            };
        });
    }, []);

    const handleRemoveCampaignVariant = useCallback((variantId: string) => {
        setCampaignWorkspace((currentWorkspace) => removeCampaignVariant(currentWorkspace, variantId));
    }, []);

    const handleRenameCampaignVariant = useCallback((variantId: string, name: string) => {
        setCampaignWorkspace((currentWorkspace) => renameCampaignVariant(currentWorkspace, variantId, name, new Date().toISOString()));
    }, []);

    const handleDuplicateCampaignVariant = useCallback((variantId: string) => {
        setCampaignWorkspace((currentWorkspace) => duplicateCampaignVariant(currentWorkspace, variantId, new Date().toISOString()));
    }, []);

    const pageName = useCallback(
        (variant: CampaignVariant) => variant.meta?.designName || designName,
        [designName],
    );

    const handleExportCampaignVariant = useCallback(async (variantId?: string) => {
        const variant = variantId
            ? campaignWorkspace.variants.find((entry) => entry.id === variantId) ?? null
            : activeCampaignVariant;
        if (!variant) {
            toast({ title: 'Nothing to export', description: 'Select a variant first.', variant: 'warning' });
            return false;
        }
        setIsExporting(true);
        try {
            deliver(await exportVariantBlob(variant, render), variantFileName(pageName(variant), variant));
            toast({ title: 'Variant exported', description: variant.name, variant: 'success' });
            return true;
        } catch (error) {
            console.error('Campaign variant export failed', error);
            toast({ title: 'Export failed', description: variant.name, variant: 'destructive' });
            return false;
        } finally {
            setIsExporting(false);
        }
    }, [activeCampaignVariant, campaignWorkspace.variants, deliver, pageName, render, toast]);

    const handleExportAllCampaignVariants = useCallback(async () => {
        const variants = campaignWorkspace.variants;
        if (variants.length === 0) {
            toast({ title: 'Nothing to export', description: 'The campaign workspace is empty.', variant: 'warning' });
            return false;
        }
        setIsExporting(true);
        try {
            const result = await exportVariantsZip(pageName(variants[0]), variants, render);
            deliver(result.blob, result.fileName);
            toast({
                title: 'Campaign exported',
                description: `${result.entries.length} variant${result.entries.length === 1 ? '' : 's'} in ${result.fileName}`,
                variant: 'success',
            });
            return true;
        } catch (error) {
            console.error('Campaign export failed', error);
            toast({ title: 'Export failed', description: 'The campaign ZIP could not be built.', variant: 'destructive' });
            return false;
        } finally {
            setIsExporting(false);
        }
    }, [campaignWorkspace.variants, deliver, pageName, render, toast]);

    return {
        campaignVariants: campaignWorkspace.variants,
        activeCampaignVariantId: activeCampaignVariant?.id ?? null,
        activeCampaignVariant,
        isExportingCampaign: isExporting,
        handleConvertActiveMediaOverlayFrameToVariant,
        handleSelectCampaignVariant,
        handleRemoveCampaignVariant,
        handleRenameCampaignVariant,
        handleDuplicateCampaignVariant,
        handleExportCampaignVariant,
        handleExportAllCampaignVariants,
    };
}

export type CampaignWorkspaceApi = ReturnType<typeof useMediaOverlayCampaignVariants>;
