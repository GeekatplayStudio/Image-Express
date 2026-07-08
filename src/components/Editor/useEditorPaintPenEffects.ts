import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';

import {
    commitStroke,
    createBrushTip,
    disableRasterDrawingMode,
    getBrushSpacing,
    normalizePaintBrushConfig,
    renderStrokePreview,
    stampBrushTip,
    type PaintBrushConfig,
    type RasterBlendMode,
    type RasterBrushPreset,
} from '@/lib/raster-engine';
import { interpolateStrokePoints } from '@/lib/retouch-engine';
import { getScenePointerFromEvent } from '@/components/Editor/editorRetouchUtils';
import type { ExtendedFabricObject } from '@/types';
import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';

type UseEditorPaintPenEffectsArgs = {
    canvas: fabric.Canvas | null;
    activeTool: string;
    paintBrushPreset: RasterBrushPreset;
    paintBrushSize: number;
    paintBrushHardness: number;
    paintBrushOpacity: number;
    paintBrushFlow: number;
    paintBrushSmoothing: number;
    paintBlendMode: RasterBlendMode;
    setPenTopMode: (mode: 'path' | 'shape') => void;
    setPenTopPathOperation: (mode: 'add' | 'subtract' | 'intersect') => void;
    setPenTopAutoAddDelete: (enabled: boolean) => void;
    setPenTopRubberBand: (enabled: boolean) => void;
};

type PenDraftPayload = {
    closure?: 'open' | 'closed';
    pathOperation?: 'add' | 'subtract' | 'intersect';
    autoAddDelete?: boolean;
    rubberBand?: boolean;
};

type PaintLayerState = {
    image: fabric.Image & ExtendedFabricObject;
    /** Committed pixels. */
    baseCanvas: HTMLCanvasElement;
    baseCtx: CanvasRenderingContext2D;
    /** The fabric image element — base + live stroke composite. */
    displayCtx: CanvasRenderingContext2D;
    width: number;
    height: number;
};

const resolvePaintLayerBounds = (canvas: fabric.Canvas) => {
    const withArtboard = canvas as CanvasWithArtboard;
    const artboard = withArtboard.artboard;
    if (artboard && artboard.width > 0 && artboard.height > 0) {
        return {
            left: artboard.left || 0,
            top: artboard.top || 0,
            width: Math.max(1, Math.round(artboard.width)),
            height: Math.max(1, Math.round(artboard.height)),
        };
    }
    return {
        left: 0,
        top: 0,
        width: Math.max(1, Math.round(canvas.getWidth() || 1)),
        height: Math.max(1, Math.round(canvas.getHeight() || 1)),
    };
};

