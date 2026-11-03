import { useCallback, useMemo, useState } from 'react';
import type * as fabric from 'fabric';

import type { ToastOptions } from '@/providers/ToastProvider';
import type { RectBounds } from '@/components/Editor/editorView.types';
import type { MediaOverlayFrameConfig } from '@/components/Editor/mediaOverlayTypes';
import { useMediaOverlayCampaignVariants } from '@/components/Editor/useMediaOverlayCampaignVariants';

type UseCampaignWorkspaceArgs = {
    canvas: fabric.Canvas | null;
    designId: string | null;
    designName: string;
    customHistoryProps: string[];
    mediaOverlayEnabled: boolean;
    mediaOverlayFrames: MediaOverlayFrameConfig[];
    activeMediaOverlayFrameId: string | null;
    resolveMediaOverlayFrameBounds: (frame: MediaOverlayFrameConfig) => RectBounds | null;
    toast: (options: ToastOptions) => void;
};

/**
 * Everything the editor needs to show the campaign workspace: the variant
 * snapshots of this page, whether the flyout is open, and the one prop the
 * header badge reads. One hook call in EditorView rather than a dozen props.
 */
export function useCampaignWorkspace({
    canvas,
    designId,
    designName,
    customHistoryProps,
    mediaOverlayEnabled,
    mediaOverlayFrames,
    activeMediaOverlayFrameId,
    resolveMediaOverlayFrameBounds,
    toast,
}: UseCampaignWorkspaceArgs) {
    const [open, setOpen] = useState(false);
    const workspace = useMediaOverlayCampaignVariants({
        // Snapshots belong to the page; an unsaved page keeps them under its name.
        mediaOverlayStorageKey: `image-express-media-overlay-${designId ?? `unsaved-${designName}`}`,
        canvas,
        customHistoryProps,
        mediaOverlayFrames,
        activeMediaOverlayFrameId,
        resolveMediaOverlayFrameBounds,
        toast,
        designId,
        designName,
    });
    const openWorkspace = useCallback(() => setOpen(true), []);
    const closeWorkspace = useCallback(() => setOpen(false), []);
    const canSnapshot = mediaOverlayEnabled && Boolean(canvas) && mediaOverlayFrames.length > 0;

    return useMemo(() => ({
        workspace,
        open,
        openWorkspace,
        closeWorkspace,
        canSnapshot,
        activeVariantName: workspace.activeCampaignVariant?.name ?? null,
    }), [canSnapshot, closeWorkspace, open, openWorkspace, workspace]);
}

export type CampaignWorkspaceController = ReturnType<typeof useCampaignWorkspace>;
