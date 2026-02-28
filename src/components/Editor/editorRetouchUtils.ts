import * as fabric from 'fabric';

import {
    computeRetouchBrushProfile,
    isLocalPointInsideBounds,
    stampDodge,
    stampFromSource,
    stampSharpen,
    toLocalRetouchPoint,
    type RetouchBounds,
} from '@/lib/retouch-engine';
import type { CanvasWithArtboard, RetouchLayerState } from '@/components/Editor/editorView.types';

type UtilityCanvasSize = {
    width: number;
    height: number;
};

type RetouchControlValues = {
    healingTopSize: number;
    healingTopHardness: number;
    historyBrushTopSize: number;
    historyBrushTopHardness: number;
    blurTopSize: number;
    blurTopStrength: number;
    sharpenTopSize: number;
    sharpenTopStrength: number;
    dodgeTopSize: number;
    dodgeTopExposure: number;
    dodgeTopProtectTones: boolean;
    cloneTopSize: number;
    cloneTopHardness: number;
};

export const getRetouchBoundsFromCanvas = (
    canvas: fabric.Canvas,
    utilityCanvasSize: UtilityCanvasSize,
): RetouchBounds => {
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
};

export const getScenePointerFromEvent = (
    canvas: fabric.Canvas,
    opt: fabric.TPointerEventInfo,
): fabric.Point | null => {
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

export const buildSceneSourceCanvas = (
    canvas: fabric.Canvas,
    layer: RetouchLayerState,
    useAllLayers: boolean,
) => {
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
                    (point.x * vt[1]) + (point.y * vt[3]) + vt[5],
                );
            };

            const topLeft = mapSceneToViewport(new fabric.Point(layer.bounds.left, layer.bounds.top));
            const bottomRight = mapSceneToViewport(new fabric.Point(
                layer.bounds.left + layer.bounds.width,
                layer.bounds.top + layer.bounds.height,
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

export const buildHistorySourceCanvas = (
    historyImageData: ImageData | null,
    layer: RetouchLayerState,
) => {
    if (!historyImageData) return layer.layerCanvas;

    const historyCanvas = document.createElement('canvas');
    historyCanvas.width = historyImageData.width;
    historyCanvas.height = historyImageData.height;
    const historyCtx = historyCanvas.getContext('2d');
    if (!historyCtx) return layer.layerCanvas;

    historyCtx.putImageData(historyImageData, 0, 0);
    return historyCanvas;
};

export const resolveRetouchBrushProfile = (
    activeTool: string,
    values: RetouchControlValues,
) => {
    if (activeTool === 'clone-stamp') {
        return computeRetouchBrushProfile({
            mode: 'clone',
            size: values.cloneTopSize,
            hardness: values.cloneTopHardness,
        });
    }
    if (activeTool === 'healing') {
        return computeRetouchBrushProfile({
            mode: 'healing',
            size: values.healingTopSize,
            hardness: values.healingTopHardness,
        });
    }
    if (activeTool === 'history-brush') {
        return computeRetouchBrushProfile({
            mode: 'history',
            size: values.historyBrushTopSize,
            hardness: values.historyBrushTopHardness,
        });
    }
    if (activeTool === 'blur') {
        return computeRetouchBrushProfile({
            mode: 'blur',
            size: values.blurTopSize,
            strength: values.blurTopStrength,
        });
    }
    if (activeTool === 'sharpen') {
        return computeRetouchBrushProfile({
            mode: 'sharpen',
            size: values.sharpenTopSize,
            strength: values.sharpenTopStrength,
        });
    }
    return computeRetouchBrushProfile({
        mode: 'dodge',
        size: values.dodgeTopSize,
        exposure: values.dodgeTopExposure,
        protectTones: values.dodgeTopProtectTones,
    });
};

type StampRetouchAtPointArgs = {
    scenePoint: fabric.Point;
    layer: RetouchLayerState;
    profile: ReturnType<typeof computeRetouchBrushProfile>;
    isDodge: boolean;
    isSharpen: boolean;
    isHealing: boolean;
    isCloneStamp: boolean;
    dodgeTopProtectTones: boolean;
    sourceCanvas: HTMLCanvasElement | null;
    maskCanvas: HTMLCanvasElement | null;
    cloneOffset: fabric.Point | null;
    onMutated: () => void;
};

export const stampRetouchAtPoint = ({
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
    onMutated,
}: StampRetouchAtPointArgs) => {
    const localDestination = toLocalRetouchPoint(scenePoint, layer.bounds);
    if (!isLocalPointInsideBounds(localDestination, layer.bounds)) return;

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
            onMutated();
        }
        return;
    }

    if (!sourceCanvas) return;

    const localSource = isCloneStamp
        ? new fabric.Point(
            localDestination.x + (cloneOffset?.x || 0),
            localDestination.y + (cloneOffset?.y || 0),
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
            onMutated();
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
        onMutated();
    }
};