export function useEditorPaintPenEffects({
    canvas,
    activeTool,
    paintBrushPreset,
    paintBrushSize,
    paintBrushHardness,
    paintBrushOpacity,
    paintBrushFlow,
    paintBrushSmoothing,
    paintBlendMode,
    setPenTopMode,
    setPenTopPathOperation,
    setPenTopAutoAddDelete,
    setPenTopRubberBand,
}: UseEditorPaintPenEffectsArgs) {
    // Foreground color from the toolbar (updated via the canvas event bus).
    const brushColorRef = useRef('#000000');
    // Live brush config so pointer handlers always read current slider values.
    const brushConfigRef = useRef<PaintBrushConfig>({
        preset: paintBrushPreset,
        size: paintBrushSize,
        hardness: paintBrushHardness,
        flow: paintBrushFlow,
        opacity: paintBrushOpacity,
        smoothing: paintBrushSmoothing,
        color: '#000000',
        blendMode: paintBlendMode,
    });

    useEffect(() => {
        brushConfigRef.current = normalizePaintBrushConfig({
            preset: paintBrushPreset,
            size: paintBrushSize,
            hardness: paintBrushHardness,
            flow: paintBrushFlow,
            opacity: paintBrushOpacity,
            smoothing: paintBrushSmoothing,
            color: brushColorRef.current,
            blendMode: paintBlendMode,
        });
    }, [paintBrushPreset, paintBrushSize, paintBrushHardness, paintBrushFlow, paintBrushOpacity, paintBrushSmoothing, paintBlendMode]);

    useEffect(() => {
        if (!canvas) return;
        const bus = canvas as unknown as {
            on: (name: string, cb: (payload?: { foregroundColor?: string }) => void) => void;
            off: (name: string, cb: (payload?: { foregroundColor?: string }) => void) => void;
        };
        const handleColorChange = (payload?: { foregroundColor?: string }) => {
            if (payload?.foregroundColor) {
                brushColorRef.current = payload.foregroundColor;
                brushConfigRef.current = { ...brushConfigRef.current, color: payload.foregroundColor };
            }
        };
        bus.on('toolbar:color:change', handleColorChange);
        return () => bus.off('toolbar:color:change', handleColorChange);
    }, [canvas]);

    // --- Paint layer stroke interactions ---
    useEffect(() => {
        if (!canvas) return;
        if (activeTool !== 'paint') {
            disableRasterDrawingMode(canvas);
            return;
        }

        // The stamp engine handles strokes itself — no fabric free drawing,
        // no per-stroke Path objects.
        disableRasterDrawingMode(canvas);
        const previousSkipTargetFind = canvas.skipTargetFind;
        const previousSelection = canvas.selection;
        // Test mocks may not implement canvas.set — fall back to assignment.
        const applyCanvasFlags = (flags: Record<string, unknown>) => {
            const target = canvas as fabric.Canvas & { set?: (props: Record<string, unknown>) => void };
            if (typeof target.set === 'function') {
                target.set(flags);
            } else {
                Object.assign(target, flags);
            }
        };
        applyCanvasFlags({ skipTargetFind: true, selection: false, defaultCursor: 'crosshair' });

        const layerRef: { current: PaintLayerState | null } = { current: null };
        let strokeBuffer: HTMLCanvasElement | null = null;
        let strokeBufferCtx: CanvasRenderingContext2D | null = null;
        let strokeTip: HTMLCanvasElement | null = null;
        let strokeConfig: PaintBrushConfig | null = null;
        let lastLocalPoint: fabric.Point | null = null;
        let isPainting = false;

        /** Finds or creates the single shared Paint Layer. */
        const ensurePaintLayer = (): PaintLayerState | null => {
            const existingState = layerRef.current;
            if (existingState && canvas.getObjects().includes(existingState.image)) {
                return existingState;
            }

            const bounds = resolvePaintLayerBounds(canvas);

            const buildState = (image: fabric.Image & ExtendedFabricObject): PaintLayerState | null => {
                const width = Math.max(1, Math.round(image.width || bounds.width));
                const height = Math.max(1, Math.round(image.height || bounds.height));

                const baseCanvas = document.createElement('canvas');
                baseCanvas.width = width;
                baseCanvas.height = height;
                const baseCtx = baseCanvas.getContext('2d');
                if (!baseCtx) return null;

                const element = (image as unknown as { getElement?: () => HTMLCanvasElement | HTMLImageElement | null }).getElement?.() || null;
                if (element) {
                    try {
                        baseCtx.drawImage(element, 0, 0, width, height);
                    } catch {
                        // Ignore unreadable sources; painting starts from transparent.
                    }
                }

                const displayCanvas = document.createElement('canvas');
                displayCanvas.width = width;
                displayCanvas.height = height;
                const displayCtx = displayCanvas.getContext('2d');
                if (!displayCtx) return null;
                displayCtx.drawImage(baseCanvas, 0, 0);

                (image as unknown as { setElement?: (el: HTMLCanvasElement) => void }).setElement?.(displayCanvas);
                image.set({ objectCaching: false, dirty: true });
                image.setCoords();

                const state: PaintLayerState = { image, baseCanvas, baseCtx, displayCtx, width, height };
                layerRef.current = state;
                return state;
            };

            const existing = canvas.getObjects().find((obj) => (obj as ExtendedFabricObject).isPaintLayer) as
                | (fabric.Image & ExtendedFabricObject)
                | undefined;
            if (existing) {
                return buildState(existing);
            }

            const layerCanvas = document.createElement('canvas');
            layerCanvas.width = bounds.width;
            layerCanvas.height = bounds.height;
            if (!layerCanvas.getContext('2d')) return null;

            const image = new fabric.Image(layerCanvas, {
                left: bounds.left,
                top: bounds.top,
                originX: 'left',
                originY: 'top',
                objectCaching: false,
            }) as fabric.Image & ExtendedFabricObject;
            image.isPaintLayer = true;
            image.name = 'Paint Layer';
            image.id = image.id || `paint-layer-${Date.now()}`;

            canvas.add(image);
            canvas.requestRenderAll();
            return buildState(image);
        };

        /** Maps a scene point into the paint layer's pixel space (handles moved/scaled/rotated layers). */
        const toLayerPoint = (state: PaintLayerState, scenePoint: fabric.Point): fabric.Point => {
            const inverse = fabric.util.invertTransform(state.image.calcTransformMatrix());
            const planePoint = fabric.util.transformPoint(scenePoint, inverse);
            return new fabric.Point(planePoint.x + state.width / 2, planePoint.y + state.height / 2);
        };

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const pointerEvent = opt.e as MouseEvent;
            if (typeof pointerEvent.button === 'number' && pointerEvent.button !== 0) return;

            const state = ensurePaintLayer();
            if (!state) return;
            const scenePoint = getScenePointerFromEvent(canvas, opt);
            if (!scenePoint) return;

            strokeConfig = { ...brushConfigRef.current };
            strokeTip = createBrushTip(strokeConfig);
            strokeBuffer = document.createElement('canvas');
            strokeBuffer.width = state.width;
            strokeBuffer.height = state.height;
            strokeBufferCtx = strokeBuffer.getContext('2d');
            if (!strokeBufferCtx) {
                strokeBuffer = null;
                return;
            }

            isPainting = true;
            const localPoint = toLayerPoint(state, scenePoint);
            stampBrushTip(strokeBufferCtx, strokeTip, strokeConfig, localPoint.x, localPoint.y);
            lastLocalPoint = localPoint;
            renderStrokePreview(state.displayCtx, state.baseCanvas, strokeBuffer, strokeConfig);
            state.image.set('dirty', true);
            canvas.requestRenderAll();
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            if (!isPainting || !strokeBuffer || !strokeBufferCtx || !strokeConfig) return;
            const state = layerRef.current;
            if (!state) return;
            const scenePoint = getScenePointerFromEvent(canvas, opt);
            if (!scenePoint) return;

            const localPoint = toLayerPoint(state, scenePoint);
            const spacing = getBrushSpacing(strokeConfig);
            const points = lastLocalPoint
                ? interpolateStrokePoints(lastLocalPoint, localPoint, spacing)
                : [localPoint];
            for (const point of points) {
                stampBrushTip(strokeBufferCtx, strokeTip, strokeConfig, point.x, point.y);
            }
            lastLocalPoint = localPoint;
            renderStrokePreview(state.displayCtx, state.baseCanvas, strokeBuffer, strokeConfig);
            state.image.set('dirty', true);
            canvas.requestRenderAll();
        };

        const finishStroke = () => {
            if (!isPainting) return;
            isPainting = false;
            const state = layerRef.current;
            if (state && strokeBuffer && strokeConfig) {
                commitStroke(state.baseCtx, strokeBuffer, strokeConfig);
                state.displayCtx.clearRect(0, 0, state.width, state.height);
                state.displayCtx.drawImage(state.baseCanvas, 0, 0);
                state.image.set('dirty', true);
                canvas.fire('object:modified', { target: state.image });
                canvas.requestRenderAll();
            }
            strokeBuffer = null;
            strokeBufferCtx = null;
            strokeTip = null;
            strokeConfig = null;
            lastLocalPoint = null;
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', finishStroke);

        return () => {
            finishStroke();
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', finishStroke);
            applyCanvasFlags({ skipTargetFind: previousSkipTargetFind, selection: previousSelection });
        };
    }, [canvas, activeTool]);

    // --- Pen draft option sync (unchanged) ---
    useEffect(() => {
        if (!canvas) return;

        const canvasWithEvents = canvas as unknown as {
            on: (eventName: string, cb: (payload?: PenDraftPayload) => void) => void;
            off: (eventName: string, cb: (payload?: PenDraftPayload) => void) => void;
        };

        const syncPenMode = (payload?: PenDraftPayload) => {
            if (payload?.closure) {
                setPenTopMode(payload.closure === 'closed' ? 'shape' : 'path');
            }
            if (payload?.pathOperation) {
                setPenTopPathOperation(payload.pathOperation);
            }
            if (typeof payload?.autoAddDelete === 'boolean') {
                setPenTopAutoAddDelete(payload.autoAddDelete);
            }
            if (typeof payload?.rubberBand === 'boolean') {
                setPenTopRubberBand(payload.rubberBand);
            }
        };

        canvasWithEvents.on('pen:draft:update', syncPenMode);
        return () => {
            canvasWithEvents.off('pen:draft:update', syncPenMode);
        };
    }, [
        canvas,
        setPenTopAutoAddDelete,
        setPenTopMode,
        setPenTopPathOperation,
        setPenTopRubberBand,
    ]);
}
