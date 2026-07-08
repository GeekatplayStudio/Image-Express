import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';

import { normalizeColorValue, parseColorWithAlpha } from '@/lib/fabric-utils';
import type { ExtendedFabricObject } from '@/types';

type ShapeMode = 'shape' | 'path' | 'pixels';
type GradientType = 'linear' | 'radial' | 'angle';
type GradientBlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

type ShapeConfigOverrides = Partial<{
    mode: ShapeMode;
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    cornerRadius: number;
    fixedSize: boolean;
}>;

type GradientConfigOverrides = Partial<{
    type: GradientType;
    blendMode: GradientBlendMode;
    opacity: number;
    reverse: boolean;
    dither: boolean;
}>;

type UseEditorShapeGradientControlsArgs = {
    canvas: fabric.Canvas | null;
    initialShapeFillColor: string;
};

export function useEditorShapeGradientControls({
    canvas,
    initialShapeFillColor,
}: UseEditorShapeGradientControlsArgs) {
    const [gradientTopType, setGradientTopType] = useState<GradientType>('linear');
    const [gradientTopBlendMode, setGradientTopBlendMode] = useState<GradientBlendMode>('source-over');
    const [gradientTopOpacity, setGradientTopOpacity] = useState(100);
    const [gradientTopReverse, setGradientTopReverse] = useState(false);
    const [gradientTopDither, setGradientTopDither] = useState(false);

    const [shapeTopMode, setShapeTopMode] = useState<ShapeMode>('shape');
    const [shapeTopFillColor, setShapeTopFillColor] = useState<string>(initialShapeFillColor);
    const previousInitialShapeFillColorRef = useRef(initialShapeFillColor);
    const [shapeTopStrokeColor, setShapeTopStrokeColor] = useState('#111827');
    const [shapeTopStrokeWidth, setShapeTopStrokeWidth] = useState(0);
    const [shapeTopCornerRadius, setShapeTopCornerRadius] = useState(0);
    const [shapeTopCanSmoothAngles, setShapeTopCanSmoothAngles] = useState(false);
    const [shapeTopFixedSize, setShapeTopFixedSize] = useState(false);

    const isShapeEditableObject = useCallback((obj: fabric.Object | null | undefined): obj is fabric.Object & ExtendedFabricObject => {
        if (!obj) return false;
        if ((obj as ExtendedFabricObject).isStar) return true;
        return ['rect', 'circle', 'triangle', 'polygon', 'polyline', 'path', 'ellipse', 'line'].includes(obj.type || '');
    }, []);

    useEffect(() => {
        setShapeTopFillColor((prev) => {
            if (prev !== previousInitialShapeFillColorRef.current) {
                previousInitialShapeFillColorRef.current = initialShapeFillColor;
                return prev;
            }

            previousInitialShapeFillColorRef.current = initialShapeFillColor;
            return initialShapeFillColor;
        });
    }, [initialShapeFillColor]);

    const emitShapeTopConfig = useCallback((overrides?: ShapeConfigOverrides) => {
        if (!canvas) return;
        const nextMode = overrides?.mode ?? shapeTopMode;
        const nextFillColor = overrides?.fillColor ?? shapeTopFillColor;
        const nextStrokeColor = overrides?.strokeColor ?? shapeTopStrokeColor;
        const nextStrokeWidth = overrides?.strokeWidth ?? shapeTopStrokeWidth;
        const nextCornerRadius = overrides?.cornerRadius ?? shapeTopCornerRadius;
        const nextFixedSize = overrides?.fixedSize ?? shapeTopFixedSize;
        (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('shape:config:set', {
            mode: nextMode,
            fillColor: nextFillColor,
            strokeColor: nextStrokeColor,
            strokeWidth: Math.max(0, Math.min(40, Math.round(nextStrokeWidth))),
            cornerRadius: Math.max(0, Math.min(100, Math.round(nextCornerRadius))),
            fixedSize: nextFixedSize,
        });
    }, [canvas, shapeTopMode, shapeTopFillColor, shapeTopStrokeColor, shapeTopStrokeWidth, shapeTopCornerRadius, shapeTopFixedSize]);

    const applyShapeTopConfigToActiveObject = useCallback((overrides?: ShapeConfigOverrides) => {
        if (!canvas) return;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
        if (!isShapeEditableObject(active)) return;

        const nextMode = overrides?.mode ?? shapeTopMode;
        const nextFillColor = overrides?.fillColor ?? shapeTopFillColor;
        const nextStrokeColor = overrides?.strokeColor ?? shapeTopStrokeColor;
        const normalizedStrokeWidth = Math.max(0, Math.min(40, Math.round(overrides?.strokeWidth ?? shapeTopStrokeWidth)));
        const normalizedCornerRadius = Math.max(0, Math.min(100, Math.round(overrides?.cornerRadius ?? shapeTopCornerRadius)));
        const nextFixedSize = overrides?.fixedSize ?? shapeTopFixedSize;
        const resolvedFill = nextMode === 'path' ? 'transparent' : nextFillColor;
        const resolvedStrokeWidth = nextMode === 'path' ? Math.max(1, normalizedStrokeWidth) : normalizedStrokeWidth;

        if (active.type === 'rect') {
            (active as fabric.Rect).set({
                rx: normalizedCornerRadius,
                ry: normalizedCornerRadius,
            });
        }
        if (['triangle', 'polygon', 'polyline', 'path', 'line'].includes(active.type || '')) {
            active.set({
                strokeLineJoin: normalizedCornerRadius > 0 ? 'round' : 'miter',
                strokeLineCap: normalizedCornerRadius > 0 ? 'round' : 'butt',
            });
        }

        active.set({
            fill: resolvedFill,
            stroke: nextStrokeColor,
            strokeWidth: resolvedStrokeWidth,
            lockScalingX: nextFixedSize,
            lockScalingY: nextFixedSize,
            dirty: true,
        });
        active.shapeDrawMode = nextMode;
        active.shapeCornerRadius = normalizedCornerRadius;
        active.setCoords();
        canvas.requestRenderAll();
    }, [
        canvas,
        isShapeEditableObject,
        shapeTopMode,
        shapeTopFillColor,
        shapeTopStrokeColor,
        shapeTopStrokeWidth,
        shapeTopCornerRadius,
        shapeTopFixedSize,
    ]);

    useEffect(() => {
        if (!canvas) return;

        const syncShapeControls = () => {
            const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
            if (!isShapeEditableObject(active)) {
                setShapeTopCanSmoothAngles(false);
                return;
            }

            setShapeTopCanSmoothAngles(active.type === 'rect');

            let inferredMode: ShapeMode = active.shapeDrawMode === 'pixels' ? 'pixels' : 'shape';
            if (typeof active.fill === 'string') {
                const parsedFill = parseColorWithAlpha(active.fill);
                const normalizedFill = normalizeColorValue(parsedFill.color);
                if (normalizedFill && normalizedFill.startsWith('#')) {
                    setShapeTopFillColor(normalizedFill);
                }
                if (parsedFill.alpha <= 0 || parsedFill.color.toLowerCase() === 'transparent') {
                    inferredMode = active.shapeDrawMode === 'pixels' ? 'pixels' : 'path';
                }
            }

            if (typeof active.stroke === 'string') {
                const parsedStroke = parseColorWithAlpha(active.stroke);
                const normalizedStroke = normalizeColorValue(parsedStroke.color);
                if (normalizedStroke && normalizedStroke.startsWith('#')) {
                    setShapeTopStrokeColor(normalizedStroke);
                }
            }

            if (typeof active.strokeWidth === 'number') {
                setShapeTopStrokeWidth(Math.max(0, Math.min(40, Math.round(active.strokeWidth))));
            }

            const rectRadius = active.type === 'rect'
                ? Math.max(
                    typeof (active as fabric.Rect).rx === 'number' ? (active as fabric.Rect).rx : 0,
                    typeof (active as fabric.Rect).ry === 'number' ? (active as fabric.Rect).ry : 0,
                )
                : 0;
            const extCornerRadius = typeof active.shapeCornerRadius === 'number' ? active.shapeCornerRadius : 0;
            setShapeTopCornerRadius(Math.max(0, Math.min(100, Math.round(Math.max(rectRadius, extCornerRadius)))));

            setShapeTopMode(inferredMode);
            setShapeTopFixedSize(Boolean(active.lockScalingX && active.lockScalingY));
        };

        syncShapeControls();
        canvas.on('selection:created', syncShapeControls);
        canvas.on('selection:updated', syncShapeControls);
        canvas.on('object:modified', syncShapeControls);
        return () => {
            canvas.off('selection:created', syncShapeControls);
            canvas.off('selection:updated', syncShapeControls);
            canvas.off('object:modified', syncShapeControls);
        };
    }, [canvas, isShapeEditableObject]);

    const extractGradientStops = useCallback((fill: unknown) => {
        if (!fill || typeof fill !== 'object') return null;
        const grad = fill as fabric.Gradient<'linear' | 'radial'>;
        if (!Array.isArray(grad.colorStops)) return null;
        const normalized = grad.colorStops
            .map((stop) => ({
                offset: typeof stop.offset === 'number' ? Math.max(0, Math.min(1, stop.offset)) : 0,
                color: typeof stop.color === 'string' && stop.color.trim().length > 0 ? stop.color : '#0000ff',
            }))
            .sort((a, b) => a.offset - b.offset);
        if (normalized.length === 0) return null;
        return normalized;
    }, []);

    const resolveGradientStops = useCallback((fill: unknown, reverse: boolean) => {
        const fallbackStops = [
            { offset: 0, color: '#0000ff' },
            { offset: 1, color: '#ff0000' },
        ];
        const stops = extractGradientStops(fill) || fallbackStops;
        if (!reverse) return stops;
        return stops
            .map((stop) => ({ offset: 1 - stop.offset, color: stop.color }))
            .sort((a, b) => a.offset - b.offset);
    }, [extractGradientStops]);

    const applyGradientTopConfigToActiveObject = useCallback((overrides?: GradientConfigOverrides) => {
        if (!canvas) return;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject & {
            get: (key: string) => unknown;
            set: (props: unknown) => void;
            setCoords: () => void;
        }) | null;
        if (!active) return;

        const nextType = overrides?.type ?? gradientTopType;
        const nextBlendMode = overrides?.blendMode ?? gradientTopBlendMode;
        const nextOpacity = Math.max(1, Math.min(100, Math.round(overrides?.opacity ?? gradientTopOpacity)));
        const nextReverse = overrides?.reverse ?? gradientTopReverse;
        const nextDither = overrides?.dither ?? gradientTopDither;
        const currentFill = active.get('fill');
        const existingGradient = currentFill && typeof currentFill === 'object' && (currentFill as fabric.Gradient<'linear' | 'radial'>).type
            ? (currentFill as fabric.Gradient<'linear' | 'radial'>)
            : null;
        const nextStops = resolveGradientStops(currentFill, nextReverse);

        let nextGradient: fabric.Gradient<'linear' | 'radial'> | null = null;
        if (nextType === 'radial') {
            const radialSourceCoords = existingGradient?.type === 'radial' && existingGradient.coords
                ? (existingGradient.coords as {
                    x1?: number;
                    y1?: number;
                    r1?: number;
                    x2?: number;
                    y2?: number;
                    r2?: number;
                })
                : null;
            const radialCoords = existingGradient?.type === 'radial' && existingGradient.coords
                ? {
                    x1: radialSourceCoords?.x1 ?? 0.5,
                    y1: radialSourceCoords?.y1 ?? 0.5,
                    r1: radialSourceCoords?.r1 ?? 0,
                    x2: radialSourceCoords?.x2 ?? 0.5,
                    y2: radialSourceCoords?.y2 ?? 0.5,
                    r2: radialSourceCoords?.r2 ?? 0.5,
                }
                : { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.5 };
            nextGradient = new fabric.Gradient({
                type: 'radial',
                gradientUnits: 'percentage',
                coords: radialCoords,
                colorStops: nextStops,
            });
        } else {
            const linearCoords = existingGradient?.type === 'linear' && existingGradient.coords
                ? {
                    x1: existingGradient.coords.x1 ?? 0,
                    y1: existingGradient.coords.y1 ?? 0.5,
                    x2: existingGradient.coords.x2 ?? 1,
                    y2: existingGradient.coords.y2 ?? 0.5,
                }
                : { x1: 0, y1: 0.5, x2: 1, y2: 0.5 };
            nextGradient = new fabric.Gradient({
                type: 'linear',
                gradientUnits: 'percentage',
                coords: linearCoords,
                colorStops: nextStops,
            });
        }

        active.set({
            fill: nextGradient,
            globalCompositeOperation: nextBlendMode,
            opacity: nextOpacity / 100,
            dirty: true,
        });
        active.gradientTypeHint = nextType;
        active.gradientReversed = nextReverse;
        active.gradientDitherEnabled = nextDither;
        active.setCoords();
        canvas.requestRenderAll();
    }, [
        canvas,
        gradientTopType,
        gradientTopBlendMode,
        gradientTopOpacity,
        gradientTopReverse,
        gradientTopDither,
        resolveGradientStops,
    ]);

    useEffect(() => {
        if (!canvas) return;

        const syncGradientControls = () => {
            const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
            if (!active) return;
            const fill = active.fill as unknown;
            const gradient = fill && typeof fill === 'object' && ((fill as fabric.Gradient<'linear' | 'radial'>).type === 'linear' || (fill as fabric.Gradient<'linear' | 'radial'>).type === 'radial')
                ? (fill as fabric.Gradient<'linear' | 'radial'>)
                : null;
            if (!gradient) return;

            if (gradient.type === 'radial') {
                setGradientTopType('radial');
            } else {
                setGradientTopType(active.gradientTypeHint === 'angle' ? 'angle' : 'linear');
            }

            const blendMode = active.globalCompositeOperation;
            if (blendMode && ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].includes(blendMode)) {
                setGradientTopBlendMode(blendMode as GradientBlendMode);
            }

            if (typeof active.opacity === 'number') {
                setGradientTopOpacity(Math.max(1, Math.min(100, Math.round(active.opacity * 100))));
            }
            setGradientTopReverse(Boolean(active.gradientReversed));
            setGradientTopDither(Boolean(active.gradientDitherEnabled));
        };

        syncGradientControls();
        canvas.on('selection:created', syncGradientControls);
        canvas.on('selection:updated', syncGradientControls);
        canvas.on('object:modified', syncGradientControls);
        return () => {
            canvas.off('selection:created', syncGradientControls);
            canvas.off('selection:updated', syncGradientControls);
            canvas.off('object:modified', syncGradientControls);
        };
    }, [canvas]);

    const handleGradientTypeChange = useCallback((type: GradientType) => {
        setGradientTopType(type);
        applyGradientTopConfigToActiveObject({ type });
    }, [applyGradientTopConfigToActiveObject]);

    const handleGradientBlendModeChange = useCallback((blendMode: GradientBlendMode) => {
        setGradientTopBlendMode(blendMode);
        applyGradientTopConfigToActiveObject({ blendMode });
    }, [applyGradientTopConfigToActiveObject]);

    const handleGradientOpacityChange = useCallback((opacity: number) => {
        const normalizedOpacity = Math.max(1, Math.min(100, Math.round(opacity)));
        setGradientTopOpacity(normalizedOpacity);
        applyGradientTopConfigToActiveObject({ opacity: normalizedOpacity });
    }, [applyGradientTopConfigToActiveObject]);

    const handleGradientReverseChange = useCallback((enabled: boolean) => {
        setGradientTopReverse(enabled);
        applyGradientTopConfigToActiveObject({ reverse: enabled });
    }, [applyGradientTopConfigToActiveObject]);

    const handleGradientDitherChange = useCallback((enabled: boolean) => {
        setGradientTopDither(enabled);
        applyGradientTopConfigToActiveObject({ dither: enabled });
    }, [applyGradientTopConfigToActiveObject]);

    const handleShapeModeChange = useCallback((mode: ShapeMode) => {
        setShapeTopMode(mode);
        emitShapeTopConfig({ mode });
        applyShapeTopConfigToActiveObject({ mode });
    }, [applyShapeTopConfigToActiveObject, emitShapeTopConfig]);

    const handleShapeFillColorChange = useCallback((color: string) => {
        const normalizedColor = normalizeColorValue(color);
        if (!normalizedColor || !normalizedColor.startsWith('#')) return;
        setShapeTopFillColor(normalizedColor);
        emitShapeTopConfig({ fillColor: normalizedColor });
        applyShapeTopConfigToActiveObject({ fillColor: normalizedColor });
    }, [applyShapeTopConfigToActiveObject, emitShapeTopConfig]);

    const handleShapeStrokeColorChange = useCallback((color: string) => {
        const normalizedColor = normalizeColorValue(color);
        if (!normalizedColor || !normalizedColor.startsWith('#')) return;
        setShapeTopStrokeColor(normalizedColor);
        emitShapeTopConfig({ strokeColor: normalizedColor });
        applyShapeTopConfigToActiveObject({ strokeColor: normalizedColor });
    }, [applyShapeTopConfigToActiveObject, emitShapeTopConfig]);

    const handleShapeStrokeWidthChange = useCallback((width: number) => {
        const normalizedWidth = Math.max(0, Math.min(40, Math.round(width)));
        setShapeTopStrokeWidth(normalizedWidth);
        emitShapeTopConfig({ strokeWidth: normalizedWidth });
        applyShapeTopConfigToActiveObject({ strokeWidth: normalizedWidth });
    }, [applyShapeTopConfigToActiveObject, emitShapeTopConfig]);

    const handleShapeCornerRadiusChange = useCallback((radius: number) => {
        const normalizedRadius = Math.max(0, Math.min(100, Math.round(radius)));
        setShapeTopCornerRadius(normalizedRadius);
        emitShapeTopConfig({ cornerRadius: normalizedRadius });
        applyShapeTopConfigToActiveObject({ cornerRadius: normalizedRadius });
    }, [applyShapeTopConfigToActiveObject, emitShapeTopConfig]);

    const handleShapeFixedSizeChange = useCallback((enabled: boolean) => {
        setShapeTopFixedSize(enabled);
        emitShapeTopConfig({ fixedSize: enabled });
        applyShapeTopConfigToActiveObject({ fixedSize: enabled });
    }, [applyShapeTopConfigToActiveObject, emitShapeTopConfig]);

    return {
        gradientTopType,
        gradientTopBlendMode,
        gradientTopOpacity,
        gradientTopReverse,
        gradientTopDither,
        handleGradientTypeChange,
        handleGradientBlendModeChange,
        handleGradientOpacityChange,
        handleGradientReverseChange,
        handleGradientDitherChange,
        resolveGradientStops,
        shapeTopMode,
        shapeTopFillColor,
        shapeTopStrokeColor,
        shapeTopStrokeWidth,
        shapeTopCornerRadius,
        shapeTopCanSmoothAngles,
        shapeTopFixedSize,
        setShapeTopFillColor,
        handleShapeModeChange,
        handleShapeFillColorChange,
        handleShapeStrokeColorChange,
        handleShapeStrokeWidthChange,
        handleShapeCornerRadiusChange,
        handleShapeFixedSizeChange,
    };
}
