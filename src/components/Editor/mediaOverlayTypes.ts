import type { MediaOverlayPreset, MediaOverlaySafeAreaPreset } from '@/components/Editor/editorViewConfig';
import type { DesignJson, RectBounds } from '@/components/Editor/editorView.types';

export type MediaOverlayFrameConfig = {
    id: string;
    preset: MediaOverlayPreset;
    includeInBatchExport: boolean;
    safeAreaPreset: MediaOverlaySafeAreaPreset;
    bounds?: RectBounds;
};

export type MediaOverlayBatchTarget = MediaOverlayFrameConfig & { bounds: RectBounds };

export type CampaignVariantAdaptationMode = 'fit' | 'fill' | 'safe-area';

export type CampaignVariantExportProfile = {
    format: 'png' | 'jpg' | 'svg' | 'pdf';
    includeBackground: boolean;
};

export type CampaignVariant = {
    id: string;
    name: string;
    sourceFrameId: string;
    framePreset: MediaOverlayPreset;
    safeAreaPreset: MediaOverlaySafeAreaPreset;
    bounds: RectBounds;
    adaptationMode: CampaignVariantAdaptationMode;
    exportProfile: CampaignVariantExportProfile;
    snapshot: DesignJson;
    createdAt: string;
    updatedAt: string;
    /** Small PNG data URL of the frame region at the time of the snapshot. */
    thumbnail?: string;
    /** Where the snapshot came from, for the workspace list and exports. */
    meta?: CampaignVariantMeta;
};

export type CampaignVariantMeta = {
    designId: string | null;
    designName: string;
    canvasWidth: number;
    canvasHeight: number;
};

export type CampaignWorkspace = {
    activeVariantId: string | null;
    variants: CampaignVariant[];
};
