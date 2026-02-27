import { useCallback, useEffect, useRef } from 'react';
import * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';
import {
    computeRetouchBrushProfile,
    createSoftBrushMask,
    interpolateStrokePoints,
    isLocalPointInsideBounds,
    resolveNextCloneSourcePoint,
    stampDodge,
    stampFromSource,
    stampSharpen,
    toLocalRetouchPoint,
    type RetouchBounds,
} from '@/lib/retouch-engine';
import type {
    CanvasWithArtboard,
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

        const withArtboard = canvas as CanvasWithArtboard;
        const artboard = withArtboard.artboard;
        if (artboard && artboard.width > 0 && artboard.height > 0) {
            return {
                left: artboard.left,
                top: artboard.top,
                width: Math.max(1, Math.round(artboard.width)),
                height: Math.max(1, Math.round(artboard.height)),
            };
        }

        const fallbackWidth = Number(canvas.getWidth?.() || utilityCanvasSize.width || 1);
        const fallbackHeight = Number(canvas.getHeight?.() || utilityCanvasSize.height || 1);
        return {
            left: 0,
            top: 0,
            width: Math.max(1, Math.round(fallbackWidth)),
            height: Math.max(1, Math.round(fallbackHeight)),
        };
    }, [canvas, utilityCanvasSize.height, utilityCanvasSize.width]);

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

        const buildSceneSourceCanvas = (layer: RetouchLayerState, useAllLayers: boolean) => {
            if (!useAllLayers) {
                return layer.layerCanvas;
            }

            const source = document.createElement('canvas');
            source.width = layer.bounds.width;
            source.height = layer.bounds.height;
            const sourceCtx = source.getContext('2d');
            if (!sourceCtx) return null;

            const canvasAny = canvas as unknown as {
                toCanvasElement?: (options?: Record<string, unknown>) => HTMLCanvasElement;
                lowerCanvasEl?: HTMLCanvasElement;
                getElement?: () => HTMLCanvasElement | null;
            };

            if (typeof canvasAny.toCanvasElement === 'function') {
                try {
                    const snapshot = canvasAny.toCanvasElement({
                        left: layer.bounds.left,
                        top: layer.bounds.top,
                        width: layer.bounds.width,
                        height: layer.bounds.height,
                        multiplier: 1,
                        enableRetinaScaling: false,
                        withoutTransform: true,
                    });
                    sourceCtx.drawImage(snapshot, 0, 0, layer.bounds.width, layer.bounds.height);
                    return source;
                } catch {
                    // fall through to lower-canvas sampling
                }
            }

            const lowerCanvas = canvasAny.lowerCanvasEl || canvasAny.getElement?.();
            if (lowerCanvas) {
                try {
                    const vt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
                    const mapSceneToViewport = (point: fabric.Point) => {
                        return new fabric.Point(
                            (point.x * vt[0]) + (point.y * vt[2]) + vt[4],
                            (point.x * vt[1]) + (point.y * vt[3]) + vt[5]
                        );
                    };

                    const topLeft = mapSceneToViewport(new fabric.Point(layer.bounds.left, layer.bounds.top));
                    const bottomRight = mapSceneToViewport(new fabric.Point(
                        layer.bounds.left + layer.bounds.width,
                        layer.bounds.top + layer.bounds.height
                    ));
                    const logicalWidth = Number(canvas.getWidth?.() || layer.bounds.width || 1);
                    const logicalHeight = Number(canvas.getHeight?.() || layer.bounds.height || 1);
                    const pixelScaleX = lowerCanvas.width / Math.max(1, logicalWidth);
                    const pixelScaleY = lowerCanvas.height / Math.max(1, logicalHeight);

                    let sx = Math.floor(Math.min(topLeft.x, bottomRight.x) * pixelScaleX);
                    let sy = Math.floor(Math.min(topLeft.y, bottomRight.y) * pixelScaleY);
                    let sw = Math.ceil(Math.abs(bottomRight.x - topLeft.x) * pixelScaleX);
                    let sh = Math.ceil(Math.abs(bottomRight.y - topLeft.y) * pixelScaleY);

                    sx = Math.max(0, Math.min(lowerCanvas.width - 1, sx));
                    sy = Math.max(0, Math.min(lowerCanvas.height - 1, sy));
                    sw = Math.max(1, Math.min(lowerCanvas.width - sx, sw));
                    sh = Math.max(1, Math.min(lowerCanvas.height - sy, sh));

                    sourceCtx.drawImage(lowerCanvas, sx, sy, sw, sh, 0, 0, layer.bounds.width, layer.bounds.height);
                    return source;
                } catch {
                    // fallback to retouch-layer-only sampling
                }
            }

            try {
                sourceCtx.drawImage(layer.layerCanvas, 0, 0);
            } catch {
                return null;
            }

            return source;
        };

        const buildHistorySourceCanvas = (layer: RetouchLayerState) => {
            const historyImageData = retouchHistorySourceRef.current;
            if (!historyImageData) return layer.layerCanvas;

            const historyCanvas = document.createElement('canvas');
            historyCanvas.width = historyImageData.width;
            historyCanvas.height = historyImageData.height;
            const historyCtx = historyCanvas.getContext('2d');
            if (!historyCtx) return layer.layerCanvas;

            historyCtx.putImageData(historyImageData, 0, 0);
            return historyCanvas;
        };

        const getBrushProfile = () => {
            if (isCloneStamp) {
                return computeRetouchBrushProfile({
                    mode: 'clone',
                    size: cloneTopSize,
                    hardness: cloneTopHardness,
                });
            }
            if (isHealing) {
                return computeRetouchBrushProfile({
                    mode: 'healing',
                    size: healingTopSize,
                    hardness: healingTopHardness,
                });
            }
            if (isHistoryBrush) {
                return computeRetouchBrushProfile({
                    mode: 'history',
                    size: historyBrushTopSize,
                    hardness: historyBrushTopHardness,
                });
            }
            if (isBlur) {
                return computeRetouchBrushProfile({
                    mode: 'blur',
                    size: blurTopSize,
                    strength: blurTopStrength,
                });
            }
            if (isSharpen) {
                return computeRetouchBrushProfile({
                    mode: 'sharpen',
                    size: sharpenTopSize,
                    strength: sharpenTopStrength,
                });
            }
            return computeRetouchBrushProfile({
                mode: 'dodge',
                size: dodgeTopSize,
                exposure: dodgeTopExposure,
                protectTones: dodgeTopProtectTones,
            });
        };

        const markLayerMutated = (layer: RetouchLayerState) => {
            layer.image.set({ dirty: true });
            layer.image.setCoords();
            canvas.requestRenderAll();
            strokeMutated = true;
        };

        const stampAtPoint = (scenePoint: fabric.Point, layer: RetouchLayerState) => {
            const localDestination = toLocalRetouchPoint(scenePoint, layer.bounds);
            if (!isLocalPointInsideBounds(localDestination, layer.bounds)) return;

            const profile = getBrushProfile();
            const size = profile.size;
            const opacity = profile.opacity;

            if (isDodge) {
                const didStampDodge = stampDodge({
                    destinationCtx: layer.ctx,
                    destinationPoint: localDestination,
                    size,
                    opacity,
                    protectTones: dodgeTopProtectTones,
                    maskCanvas,
                });
                if (didStampDodge) {
                    markLayerMutated(layer);
                }
                return;
            }

            if (!sourceCanvas) return;

            const localSource = isCloneStamp
                ? new fabric.Point(
                    localDestination.x + (cloneOffset?.x || 0),
                    localDestination.y + (cloneOffset?.y || 0)
                )
                : localDestination;

            if (!isLocalPointInsideBounds(localSource, layer.bounds)) return;

            const blurPx = profile.blurPx;

            if (isSharpen) {
                const didSharpen = stampSharpen({
                    sourceCanvas,
                    destinationCtx: layer.ctx,
                    sourcePoint: localSource,
                    destinationPoint: localDestination,
                    size,
                    opacity,
                    amount: profile.sharpenAmount,
                    maskCanvas,
                });
                if (didSharpen) {
                    markLayerMutated(layer);
                }
                return;
            }

            const didStamp = stampFromSource({
                sourceCanvas,
                destinationCtx: layer.ctx,
                sourcePoint: localSource,
                destinationPoint: localDestination,
                size,
                opacity,
                blurPx,
                maskCanvas,
                compositeOperation: profile.compositeOperation,
            });
            let didMutate = didStamp;

            if (isHealing && didStamp && profile.secondaryPass) {
                const didSecondaryStamp = stampFromSource({
                    sourceCanvas,
                    destinationCtx: layer.ctx,
                    sourcePoint: localSource,
                    destinationPoint: localDestination,
                    size,
                    opacity: profile.secondaryPass.opacity,
                    blurPx: profile.secondaryPass.blurPx,
                    maskCanvas,
                    compositeOperation: profile.secondaryPass.compositeOperation,
                });
                didMutate = didMutate || didSecondaryStamp;
            }

            if (didMutate) {
                markLayerMutated(layer);
            }
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
                sourceCanvas = buildSceneSourceCanvas(layer, cloneTopSampleAllLayers);
            } else if (isHealing) {
                sourceCanvas = buildSceneSourceCanvas(layer, healingTopSampleAllLayers);
            } else if (isHistoryBrush) {
                sourceCanvas = buildHistorySourceCanvas(layer);
            } else if (isBlur) {
                sourceCanvas = buildSceneSourceCanvas(layer, blurTopSampleAllLayers);
            } else if (isSharpen) {
                sourceCanvas = buildSceneSourceCanvas(layer, sharpenTopSampleAllLayers);
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
