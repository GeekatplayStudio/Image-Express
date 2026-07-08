import {
    MEDIA_OVERLAY_PRESETS,
    type MediaOverlayNamingTemplate,
} from '@/components/Editor/editorViewConfig';
import type { MediaOverlayBatchTarget } from '@/components/Editor/useMediaOverlay';

export const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
};

export const sanitizeExportToken = (token: string) => (
    token
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'frame'
);

export const dataUrlToBlob = (dataUrl: string): Blob => {
    const [meta, data] = dataUrl.split(',', 2);
    const mimeMatch = meta?.match(/^data:([^;]+);base64$/);
    const mime = mimeMatch?.[1] || 'application/octet-stream';
    const decoded = window.atob(data || '');
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
        bytes[index] = decoded.charCodeAt(index);
    }
    return new Blob([bytes], { type: mime });
};

export const buildFrameZipEntryName = (
    frame: MediaOverlayBatchTarget,
    index: number,
    timestamp: string,
    options: {
        designName: string;
        namingTemplate: MediaOverlayNamingTemplate;
    },
) => {
    const preset = MEDIA_OVERLAY_PRESETS.find((item) => item.id === frame.preset);
    const frameToken = sanitizeExportToken(`frame-${String(index + 1).padStart(2, '0')}`);
    const presetToken = sanitizeExportToken(preset?.label || frame.preset);
    const designToken = sanitizeExportToken(options.designName || 'design');
    const compactDate = timestamp.slice(0, 10).replace(/-/g, '');

    switch (options.namingTemplate) {
        case 'design-frame-preset':
            return `${designToken}-${frameToken}-${presetToken}.png`;
        case 'design-preset-date-frame':
            return `${designToken}-${presetToken}-${compactDate}-${frameToken}.png`;
        case 'frame-preset':
        default:
            return `${frameToken}-${presetToken}.png`;
    }
};
