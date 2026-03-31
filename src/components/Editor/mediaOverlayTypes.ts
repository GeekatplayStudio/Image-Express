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
};

export type CampaignWorkspace = {
    activeVariantId: string | null;
    variants: CampaignVariant[];
};
