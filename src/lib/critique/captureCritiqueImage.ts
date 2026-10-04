import * as fabric from 'fabric';

/**
 * Capturing what the critic looks at: the whole page, or one selected layer.
 * Moved out of AICritiqueModal, which is over the file-size limit.
 */

export type CritiqueTarget = 'selection' | 'canvas';

export type CanvasWithSelectionControls = fabric.Canvas & {
    artboard?: { width: number; height: number };
    defaultCursor: string;
    hoverCursor: string;
    isDrawingMode?: boolean;
    selection: boolean;
    viewportTransform?: fabric.TMat2D;
};

type FabricObjectLike = fabric.Object & {
    name?: string;
};

export const resolveSelectionLabel = (target: fabric.Object | null | undefined): string | null => {
    if (!target) return null;
    const namedTarget = target as FabricObjectLike;
    if (typeof namedTarget.name === 'string' && namedTarget.name.trim().length > 0) {
        return namedTarget.name.trim();
    }
    if (typeof target.type === 'string' && target.type.trim().length > 0) {
        return target.type.replace(/-/g, ' ');
    }
    return 'Selected layer';
};

export const captureCritiqueImage = (canvas: CanvasWithSelectionControls, target: CritiqueTarget): string => {
    const originalViewportTransform = Array.isArray(canvas.viewportTransform) && canvas.viewportTransform.length === 6
        ? [...canvas.viewportTransform] as fabric.TMat2D
        : undefined;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.requestRenderAll();

    try {
        if (target === 'selection') {
            const activeObject = canvas.getActiveObject();
            if (!activeObject) {
                throw new Error('Select a layer on the canvas before running critique.');
            }

            const bounds = activeObject.getBoundingRect();
            return canvas.toDataURL({
                format: 'png',
                multiplier: 1,
                left: Math.max(0, bounds.left),
                top: Math.max(0, bounds.top),
                width: Math.max(1, bounds.width),
                height: Math.max(1, bounds.height),
            });
        }

        if (canvas.artboard) {
            return canvas.toDataURL({
                format: 'png',
                multiplier: 1,
                left: 0,
                top: 0,
                width: Math.max(1, canvas.artboard.width),
                height: Math.max(1, canvas.artboard.height),
            });
        }

        return canvas.toDataURL({ format: 'png', multiplier: 1 });
    } finally {
        if (originalViewportTransform) {
            if (typeof canvas.setViewportTransform === 'function') {
                canvas.setViewportTransform(originalViewportTransform);
            } else {
                canvas.viewportTransform = originalViewportTransform;
            }
            canvas.requestRenderAll();
        }
    }
};
