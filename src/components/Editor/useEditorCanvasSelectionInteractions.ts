import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import type { LassoSelectionHelper, MarqueeSelectionHelper } from '@/components/Editor/editorView.types';
import {
    buildLassoPathData,
    OBJECT_PICK_SELECTION_TOOLS,
    resolveSelectionInteractionTool,
    type SelectionInteractionTool,
} from '@/components/Editor/selectionGeometry';
import { applyEditorCanvasToolConfig } from '@/components/Editor/editorCanvasToolMode';
import {
    commitLassoContentSelection,
    commitMarqueeContentSelection,
    commitWandContentSelection,
    type ContentSelectionToast,
    type WandSampleMode,
} from '@/components/Editor/contentSelectionCommit';
import { useSelectionMaskOverlay } from '@/components/Editor/useSelectionMaskOverlay';
import { clearDocumentSelection } from '@/lib/selection/documentSelectionStore';
import { type SelectionBrushPaintMode } from '@/lib/selection/selectionBrushStamp';
import { paintContentSelectionBrush } from '@/components/Editor/contentSelectionBrushPaint';

type UseEditorCanvasSelectionInteractionsArgs = {
    canvas: fabric.Canvas | null;
    activeTool: string;
    wandTopThreshold: number;
    selectFeather: number;
    wandSampleMode: WandSampleMode;
    wandSampleColor: string;
    onWandSampleColorChange?: (hex: string) => void;
    toast?: ContentSelectionToast;
    emptyTargetTitle: string;
    emptyTargetDescription: string;
    noPixelsTitle: string;
    noPixelsDescription: string;
};

const OVERLAY_FILL = 'rgba(37,99,235,0.14)';
const OVERLAY_STROKE = '#2563eb';

type BrushHelper = fabric.Circle & { isSelectionOverlayHelper?: boolean };

