import { useEffect } from 'react';
import * as fabric from 'fabric';
import { normalizeColorValue, parseColorWithAlpha } from '@/lib/fabric-utils';
import type { ExtendedFabricObject } from '@/types';
import type { LassoSelectionHelper, MarqueeSelectionHelper } from '@/components/Editor/editorView.types';

type SelectionMode = 'layer' | 'group';

type RectBounds = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type UseEditorCanvasSelectionInteractionsArgs = {
    canvas: fabric.Canvas | null;
    activeTool: string;
    selectionMode: SelectionMode;
    wandTopThreshold: number;
};

export function useEditorCanvasSelectionInteractions({
    canvas,
    activeTool,
    selectionMode,
    wandTopThreshold,
}: UseEditorCanvasSelectionInteractionsArgs) {
    useEffect(() => {
        if (!canvas) return;

        const resolvedSelectionTool = activeTool === 'quick-select'
            ? 'wand'
            : activeTool === 'selection-brush'
                ? 'lasso'
                : activeTool;

        let isDragging = false;
        let selectionTool: 'marquee' | 'lasso' | null = null;
        let dragStart: fabric.Point | null = null;
        let marqueeHelper: MarqueeSelectionHelper | null = null;
        let lassoHelper: LassoSelectionHelper | null = null;
        let lassoPoints: fabric.Point[] = [];

        const intersectsBounds = (a: RectBounds, b: RectBounds) => {
            return !(
                a.left + a.width < b.left
                || b.left + b.width < a.left
                || a.top + a.height < b.top
                || b.top + b.height < a.top
            );
        };

        const pointInPolygon = (point: fabric.Point, polygon: fabric.Point[]) => {
            if (polygon.length < 3) return false;
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const xi = polygon[i].x;
                const yi = polygon[i].y;
                const xj = polygon[j].x;
                const yj = polygon[j].y;
                const intersects = ((yi > point.y) !== (yj > point.y))
                    && (point.x < (((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON)) + xi);
                if (intersects) inside = !inside;
            }
            return inside;
        };

        const getPolygonBounds = (points: fabric.Point[]): RectBounds => {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            points.forEach((point) => {
                if (point.x < minX) minX = point.x;
                if (point.y < minY) minY = point.y;
                if (point.x > maxX) maxX = point.x;
                if (point.y > maxY) maxY = point.y;
            });

            return {
                left: minX,
                top: minY,
                width: Math.max(0, maxX - minX),
                height: Math.max(0, maxY - minY),
            };
        };

        const buildLassoPathData = (points: fabric.Point[], closed = false) => {
            if (points.length === 0) return '';
            const start = points[0];
            let pathData = `M ${start.x} ${start.y}`;
            for (let i = 1; i < points.length; i += 1) {
                pathData += ` L ${points[i].x} ${points[i].y}`;
            }
            if (closed && points.length > 2) {
                pathData += ' Z';
            }
            return pathData;
        };

        const updateLassoHelperPath = (points: fabric.Point[], closed = false) => {
            if (!lassoHelper || points.length === 0) return;
            const nextPath = new fabric.Path(buildLassoPathData(points, closed));
            lassoHelper.set({
                path: nextPath.path,
                width: nextPath.width,
                height: nextPath.height,
                pathOffset: nextPath.pathOffset,
                dirty: true,
            });
            lassoHelper.setCoords();
        };

        const clearSelectionHelpers = () => {
            if (marqueeHelper) {
                canvas.remove(marqueeHelper);
                marqueeHelper = null;
            }
            if (lassoHelper) {
                canvas.remove(lassoHelper);
                lassoHelper = null;
            }
            lassoPoints = [];
        };

        const getScenePointer = (opt: fabric.TPointerEventInfo): fabric.Point | null => {
            const optWithScene = opt as unknown as { scenePoint?: fabric.Point };
            if (optWithScene.scenePoint) return optWithScene.scenePoint;

            const canvasWithScene = canvas as unknown as {
                getScenePoint?: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point;
            };
            if (opt.e && typeof canvasWithScene.getScenePoint === 'function') {
                return canvasWithScene.getScenePoint(opt.e);
            }
            return null;
        };

        const collectSelectableObjects = () => {
            return canvas.getObjects().filter((obj) => {
                const ext = obj as ExtendedFabricObject & {
                    isPenDraftAnchor?: boolean;
                    isSelectionOverlayHelper?: boolean;
                };

                if (obj === marqueeHelper || obj === lassoHelper || ext.isSelectionOverlayHelper) return false;
                if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
                if (ext.isPenDraftAnchor) return false;
                if (ext.name === 'Artboard') return false;
                if (obj.selectable === false || obj.evented === false) return false;
                return true;
            });
        };

        const commitSelectedObjects = (selected: fabric.Object[]) => {
            if (selected.length === 0) {
                canvas.discardActiveObject();
                canvas.requestRenderAll();
                return;
            }

            if (selectionMode === 'layer' || selected.length === 1) {
                const topMost = selected[selected.length - 1];
                if (topMost) {
                    canvas.setActiveObject(topMost);
                    canvas.requestRenderAll();
                }
                return;
            }

            const activeSelection = new fabric.ActiveSelection(selected, { canvas });
            canvas.setActiveObject(activeSelection);
            canvas.requestRenderAll();
        };

        const commitMarqueeSelection = (selectionBounds: RectBounds) => {
            const selected = collectSelectableObjects().filter((obj) => {
                const objectBounds = obj.getBoundingRect();
                return intersectsBounds(selectionBounds, objectBounds);
            });
            commitSelectedObjects(selected);
        };

        const commitLassoSelection = (points: fabric.Point[]) => {
            if (points.length < 3) {
                canvas.requestRenderAll();
                return;
            }

            const polygonBounds = getPolygonBounds(points);
            const selected = collectSelectableObjects().filter((obj) => {
                const objectBounds = obj.getBoundingRect();
                if (!intersectsBounds(polygonBounds, objectBounds)) return false;

                const center = new fabric.Point(
                    objectBounds.left + (objectBounds.width / 2),
                    objectBounds.top + (objectBounds.height / 2)
                );
                if (pointInPolygon(center, points)) return true;

                const corners = [
                    new fabric.Point(objectBounds.left, objectBounds.top),
                    new fabric.Point(objectBounds.left + objectBounds.width, objectBounds.top),
                    new fabric.Point(objectBounds.left, objectBounds.top + objectBounds.height),
                    new fabric.Point(objectBounds.left + objectBounds.width, objectBounds.top + objectBounds.height),
                ];
                return corners.some((corner) => pointInPolygon(corner, points));
            });

            commitSelectedObjects(selected);
        };

        const toRgbColor = (value: unknown): { r: number; g: number; b: number } | null => {
            if (typeof value !== 'string') return null;

            const parsed = parseColorWithAlpha(value);
            if (parsed.alpha <= 0) return null;

            const normalized = (normalizeColorValue(parsed.color) || parsed.color).trim();
            const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
            if (shortHex) {
                const digits = shortHex[1];
                return {
                    r: Number.parseInt(`${digits[0]}${digits[0]}`, 16),
                    g: Number.parseInt(`${digits[1]}${digits[1]}`, 16),
                    b: Number.parseInt(`${digits[2]}${digits[2]}`, 16),
                };
            }

            const fullHex = normalized.match(/^#([0-9a-f]{6})$/i);
            if (fullHex) {
                const digits = fullHex[1];
                return {
                    r: Number.parseInt(digits.slice(0, 2), 16),
                    g: Number.parseInt(digits.slice(2, 4), 16),
                    b: Number.parseInt(digits.slice(4, 6), 16),
                };
            }

            const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
            if (rgbMatch) {
                const channels = rgbMatch[1]
                    .split(',')
                    .slice(0, 3)
                    .map((part) => Number.parseFloat(part.trim()));
                if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) {
                    return {
                        r: Math.max(0, Math.min(255, Math.round(channels[0]))),
                        g: Math.max(0, Math.min(255, Math.round(channels[1]))),
                        b: Math.max(0, Math.min(255, Math.round(channels[2]))),
                    };
                }
            }

            return null;
        };

        const getObjectRepresentativeColor = (obj: fabric.Object): { r: number; g: number; b: number } | null => {
            const ext = obj as ExtendedFabricObject;
            return toRgbColor(ext.fill) || toRgbColor(ext.stroke) || null;
        };

        const colorDistance = (
            a: { r: number; g: number; b: number },
            b: { r: number; g: number; b: number }
        ) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

        const isPointInsideBounds = (point: fabric.Point, bounds: RectBounds) => (
            point.x >= bounds.left
            && point.x <= bounds.left + bounds.width
            && point.y >= bounds.top
            && point.y <= bounds.top + bounds.height
        );

        const commitWandSelection = (opt: fabric.TPointerEventInfo, pointer: fabric.Point) => {
            const selectableObjects = collectSelectableObjects();
            if (selectableObjects.length === 0) {
                commitSelectedObjects([]);
                return;
            }

            const optWithTarget = opt as fabric.TPointerEventInfo & { target?: fabric.Object | null };
            const directTarget = optWithTarget.target && selectableObjects.includes(optWithTarget.target)
                ? optWithTarget.target
                : null;
            const fallbackTarget = selectableObjects
                .filter((obj) => isPointInsideBounds(pointer, obj.getBoundingRect()))
                .at(-1) || null;
            const seedTarget = directTarget || fallbackTarget;
            if (!seedTarget) {
                commitSelectedObjects([]);
                return;
            }

            const normalizedThreshold = Math.max(0, Math.min(180, Math.round(wandTopThreshold)));
            const seedColor = getObjectRepresentativeColor(seedTarget);
            if (!seedColor || normalizedThreshold <= 0) {
                commitSelectedObjects([seedTarget]);
                return;
            }

            const selected = selectableObjects.filter((obj) => {
                const objectColor = getObjectRepresentativeColor(obj);
                if (!objectColor) return obj === seedTarget;
                return colorDistance(seedColor, objectColor) <= normalizedThreshold;
            });

            if (!selected.includes(seedTarget)) {
                selected.push(seedTarget);
            }
            commitSelectedObjects(selected);
        };

        const cancelLassoCapture = () => {
            if (!isDragging || selectionTool !== 'lasso') return false;

            isDragging = false;
            selectionTool = null;
            dragStart = null;
            clearSelectionHelpers();
            canvas.requestRenderAll();
            return true;
        };

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const isMarquee = resolvedSelectionTool === 'marquee';
            const isLasso = resolvedSelectionTool === 'lasso';
            const isWand = resolvedSelectionTool === 'wand';
            if (!isMarquee && !isLasso && !isWand) return;

            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;

            const pointer = getScenePointer(opt);
            if (!pointer) return;

            if (isWand) {
                commitWandSelection(opt, pointer);
                return;
            }

            isDragging = true;
            selectionTool = isLasso ? 'lasso' : 'marquee';
            dragStart = pointer;
            clearSelectionHelpers();

            if (selectionTool === 'marquee') {
                marqueeHelper = new fabric.Rect({
                    left: pointer.x,
                    top: pointer.y,
                    width: 1,
                    height: 1,
                    fill: 'rgba(37,99,235,0.12)',
                    stroke: '#2563eb',
                    strokeWidth: 1,
                    strokeDashArray: [4, 4],
                    originX: 'left',
                    originY: 'top',
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    excludeFromExport: true,
                }) as MarqueeSelectionHelper;
                marqueeHelper.isSelectionOverlayHelper = true;
                canvas.add(marqueeHelper);
            } else {
                lassoPoints = [pointer];
                lassoHelper = new fabric.Path(buildLassoPathData([pointer, pointer]), {
                    fill: 'rgba(37,99,235,0.12)',
                    stroke: '#2563eb',
                    strokeWidth: 1.2,
                    strokeDashArray: [4, 4],
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    excludeFromExport: true,
                }) as LassoSelectionHelper;
                lassoHelper.isSelectionOverlayHelper = true;
                canvas.add(lassoHelper);
            }

            canvas.requestRenderAll();
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            if (!isDragging || !selectionTool) return;

            const pointer = getScenePointer(opt);
            if (!pointer) return;

            if (selectionTool === 'marquee') {
                if (!dragStart || !marqueeHelper) return;

                const left = Math.min(dragStart.x, pointer.x);
                const top = Math.min(dragStart.y, pointer.y);
                const width = Math.max(1, Math.abs(pointer.x - dragStart.x));
                const height = Math.max(1, Math.abs(pointer.y - dragStart.y));
                marqueeHelper.set({
                    left,
                    top,
                    width,
                    height,
                });
                marqueeHelper.setCoords();
                canvas.requestRenderAll();
                return;
            }

            if (!lassoHelper) return;

            const lastPoint = lassoPoints[lassoPoints.length - 1];
            if (lastPoint && Math.hypot(pointer.x - lastPoint.x, pointer.y - lastPoint.y) < 2) return;

            lassoPoints = [...lassoPoints, pointer];
            updateLassoHelperPath(lassoPoints, false);
            canvas.requestRenderAll();
        };

        const handleMouseUp = (opt: fabric.TPointerEventInfo) => {
            if (!isDragging || !selectionTool) return;

            isDragging = false;
            const pointer = getScenePointer(opt) || dragStart;
            if (!pointer || !dragStart) {
                selectionTool = null;
                dragStart = null;
                clearSelectionHelpers();
                return;
            }

            if (selectionTool === 'marquee') {
                const selectionBounds = {
                    left: Math.min(dragStart.x, pointer.x),
                    top: Math.min(dragStart.y, pointer.y),
                    width: Math.abs(pointer.x - dragStart.x),
                    height: Math.abs(pointer.y - dragStart.y),
                };
                selectionTool = null;
                dragStart = null;
                clearSelectionHelpers();

                if (selectionBounds.width < 2 || selectionBounds.height < 2) {
                    canvas.requestRenderAll();
                    return;
                }

                commitMarqueeSelection(selectionBounds);
                return;
            }

            const finalizedPoints = [...lassoPoints];
            const lastPoint = finalizedPoints[finalizedPoints.length - 1];
            if (!lastPoint || Math.hypot(pointer.x - lastPoint.x, pointer.y - lastPoint.y) >= 1) {
                finalizedPoints.push(pointer);
            }

            selectionTool = null;
            dragStart = null;
            clearSelectionHelpers();
            if (finalizedPoints.length < 3) {
                canvas.requestRenderAll();
                return;
            }

            commitLassoSelection(finalizedPoints);
        };

        const handleWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            if (cancelLassoCapture()) {
                event.preventDefault();
            }
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        window.addEventListener('keydown', handleWindowKeyDown);

        return () => {
            isDragging = false;
            selectionTool = null;
            dragStart = null;
            lassoPoints = [];
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
            window.removeEventListener('keydown', handleWindowKeyDown);
            clearSelectionHelpers();
        };
    }, [canvas, activeTool, selectionMode, wandTopThreshold]);
}
