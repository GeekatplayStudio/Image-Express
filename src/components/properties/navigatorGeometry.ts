import * as fabric from 'fabric';
import type { NavigatorSceneRect } from './PanelUtilityViews';

/**
 * The geometry behind the Navigator panel: where the page is, where each layer
 * sits on it, and which part the editor is currently looking at. Pure functions
 * of the canvas, lifted out of PropertiesPanel where they were callbacks that
 * could only be exercised by mounting the whole panel.
 */

type NavigatorCanvas = fabric.Canvas & {
    artboard?: { width: number; height: number; left?: number; top?: number };
    artboardRect?: fabric.Rect;
};

/** The cap on layer outlines drawn in the miniature. */
export const MAX_NAVIGATOR_OBJECTS = 200;

/** Replace non-finite values and guarantee a positive size, so nothing downstream divides by zero. */
export const normalizeNavigatorRect = (rect: NavigatorSceneRect): NavigatorSceneRect => ({
    left: Number.isFinite(rect.left) ? rect.left : 0,
    top: Number.isFinite(rect.top) ? rect.top : 0,
    width: Number.isFinite(rect.width) ? Math.max(1, rect.width) : 1,
    height: Number.isFinite(rect.height) ? Math.max(1, rect.height) : 1,
});

/** A layer's axis-aligned bounds in scene coordinates, or null if it has none. */
export const getObjectSceneRect = (obj: fabric.Object | null | undefined): NavigatorSceneRect | null => {
    if (!obj) return null;
    if (typeof obj.getCoords === 'function') {
        const coords = obj.getCoords();
        if (Array.isArray(coords) && coords.length > 0) {
            const xs = coords.map((point) => point.x).filter((value) => Number.isFinite(value));
            const ys = coords.map((point) => point.y).filter((value) => Number.isFinite(value));
            if (xs.length > 0 && ys.length > 0) {
                const minX = Math.min(...xs);
                const minY = Math.min(...ys);
                return normalizeNavigatorRect({
                    left: minX,
                    top: minY,
                    width: Math.max(...xs) - minX,
                    height: Math.max(...ys) - minY,
                });
            }
        }
    }

    if (typeof obj.getBoundingRect === 'function') {
        const bounds = obj.getBoundingRect();
        if (
            Number.isFinite(bounds.left)
            && Number.isFinite(bounds.top)
            && Number.isFinite(bounds.width)
            && Number.isFinite(bounds.height)
        ) {
            return normalizeNavigatorRect(bounds);
        }
    }

    return null;
};

/** The page the miniature represents: the artboard record, else its rect, else the given size. */
export const getNavigatorWorldBounds = (
    canvas: fabric.Canvas | null,
    fallbackWidth: number,
    fallbackHeight: number,
): NavigatorSceneRect => {
    const fallback = { left: 0, top: 0, width: Math.max(1, fallbackWidth), height: Math.max(1, fallbackHeight) };
    if (!canvas) return fallback;

    const extended = canvas as NavigatorCanvas;
    if (extended.artboard) {
        return normalizeNavigatorRect({
            // A record carrying only a size is treated as sitting at the origin.
            left: extended.artboard.left ?? 0,
            top: extended.artboard.top ?? 0,
            width: extended.artboard.width,
            height: extended.artboard.height,
        });
    }
    return getObjectSceneRect(extended.artboardRect) ?? fallback;
};

/** Visible layers clipped to the page, as rects in scene coordinates. */
export const getNavigatorObjectRects = (
    canvas: fabric.Canvas | null,
    world: NavigatorSceneRect,
): NavigatorSceneRect[] => {
    if (!canvas) return [];
    const extended = canvas as NavigatorCanvas;
    return canvas.getObjects()
        .filter((obj) => obj !== extended.artboardRect && obj.visible !== false)
        .map((obj) => getObjectSceneRect(obj))
        .filter((rect): rect is NavigatorSceneRect => !!rect)
        .map((rect) => {
            const left = Math.max(world.left, rect.left);
            const top = Math.max(world.top, rect.top);
            const width = Math.min(world.left + world.width, rect.left + rect.width) - left;
            const height = Math.min(world.top + world.height, rect.top + rect.height) - top;
            return width <= 0 || height <= 0 ? null : { left, top, width, height };
        })
        .filter((rect): rect is NavigatorSceneRect => !!rect)
        .slice(0, MAX_NAVIGATOR_OBJECTS);
};

/** The part of the page the editor view currently shows, kept inside the page. */
export const getNavigatorViewport = (canvas: fabric.Canvas, world: NavigatorSceneRect): NavigatorSceneRect => {
    const zoom = Math.max(0.0001, canvas.getZoom() || 1);
    const viewport = canvas.viewportTransform || [zoom, 0, 0, zoom, 0, 0];
    const visibleWidth = (canvas.width || canvas.getWidth() || 1) / zoom;
    const visibleHeight = (canvas.height || canvas.getHeight() || 1) / zoom;
    const sceneLeft = -viewport[4] / zoom;
    const sceneTop = -viewport[5] / zoom;
    return normalizeNavigatorRect({
        left: Math.max(world.left, Math.min(sceneLeft, world.left + world.width - visibleWidth)),
        top: Math.max(world.top, Math.min(sceneTop, world.top + world.height - visibleHeight)),
        width: Math.min(world.width, visibleWidth),
        height: Math.min(world.height, visibleHeight),
    });
};