export function useEditorCanvasSelectionInteractions({
    canvas,
    activeTool,
    wandTopThreshold,
    selectFeather,
    wandSampleMode,
    wandSampleColor,
    onWandSampleColorChange,
    toast,
    emptyTargetTitle,
    emptyTargetDescription,
    noPixelsTitle,
    noPixelsDescription,
}: UseEditorCanvasSelectionInteractionsArgs) {
    const wandThresholdRef = useRef(wandTopThreshold);
    const featherRef = useRef(selectFeather);
    const wandModeRef = useRef(wandSampleMode);
    const wandColorRef = useRef(wandSampleColor);
    wandThresholdRef.current = wandTopThreshold;
    featherRef.current = selectFeather;
    wandModeRef.current = wandSampleMode;
    wandColorRef.current = wandSampleColor;

    useSelectionMaskOverlay(canvas);

    useEffect(() => {
        if (!canvas) return;

        const resolvedSelectionTool = resolveSelectionInteractionTool(activeTool);
        if (!resolvedSelectionTool) return;

        applyEditorCanvasToolConfig(canvas, activeTool);

        let isDragging = false;
        let spacePanArmed = false;
        let addToSelection = false;
        let brushPaintMode: SelectionBrushPaintMode = 'add';
        let selectionTool: SelectionInteractionTool | null = null;
        let dragStart: fabric.Point | null = null;
        let marqueeHelper: MarqueeSelectionHelper | null = null;
        let lassoHelper: LassoSelectionHelper | null = null;
        let brushHelper: BrushHelper | null = null;
        let lassoPoints: fabric.Point[] = [];
        let brushLayerPixelsRef = { current: null as ImageData | null };

        const isTypingTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            if (target.isContentEditable) return true;
            const tag = target.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
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

        const clearGestureHelpers = () => {
            if (marqueeHelper) {
                canvas.remove(marqueeHelper);
                marqueeHelper = null;
            }
            if (lassoHelper) {
                canvas.remove(lassoHelper);
                lassoHelper = null;
            }
            if (brushHelper) {
                canvas.remove(brushHelper);
                brushHelper = null;
            }
            lassoPoints = [];
            brushLayerPixelsRef.current = null;
        };

        const getScenePointer = (opt: fabric.TPointerEventInfo): fabric.Point | null => {
            const optWithScene = opt as unknown as { scenePoint?: fabric.Point; pointer?: { x: number; y: number } };
            if (optWithScene.scenePoint) return optWithScene.scenePoint;

            const canvasWithPointer = canvas as unknown as {
                getScenePoint?: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point;
                getPointer?: (e: Event, fromViewport?: boolean) => { x: number; y: number };
            };
            if (opt.e && typeof canvasWithPointer.getScenePoint === 'function') {
                return canvasWithPointer.getScenePoint(opt.e);
            }
            if (optWithScene.pointer) {
                return new fabric.Point(optWithScene.pointer.x, optWithScene.pointer.y);
            }
            if (opt.e && typeof canvasWithPointer.getPointer === 'function') {
                const point = canvasWithPointer.getPointer(opt.e);
                return new fabric.Point(point.x, point.y);
            }
            return null;
        };

        const claimPointerEvent = (opt: fabric.TPointerEventInfo) => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | undefined;
            if (!rawEvent) return;
            rawEvent.preventDefault?.();
            rawEvent.stopPropagation?.();
        };

        const ensureBrushHelper = (pointer: fabric.Point, radius: number) => {
            if (!brushHelper) {
                brushHelper = new fabric.Circle({
                    left: pointer.x,
                    top: pointer.y,
                    radius,
                    originX: 'center',
                    originY: 'center',
                    fill: brushPaintMode === 'subtract'
                        ? 'rgba(220,38,38,0.10)'
                        : 'rgba(37,99,235,0.08)',
                    stroke: brushPaintMode === 'subtract' ? '#dc2626' : OVERLAY_STROKE,
                    strokeWidth: 1.25,
                    strokeDashArray: [4, 3],
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    excludeFromExport: true,
                }) as BrushHelper;
                brushHelper.isSelectionOverlayHelper = true;
                canvas.add(brushHelper);
            } else {
                brushHelper.set({
                    left: pointer.x,
                    top: pointer.y,
                    radius,
                    fill: brushPaintMode === 'subtract'
                        ? 'rgba(220,38,38,0.10)'
                        : 'rgba(37,99,235,0.08)',
                    stroke: brushPaintMode === 'subtract' ? '#dc2626' : OVERLAY_STROKE,
                });
                brushHelper.setCoords();
            }
        };

        const paintSelectionBrushAt = (
            pointer: fabric.Point,
            tool: 'quick-select' | 'selection-brush',
        ) => {
            const radius = paintContentSelectionBrush({
                canvas,
                pointer,
                tool,
                mode: brushPaintMode,
                colorThreshold: wandThresholdRef.current,
                layerPixelsRef: brushLayerPixelsRef,
            });
            ensureBrushHelper(pointer, radius);
            canvas.requestRenderAll();
        };

        const cancelActiveCapture = () => {
            if (!isDragging) {
                if (marqueeHelper || lassoHelper || brushHelper) {
                    clearGestureHelpers();
                    canvas.requestRenderAll();
                    return true;
                }
                if (getDocumentSelectionPresent()) {
                    clearDocumentSelection(canvas);
                    canvas.requestRenderAll();
                    return true;
                }
                return false;
            }
            isDragging = false;
            selectionTool = null;
            dragStart = null;
            clearGestureHelpers();
            canvas.requestRenderAll();
            return true;
        };

        const getDocumentSelectionPresent = () => {
            const typed = canvas as fabric.Canvas & { __ieSelectionMask?: { data: Uint8ClampedArray } | null };
            const data = typed.__ieSelectionMask?.data;
            if (!data) return false;
            for (let i = 0; i < data.length; i += 1) {
                if (data[i] > 0) return true;
            }
            return false;
        };

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            if (
                spacePanArmed
                || canvas.defaultCursor === 'grab'
                || canvas.defaultCursor === 'grabbing'
            ) {
                return;
            }

            const tool = resolvedSelectionTool;
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;

            const pointer = getScenePointer(opt);
            if (!pointer) return;

            claimPointerEvent(opt);
            applyEditorCanvasToolConfig(canvas, activeTool);
            clearGestureHelpers();

            const shiftHeld = Boolean(rawEvent && 'shiftKey' in rawEvent && rawEvent.shiftKey);
            const altHeld = Boolean(rawEvent && 'altKey' in rawEvent && rawEvent.altKey);

            if (tool === 'wand') {
                commitWandContentSelection({
                    canvas,
                    pointer,
                    threshold: wandThresholdRef.current,
                    featherPx: featherRef.current,
                    sampleMode: wandModeRef.current,
                    seedColorHex: wandColorRef.current,
                    addToSelection: shiftHeld,
                    toast,
                    emptyTargetTitle,
                    emptyTargetDescription,
                    noPixelsTitle,
                    noPixelsDescription,
                    onSampledColor: onWandSampleColorChange,
                });
                return;
            }

            isDragging = true;
            addToSelection = shiftHeld;
            brushPaintMode = altHeld ? 'subtract' : 'add';
            selectionTool = tool;
            dragStart = pointer;

            if (tool === 'marquee') {
                marqueeHelper = new fabric.Rect({
                    left: pointer.x,
                    top: pointer.y,
                    width: 1,
                    height: 1,
                    fill: OVERLAY_FILL,
                    stroke: OVERLAY_STROKE,
                    strokeWidth: 1.5,
                    strokeDashArray: [6, 4],
                    originX: 'left',
                    originY: 'top',
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    excludeFromExport: true,
                }) as MarqueeSelectionHelper;
                marqueeHelper.isSelectionOverlayHelper = true;
                canvas.add(marqueeHelper);
            } else if (tool === 'lasso') {
                lassoPoints = [pointer];
                lassoHelper = new fabric.Path(buildLassoPathData([pointer, pointer]), {
                    fill: OVERLAY_FILL,
                    stroke: OVERLAY_STROKE,
                    strokeWidth: 1.5,
                    strokeDashArray: [6, 4],
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    excludeFromExport: true,
                }) as LassoSelectionHelper;
                lassoHelper.isSelectionOverlayHelper = true;
                canvas.add(lassoHelper);
            } else if (tool === 'quick-select' || tool === 'selection-brush') {
                brushLayerPixelsRef.current = null;
                paintSelectionBrushAt(pointer, tool);
            }

            canvas.requestRenderAll();
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            if (!isDragging || !selectionTool) return;

            const pointer = getScenePointer(opt);
            if (!pointer) return;
            claimPointerEvent(opt);

            if (selectionTool === 'marquee') {
                if (!dragStart || !marqueeHelper) return;
                marqueeHelper.set({
                    left: Math.min(dragStart.x, pointer.x),
                    top: Math.min(dragStart.y, pointer.y),
                    width: Math.max(1, Math.abs(pointer.x - dragStart.x)),
                    height: Math.max(1, Math.abs(pointer.y - dragStart.y)),
                });
                marqueeHelper.setCoords();
                canvas.requestRenderAll();
                return;
            }

            if (selectionTool === 'lasso') {
                if (!lassoHelper) return;
                const lastPoint = lassoPoints[lassoPoints.length - 1];
                if (lastPoint && Math.hypot(pointer.x - lastPoint.x, pointer.y - lastPoint.y) < 2) return;
                lassoPoints = [...lassoPoints, pointer];
                updateLassoHelperPath(lassoPoints, false);
                canvas.requestRenderAll();
                return;
            }

            if (selectionTool === 'quick-select' || selectionTool === 'selection-brush') {
                const rawMove = opt.e as MouseEvent | PointerEvent | undefined;
                if (rawMove && 'altKey' in rawMove) {
                    brushPaintMode = rawMove.altKey ? 'subtract' : 'add';
                }
                paintSelectionBrushAt(pointer, selectionTool);
            }
        };

        const handleMouseUp = (opt: fabric.TPointerEventInfo) => {
            if (!isDragging || !selectionTool) return;

            isDragging = false;
            const pointer = getScenePointer(opt) || dragStart;
            const tool = selectionTool;
            selectionTool = null;

            if (!pointer || !dragStart) {
                dragStart = null;
                clearGestureHelpers();
                return;
            }

            claimPointerEvent(opt);

            if (tool === 'marquee') {
                const start = dragStart;
                const shouldAdd = addToSelection;
                dragStart = null;
                addToSelection = false;
                clearGestureHelpers();
                commitMarqueeContentSelection({
                    canvas,
                    pointerStart: start,
                    pointerEnd: pointer,
                    featherPx: featherRef.current,
                    addToSelection: shouldAdd,
                    toast,
                    emptyTargetTitle,
                    emptyTargetDescription,
                });
                return;
            }

            if (tool === 'lasso') {
                const finalizedPoints = [...lassoPoints];
                const lastPoint = finalizedPoints[finalizedPoints.length - 1];
                if (!lastPoint || Math.hypot(pointer.x - lastPoint.x, pointer.y - lastPoint.y) >= 1) {
                    finalizedPoints.push(pointer);
                }
                const shouldAdd = addToSelection;
                dragStart = null;
                addToSelection = false;
                clearGestureHelpers();
                commitLassoContentSelection({
                    canvas,
                    points: finalizedPoints,
                    featherPx: featherRef.current,
                    addToSelection: shouldAdd,
                    toast,
                    emptyTargetTitle,
                    emptyTargetDescription,
                });
                return;
            }

            dragStart = null;
            addToSelection = false;
            brushPaintMode = 'add';
            if (brushHelper) {
                canvas.remove(brushHelper);
                brushHelper = null;
            }
            brushLayerPixelsRef.current = null;
            canvas.requestRenderAll();
        };

        const handleWindowKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'Space' && !isTypingTarget(event.target)) {
                spacePanArmed = true;
                return;
            }
            if (event.key !== 'Escape') return;
            if (cancelActiveCapture()) event.preventDefault();
        };

        const handleWindowKeyUp = (event: KeyboardEvent) => {
            if (event.code === 'Space') spacePanArmed = false;
        };

        const handleWindowBlur = () => {
            spacePanArmed = false;
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        window.addEventListener('keydown', handleWindowKeyDown);
        window.addEventListener('keyup', handleWindowKeyUp);
        window.addEventListener('blur', handleWindowBlur);

        return () => {
            isDragging = false;
            spacePanArmed = false;
            selectionTool = null;
            dragStart = null;
            lassoPoints = [];
            brushLayerPixelsRef.current = null;
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
            window.removeEventListener('keydown', handleWindowKeyDown);
            window.removeEventListener('keyup', handleWindowKeyUp);
            window.removeEventListener('blur', handleWindowBlur);
            clearGestureHelpers();
        };
    }, [
        canvas,
        activeTool,
        toast,
        emptyTargetTitle,
        emptyTargetDescription,
        noPixelsTitle,
        noPixelsDescription,
        onWandSampleColorChange,
    ]);

    useEffect(() => {
        if (!canvas) return;
        const typed = canvas as fabric.Canvas & { __ieRegionSelectionTool?: boolean };
        typed.__ieRegionSelectionTool = OBJECT_PICK_SELECTION_TOOLS.has(activeTool);
        return () => {
            typed.__ieRegionSelectionTool = false;
        };
    }, [canvas, activeTool]);
}
