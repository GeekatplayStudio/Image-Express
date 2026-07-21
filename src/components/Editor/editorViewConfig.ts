import type { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';

export const TOP_CROP_RATIO_PRESETS = ['free', '1:1', '4:3', '16:9'] as const;
export const TOP_EYEDROPPER_SAMPLE_SIZES = [1, 3, 5, 11] as const;
export const TOP_ZOOM_STEPS = [5, 10, 25, 50] as const;

export type TopCropRatioPreset = typeof TOP_CROP_RATIO_PRESETS[number];
export type TopEyedropperSampleSize = typeof TOP_EYEDROPPER_SAMPLE_SIZES[number];
export type TopZoomStep = typeof TOP_ZOOM_STEPS[number];

export const WINDOW_PANEL_ITEMS: Array<{ mode: PanelRailMode; labelKey: string }> = [
    { mode: 'layers', labelKey: 'window.panel.layers' },
    { mode: 'properties', labelKey: 'window.panel.properties' },
    { mode: 'history', labelKey: 'window.panel.history' },
    { mode: 'color', labelKey: 'window.panel.color' },
    { mode: 'swatches', labelKey: 'window.panel.swatches' },
    { mode: 'brushes', labelKey: 'window.panel.brushes' },
    { mode: 'channels', labelKey: 'window.panel.channels' },
    { mode: 'adjustments', labelKey: 'window.panel.adjustments' },
    { mode: 'navigator', labelKey: 'window.panel.navigator' },
    { mode: 'info', labelKey: 'window.panel.info' },
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
    exportToken: string;
    labelKey: string;
    width: number;
    height: number;
};

export type MediaOverlaySafeAreaPreset =
    | 'none'
    | 'title-safe-10'
    | 'action-safe-20';

export type MediaOverlaySafeAreaPresetSpec = {
    id: MediaOverlaySafeAreaPreset;
    exportToken: string;
    labelKey: string;
    insetRatio: number;
};

export type MediaOverlayNamingTemplate =
    | 'frame-preset'
    | 'design-frame-preset'
    | 'design-preset-date-frame';

export type MediaOverlayNamingTemplateSpec = {
    id: MediaOverlayNamingTemplate;
    exportToken: string;
    labelKey: string;
};

export type MediaOverlayVariantConversionMode =
    | 'fill'
    | 'fit'
    | 'safe-area';

export type MediaOverlayVariantConversionModeSpec = {
    id: MediaOverlayVariantConversionMode;
    exportToken: string;
    labelKey: string;
};

export type MediaOverlayPersistedState = {
    enabled: boolean;
    preset: MediaOverlayPreset;
    namingTemplate?: MediaOverlayNamingTemplate;
    variantConversionMode?: MediaOverlayVariantConversionMode;
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
        safeAreaPreset?: MediaOverlaySafeAreaPreset;
        bounds?: {
            left: number;
            top: number;
            width: number;
            height: number;
        };
    }>;
};

// `exportToken` is the stable English string used for export filenames and
// generated variant names; `labelKey` is what the UI renders. Keeping them
// separate means switching language never renames an exported file.
export const MEDIA_OVERLAY_PRESETS: MediaOverlayPresetSpec[] = [
    { id: 'canvas-original', exportToken: 'Original Size (Artboard)', labelKey: 'overlay.preset.canvasOriginal', width: 1, height: 1 },
    { id: 'instagram-square', exportToken: 'Instagram 1:1', labelKey: 'overlay.preset.instagramSquare', width: 1080, height: 1080 },
    { id: 'instagram-story', exportToken: 'Instagram Story 9:16', labelKey: 'overlay.preset.instagramStory', width: 1080, height: 1920 },
    { id: 'facebook-post', exportToken: 'Facebook Post 1200x630', labelKey: 'overlay.preset.facebookPost', width: 1200, height: 630 },
    { id: 'linkedin-post', exportToken: 'LinkedIn Post 1200x627', labelKey: 'overlay.preset.linkedinPost', width: 1200, height: 627 },
    { id: 'x-post', exportToken: 'X Post 16:9', labelKey: 'overlay.preset.xPost', width: 1600, height: 900 },
    { id: 'youtube-landscape', exportToken: 'YouTube 16:9', labelKey: 'overlay.preset.youtubeLandscape', width: 1920, height: 1080 },
    { id: 'youtube-shorts', exportToken: 'YouTube Shorts 9:16', labelKey: 'overlay.preset.youtubeShorts', width: 1080, height: 1920 },
    { id: 'tiktok-vertical', exportToken: 'TikTok 9:16', labelKey: 'overlay.preset.tiktokVertical', width: 1080, height: 1920 },
];

