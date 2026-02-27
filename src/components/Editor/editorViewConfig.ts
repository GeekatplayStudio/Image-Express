import type { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';

export const TOP_CROP_RATIO_PRESETS = ['free', '1:1', '4:3', '16:9'] as const;
export const TOP_EYEDROPPER_SAMPLE_SIZES = [1, 3, 5, 11] as const;
export const TOP_ZOOM_STEPS = [5, 10, 25, 50] as const;

export type TopCropRatioPreset = typeof TOP_CROP_RATIO_PRESETS[number];
export type TopEyedropperSampleSize = typeof TOP_EYEDROPPER_SAMPLE_SIZES[number];
export type TopZoomStep = typeof TOP_ZOOM_STEPS[number];

export const WINDOW_PANEL_ITEMS: Array<{ mode: PanelRailMode; label: string }> = [
    { mode: 'layers', label: 'Layers Panel' },
    { mode: 'properties', label: 'Properties Panel' },
    { mode: 'history', label: 'History Panel' },
    { mode: 'color', label: 'Color Panel' },
    { mode: 'swatches', label: 'Swatches Panel' },
    { mode: 'brushes', label: 'Brushes Panel' },
    { mode: 'channels', label: 'Channels Panel' },
    { mode: 'adjustments', label: 'Adjustments Panel' },
    { mode: 'navigator', label: 'Navigator Panel' },
    { mode: 'info', label: 'Info Panel' },
];

export type MediaOverlayPreset =
    | 'canvas-original'
    | 'instagram-square'
    | 'instagram-story'
    | 'facebook-post'
    | 'linkedin-post'
    | 'x-post'
    | 'youtube-landscape'
    | 'youtube-shorts'
    | 'tiktok-vertical';

export type MediaOverlayPresetSpec = {
    id: MediaOverlayPreset;
    label: string;
    width: number;
    height: number;
};

export type MediaOverlayPersistedState = {
    enabled: boolean;
    preset: MediaOverlayPreset;
    frameBounds?: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    activeFrameId?: string;
    frames?: Array<{
        id: string;
        preset: MediaOverlayPreset;
        includeInBatchExport: boolean;
        bounds?: {
            left: number;
            top: number;
            width: number;
            height: number;
        };
    }>;
};

export const MEDIA_OVERLAY_PRESETS: MediaOverlayPresetSpec[] = [
    { id: 'canvas-original', label: 'Original Size (Canvas)', width: 1, height: 1 },
    { id: 'instagram-square', label: 'Instagram 1:1', width: 1080, height: 1080 },
    { id: 'instagram-story', label: 'Instagram Story 9:16', width: 1080, height: 1920 },
    { id: 'facebook-post', label: 'Facebook Post 1200x630', width: 1200, height: 630 },
    { id: 'linkedin-post', label: 'LinkedIn Post 1200x627', width: 1200, height: 627 },
    { id: 'x-post', label: 'X Post 16:9', width: 1600, height: 900 },
    { id: 'youtube-landscape', label: 'YouTube 16:9', width: 1920, height: 1080 },
    { id: 'youtube-shorts', label: 'YouTube Shorts 9:16', width: 1080, height: 1920 },
    { id: 'tiktok-vertical', label: 'TikTok 9:16', width: 1080, height: 1920 },
];

export const MEDIA_OVERLAY_STORAGE_KEY_PREFIX = 'image-express-media-overlay';
