import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import * as fabric from 'fabric';

import { normalizeColorValue, parseColorWithAlpha } from '@/lib/fabric-utils';
import {
    sampleColorAtCanvasCenter,
    sampleColorAtScenePoint,
} from '@/components/Editor/editorColorSampling';
import {
    TOP_CROP_RATIO_PRESETS,
    TOP_EYEDROPPER_SAMPLE_SIZES,
    TOP_ZOOM_STEPS,
    type TopCropRatioPreset,
    type TopEyedropperSampleSize,
    type TopZoomStep,
} from '@/components/Editor/editorViewConfig';
import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';
import type { ToastOptions } from '@/providers/ToastProvider';

type UseEditorTopCanvasControlsArgs = {
    canvas: fabric.Canvas | null;
    activeTool: string;
    setActiveTool: Dispatch<SetStateAction<string>>;
    setIsDirty: Dispatch<SetStateAction<boolean>>;
    setShapeTopFillColor: Dispatch<SetStateAction<string>>;
    setSampledTextColor: (color: string) => void;
    setZoom: Dispatch<SetStateAction<number>>;
    toast: (options: ToastOptions) => void;
};

export function useEditorTopCanvasControls({
    canvas,
    activeTool,
    setActiveTool,
    setIsDirty,
    setShapeTopFillColor,
    setSampledTextColor,
    setZoom,
    toast,
}: UseEditorTopCanvasControlsArgs) {
    const [utilityCanvasSize, setUtilityCanvasSize] = useState({ width: 1080, height: 1080 });
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [cropTopRatioPreset, setCropTopRatioPreset] = useState<TopCropRatioPreset>('free');
    const [cropTopDeleteOutside, setCropTopDeleteOutside] = useState(false);
    const [cropTopUseArtboardBounds, setCropTopUseArtboardBounds] = useState(true);
    const cropTopDraftRectRef = useRef<{
        left: number;
        top: number;
        width: number;
        height: number;
    } | null>(null);
    const [eyedropperTopSampleSize, setEyedropperTopSampleSize] = useState<TopEyedropperSampleSize>(1);
    const [eyedropperTopSampleSource, setEyedropperTopSampleSource] = useState<'current-layer' | 'all-layers'>('current-layer');
    const [eyedropperTopSampledColor, setEyedropperTopSampledColor] = useState('#000000');
    const [zoomTopMode, setZoomTopMode] = useState<'in' | 'out'>('in');
    const [zoomTopStep, setZoomTopStep] = useState<TopZoomStep>(10);

    const eyedropperPointerRef = useRef<fabric.Point | null>(null);
    const cropDraftHelperRef = useRef<(fabric.Rect & { isSelectionOverlayHelper?: boolean }) | null>(null);

    const handleZoom = useCallback((factor: number) => {
        if (!canvas) return;

        const wrapper = canvas.getElement()?.parentElement?.parentElement;
        if (wrapper && wrapper.clientWidth > 0 && wrapper.clientHeight > 0) {
            const parentWidth = wrapper.clientWidth;
            const parentHeight = wrapper.clientHeight;
            if (canvas.width !== parentWidth || canvas.height !== parentHeight) {
                canvas.setDimensions({ width: parentWidth, height: parentHeight });
            }
        }

        const currentZoom = canvas.getZoom();
        let nextZoom = currentZoom + factor;
        nextZoom = Math.max(0.05, Math.min(nextZoom, 20));

        const centerPoint = new fabric.Point(
            (canvas.width || canvas.getWidth()) / 2,
            (canvas.height || canvas.getHeight()) / 2
        );
        canvas.zoomToPoint(centerPoint, nextZoom);
        canvas.requestRenderAll();
        setZoom(nextZoom);
    }, [canvas, setZoom]);

    const handleFitToScreen = useCallback(() => {
        if (!canvas) return;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (typeof canvasWithArtboard.centerArtboard === 'function') {
            canvasWithArtboard.centerArtboard();
            setZoom(canvas.getZoom());
            return;
        }
        const centerPoint = new fabric.Point(
            (canvas.width || canvas.getWidth()) / 2,
            (canvas.height || canvas.getHeight()) / 2
        );
        canvas.zoomToPoint(centerPoint, 1);
        canvas.requestRenderAll();
        setZoom(1);
    }, [canvas, setZoom]);

    const handleZoomReset = useCallback(() => {
        if (!canvas) return;
        const centerPoint = new fabric.Point(
            (canvas.width || canvas.getWidth()) / 2,
            (canvas.height || canvas.getHeight()) / 2
        );
        canvas.zoomToPoint(centerPoint, 1);
        canvas.requestRenderAll();
        setZoom(1);
    }, [canvas, setZoom]);

    const parseCropAspectRatio = useCallback((preset: TopCropRatioPreset): number | null => {
        if (preset === 'free') return null;
        const [widthToken, heightToken] = preset.split(':');
        const width = Number(widthToken);
        const height = Number(heightToken);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            return null;
        }
        return width / height;
    }, []);

    const buildAspectCropRect = useCallback((
        sourceRect: { left: number; top: number; width: number; height: number },
        aspectRatio: number | null
    ) => {
        if (!aspectRatio) {
            return {
                left: sourceRect.left,
                top: sourceRect.top,
                width: Math.max(1, sourceRect.width),
                height: Math.max(1, sourceRect.height),
            };
        }

        const sourceRatio = sourceRect.width / sourceRect.height;
        let width = sourceRect.width;
        let height = sourceRect.height;
        if (sourceRatio > aspectRatio) {
            width = sourceRect.height * aspectRatio;
        } else {
            height = sourceRect.width / aspectRatio;
        }
        return {
            left: sourceRect.left + (sourceRect.width - width) / 2,
            top: sourceRect.top + (sourceRect.height - height) / 2,
            width: Math.max(1, width),
            height: Math.max(1, height),
        };
    }, []);

    const applyTopCropSettings = useCallback(() => {
        if (!canvas) return;
        const activeCanvas = canvas as CanvasWithArtboard;
        const fallbackWidth = canvas.width || canvas.getWidth();
        const fallbackHeight = canvas.height || canvas.getHeight();
        if (!fallbackWidth || !fallbackHeight) return;

        const sourceRect = cropTopUseArtboardBounds && activeCanvas.artboard
            ? {
                left: activeCanvas.artboard.left,
                top: activeCanvas.artboard.top,
                width: activeCanvas.artboard.width,
                height: activeCanvas.artboard.height,
            }
            : { left: 0, top: 0, width: fallbackWidth, height: fallbackHeight };

        const cropTopDraftRect = cropTopDraftRectRef.current;
        const hasDraftRect = Boolean(
            cropTopDraftRect
            && cropTopDraftRect.width > 1
            && cropTopDraftRect.height > 1
        );
        const cropRect = hasDraftRect
            ? {
                left: cropTopDraftRect!.left,
                top: cropTopDraftRect!.top,
                width: cropTopDraftRect!.width,
                height: cropTopDraftRect!.height,
            }
            : buildAspectCropRect(sourceRect, parseCropAspectRatio(cropTopRatioPreset));

        Object.assign(activeCanvas as { artboard?: CanvasWithArtboard['artboard'] }, {
            artboard: {
                left: cropRect.left,
                top: cropRect.top,
                width: cropRect.width,
                height: cropRect.height,
            },
        });

        if (activeCanvas.artboardRect) {
            activeCanvas.artboardRect.set({
                left: cropRect.left,
                top: cropRect.top,
                width: cropRect.width,
                height: cropRect.height,
            });
            activeCanvas.artboardRect.setCoords();
        }

        let removedCount = 0;
        if (cropTopDeleteOutside) {
            const intersects = (
                a: { left: number; top: number; width: number; height: number },
                b: { left: number; top: number; width: number; height: number }
            ) => (
                a.left < b.left + b.width
                && a.left + a.width > b.left
                && a.top < b.top + b.height
                && a.top + a.height > b.top
            );

            const objects = [...canvas.getObjects()];
            for (const obj of objects) {
                if (obj === activeCanvas.artboardRect) continue;
                const bounds = obj.getBoundingRect();
                if (!intersects(bounds, cropRect)) {
                    canvas.remove(obj);
                    removedCount += 1;
                }
            }
        }

        canvas.requestRenderAll();
        setIsDirty(true);
        setActiveTool('select');
        cropTopDraftRectRef.current = null;
        const cropHelper = cropDraftHelperRef.current;
        if (cropHelper) {
            canvas.remove(cropHelper);
            cropDraftHelperRef.current = null;
        }
        toast({
            title: 'Crop applied',
            description: removedCount > 0
                ? `Removed ${removedCount} object${removedCount === 1 ? '' : 's'} outside crop bounds.`
                : hasDraftRect
                    ? 'Draft crop bounds applied.'
                    : 'Artboard crop bounds updated.',
            variant: 'success',
        });
    }, [
        canvas,
        cropTopDeleteOutside,
        cropTopRatioPreset,
        cropTopUseArtboardBounds,
        buildAspectCropRect,
        parseCropAspectRatio,
        setActiveTool,
        setIsDirty,
        toast,
    ]);

    const getScenePointerFromEvent = useCallback((opt: fabric.TPointerEventInfo): fabric.Point | null => {
        const optWithScene = opt as unknown as { scenePoint?: fabric.Point };
        if (optWithScene.scenePoint) {
            return optWithScene.scenePoint;
        }
        const canvasWithScene = canvas as unknown as {
            getScenePoint?: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point;
        };
        if (opt.e && typeof canvasWithScene.getScenePoint === 'function') {
            return canvasWithScene.getScenePoint(opt.e);
        }
        return null;
    }, [canvas]);

    const readColorFromActiveObject = useCallback((): string | null => {
        if (!canvas) return null;
        const active = canvas.getActiveObject() as (fabric.Object & { fill?: unknown; stroke?: unknown }) | null;
        if (!active) return null;
        const candidates = [active.fill, active.stroke];
        for (const value of candidates) {
            if (typeof value !== 'string' || !value.trim()) continue;
            const parsed = parseColorWithAlpha(value);
            const normalized = normalizeColorValue(parsed.color);
            if (normalized && normalized.startsWith('#') && normalized.length === 7) {
                return normalized;
            }
        }
        return null;
    }, [canvas]);

    const readColorFromCanvasPoint = useCallback((point: fabric.Point, sampleSize: TopEyedropperSampleSize): string | null => {
        if (!canvas) return null;
        return sampleColorAtScenePoint(canvas, point, sampleSize);
    }, [canvas]);

    const readColorFromCanvasCenter = useCallback((sampleSize: TopEyedropperSampleSize): string | null => {
        if (!canvas) return null;
        return sampleColorAtCanvasCenter(canvas, sampleSize);
    }, [canvas]);

    const resolveEyedropperSample = useCallback((preferredPoint?: fabric.Point | null): string | null => {
        const pointColor = preferredPoint
            ? readColorFromCanvasPoint(preferredPoint, eyedropperTopSampleSize)
            : null;
        const centerColor = pointColor || readColorFromCanvasCenter(eyedropperTopSampleSize);
        if (eyedropperTopSampleSource === 'current-layer') {
            return pointColor || readColorFromActiveObject() || centerColor;
        }
        return centerColor || readColorFromActiveObject();
    }, [
        eyedropperTopSampleSize,
        eyedropperTopSampleSource,
        readColorFromActiveObject,
        readColorFromCanvasCenter,
        readColorFromCanvasPoint,
    ]);

    const handleEyedropperSample = useCallback((preferredPoint?: fabric.Point | null) => {
        if (!canvas) return;
        const sampledColor = resolveEyedropperSample(preferredPoint ?? eyedropperPointerRef.current);
        if (!sampledColor) {
            toast({
                title: 'Sample unavailable',
                description: 'No readable color source was found for the current sample settings.',
                variant: 'warning',
            });
            return;
        }

        setEyedropperTopSampledColor(sampledColor);
        setShapeTopFillColor(sampledColor);
        setSampledTextColor(sampledColor);
        (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('eyedropper:sample', {
            color: sampledColor,
            sampleSize: eyedropperTopSampleSize,
            sampleSource: eyedropperTopSampleSource,
        });
        toast({
            title: 'Color sampled',
            description: `${sampledColor.toUpperCase()} captured from ${eyedropperTopSampleSource === 'current-layer' ? 'current layer' : 'all layers'}.`,
            variant: 'success',
        });
    }, [
        canvas,
        eyedropperTopSampleSize,
        eyedropperTopSampleSource,
        resolveEyedropperSample,
        setSampledTextColor,
        setShapeTopFillColor,
        toast,
    ]);

    useEffect(() => {
        if (!canvas) return;

        const clearDraftHelper = () => {
            const helper = cropDraftHelperRef.current;
            if (!helper) return;
            canvas.remove(helper);
            cropDraftHelperRef.current = null;
            canvas.requestRenderAll();
        };

        if (activeTool !== 'crop') {
            clearDraftHelper();
            cropTopDraftRectRef.current = null;
            return;
        }

        let isDragging = false;
        let dragStart: fabric.Point | null = null;

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;

            const pointer = getScenePointerFromEvent(opt);
            if (!pointer) return;

            isDragging = true;
            dragStart = pointer;
            clearDraftHelper();
            cropTopDraftRectRef.current = null;

            const helper = new fabric.Rect({
                left: pointer.x,
                top: pointer.y,
                width: 1,
                height: 1,
                fill: 'rgba(31,138,165,0.12)',
                stroke: '#1f8aa5',
                strokeWidth: 1.2,
                strokeDashArray: [6, 4],
                selectable: false,
                evented: false,
                objectCaching: false,
                excludeFromExport: true,
            }) as fabric.Rect & { isSelectionOverlayHelper?: boolean };
            helper.isSelectionOverlayHelper = true;
            cropDraftHelperRef.current = helper;
            canvas.add(helper);
            canvas.requestRenderAll();
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            if (!isDragging || !dragStart || !cropDraftHelperRef.current) return;
            const pointer = getScenePointerFromEvent(opt);
            if (!pointer) return;

            const left = Math.min(dragStart.x, pointer.x);
            const top = Math.min(dragStart.y, pointer.y);
            const width = Math.max(1, Math.abs(pointer.x - dragStart.x));
            const height = Math.max(1, Math.abs(pointer.y - dragStart.y));

            cropDraftHelperRef.current.set({ left, top, width, height });
            cropDraftHelperRef.current.setCoords();
            cropTopDraftRectRef.current = { left, top, width, height };
            canvas.requestRenderAll();
        };

        const handleMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            dragStart = null;
        };

        const handleWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            applyTopCropSettings();
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        window.addEventListener('keydown', handleWindowKeyDown);
        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
            window.removeEventListener('keydown', handleWindowKeyDown);
            clearDraftHelper();
        };
    }, [activeTool, applyTopCropSettings, canvas, getScenePointerFromEvent]);

    useEffect(() => {
        if (!canvas || activeTool !== 'eyedropper') return;
        const eyedropperCanvas = canvas as fabric.Canvas & { skipTargetFind?: boolean; selection?: boolean };
        const previousSkipTargetFind = Boolean(eyedropperCanvas.skipTargetFind);
        Object.assign(eyedropperCanvas, { skipTargetFind: true, selection: false });
        if (canvas.getActiveObject()) {
            canvas.discardActiveObject();
            canvas.requestRenderAll();
        }

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            const pointer = getScenePointerFromEvent(opt);
            if (pointer) eyedropperPointerRef.current = pointer;
        };

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;
            const pointer = getScenePointerFromEvent(opt);
            if (!pointer) return;
            eyedropperPointerRef.current = pointer;
            handleEyedropperSample(pointer);
        };

        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:down', handleMouseDown);
        return () => {
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:down', handleMouseDown);
            Object.assign(eyedropperCanvas, { skipTargetFind: previousSkipTargetFind });
        };
    }, [activeTool, canvas, getScenePointerFromEvent, handleEyedropperSample]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const syncViewportSize = () => {
            setViewportSize({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };
        syncViewportSize();
        window.addEventListener('resize', syncViewportSize);
        return () => window.removeEventListener('resize', syncViewportSize);
    }, []);

    useEffect(() => {
        if (!canvas) return;

        const syncUtilityCanvasSize = () => {
            const activeCanvas = canvas as CanvasWithArtboard;
            if (activeCanvas.artboardRect) {
                const width = Math.max(1, Math.round((activeCanvas.artboardRect.width || 0) * (activeCanvas.artboardRect.scaleX || 1)));
                const height = Math.max(1, Math.round((activeCanvas.artboardRect.height || 0) * (activeCanvas.artboardRect.scaleY || 1)));
                setUtilityCanvasSize({ width, height });
                return;
            }

            if (activeCanvas.artboard) {
                setUtilityCanvasSize({
                    width: Math.max(1, Math.round(activeCanvas.artboard.width)),
                    height: Math.max(1, Math.round(activeCanvas.artboard.height)),
                });
                return;
            }

            const canvasZoom = canvas.getZoom() || 1;
            const width = Math.max(1, Math.round((canvas.width || canvas.getWidth() || 1080) / canvasZoom));
            const height = Math.max(1, Math.round((canvas.height || canvas.getHeight() || 1080) / canvasZoom));
            setUtilityCanvasSize({ width, height });
        };

        const canvasWithEvents = canvas as unknown as {
            on: (eventName: string, cb: () => void) => void;
            off: (eventName: string, cb: () => void) => void;
        };

        syncUtilityCanvasSize();
        canvasWithEvents.on('artboard:resize', syncUtilityCanvasSize);
        canvas.on('object:modified', syncUtilityCanvasSize);
        canvas.on('object:added', syncUtilityCanvasSize);
        canvas.on('object:removed', syncUtilityCanvasSize);

        return () => {
            canvasWithEvents.off('artboard:resize', syncUtilityCanvasSize);
            canvas.off('object:modified', syncUtilityCanvasSize);
            canvas.off('object:added', syncUtilityCanvasSize);
            canvas.off('object:removed', syncUtilityCanvasSize);
        };
    }, [canvas]);

    const handleCropRatioPresetChange = useCallback((preset: TopCropRatioPreset) => {
        if (!TOP_CROP_RATIO_PRESETS.includes(preset)) return;
        setCropTopRatioPreset(preset);
    }, []);

    const handleEyedropperSampleSizeChange = useCallback((size: TopEyedropperSampleSize) => {
        if (!TOP_EYEDROPPER_SAMPLE_SIZES.includes(size)) return;
        setEyedropperTopSampleSize(size);
    }, []);

    const handleZoomStepChange = useCallback((step: TopZoomStep) => {
        if (!TOP_ZOOM_STEPS.includes(step)) return;
        setZoomTopStep(step);
    }, []);

    const handleZoomApply = useCallback(() => {
        const direction = zoomTopMode === 'in' ? 1 : -1;
        handleZoom((zoomTopStep / 100) * direction);
    }, [handleZoom, zoomTopMode, zoomTopStep]);

    return {
        utilityCanvasSize,
        viewportSize,
        cropTopRatioPreset,
        cropTopDeleteOutside,
        cropTopUseArtboardBounds,
        setCropTopDeleteOutside,
        setCropTopUseArtboardBounds,
        handleCropRatioPresetChange,
        applyTopCropSettings,
        eyedropperTopSampleSize,
        eyedropperTopSampleSource,
        eyedropperTopSampledColor,
        setEyedropperTopSampleSource,
        handleEyedropperSampleSizeChange,
        handleEyedropperSample,
        zoomTopMode,
        zoomTopStep,
        setZoomTopMode,
        handleZoomStepChange,
        handleZoomApply,
        handleZoomReset,
        handleFitToScreen,
        handleZoom,
    };
}
