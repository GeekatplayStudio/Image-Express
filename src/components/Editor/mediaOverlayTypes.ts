import type { MediaOverlayPreset, MediaOverlaySafeAreaPreset } from '@/components/Editor/editorViewConfig';
import type { RectBounds } from '@/components/Editor/editorView.types';

export type MediaOverlayFrameConfig = {
    id: string;
    preset: MediaOverlayPreset;
    includeInBatchExport: boolean;
    safeAreaPreset: MediaOverlaySafeAreaPreset;
    bounds?: RectBounds;
};

export type MediaOverlayBatchTarget = MediaOverlayFrameConfig & { bounds: RectBounds };
