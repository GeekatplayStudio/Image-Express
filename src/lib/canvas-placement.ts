// src/lib/canvas-placement.ts
// Deterministic placement helpers so newly created layers always appear
// centered in the user's current view instead of at fixed world coordinates
// (which land in the artboard's top-left corner once the view is panned/zoomed).
import * as fabric from 'fabric';

type ArtboardInfo = { width: number; height: number; left: number; top: number };
type CanvasWithArtboard = fabric.Canvas & { artboard?: ArtboardInfo };

/** World-space point currently shown at the center of the canvas element. */
export const getViewportCenterPoint = (canvas: fabric.Canvas): { x: number; y: number } => {
    const vpt = canvas.viewportTransform;
    const zoom = canvas.getZoom() || 1;
    const width = canvas.width || 0;
    const height = canvas.height || 0;
    if (!vpt || !width || !height) {
        const artboard = (canvas as CanvasWithArtboard).artboard;
        if (artboard) {
            return { x: artboard.left + artboard.width / 2, y: artboard.top + artboard.height / 2 };
        }
        return { x: width / 2, y: height / 2 };
    }
    return {
        x: (width / 2 - vpt[4]) / zoom,
        y: (height / 2 - vpt[5]) / zoom
    };
};

/**
 * Center `obj` on the visible viewport center, clamped so its center stays
 * within the artboard bounds (when an artboard is present). Keeps placement
 * consistent regardless of pan/zoom state.
 */
export const placeAtViewportCenter = (canvas: fabric.Canvas, obj: fabric.Object): void => {
    const center = getViewportCenterPoint(canvas);
    const artboard = (canvas as CanvasWithArtboard).artboard;
    if (artboard && artboard.width > 0 && artboard.height > 0) {
        center.x = Math.min(Math.max(center.x, artboard.left), artboard.left + artboard.width);
        center.y = Math.min(Math.max(center.y, artboard.top), artboard.top + artboard.height);
    }
    obj.setPositionByOrigin(new fabric.Point(center.x, center.y), 'center', 'center');
    obj.setCoords();
};
