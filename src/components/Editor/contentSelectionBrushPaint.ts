import type * as fabric from 'fabric';
import {
    commitDocumentSelection,
    ensureDocumentSelectionMask,
} from '@/lib/selection/documentSelectionStore';
import {
    stampQuickSelectIntoMask,
    stampSelectionBrushIntoMask,
    type SelectionBrushPaintMode,
} from '@/lib/selection/selectionBrushStamp';
import {
    captureLayerPixelsInArtboard,
    ensureObjectId,
    getArtboardSelectionBounds,
    resolveContentSelectionTarget,
} from '@/lib/selection/selectionLayerCapture';

export const QUICK_SELECT_RADIUS = 10;
export const SELECTION_BRUSH_RADIUS = 36;

type BrushPaintArgs = {
    canvas: fabric.Canvas;
    pointer: { x: number; y: number };
    tool: 'quick-select' | 'selection-brush';
    mode: SelectionBrushPaintMode;
    colorThreshold: number;
    layerPixelsRef: { current: ImageData | null };
};

/** Stamp Selection Brush / Quick Select into the document content mask. */
export function paintContentSelectionBrush(args: BrushPaintArgs) {
    const { canvas, pointer, tool, mode, colorThreshold, layerPixelsRef } = args;
    const radius = tool === 'quick-select' ? QUICK_SELECT_RADIUS : SELECTION_BRUSH_RADIUS;
    const mask = ensureDocumentSelectionMask(canvas);
    const target = resolveContentSelectionTarget(canvas, pointer as fabric.Point);

    if (tool === 'quick-select') {
        if (!layerPixelsRef.current && target) {
            layerPixelsRef.current = captureLayerPixelsInArtboard(
                canvas,
                target,
                getArtboardSelectionBounds(canvas),
            );
        }
        stampQuickSelectIntoMask(
            mask,
            layerPixelsRef.current,
            pointer.x,
            pointer.y,
            radius,
            mode,
            colorThreshold,
        );
    } else {
        stampSelectionBrushIntoMask(mask, pointer.x, pointer.y, radius, mode, 70);
    }

    commitDocumentSelection(canvas, mask, target ? ensureObjectId(target) : null);
    if (target) canvas.setActiveObject(target);
    return radius;
}
