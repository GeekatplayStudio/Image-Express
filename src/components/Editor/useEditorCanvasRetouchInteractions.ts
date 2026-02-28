import { useCallback, useEffect, useRef } from 'react';
import * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';
import {
    createSoftBrushMask,
    interpolateStrokePoints,
    resolveNextCloneSourcePoint,
    type RetouchBounds,
} from '@/lib/retouch-engine';
import {
    buildHistorySourceCanvas,
    buildSceneSourceCanvas,
    getRetouchBoundsFromCanvas,
    getScenePointerFromEvent,
    resolveRetouchBrushProfile,
    stampRetouchAtPoint,
} from '@/components/Editor/editorRetouchUtils';
import type {
    RetouchLayerState,
} from '@/components/Editor/editorView.types';

type UtilityCanvasSize = {
    width: number;
    height: number;
};

type RetouchControls = {
    healingTopSize: number;
    healingTopHardness: number;
    healingTopSampleAllLayers: boolean;
    historyBrushTopSize: number;
    historyBrushTopHardness: number;
    blurTopSize: number;
    blurTopStrength: number;
    blurTopSampleAllLayers: boolean;
    sharpenTopSize: number;
    sharpenTopStrength: number;
    sharpenTopSampleAllLayers: boolean;
    dodgeTopSize: number;
    dodgeTopExposure: number;
    dodgeTopProtectTones: boolean;
    cloneTopSize: number;
    cloneTopHardness: number;
    cloneTopAligned: boolean;
    cloneTopSampleAllLayers: boolean;
    cloneSourcePoint: fabric.Point | null;
    setCloneSourcePoint: (point: fabric.Point | null) => void;
};

type UseEditorCanvasRetouchInteractionsArgs = {
    canvas: fabric.Canvas | null;
    utilityCanvasSize: UtilityCanvasSize;
    activeTool: string;
    retouchControls: RetouchControls;
    pushHistory: () => void;
    setIsDirty: (value: boolean) => void;
    toast: (options: { title: string; description: string; variant: 'warning' }) => void;
};

