import * as fabric from 'fabric';

import type { TopCropRatioPreset } from '@/components/Editor/editorViewConfig';
import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';

export const getCanvasCenterPoint = (canvas: fabric.Canvas) => new fabric.Point(
    (canvas.width || canvas.getWidth()) / 2,
    (canvas.height || canvas.getHeight()) / 2,
);

export const parseCropAspectRatio = (preset: TopCropRatioPreset): number | null => {
    if (preset === 'free') return null;
    const [widthToken, heightToken] = preset.split(':');
    const width = Number(widthToken);
    const height = Number(heightToken);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }
    return width / height;
};

export const buildAspectCropRect = (
    sourceRect: { left: number; top: number; width: number; height: number },
    aspectRatio: number | null,
) => {
    if (!aspectRatio) {
        return {
            left: sourceRect.left,
            top: sourceRect.top,
            width: Math.max(1, sourceRect.width),
            height: Math.max(1, sourceRect.height),
        };
    }

    const sourceRatio = sourceRect.width / sourceRect.height;
    let width = sourceRect.width;
    let height = sourceRect.height;
    if (sourceRatio > aspectRatio) {
        width = sourceRect.height * aspectRatio;
    } else {
        height = sourceRect.width / aspectRatio;
    }
    return {
        left: sourceRect.left + (sourceRect.width - width) / 2,
        top: sourceRect.top + (sourceRect.height - height) / 2,
        width: Math.max(1, width),
        height: Math.max(1, height),
    };
};

export const rectsIntersect = (
    a: { left: number; top: number; width: number; height: number },
    b: { left: number; top: number; width: number; height: number },
) => (
    a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top
);

export const resolveUtilityCanvasSize = (canvas: fabric.Canvas) => {
    const activeCanvas = canvas as CanvasWithArtboard;
    if (activeCanvas.artboardRect) {
        return {
            width: Math.max(1, Math.round((activeCanvas.artboardRect.width || 0) * (activeCanvas.artboardRect.scaleX || 1))),
            height: Math.max(1, Math.round((activeCanvas.artboardRect.height || 0) * (activeCanvas.artboardRect.scaleY || 1))),
        };
    }

    if (activeCanvas.artboard) {
        return {
            width: Math.max(1, Math.round(activeCanvas.artboard.width)),
            height: Math.max(1, Math.round(activeCanvas.artboard.height)),
        };
    }

    const canvasZoom = canvas.getZoom() || 1;
    return {
        width: Math.max(1, Math.round((canvas.width || canvas.getWidth() || 1080) / canvasZoom)),
        height: Math.max(1, Math.round((canvas.height || canvas.getHeight() || 1080) / canvasZoom)),
    };
};
