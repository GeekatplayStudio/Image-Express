import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';
import { ensureObjectId } from '@/lib/fabric-utils';
import type {
    CanvasLockControl,
    LockedLayerOverlayEntry,
    RectBounds,
} from '@/components/Editor/editorView.types';

type ContextMenuState = {
    x: number;
    y: number;
    isOpen: boolean;
};

type CursorPreviewKind = 'brush' | 'eyedropper';

type CursorPreviewConfig = {
    kind: CursorPreviewKind;
    diameter: number;
};

type CursorPreviewState = {
    kind: CursorPreviewKind;
    clientX: number;
    clientY: number;
    diameter: number;
};

interface UseEditorCanvasOverlayStateParams {
    canvas: fabric.Canvas | null;
    activeTool: string;
    zoom: number;
    paintBrushSize: number;
    healingTopSize: number;
    cloneTopSize: number;
    historyBrushTopSize: number;
    blurTopSize: number;
    sharpenTopSize: number;
    dodgeTopSize: number;
}

export function useEditorCanvasOverlayState({
    canvas,
    activeTool,
    zoom,
    paintBrushSize,
    healingTopSize,
    cloneTopSize,
    historyBrushTopSize,
    blurTopSize,
    sharpenTopSize,
    dodgeTopSize,
}: UseEditorCanvasOverlayStateParams) {
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, isOpen: false });
    const [lockedLayerOverlayEntries, setLockedLayerOverlayEntries] = useState<LockedLayerOverlayEntry[]>([]);
    const [hoveredLockedLayerId, setHoveredLockedLayerId] = useState<string | null>(null);
    const [canvasLockControl, setCanvasLockControl] = useState<CanvasLockControl | null>(null);
    const [cursorPreview, setCursorPreview] = useState<CursorPreviewState | null>(null);
    const lockedLayerOverlayEntriesRef = useRef<LockedLayerOverlayEntry[]>([]);
    const hoveredLockedLayerIdRef = useRef<string | null>(null);
    const canvasLockControlRef = useRef<CanvasLockControl | null>(null);

    useEffect(() => {
        lockedLayerOverlayEntriesRef.current = lockedLayerOverlayEntries;
    }, [lockedLayerOverlayEntries]);

    useEffect(() => {
        hoveredLockedLayerIdRef.current = hoveredLockedLayerId;
    }, [hoveredLockedLayerId]);

    useEffect(() => {
        canvasLockControlRef.current = canvasLockControl;
    }, [canvasLockControl]);

    const cursorPreviewConfig = useMemo<CursorPreviewConfig | null>(() => {
        if (activeTool === 'eyedropper') {
            return { kind: 'eyedropper', diameter: 20 };
        }
        if (activeTool === 'paint') {
            return { kind: 'brush', diameter: paintBrushSize };
        }
        if (activeTool === 'healing' || activeTool === 'spot-healing' || activeTool === 'remove') {
            return { kind: 'brush', diameter: healingTopSize };
        }
        if (activeTool === 'clone-stamp') {
            return { kind: 'brush', diameter: cloneTopSize };
        }
        if (activeTool === 'history-brush') {
            return { kind: 'brush', diameter: historyBrushTopSize };
        }
        if (activeTool === 'blur') {
            return { kind: 'brush', diameter: blurTopSize };
        }
        if (activeTool === 'sharpen') {
            return { kind: 'brush', diameter: sharpenTopSize };
        }
        if (activeTool === 'dodge' || activeTool === 'burn' || activeTool === 'sponge') {
            return { kind: 'brush', diameter: dodgeTopSize };
        }
        return null;
    }, [
        activeTool,
        blurTopSize,
        cloneTopSize,
        dodgeTopSize,
        healingTopSize,
        historyBrushTopSize,
        paintBrushSize,
        sharpenTopSize,
    ]);

    const handleOpenWorkspaceContextMenu = useCallback((x: number, y: number) => {
        setContextMenu({ x, y, isOpen: true });
    }, []);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu((current) => ({ ...current, isOpen: false }));
    }, []);

    const setObjectLockedFromCanvasOverlay = useCallback((obj: fabric.Object & ExtendedFabricObject, nextLocked: boolean) => {
        if (!canvas) return;
        const runtimeCanvas = canvas as fabric.Canvas & {
            fire?: (eventName: string, payload?: Record<string, unknown>) => void;
        };
        obj.locked = nextLocked;
        obj.set({
            lockMovementX: nextLocked,
            lockMovementY: nextLocked,
            lockRotation: nextLocked,
            lockScalingX: nextLocked,
            lockScalingY: nextLocked,
            selectable: !nextLocked,
            evented: !nextLocked,
        });
        obj.setCoords();
        if (obj.group) obj.group.set('dirty', true);
        if (nextLocked) canvas.discardActiveObject();
        runtimeCanvas.fire?.('object:modified', { target: obj });
        canvas.requestRenderAll();
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;

        const LOCK_BADGE_MIN_SIZE = 11;
        const LOCK_BADGE_MAX_SIZE = 14;

        const isLockedOverlayCandidate = (obj: fabric.Object): obj is fabric.Object & ExtendedFabricObject => {
            const ext = obj as ExtendedFabricObject & {
                isSelectionOverlayHelper?: boolean;
                isPenDraftAnchor?: boolean;
            };
            if (!ext.locked) return false;
            if (obj.visible === false) return false;
            if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
            if (ext.isSelectionOverlayHelper || ext.isPenDraftAnchor || ext.isRetouchLayer) return false;
            if (ext.name === 'Artboard') return false;
            return true;
        };

        const isCanvasLockControlCandidate = (obj: fabric.Object | null | undefined): obj is fabric.Object & ExtendedFabricObject => {
            if (!obj) return false;
            const ext = obj as ExtendedFabricObject & {
                isSelectionOverlayHelper?: boolean;
                isPenDraftAnchor?: boolean;
            };
            if (ext.locked) return false;
            if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
            if (ext.isSelectionOverlayHelper || ext.isPenDraftAnchor || ext.isRetouchLayer) return false;
            if (ext.name === 'Artboard') return false;
            if (obj.visible === false) return false;
            return true;
        };

        const toRectBounds = (
            bounds: Partial<{ left: number; top: number; width: number; height: number }>
        ): RectBounds | null => {
            const left = Number(bounds.left);
            const top = Number(bounds.top);
            const width = Number(bounds.width);
            const height = Number(bounds.height);
            if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
                return null;
            }
            if (width <= 0 || height <= 0) return null;
            return { left, top, width, height };
        };

        const getObjectSceneBounds = (obj: fabric.Object): RectBounds | null => {
            if (typeof obj.getCoords === 'function') {
                const coords = obj.getCoords();
                if (Array.isArray(coords) && coords.length > 0) {
                    const xs = coords.map((point) => point.x).filter((value) => Number.isFinite(value));
                    const ys = coords.map((point) => point.y).filter((value) => Number.isFinite(value));
                    if (xs.length > 0 && ys.length > 0) {
                        const left = Math.min(...xs);
                        const right = Math.max(...xs);
                        const top = Math.min(...ys);
                        const bottom = Math.max(...ys);
                        if (Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom)) {
                            return toRectBounds({
                                left,
                                top,
                                width: right - left,
                                height: bottom - top,
                            });
                        }
                    }
                }
            }

            if (typeof obj.getBoundingRect === 'function') {
                return toRectBounds(obj.getBoundingRect());
            }

            return null;
        };

        const toViewportRect = (sceneBounds: RectBounds): RectBounds => {
            const viewport = canvas.viewportTransform || [1, 0, 0, 1, 0, 0] as fabric.TMat2D;
            const transformPoint = (
                point: fabric.Point
            ) => fabric.util.transformPoint(point, viewport);

            const topLeft = transformPoint(new fabric.Point(sceneBounds.left, sceneBounds.top));
            const bottomRight = transformPoint(new fabric.Point(
                sceneBounds.left + sceneBounds.width,
                sceneBounds.top + sceneBounds.height
            ));

            const left = Math.min(topLeft.x, bottomRight.x);
            const top = Math.min(topLeft.y, bottomRight.y);
            const width = Math.abs(bottomRight.x - topLeft.x);
            const height = Math.abs(bottomRight.y - topLeft.y);
            return { left, top, width, height };
        };

        const buildLockedOverlayEntries = (): LockedLayerOverlayEntry[] => {
            const entries: LockedLayerOverlayEntry[] = [];
            let paintOrder = 0;

            const walkObject = (obj: fabric.Object, parentLocked: boolean) => {
                const ext = obj as ExtendedFabricObject;
                const isCurrentLocked = Boolean(ext.locked);

                if (!parentLocked && isLockedOverlayCandidate(obj)) {
                    const sceneBounds = getObjectSceneBounds(obj);
                    if (sceneBounds) {
                        const viewportBounds = toViewportRect(sceneBounds);
                        if (viewportBounds.width > 0 && viewportBounds.height > 0) {
                            const iconSizeBase = Math.min(viewportBounds.width, viewportBounds.height) * 0.18;
                            const iconSize = Math.max(LOCK_BADGE_MIN_SIZE, Math.min(LOCK_BADGE_MAX_SIZE, iconSizeBase));
                            const iconPadding = Math.max(3, Math.round(iconSize * 0.22));
                            const iconBounds: RectBounds = {
                                left: viewportBounds.left + viewportBounds.width - iconSize - iconPadding,
                                top: viewportBounds.top + iconPadding,
                                width: iconSize,
                                height: iconSize,
                            };
                            const id = ensureObjectId(obj);

                            entries.push({
                                id,
                                object: obj as fabric.Object & ExtendedFabricObject,
                                paintOrder,
                                sceneBounds,
                                viewportBounds,
                                iconBounds,
                            });
                        }
                    }
                }

                paintOrder += 1;

                const isGroup = obj.type === 'group' && typeof (obj as fabric.Group).getObjects === 'function';
                if (!isGroup) return;

                const nextParentLocked = parentLocked || isCurrentLocked;
                if (nextParentLocked) return;

                const children = (obj as fabric.Group).getObjects();
                children.forEach((child) => walkObject(child, nextParentLocked));
            };

            canvas.getObjects().forEach((obj) => walkObject(obj, false));
            return entries;
        };

        const areEntriesEqual = (
            entries: LockedLayerOverlayEntry[],
            nextEntries: LockedLayerOverlayEntry[]
        ) => {
            const nearlyEqual = (a: number, b: number) => Math.abs(a - b) <= 0.5;
            if (entries.length !== nextEntries.length) return false;
            for (let index = 0; index < entries.length; index += 1) {
                const current = entries[index];
                const next = nextEntries[index];
                if (current.id !== next.id) return false;
                if (current.paintOrder !== next.paintOrder) return false;
                if (!nearlyEqual(current.viewportBounds.left, next.viewportBounds.left)) return false;
                if (!nearlyEqual(current.viewportBounds.top, next.viewportBounds.top)) return false;
                if (!nearlyEqual(current.viewportBounds.width, next.viewportBounds.width)) return false;
                if (!nearlyEqual(current.viewportBounds.height, next.viewportBounds.height)) return false;
                if (!nearlyEqual(current.iconBounds.left, next.iconBounds.left)) return false;
                if (!nearlyEqual(current.iconBounds.top, next.iconBounds.top)) return false;
                if (!nearlyEqual(current.iconBounds.width, next.iconBounds.width)) return false;
                if (!nearlyEqual(current.iconBounds.height, next.iconBounds.height)) return false;
            }
            return true;
        };

        const areCanvasLockControlsEqual = (
            current: CanvasLockControl | null,
            next: CanvasLockControl | null,
        ) => {
            if (current === next) return true;
            if (!current || !next) return false;
            const nearlyEqual = (a: number, b: number) => Math.abs(a - b) <= 0.5;
            return (
                current.id === next.id
                && current.object === next.object
                && current.locked === next.locked
                && current.label === next.label
                && nearlyEqual(current.buttonBounds.left, next.buttonBounds.left)
                && nearlyEqual(current.buttonBounds.top, next.buttonBounds.top)
                && nearlyEqual(current.buttonBounds.width, next.buttonBounds.width)
                && nearlyEqual(current.buttonBounds.height, next.buttonBounds.height)
            );
        };

        const syncLockedLayerOverlayEntries = () => {
            const nextEntries = buildLockedOverlayEntries();
            if (!areEntriesEqual(lockedLayerOverlayEntriesRef.current, nextEntries)) {
                lockedLayerOverlayEntriesRef.current = nextEntries;
                setLockedLayerOverlayEntries(nextEntries);
            }

            const nextHoveredLockedLayerId = hoveredLockedLayerIdRef.current
                && nextEntries.some((entry) => entry.id === hoveredLockedLayerIdRef.current)
                ? hoveredLockedLayerIdRef.current
                : null;
            if (nextHoveredLockedLayerId !== hoveredLockedLayerIdRef.current) {
                hoveredLockedLayerIdRef.current = nextHoveredLockedLayerId;
                setHoveredLockedLayerId(nextHoveredLockedLayerId);
            }

            const activeObject = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
            if (!isCanvasLockControlCandidate(activeObject)) {
                if (canvasLockControlRef.current) {
                    canvasLockControlRef.current = null;
                    setCanvasLockControl(null);
                }
                return;
            }

            const activeSceneBounds = getObjectSceneBounds(activeObject);
            if (!activeSceneBounds) {
                if (canvasLockControlRef.current) {
                    canvasLockControlRef.current = null;
                    setCanvasLockControl(null);
                }
                return;
            }

            const activeViewportBounds = toViewportRect(activeSceneBounds);
            const buttonSize = Math.max(12, Math.min(16, Math.min(activeViewportBounds.width, activeViewportBounds.height) * 0.16));
            const canvasElement = typeof canvas.getElement === 'function' ? canvas.getElement() : null;
            const maxLeft = Number.isFinite(canvasElement?.clientWidth)
                ? Math.max(2, (canvasElement?.clientWidth ?? 0) - buttonSize - 2)
                : Number.POSITIVE_INFINITY;
            const maxTop = Number.isFinite(canvasElement?.clientHeight)
                ? Math.max(2, (canvasElement?.clientHeight ?? 0) - buttonSize - 2)
                : Number.POSITIVE_INFINITY;
            const cornerInset = Math.max(2, Math.round(buttonSize * 0.24));
            const desiredLeft = activeViewportBounds.left + activeViewportBounds.width - buttonSize - cornerInset;
            const desiredTop = activeViewportBounds.top + cornerInset;
            const buttonBounds: RectBounds = {
                left: Math.min(maxLeft, Math.max(2, desiredLeft)),
                top: Math.min(maxTop, Math.max(2, desiredTop)),
                width: buttonSize,
                height: buttonSize,
            };
            const activeId = ensureObjectId(activeObject);
            const locked = Boolean(activeObject.locked);
            const label = `${locked ? 'Unlock' : 'Lock'} layer ${activeObject.name || activeId}`;
            const nextControl: CanvasLockControl = {
                id: activeId,
                object: activeObject,
                locked,
                buttonBounds,
                label,
            };
            if (!areCanvasLockControlsEqual(canvasLockControlRef.current, nextControl)) {
                canvasLockControlRef.current = nextControl;
                setCanvasLockControl(nextControl);
            }
        };

        canvas.on('object:added', syncLockedLayerOverlayEntries);
        canvas.on('object:removed', syncLockedLayerOverlayEntries);
        canvas.on('object:modified', syncLockedLayerOverlayEntries);
        canvas.on('object:moving', syncLockedLayerOverlayEntries);
        canvas.on('object:scaling', syncLockedLayerOverlayEntries);
        canvas.on('object:rotating', syncLockedLayerOverlayEntries);
        canvas.on('selection:created', syncLockedLayerOverlayEntries);
        canvas.on('selection:updated', syncLockedLayerOverlayEntries);
        canvas.on('selection:cleared', syncLockedLayerOverlayEntries);
        syncLockedLayerOverlayEntries();

        return () => {
            canvas.off('object:added', syncLockedLayerOverlayEntries);
            canvas.off('object:removed', syncLockedLayerOverlayEntries);
            canvas.off('object:modified', syncLockedLayerOverlayEntries);
            canvas.off('object:moving', syncLockedLayerOverlayEntries);
            canvas.off('object:scaling', syncLockedLayerOverlayEntries);
            canvas.off('object:rotating', syncLockedLayerOverlayEntries);
            canvas.off('selection:created', syncLockedLayerOverlayEntries);
            canvas.off('selection:updated', syncLockedLayerOverlayEntries);
            canvas.off('selection:cleared', syncLockedLayerOverlayEntries);
        };
    }, [canvas]);

    useEffect(() => {
        if (!canvas || !cursorPreviewConfig) return;

        const clampCursorDiameter = (diameter: number) => {
            if (cursorPreviewConfig.kind !== 'brush') return 20;
            const zoomScale = Number.isFinite(zoom) ? Math.max(0.05, zoom) : 1;
            return Math.max(8, Math.min(320, diameter * zoomScale));
        };

        const resolveClientPoint = (opt: fabric.TPointerEventInfo): { x: number; y: number } | null => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'clientX' in rawEvent && 'clientY' in rawEvent) {
                return { x: rawEvent.clientX, y: rawEvent.clientY };
            }

            const optWithScene = opt as unknown as { scenePoint?: fabric.Point };
            const canvasWithScene = canvas as unknown as {
                getScenePoint?: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point;
                lowerCanvasEl?: HTMLCanvasElement;
                getElement?: () => HTMLCanvasElement | null;
            };
            const scenePoint = optWithScene.scenePoint
                || (opt.e && typeof canvasWithScene.getScenePoint === 'function'
                    ? canvasWithScene.getScenePoint(opt.e)
                    : null);
            if (!scenePoint) return null;

            const canvasElement = canvasWithScene.lowerCanvasEl || canvasWithScene.getElement?.();
            if (!canvasElement) return null;

            const rect = canvasElement.getBoundingClientRect();
            const logicalWidth = Number(canvas.getWidth?.() || canvasElement.width || 1);
            const logicalHeight = Number(canvas.getHeight?.() || canvasElement.height || 1);
            const vt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
            const viewportX = (scenePoint.x * vt[0]) + (scenePoint.y * vt[2]) + vt[4];
            const viewportY = (scenePoint.x * vt[1]) + (scenePoint.y * vt[3]) + vt[5];

            return {
                x: rect.left + (viewportX * (rect.width / Math.max(1, logicalWidth))),
                y: rect.top + (viewportY * (rect.height / Math.max(1, logicalHeight))),
            };
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            const point = resolveClientPoint(opt);
            if (!point) return;

            setCursorPreview({
                kind: cursorPreviewConfig.kind,
                clientX: point.x,
                clientY: point.y,
                diameter: clampCursorDiameter(cursorPreviewConfig.diameter),
            });
        };

        const clearCursorPreview = () => {
            setCursorPreview(null);
        };

        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:out', clearCursorPreview);
        return () => {
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:out', clearCursorPreview);
            setCursorPreview(null);
        };
    }, [canvas, cursorPreviewConfig, zoom]);

    return {
        contextMenu,
        setContextMenu,
        handleOpenWorkspaceContextMenu,
        handleCloseContextMenu,
        lockedLayerOverlayEntries: canvas ? lockedLayerOverlayEntries : [],
        hoveredLockedLayerId: canvas ? hoveredLockedLayerId : null,
        setHoveredLockedLayerId,
        canvasLockControl: canvas ? canvasLockControl : null,
        cursorPreview: cursorPreviewConfig ? cursorPreview : null,
        setObjectLockedFromCanvasOverlay,
    };
}