export const MEDIA_OVERLAY_SAFE_AREA_PRESETS: MediaOverlaySafeAreaPresetSpec[] = [
    { id: 'none', exportToken: 'None', labelKey: 'overlay.safe.none', insetRatio: 0 },
    { id: 'title-safe-10', exportToken: 'Title Safe (10%)', labelKey: 'overlay.safe.title10', insetRatio: 0.1 },
    { id: 'action-safe-20', exportToken: 'Action Safe (20%)', labelKey: 'overlay.safe.action20', insetRatio: 0.2 },
];

export const MEDIA_OVERLAY_NAMING_TEMPLATES: MediaOverlayNamingTemplateSpec[] = [
    { id: 'frame-preset', exportToken: 'Frame + Preset', labelKey: 'overlay.naming.framePreset' },
    { id: 'design-frame-preset', exportToken: 'Design + Frame + Preset', labelKey: 'overlay.naming.designFramePreset' },
    { id: 'design-preset-date-frame', exportToken: 'Design + Preset + Date + Frame', labelKey: 'overlay.naming.designPresetDateFrame' },
];

export const MEDIA_OVERLAY_VARIANT_CONVERSION_MODES: MediaOverlayVariantConversionModeSpec[] = [
    { id: 'fill', exportToken: 'Fill', labelKey: 'overlay.mode.fill' },
    { id: 'fit', exportToken: 'Fit', labelKey: 'overlay.mode.fit' },
    { id: 'safe-area', exportToken: 'Safe Area', labelKey: 'overlay.mode.safeArea' },
];

export const MEDIA_OVERLAY_STORAGE_KEY_PREFIX = 'image-express-media-overlay';

// Custom fabric object properties that must survive serialization: history
// snapshots, design saves, exports, multi-canvas snapshots and clones.
export const CUSTOM_SERIALIZED_PROPS: string[] = [
        'id',
        'sharedLayerId',
        'gradient',
        'pattern',
        'is3DModel',
        'modelUrl',
        'isStar',
        'starPoints',
        'starInnerRadius',
        'mediaType',
        'mediaSource',
        'layerTagColor',
        'name',
        'locked',
        'curveStrength',
        'curveCenter',
        'curveSpan',
        'textSpellcheck',
        'textBgEnabled',
        'textBgColor',
        'textBgPadding',
        'textBgCorners',
        'textBgStyle',
        'skewZ',
        'skewZBaseScale',
        'skewZBaseScaleX',
        'skewZBaseScaleY',
        'skewZBaseSkewX',
        'skewZBaseSkewY',
        'backsideBaseFlipX',
        'pseudoBacksidePreset',
        'taperDirection',
        'taperBaseLeft',
        'taperBaseTop',
        'threeDSettings',
        'isAdjustmentLayer',
        'adjustmentType',
        'adjustmentSettings',
        'clipped',
        'isClippedToBelow',
        'clipSourceId',
        'baseFilters',
        'channelSettings',
        'aiGenerated',
        'aiProvider',
        'isPenPath',
        'penMode',
        'penClosed',
        'penNodes',
        'penSourcePoints',
        'textPathSourceId',
        'shapeCornerRadius',
        'isRetouchLayer',
        'isPaintLayer',
        'gradientTypeHint',
        'gradientReversed',
        'gradientDitherEnabled'
    ];
