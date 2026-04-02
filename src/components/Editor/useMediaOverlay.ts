import { useCallback, useMemo, useRef, useState } from 'react';
import * as fabric from 'fabric';
import {
    MEDIA_OVERLAY_NAMING_TEMPLATES,
    MEDIA_OVERLAY_PRESETS,
    MEDIA_OVERLAY_SAFE_AREA_PRESETS,
    MEDIA_OVERLAY_STORAGE_KEY_PREFIX,
    MEDIA_OVERLAY_VARIANT_CONVERSION_MODES,
    type MediaOverlayNamingTemplate,
    type MediaOverlayPersistedState,
    type MediaOverlayPreset,
    type MediaOverlaySafeAreaPreset,
    type MediaOverlayVariantConversionMode,
} from '@/components/Editor/editorViewConfig';
import {
    buildAspectCropRect,
    buildMediaOverlayStorageKey,
    getFrameBounds,
    normalizeFrameOrigin,
} from '@/components/Editor/editorViewGeometry';
import { useMediaOverlayCanvasEffects } from '@/components/Editor/useMediaOverlayCanvasEffects';
import { useMediaOverlayFrameActions } from '@/components/Editor/useMediaOverlayFrameActions';
import { useMediaOverlayStateEffects } from '@/components/Editor/useMediaOverlayStateEffects';
import type { MediaOverlayBatchTarget, MediaOverlayFrameConfig } from '@/components/Editor/mediaOverlayTypes';
import type { ExtendedFabricObject } from '@/types';
import type { CanvasWithArtboard, RectBounds } from '@/components/Editor/editorView.types';

export type { MediaOverlayFrameConfig, MediaOverlayBatchTarget } from '@/components/Editor/mediaOverlayTypes';

type UseMediaOverlayArgs = {
    canvas: fabric.Canvas | null;
    designId: string | null;
    designName: string;
    onDirty: () => void;
    pushHistory: () => void;
    toast: (options: { title: string; description: string; variant: 'success' | 'warning' }) => void;
    confirm: (message: string, options?: { title?: string; variant?: 'default' | 'destructive' }) => Promise<boolean>;
    onVariantDraftCreated?: (name: string) => void;
};

const toNormalizedBounds = (bounds: Partial<RectBounds>): RectBounds => ({
    left: Number(bounds.left),
    top: Number(bounds.top),
    width: Number(bounds.width),
    height: Number(bounds.height),
});

const rectsIntersect = (
    a: { left: number; top: number; width: number; height: number },
    b: { left: number; top: number; width: number; height: number },
) => (
    a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top
);

const buildAspectFitRect = (targetRect: RectBounds, aspectRatio: number): RectBounds => (
    buildAspectCropRect(targetRect, aspectRatio)
);

const buildAspectFillRect = (targetRect: RectBounds, aspectRatio: number): RectBounds => {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
        return targetRect;
    }

    const targetRatio = targetRect.width / targetRect.height;
    let width = targetRect.width;
    let height = targetRect.height;
    if (targetRatio > aspectRatio) {
        height = targetRect.width / aspectRatio;
    } else {
        width = targetRect.height * aspectRatio;
    }
    return {
        left: targetRect.left + (targetRect.width - width) / 2,
        top: targetRect.top + (targetRect.height - height) / 2,
        width: Math.max(1, width),
        height: Math.max(1, height),
    };
};

const buildInsetRect = (targetRect: RectBounds, insetRatio: number): RectBounds => {
    const safeInsetRatio = Number.isFinite(insetRatio) ? Math.max(0, Math.min(0.45, insetRatio)) : 0;
    const insetX = targetRect.width * safeInsetRatio;
    const insetY = targetRect.height * safeInsetRatio;
    return {
        left: targetRect.left + insetX,
        top: targetRect.top + insetY,
        width: Math.max(1, targetRect.width - (insetX * 2)),
        height: Math.max(1, targetRect.height - (insetY * 2)),
    };
};