export function useEditorCanvasRetouchInteractions({
    canvas,
    utilityCanvasSize,
    activeTool,
    retouchControls,
    pushHistory,
    setIsDirty,
    toast,
}: UseEditorCanvasRetouchInteractionsArgs) {
    const retouchNoticeAtRef = useRef(0);
    const retouchLayerRef = useRef<RetouchLayerState | null>(null);
    const retouchHistorySourceRef = useRef<ImageData | null>(null);
    const {
        healingTopSize,
        healingTopHardness,
        healingTopSampleAllLayers,
        historyBrushTopSize,
        historyBrushTopHardness,
        blurTopSize,
        blurTopStrength,
        blurTopSampleAllLayers,
        sharpenTopSize,
        sharpenTopStrength,
        sharpenTopSampleAllLayers,
        dodgeTopSize,
        dodgeTopExposure,
        dodgeTopProtectTones,
        cloneTopSize,
        cloneTopHardness,
        cloneTopAligned,
        cloneTopSampleAllLayers,
        cloneSourcePoint,
        setCloneSourcePoint,
    } = retouchControls;

    const getRetouchBounds = useCallback((): RetouchBounds | null => {
        if (!canvas) return null;
        return getRetouchBoundsFromCanvas(canvas, utilityCanvasSize);
    }, [canvas, utilityCanvasSize]);

    const ensureRetouchLayer = useCallback((): RetouchLayerState | null => {
        if (!canvas) return null;

        const bounds = getRetouchBounds();
        if (!bounds) return null;

        const normalizeLayer = (
            imageLayer: fabric.Image & ExtendedFabricObject,
            sourceElement?: HTMLCanvasElement | HTMLImageElement | null
        ): RetouchLayerState | null => {
            const layerCanvas = document.createElement('canvas');
            layerCanvas.width = bounds.width;
            layerCanvas.height = bounds.height;
            const layerCtx = layerCanvas.getContext('2d');
            if (!layerCtx) return null;

            if (sourceElement) {
                try {
                    layerCtx.drawImage(sourceElement, 0, 0, bounds.width, bounds.height);
                } catch {
                    // ignore invalid source draw
                }
            }

            const imageAny = imageLayer as unknown as {
                setElement?: (element: HTMLCanvasElement) => void;
            };
            imageAny.setElement?.(layerCanvas);
            imageLayer.set({
                left: bounds.left,
                top: bounds.top,
                originX: 'left',
                originY: 'top',
                selectable: false,
                evented: false,
                hasControls: false,
                hasBorders: false,
                objectCaching: false,
                isRetouchLayer: true,
                name: imageLayer.name || 'Retouch Layer',
                dirty: true,
            });
            imageLayer.setCoords();

            const canvasWithFront = canvas as unknown as {
                bringObjectToFront?: (object: fabric.Object) => void;
                bringToFront?: (object: fabric.Object) => void;
            };
            canvasWithFront.bringObjectToFront?.(imageLayer);
            canvasWithFront.bringToFront?.(imageLayer);

            const layerState = {
                bounds,
                layerCanvas,
                ctx: layerCtx,
                image: imageLayer,
            };
            retouchLayerRef.current = layerState;
            try {
                retouchHistorySourceRef.current = layerCtx.getImageData(0, 0, bounds.width, bounds.height);
            } catch {
                retouchHistorySourceRef.current = null;
            }
            return layerState;
        };

        const current = retouchLayerRef.current;
        if (
            current
            && current.bounds.width === bounds.width
            && current.bounds.height === bounds.height
            && current.bounds.left === bounds.left
            && current.bounds.top === bounds.top
        ) {
            return current;
        }

        const existingLayer = canvas.getObjects().find((obj) => {
            return (obj as ExtendedFabricObject).isRetouchLayer;
        }) as (fabric.Image & ExtendedFabricObject) | undefined;
        if (existingLayer) {
            const existingAny = existingLayer as unknown as {
                getElement?: () => HTMLCanvasElement | HTMLImageElement | null;
            };
            const existingElement = existingAny.getElement?.() || null;
            return normalizeLayer(existingLayer, existingElement);
        }

        const newCanvas = document.createElement('canvas');
        newCanvas.width = bounds.width;
        newCanvas.height = bounds.height;
        const newCtx = newCanvas.getContext('2d');
        if (!newCtx) return null;

        const image = new fabric.Image(newCanvas, {
            left: bounds.left,
            top: bounds.top,
            originX: 'left',
            originY: 'top',
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false,
            objectCaching: false,
        }) as fabric.Image & ExtendedFabricObject;
        image.isRetouchLayer = true;
        image.name = 'Retouch Layer';
        image.id = image.id || `retouch-${Date.now()}`;

        canvas.add(image);
        const canvasWithFront = canvas as unknown as {
            bringObjectToFront?: (object: fabric.Object) => void;
            bringToFront?: (object: fabric.Object) => void;
        };
        canvasWithFront.bringObjectToFront?.(image);
        canvasWithFront.bringToFront?.(image);
        canvas.requestRenderAll();

        const layerState = {
            bounds,
            layerCanvas: newCanvas,
            ctx: newCtx,
            image,
        };
        retouchLayerRef.current = layerState;
        try {
            retouchHistorySourceRef.current = newCtx.getImageData(0, 0, bounds.width, bounds.height);
        } catch {
            retouchHistorySourceRef.current = null;
        }
        return layerState;
    }, [canvas, getRetouchBounds]);

    useEffect(() => {
        if (!canvas) {
            retouchLayerRef.current = null;
            retouchHistorySourceRef.current = null;
        }
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;

        const isHealing = activeTool === 'healing';
        const isCloneStamp = activeTool === 'clone-stamp';
        const isHistoryBrush = activeTool === 'history-brush';
        const isBlur = activeTool === 'blur';
        const isSharpen = activeTool === 'sharpen';
        const isDodge = activeTool === 'dodge';
        if (!isHealing && !isCloneStamp && !isHistoryBrush && !isBlur && !isSharpen && !isDodge) return;

        let isDrawing = false;
        let strokeMutated = false;
        let lastPoint: fabric.Point | null = null;
        let cloneOffset: fabric.Point | null = null;
        let sourceCanvas: HTMLCanvasElement | null = null;
        let maskCanvas: HTMLCanvasElement | null = null;

        const notifyRetouch = (title: string, description: string) => {
            const now = Date.now();
            if (now - retouchNoticeAtRef.current < 1200) return;

            retouchNoticeAtRef.current = now;
            toast({
                title,
                description,
                variant: 'warning',
            });
        };

        const getScenePointer = (opt: fabric.TPointerEventInfo): fabric.Point | null => getScenePointerFromEvent(canvas, opt);

        const getBrushProfile = () => resolveRetouchBrushProfile(activeTool, {
            healingTopSize,
            healingTopHardness,
            historyBrushTopSize,
            historyBrushTopHardness,
            blurTopSize,
            blurTopStrength,
            sharpenTopSize,
            sharpenTopStrength,
            dodgeTopSize,
            dodgeTopExposure,
            dodgeTopProtectTones,
            cloneTopSize,
            cloneTopHardness,
        });

        const markLayerMutated = (layer: RetouchLayerState) => {
            layer.image.set({ dirty: true });
            layer.image.setCoords();
            canvas.requestRenderAll();
            strokeMutated = true;
        };

        const stampAtPoint = (scenePoint: fabric.Point, layer: RetouchLayerState) => {
            const profile = getBrushProfile();
            stampRetouchAtPoint({
                scenePoint,
                layer,
                profile,
                isDodge,
                isSharpen,
                isHealing,
                isCloneStamp,
                dodgeTopProtectTones,
                sourceCanvas,
                maskCanvas,
                cloneOffset,
                onMutated: () => markLayerMutated(layer),
            });
        };

        const finishStroke = () => {
            if (!isDrawing) return;

            const endPoint = lastPoint;
            const nextCloneSourcePoint = isCloneStamp
                ? resolveNextCloneSourcePoint({
                    aligned: cloneTopAligned,
                    strokeMutated,
                    endPoint,
                    cloneOffset,
                })
                : null;

            isDrawing = false;
            lastPoint = null;
            cloneOffset = null;
            sourceCanvas = null;
            maskCanvas = null;
            if (strokeMutated) {
                pushHistory();
                setIsDirty(true);
            }
            if (nextCloneSourcePoint) {
                setCloneSourcePoint(nextCloneSourcePoint);
            }
            strokeMutated = false;
        };

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;

            const pointer = getScenePointer(opt);
            if (!pointer) return;

            if (isCloneStamp) {
                const isAltKey = Boolean(rawEvent && 'altKey' in rawEvent && rawEvent.altKey);
                if (isAltKey) {
                    setCloneSourcePoint(new fabric.Point(pointer.x, pointer.y));
                    return;
                }
                if (!cloneSourcePoint) {
                    notifyRetouch(
                        'Clone source required',
                        'Option-click on the canvas to set a clone source point.'
                    );
                    return;
                }
            }

            const layer = ensureRetouchLayer();
            if (!layer) {
                notifyRetouch(
                    'Retouch unavailable',
                    'Retouch layer could not be prepared on this canvas.'
                );
                return;
            }

            try {
                retouchHistorySourceRef.current = layer.ctx.getImageData(0, 0, layer.bounds.width, layer.bounds.height);
            } catch {
                retouchHistorySourceRef.current = null;
            }
            isDrawing = true;
            strokeMutated = false;
            lastPoint = pointer;
            const profile = getBrushProfile();
            maskCanvas = createSoftBrushMask(profile.size, profile.maskHardness);

            if (isCloneStamp) {
                cloneOffset = new fabric.Point(
                    (cloneSourcePoint?.x || 0) - pointer.x,
                    (cloneSourcePoint?.y || 0) - pointer.y
                );
                sourceCanvas = buildSceneSourceCanvas(canvas, layer, cloneTopSampleAllLayers);
            } else if (isHealing) {
                sourceCanvas = buildSceneSourceCanvas(canvas, layer, healingTopSampleAllLayers);
            } else if (isHistoryBrush) {
                sourceCanvas = buildHistorySourceCanvas(retouchHistorySourceRef.current, layer);
            } else if (isBlur) {
                sourceCanvas = buildSceneSourceCanvas(canvas, layer, blurTopSampleAllLayers);
            } else if (isSharpen) {
                sourceCanvas = buildSceneSourceCanvas(canvas, layer, sharpenTopSampleAllLayers);
            } else {
                sourceCanvas = null;
            }

            stampAtPoint(pointer, layer);
            if (!strokeMutated && !isDodge) {
                notifyRetouch(
                    'Retouch source unavailable',
                    'Could not read source pixels for the current stroke.'
                );
                finishStroke();
            }
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            if (!isDrawing || !lastPoint) return;

            const pointer = getScenePointer(opt);
            if (!pointer) return;

            const layer = retouchLayerRef.current;
            if (!layer) return;

            const stepSpacing = getBrushProfile().spacing;
            const points = interpolateStrokePoints(lastPoint, pointer, stepSpacing);
            points.forEach((point) => stampAtPoint(point, layer));
            lastPoint = pointer;
        };

        const handleMouseUp = () => {
            finishStroke();
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);

        return () => {
            finishStroke();
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
        };
    }, [
        activeTool,
        blurTopSampleAllLayers,
        blurTopSize,
        blurTopStrength,
        canvas,
        cloneSourcePoint,
        cloneTopAligned,
        cloneTopHardness,
        cloneTopSampleAllLayers,
        cloneTopSize,
        dodgeTopExposure,
        dodgeTopProtectTones,
        dodgeTopSize,
        ensureRetouchLayer,
        healingTopHardness,
        healingTopSampleAllLayers,
        healingTopSize,
        historyBrushTopHardness,
        historyBrushTopSize,
        pushHistory,
        setCloneSourcePoint,
        setIsDirty,
        sharpenTopSampleAllLayers,
        sharpenTopSize,
        sharpenTopStrength,
        toast,
    ]);
}
