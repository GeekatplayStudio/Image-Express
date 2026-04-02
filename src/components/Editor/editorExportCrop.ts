import type { CanvasWithArtboard, RectBounds } from '@/components/Editor/editorView.types';

export function resolveEditorExportCropBounds(canvas: CanvasWithArtboard | null): RectBounds {
    if (!canvas) {
        return {
            left: 0,
            top: 0,
            width: 800,
            height: 600,
        };
    }

    const artboard = canvas.artboard;
    const rect = canvas.artboardRect;

    if (artboard && artboard.width > 0 && artboard.height > 0) {
        return {
            left: artboard.left || rect?.left || 0,
            top: artboard.top || rect?.top || 0,
            width: artboard.width,
            height: artboard.height,
        };
    }

    if (rect) {
        const rectWidth = rect.getScaledWidth?.() ?? ((rect.width || 0) * (rect.scaleX || 1));
        const rectHeight = rect.getScaledHeight?.() ?? ((rect.height || 0) * (rect.scaleY || 1));

        if (rectWidth > 0 && rectHeight > 0) {
            return {
                left: rect.left || 0,
                top: rect.top || 0,
                width: rectWidth,
                height: rectHeight,
            };
        }
    }

    return {
        left: 0,
        top: 0,
        width: canvas.width || 800,
        height: canvas.height || 600,
    };
}