export function useMediaOverlay({
    canvas,
    designId,
    designName,
    onDirty,
    pushHistory,
    toast,
    confirm,
    onVariantDraftCreated,
}: UseMediaOverlayArgs) {
    const mediaOverlayStorageKey = useMemo(
        () => buildMediaOverlayStorageKey(designId, designName || 'untitled', MEDIA_OVERLAY_STORAGE_KEY_PREFIX),
        [designId, designName],
    );

    const [mediaOverlayEnabled, setMediaOverlayEnabled] = useState(true);
    const [mediaOverlayPreset, setMediaOverlayPreset] = useState<MediaOverlayPreset>('canvas-original');
    const [mediaOverlayFrames, setMediaOverlayFrames] = useState<MediaOverlayFrameConfig[]>([]);
    const [activeMediaOverlayFrameId, setActiveMediaOverlayFrameId] = useState<string | null>(null);
    const [mediaOverlayNamingTemplate, setMediaOverlayNamingTemplate] = useState<MediaOverlayNamingTemplate>('frame-preset');
    const [mediaOverlayVariantConversionMode, setMediaOverlayVariantConversionMode] = useState<MediaOverlayVariantConversionMode>('fill');

    const mediaOverlayFrameRef = useRef<(fabric.Rect & ExtendedFabricObject & {
        excludeFromExport?: boolean;
        mediaOverlayFrameId?: string;
    }) | null>(null);
    const mediaOverlayLabelRef = useRef<(fabric.Rect & ExtendedFabricObject & {
        excludeFromExport?: boolean;
    }) | null>(null);
    const mediaOverlayPendingRestoreRef = useRef<RectBounds | null>(null);
    const mediaOverlayIdCounterRef = useRef(0);
    const previousActiveMediaOverlayFrameIdRef = useRef<string | null>(null);

    const createMediaOverlayFrameId = useCallback(() => {
        mediaOverlayIdCounterRef.current += 1;
        return `media-overlay-frame-${Date.now()}-${mediaOverlayIdCounterRef.current}`;
    }, []);

    const isValidMediaOverlayBounds = useCallback((bounds: Partial<RectBounds> | null | undefined): bounds is RectBounds => (
        Boolean(
            bounds
            && Number.isFinite(bounds.left)
            && Number.isFinite(bounds.top)
            && Number.isFinite(bounds.width)
            && Number.isFinite(bounds.height)
            && Number(bounds.width) > 1
            && Number(bounds.height) > 1,
        )
    ), []);

    const isValidSafeAreaPreset = useCallback((preset: unknown): preset is MediaOverlaySafeAreaPreset => (
        typeof preset === 'string'
        && MEDIA_OVERLAY_SAFE_AREA_PRESETS.some((item) => item.id === preset)
    ), []);

    const isValidNamingTemplate = useCallback((template: unknown): template is MediaOverlayNamingTemplate => (
        typeof template === 'string'
        && MEDIA_OVERLAY_NAMING_TEMPLATES.some((item) => item.id === template)
    ), []);

    const isValidVariantConversionMode = useCallback((mode: unknown): mode is MediaOverlayVariantConversionMode => (
        typeof mode === 'string'
        && MEDIA_OVERLAY_VARIANT_CONVERSION_MODES.some((item) => item.id === mode)
    ), []);

    const getMediaOverlaySourceRect = useCallback((): RectBounds | null => {
        if (!canvas) return null;
        const activeCanvas = canvas as CanvasWithArtboard;
        const artboard = activeCanvas.artboard;
        if (artboard && artboard.width > 0 && artboard.height > 0) {
            return {
                left: artboard.left,
                top: artboard.top,
                width: artboard.width,
                height: artboard.height,
            };
        }

        const width = canvas.width || canvas.getWidth();
        const height = canvas.height || canvas.getHeight();
        if (!width || !height) return null;

        return {
            left: 0,
            top: 0,
            width,
            height,
        };
    }, [canvas]);

    const getCanvasFullRect = useCallback((): RectBounds | null => {
        if (!canvas) return null;
        const width = canvas.width || canvas.getWidth();
        const height = canvas.height || canvas.getHeight();
        if (!width || !height) return null;
        return { left: 0, top: 0, width, height };
    }, [canvas]);

    const getMediaOverlayConstraintRect = useCallback((preset: MediaOverlayPreset): RectBounds | null => {
        if (preset === 'canvas-original') {
            return getMediaOverlaySourceRect() || getCanvasFullRect();
        }
        return getMediaOverlaySourceRect() || getCanvasFullRect();
    }, [getCanvasFullRect, getMediaOverlaySourceRect]);

    const getMediaOverlayFrameBounds = useCallback((frame: fabric.Rect): RectBounds => getFrameBounds(frame), []);

    const normalizeMediaOverlayFrameOrigin = useCallback((frame: fabric.Rect) => {
        normalizeFrameOrigin(frame);
    }, []);

    const getActiveMediaOverlayFrame = useCallback((): MediaOverlayFrameConfig | null => {
        if (mediaOverlayFrames.length === 0) return null;
        if (!activeMediaOverlayFrameId) return mediaOverlayFrames[0];
        return mediaOverlayFrames.find((frame) => frame.id === activeMediaOverlayFrameId) ?? mediaOverlayFrames[0];
    }, [activeMediaOverlayFrameId, mediaOverlayFrames]);

    const clampMediaOverlayBounds = useCallback((bounds: RectBounds, sourceRect: RectBounds): RectBounds => {
        const clampedWidth = Math.max(1, Math.min(bounds.width, sourceRect.width));
        const clampedHeight = Math.max(1, Math.min(bounds.height, sourceRect.height));
        const minLeft = sourceRect.left;
        const minTop = sourceRect.top;
        const maxLeft = sourceRect.left + sourceRect.width - clampedWidth;
        const maxTop = sourceRect.top + sourceRect.height - clampedHeight;
        return {
            left: Math.min(Math.max(bounds.left, minLeft), maxLeft),
            top: Math.min(Math.max(bounds.top, minTop), maxTop),
            width: clampedWidth,
            height: clampedHeight,
        };
    }, []);

    const resolveMediaOverlayFrameBounds = useCallback((frameConfig: MediaOverlayFrameConfig): RectBounds | null => {
        const sourceRect = getMediaOverlayConstraintRect(frameConfig.preset);
        if (!sourceRect) return null;

        if (frameConfig.preset === 'canvas-original') {
            return {
                left: sourceRect.left,
                top: sourceRect.top,
                width: sourceRect.width,
                height: sourceRect.height,
            };
        }

        const liveFrame = mediaOverlayFrameRef.current;
        const liveFrameId = liveFrame?.mediaOverlayFrameId;
        if (liveFrame && liveFrameId === frameConfig.id) {
            return clampMediaOverlayBounds(getMediaOverlayFrameBounds(liveFrame), sourceRect);
        }

        if (isValidMediaOverlayBounds(frameConfig.bounds)) {
            return clampMediaOverlayBounds(frameConfig.bounds, sourceRect);
        }

        const spec = MEDIA_OVERLAY_PRESETS.find((item) => item.id === frameConfig.preset) ?? MEDIA_OVERLAY_PRESETS[0];
        const targetAspectRatio = spec.width / spec.height;
        return buildAspectCropRect(sourceRect, targetAspectRatio);
    }, [clampMediaOverlayBounds, getMediaOverlayConstraintRect, getMediaOverlayFrameBounds, isValidMediaOverlayBounds]);

    const bringMediaOverlayFrameToFront = useCallback((frameOverride?: fabric.Rect): boolean => {
        if (!canvas) return false;
        const frame = frameOverride ?? mediaOverlayFrameRef.current;
        if (!frame) return false;
        const objects = canvas.getObjects();
        if (!objects.includes(frame) || objects[objects.length - 1] === frame) {
            return false;
        }

        const canvasStack = canvas as fabric.Canvas & {
            bringToFront?: (obj: fabric.Object) => void;
            moveTo?: (obj: fabric.Object, index: number) => void;
        };
        if (canvasStack.bringToFront) {
            canvasStack.bringToFront(frame);
            return true;
        }
        if (canvasStack.moveTo) {
            canvasStack.moveTo(frame, objects.length - 1);
            return true;
        }
        return false;
    }, [canvas]);

    const constrainMediaOverlayFrame = useCallback((frame: fabric.Rect, presetOverride?: MediaOverlayPreset) => {
        const sourceRect = getMediaOverlayConstraintRect(presetOverride ?? mediaOverlayPreset);
        if (!sourceRect) return;
        normalizeMediaOverlayFrameOrigin(frame);

        let width = Math.max(1, frame.getScaledWidth?.() ?? ((frame.width || 1) * (frame.scaleX || 1)));
        let height = Math.max(1, frame.getScaledHeight?.() ?? ((frame.height || 1) * (frame.scaleY || 1)));

        if (width > sourceRect.width || height > sourceRect.height) {
            const fitScale = Math.min(sourceRect.width / width, sourceRect.height / height);
            width = Math.max(1, width * fitScale);
            height = Math.max(1, height * fitScale);
            frame.set({ width, height, scaleX: 1, scaleY: 1 });
        }

        const maxLeft = sourceRect.left + sourceRect.width - width;
        const maxTop = sourceRect.top + sourceRect.height - height;
        const clampedLeft = Math.min(Math.max(sourceRect.left, frame.left || 0), Math.max(sourceRect.left, maxLeft));
        const clampedTop = Math.min(Math.max(sourceRect.top, frame.top || 0), Math.max(sourceRect.top, maxTop));

        frame.set({ left: clampedLeft, top: clampedTop });
        frame.setCoords();
    }, [getMediaOverlayConstraintRect, mediaOverlayPreset, normalizeMediaOverlayFrameOrigin]);

    const applyMediaOverlayPresetToFrame = useCallback((frame: fabric.Rect, preset: MediaOverlayPreset) => {
        const sourceRect = getMediaOverlayConstraintRect(preset);
        if (!sourceRect) return;

        if (preset === 'canvas-original') {
            frame.set({
                left: sourceRect.left,
                top: sourceRect.top,
                width: Math.max(1, sourceRect.width),
                height: Math.max(1, sourceRect.height),
                scaleX: 1,
                scaleY: 1,
            });
            frame.setCoords();
            return;
        }

        const spec = MEDIA_OVERLAY_PRESETS.find((item) => item.id === preset) ?? MEDIA_OVERLAY_PRESETS[0];
        const targetAspectRatio = spec.width / spec.height;
        const fittedRect = buildAspectCropRect(sourceRect, targetAspectRatio);
        const frameWidth = Math.max(24, fittedRect.width * 0.7);
        const frameHeight = Math.max(24, fittedRect.height * 0.7);

        frame.set({
            left: fittedRect.left + (fittedRect.width - frameWidth) / 2,
            top: fittedRect.top + (fittedRect.height - frameHeight) / 2,
            width: frameWidth,
            height: frameHeight,
            scaleX: 1,
            scaleY: 1,
        });
        frame.setCoords();
    }, [getMediaOverlayConstraintRect]);

    const persistMediaOverlayState = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            const activeFrame = getActiveMediaOverlayFrame();
            const liveFrame = mediaOverlayFrameRef.current;
            const liveFrameId = liveFrame?.mediaOverlayFrameId;
            const payload: MediaOverlayPersistedState = {
                enabled: mediaOverlayEnabled,
                preset: activeFrame?.preset ?? mediaOverlayPreset,
                namingTemplate: mediaOverlayNamingTemplate,
                variantConversionMode: mediaOverlayVariantConversionMode,
            };
            if (mediaOverlayFrames.length > 0) {
                payload.frames = mediaOverlayFrames.map((frame) => ({
                    id: frame.id,
                    preset: frame.preset,
                    includeInBatchExport: frame.includeInBatchExport,
                    safeAreaPreset: frame.safeAreaPreset,
                    bounds: frame.id === liveFrameId && liveFrame
                        ? getMediaOverlayFrameBounds(liveFrame)
                        : frame.bounds,
                }));
            }
            if (activeFrame?.id) {
                payload.activeFrameId = activeFrame.id;
            }
            if (activeFrame && mediaOverlayEnabled && activeFrame.preset !== 'canvas-original') {
                const bounds = activeFrame.id === liveFrameId && liveFrame
                    ? getMediaOverlayFrameBounds(liveFrame)
                    : activeFrame.bounds;
                if (isValidMediaOverlayBounds(bounds)) {
                    payload.frameBounds = bounds;
                }
            }
            window.localStorage.setItem(mediaOverlayStorageKey, JSON.stringify(payload));
        } catch {
            // ignore storage write failures
        }
    }, [
        getActiveMediaOverlayFrame,
        getMediaOverlayFrameBounds,
        isValidMediaOverlayBounds,
        mediaOverlayEnabled,
        mediaOverlayFrames,
        mediaOverlayNamingTemplate,
        mediaOverlayPreset,
        mediaOverlayVariantConversionMode,
        mediaOverlayStorageKey,
    ]);

    useMediaOverlayStateEffects({
        mediaOverlayStorageKey,
        mediaOverlayPreset,
        mediaOverlayEnabled,
        mediaOverlayFrames,
        activeMediaOverlayFrameId,
        createMediaOverlayFrameId,
        isValidMediaOverlayBounds,
        isValidSafeAreaPreset,
        isValidNamingTemplate,
        isValidVariantConversionMode,
        toNormalizedBounds,
        mediaOverlayPendingRestoreRef,
        previousActiveMediaOverlayFrameIdRef,
        setMediaOverlayPreset,
        setMediaOverlayEnabled,
        setMediaOverlayFrames,
        setActiveMediaOverlayFrameId,
        setMediaOverlayNamingTemplate,
        setMediaOverlayVariantConversionMode,
        onDirty,
    });

    const getMediaOverlayCropBounds = useCallback((): RectBounds | null => {
        if (!mediaOverlayEnabled) return null;

        const activeFrame = getActiveMediaOverlayFrame();
        const effectivePreset = activeFrame?.preset ?? mediaOverlayPreset;
        const sourceRect = getMediaOverlayConstraintRect(effectivePreset);
        if (!sourceRect) return null;

        if (effectivePreset === 'canvas-original') {
            return {
                left: sourceRect.left,
                top: sourceRect.top,
                width: sourceRect.width,
                height: sourceRect.height,
            };
        }

        if (activeFrame) {
            const resolvedBounds = resolveMediaOverlayFrameBounds(activeFrame);
            if (resolvedBounds) {
                return resolvedBounds;
            }
        }

        const spec = MEDIA_OVERLAY_PRESETS.find((item) => item.id === effectivePreset) ?? MEDIA_OVERLAY_PRESETS[0];
        const targetAspectRatio = spec.width / spec.height;
        return buildAspectCropRect(sourceRect, targetAspectRatio);
    }, [
        getActiveMediaOverlayFrame,
        getMediaOverlayConstraintRect,
        mediaOverlayEnabled,
        mediaOverlayPreset,
        resolveMediaOverlayFrameBounds,
    ]);

    const {
        handleMediaOverlayPresetChange,
        handleAddMediaOverlayFrame,
        handleRemoveActiveMediaOverlayFrame,
        handleToggleMediaOverlayFrameInclude,
        handleSelectMediaOverlayFrame,
        handleActiveMediaOverlayFrameSafeAreaPresetChange,
    } = useMediaOverlayFrameActions({
        activeMediaOverlayFrameId,
        mediaOverlayFrames,
        mediaOverlayPreset,
        createMediaOverlayFrameId,
        isValidMediaOverlayBounds,
        toNormalizedBounds,
        mediaOverlayPendingRestoreRef,
        setMediaOverlayPreset,
        setMediaOverlayEnabled,
        setMediaOverlayFrames,
        setActiveMediaOverlayFrameId,
        onDirty,
    });

    const getMediaOverlayBatchTargets = useCallback((scope: 'selected' | 'all'): MediaOverlayBatchTarget[] => {
        if (mediaOverlayFrames.length === 0) {
            const fallback = getMediaOverlayCropBounds();
            if (!fallback) return [];
            return [{
                id: 'canvas',
                preset: mediaOverlayPreset,
                includeInBatchExport: true,
                safeAreaPreset: 'none',
                bounds: fallback,
            }];
        }

        const source = scope === 'selected'
            ? mediaOverlayFrames.filter((frame) => frame.includeInBatchExport)
            : mediaOverlayFrames;

        return source
            .map((frame) => {
                const bounds = resolveMediaOverlayFrameBounds(frame);
                if (!bounds) return null;
                return {
                    ...frame,
                    bounds,
                };
            })
            .filter((frame): frame is MediaOverlayBatchTarget => frame !== null);
    }, [getMediaOverlayCropBounds, mediaOverlayFrames, mediaOverlayPreset, resolveMediaOverlayFrameBounds]);

    const handleConvertActiveMediaOverlayFrameToVariant = useCallback(async () => {
        if (!canvas) return;

        const activeFrame = getActiveMediaOverlayFrame();
        if (!activeFrame) {
            toast({
                title: 'Variant unavailable',
                description: 'Add or select a media overlay frame first.',
                variant: 'warning',
            });
            return;
        }

        const confirmed = await confirm(
            'Create a new variant draft from the active frame? Off-frame objects will be removed from the new draft, and the current session will switch to that variant.',
            {
                title: 'Convert Frame to Variant',
                variant: 'destructive',
            },
        );
        if (!confirmed) {
            return;
        }

        const cropBounds = resolveMediaOverlayFrameBounds(activeFrame);
        const sourceRect = getMediaOverlaySourceRect();
        const presetSpec = MEDIA_OVERLAY_PRESETS.find((item) => item.id === activeFrame.preset);
        if (!cropBounds || !sourceRect || !presetSpec) {
            toast({
                title: 'Variant unavailable',
                description: 'The active frame could not be resolved.',
                variant: 'warning',
            });
            return;
        }

        const targetRect: RectBounds = {
            left: sourceRect.left,
            top: sourceRect.top,
            width: presetSpec.width,
            height: presetSpec.height,
        };
        const sourceAspectRatio = cropBounds.width / cropBounds.height;
        const safeAreaPreset = activeFrame.safeAreaPreset === 'none' ? 'title-safe-10' : activeFrame.safeAreaPreset;
        const safeAreaSpec = MEDIA_OVERLAY_SAFE_AREA_PRESETS.find((item) => item.id === safeAreaPreset)
            ?? MEDIA_OVERLAY_SAFE_AREA_PRESETS[0];
        const destinationContentRect = mediaOverlayVariantConversionMode === 'fit'
            ? buildAspectFitRect(targetRect, sourceAspectRatio)
            : mediaOverlayVariantConversionMode === 'safe-area'
                ? buildAspectFitRect(buildInsetRect(targetRect, safeAreaSpec.insetRatio), sourceAspectRatio)
                : buildAspectFillRect(targetRect, sourceAspectRatio);
        const scaleX = destinationContentRect.width / cropBounds.width;
        const scaleY = destinationContentRect.height / cropBounds.height;
        const transformMatrix = [
            scaleX,
            0,
            0,
            scaleY,
            destinationContentRect.left - (cropBounds.left * scaleX),
            destinationContentRect.top - (cropBounds.top * scaleY),
        ] as fabric.TMat2D;

        const applyVariantTransformToObject = (obj: fabric.Object) => {
            try {
                if (
                    typeof obj.calcTransformMatrix === 'function'
                    && typeof fabric.util.multiplyTransformMatrices === 'function'
                    && typeof fabric.util.applyTransformToObject === 'function'
                ) {
                    const objectMatrix = obj.calcTransformMatrix() as fabric.TMat2D;
                    const finalMatrix = fabric.util.multiplyTransformMatrices(transformMatrix, objectMatrix);
                    fabric.util.applyTransformToObject(obj, finalMatrix);
                    obj.setCoords();
                    return;
                }
            } catch {
                // Fall back to direct property remap below when matrix transforms are unavailable.
            }

            const directObj = obj as fabric.Object & {
                left?: number;
                top?: number;
                scaleX?: number;
                scaleY?: number;
            };
            obj.set({
                left: destinationContentRect.left + (((directObj.left || 0) - cropBounds.left) * scaleX),
                top: destinationContentRect.top + (((directObj.top || 0) - cropBounds.top) * scaleY),
                scaleX: (directObj.scaleX || 1) * scaleX,
                scaleY: (directObj.scaleY || 1) * scaleY,
            });
            obj.setCoords();
        };

        const canvasWithArtboard = canvas as CanvasWithArtboard;
        const overlayFrame = mediaOverlayFrameRef.current;
        const overlayGuide = mediaOverlayLabelRef.current;
        if (overlayFrame) {
            canvas.remove(overlayFrame);
            mediaOverlayFrameRef.current = null;
        }
        if (overlayGuide) {
            canvas.remove(overlayGuide);
            mediaOverlayLabelRef.current = null;
        }

        canvas.discardActiveObject();

        let removedCount = 0;
        const objects = [...canvas.getObjects()];
        for (const obj of objects) {
            if (obj === overlayFrame || obj === overlayGuide || obj === canvasWithArtboard.artboardRect) {
                continue;
            }

            const bounds = typeof obj.getBoundingRect === 'function' ? obj.getBoundingRect() : null;
            if (bounds && !rectsIntersect(bounds, cropBounds)) {
                canvas.remove(obj);
                removedCount += 1;
                continue;
            }

            applyVariantTransformToObject(obj);
        }

        Object.assign(canvasWithArtboard as { artboard?: CanvasWithArtboard['artboard'] }, {
            artboard: {
                left: targetRect.left,
                top: targetRect.top,
                width: targetRect.width,
                height: targetRect.height,
            },
        });

        if (canvasWithArtboard.artboardRect) {
            canvasWithArtboard.artboardRect.set({
                left: targetRect.left,
                top: targetRect.top,
                width: targetRect.width,
                height: targetRect.height,
            });
            canvasWithArtboard.artboardRect.setCoords();
            canvas.fire('object:modified', { target: canvasWithArtboard.artboardRect });
        }
        const canvasWithCustomEvents = canvas as fabric.Canvas & {
            fire: (eventName: string, options?: object) => void;
        };
        canvasWithCustomEvents.fire('artboard:resize', targetRect);
        canvas.requestRenderAll();

        mediaOverlayPendingRestoreRef.current = null;
        setMediaOverlayFrames([]);
        setActiveMediaOverlayFrameId(null);
        setMediaOverlayPreset('canvas-original');
        setMediaOverlayEnabled(true);

        const nextVariantName = designName && designName !== 'Untitled Design'
            ? `${designName} - ${presetSpec.label}`
            : presetSpec.label;
        const modeLabel = mediaOverlayVariantConversionMode === 'fit'
            ? 'Fit'
            : mediaOverlayVariantConversionMode === 'safe-area'
                ? 'Safe Area'
                : 'Fill';

        onVariantDraftCreated?.(nextVariantName);
        onDirty();
        pushHistory();

        toast({
            title: 'Variant draft created',
            description: removedCount > 0
                ? `Active frame converted to ${presetSpec.label} using ${modeLabel}. Removed ${removedCount} off-frame object${removedCount === 1 ? '' : 's'}.`
                : `Active frame converted to ${presetSpec.label} using ${modeLabel}. Save to keep it as a separate design.`,
            variant: 'success',
        });
    }, [
        canvas,
        designName,
        getActiveMediaOverlayFrame,
        getMediaOverlaySourceRect,
        mediaOverlayVariantConversionMode,
        onDirty,
        onVariantDraftCreated,
        pushHistory,
        resolveMediaOverlayFrameBounds,
        setActiveMediaOverlayFrameId,
        setMediaOverlayEnabled,
        setMediaOverlayFrames,
        setMediaOverlayPreset,
        toast,
        confirm,
    ]);

    useMediaOverlayCanvasEffects({
        canvas,
        mediaOverlayEnabled,
        mediaOverlayPreset,
        mediaOverlayFrameRef,
        mediaOverlayLabelRef,
        mediaOverlayPendingRestoreRef,
        getActiveMediaOverlayFrame,
        getMediaOverlayFrameBounds,
        getMediaOverlayConstraintRect,
        applyMediaOverlayPresetToFrame,
        normalizeMediaOverlayFrameOrigin,
        constrainMediaOverlayFrame,
        bringMediaOverlayFrameToFront,
        isValidMediaOverlayBounds,
        toNormalizedBounds,
        persistMediaOverlayState,
        setMediaOverlayFrames,
        onDirty,
    });

    return {
        mediaOverlayEnabled,
        setMediaOverlayEnabled,
        mediaOverlayPreset,
        mediaOverlayFrames,
        activeMediaOverlayFrameId,
        mediaOverlayFrameRef,
        mediaOverlayLabelRef,
        getMediaOverlayCropBounds,
        getMediaOverlayBatchTargets,
        handleMediaOverlayPresetChange,
        handleAddMediaOverlayFrame,
        handleRemoveActiveMediaOverlayFrame,
        handleToggleMediaOverlayFrameInclude,
        mediaOverlayNamingTemplate,
        setMediaOverlayNamingTemplate,
        mediaOverlayVariantConversionMode,
        setMediaOverlayVariantConversionMode,
        handleActiveMediaOverlayFrameSafeAreaPresetChange,
        handleSelectMediaOverlayFrame,
        handleConvertActiveMediaOverlayFrameToVariant,
    };
}
