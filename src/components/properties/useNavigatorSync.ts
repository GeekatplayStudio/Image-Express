import { useCallback, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { normalizeColorValue } from '@/lib/fabric-utils';
import type { CanvasWithArtboard } from './propertiesPanelTypes';
import type { NavigatorSceneRect } from './PanelUtilityViews';

/**
 * Hook that manages the navigator mini-map state: world bounds,
 * viewport rect, object rects, and background colour.
 */
export function useNavigatorSync(
    canvas: fabric.Canvas | null,
    canvasWidth: number,
    canvasHeight: number,
    canvasColor: string,
) {
    const [navigatorWorld, setNavigatorWorld] = useState<NavigatorSceneRect>({ left: 0, top: 0, width: 1080, height: 1080 });
    const [navigatorViewport, setNavigatorViewport] = useState<NavigatorSceneRect>({ left: 0, top: 0, width: 1080, height: 1080 });
    const [navigatorObjects, setNavigatorObjects] = useState<NavigatorSceneRect[]>([]);
    const [navigatorBackground, setNavigatorBackground] = useState('#ffffff');
    const navigatorWorldRef = useRef<NavigatorSceneRect>({ left: 0, top: 0, width: 1080, height: 1080 });

    const normalizeNavigatorRect = useCallback((rect: NavigatorSceneRect): NavigatorSceneRect => {
        const width = Number.isFinite(rect.width) ? Math.max(1, rect.width) : 1;
        const height = Number.isFinite(rect.height) ? Math.max(1, rect.height) : 1;
        const left = Number.isFinite(rect.left) ? rect.left : 0;
        const top = Number.isFinite(rect.top) ? rect.top : 0;
        return { left, top, width, height };
    }, []);

    const getObjectSceneRect = useCallback((obj: fabric.Object | null | undefined): NavigatorSceneRect | null => {
        if (!obj) return null;
        if (typeof obj.getCoords === 'function') {
            const coords = obj.getCoords();
            if (Array.isArray(coords) && coords.length > 0) {
                const xs = coords.map((point) => point.x).filter((value) => Number.isFinite(value));
                const ys = coords.map((point) => point.y).filter((value) => Number.isFinite(value));
                if (xs.length > 0 && ys.length > 0) {
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);
                    if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)) {
                        return normalizeNavigatorRect({
                            left: minX, top: minY,
                            width: maxX - minX, height: maxY - minY,
                        });
                    }
                }
            }
        }
        if (typeof obj.getBoundingRect === 'function') {
            const bounds = obj.getBoundingRect();
            if (
                Number.isFinite(bounds.left) && Number.isFinite(bounds.top)
                && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)
            ) {
                return normalizeNavigatorRect({
                    left: bounds.left, top: bounds.top,
                    width: bounds.width, height: bounds.height,
                });
            }
        }
        return null;
    }, [normalizeNavigatorRect]);

    const getNavigatorWorldBounds = useCallback((): NavigatorSceneRect => {
        if (!canvas) {
            return { left: 0, top: 0, width: Math.max(1, canvasWidth), height: Math.max(1, canvasHeight) };
        }
        const extendedCanvas = canvas as CanvasWithArtboard;
        if (extendedCanvas.artboardRect) {
            const artboardRect = getObjectSceneRect(extendedCanvas.artboardRect);
            if (artboardRect) return artboardRect;
        }
        if (extendedCanvas.artboard) {
            return normalizeNavigatorRect({
                left: extendedCanvas.artboard.left,
                top: extendedCanvas.artboard.top,
                width: extendedCanvas.artboard.width,
                height: extendedCanvas.artboard.height,
            });
        }
        return { left: 0, top: 0, width: Math.max(1, canvasWidth), height: Math.max(1, canvasHeight) };
    }, [canvas, canvasWidth, canvasHeight, getObjectSceneRect, normalizeNavigatorRect]);

    const getNavigatorObjectRects = useCallback((world: NavigatorSceneRect) => {
        if (!canvas) return [];
        const extendedCanvas = canvas as CanvasWithArtboard;
        const items = canvas.getObjects()
            .filter((obj) => obj !== extendedCanvas.artboardRect && obj.visible !== false)
            .map((obj) => getObjectSceneRect(obj))
            .filter((rect): rect is NavigatorSceneRect => !!rect)
            .map((rect) => {
                const right = Math.min(world.left + world.width, rect.left + rect.width);
                const bottom = Math.min(world.top + world.height, rect.top + rect.height);
                const left = Math.max(world.left, rect.left);
                const top = Math.max(world.top, rect.top);
                const width = right - left;
                const height = bottom - top;
                if (width <= 0 || height <= 0) return null;
                return { left, top, width, height };
            })
            .filter((rect): rect is NavigatorSceneRect => !!rect);
        return items.slice(0, 200);
    }, [canvas, getObjectSceneRect]);

    const syncNavigatorStatic = useCallback(() => {
        if (!canvas) return;
        const nextWorld = getNavigatorWorldBounds();
        navigatorWorldRef.current = nextWorld;
        setNavigatorWorld(nextWorld);
        setNavigatorObjects(getNavigatorObjectRects(nextWorld));

        const extendedCanvas = canvas as CanvasWithArtboard;
        const artboardColor = extendedCanvas.artboardRect && typeof extendedCanvas.artboardRect.canvasBackgroundColor === 'string'
            ? normalizeColorValue(extendedCanvas.artboardRect.canvasBackgroundColor) || extendedCanvas.artboardRect.canvasBackgroundColor
            : null;
        setNavigatorBackground(artboardColor || canvasColor || '#ffffff');
    }, [canvas, canvasColor, getNavigatorObjectRects, getNavigatorWorldBounds]);

    const syncNavigatorViewport = useCallback(() => {
        if (!canvas) return;
        const world = navigatorWorldRef.current;
        const zoomValue = Math.max(0.0001, canvas.getZoom() || 1);
        const viewport = canvas.viewportTransform || [zoomValue, 0, 0, zoomValue, 0, 0];
        const visibleWidth = (canvas.width || canvas.getWidth() || 1) / zoomValue;
        const visibleHeight = (canvas.height || canvas.getHeight() || 1) / zoomValue;
        const sceneLeft = (-viewport[4]) / zoomValue;
        const sceneTop = (-viewport[5]) / zoomValue;
        const nextViewport = normalizeNavigatorRect({
            left: Math.max(world.left, Math.min(sceneLeft, world.left + world.width - visibleWidth)),
            top: Math.max(world.top, Math.min(sceneTop, world.top + world.height - visibleHeight)),
            width: Math.min(world.width, visibleWidth),
            height: Math.min(world.height, visibleHeight),
        });
        setNavigatorViewport(nextViewport);
    }, [canvas, normalizeNavigatorRect]);

    return {
        navigatorWorld,
        navigatorViewport,
        navigatorObjects,
        navigatorBackground,
        navigatorWorldRef,
        syncNavigatorStatic,
        syncNavigatorViewport,
    };
}
