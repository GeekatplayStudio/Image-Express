import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ToastOptions } from '@/providers/ToastProvider';
import type { DesignJson, RectBounds } from '@/components/Editor/editorView.types';
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
    normalizeCampaignWorkspace,
    removeCampaignVariant,
    upsertCampaignVariantFromFrame,
} from '@/components/Editor/mediaOverlayCampaignVariantUtils';

type Toast = (options: ToastOptions) => void;

type UseMediaOverlayCampaignVariantsArgs = {
    mediaOverlayStorageKey: string;
    canvas: fabric.Canvas | null;
    customHistoryProps: string[];
    mediaOverlayFrames: MediaOverlayFrameConfig[];
    activeMediaOverlayFrameId: string | null;
    resolveMediaOverlayFrameBounds: (frame: MediaOverlayFrameConfig) => RectBounds | null;
    toast: Toast;
};

export function useMediaOverlayCampaignVariants({
    mediaOverlayStorageKey,
    canvas,
    customHistoryProps,
    mediaOverlayFrames,
    activeMediaOverlayFrameId,
    resolveMediaOverlayFrameBounds,
    toast,
}: UseMediaOverlayCampaignVariantsArgs) {
    const storageKey = useMemo(
        () => buildCampaignWorkspaceStorageKey(mediaOverlayStorageKey),
        [mediaOverlayStorageKey],
    );
    const [campaignWorkspace, setCampaignWorkspace] = useState<CampaignWorkspace>(createEmptyCampaignWorkspace);
    const [hasLoaded, setHasLoaded] = useState(false);

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
        });

        setCampaignWorkspace(result.workspace);
        toast({
            title: result.didCreate ? 'Variant snapshot created' : 'Variant snapshot updated',
            description: `${result.variant.name} is saved for the upcoming campaign workspace flow.`,
            variant: 'success',
        });
        return true;
    }, [
        activeFrame,
        campaignWorkspace,
        canvas,
        customHistoryProps,
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

    return {
        campaignVariants: campaignWorkspace.variants,
        activeCampaignVariantId: activeCampaignVariant?.id ?? null,
        activeCampaignVariant,
        handleConvertActiveMediaOverlayFrameToVariant,
        handleSelectCampaignVariant,
        handleRemoveCampaignVariant,
    };
}