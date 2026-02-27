import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as fabric from 'fabric';
import {
    MEDIA_OVERLAY_PRESETS,
    MEDIA_OVERLAY_STORAGE_KEY_PREFIX,
    type MediaOverlayPersistedState,
    type MediaOverlayPreset,
} from '@/components/Editor/editorViewConfig';
import {
    buildAspectCropRect,
    buildMediaOverlayStorageKey,
    getFrameBounds,
    normalizeFrameOrigin,
} from '@/components/Editor/editorViewGeometry';
import type { ExtendedFabricObject } from '@/types';
import type { CanvasWithArtboard, RectBounds } from '@/components/Editor/editorView.types';

export type MediaOverlayFrameConfig = {
    id: string;
    preset: MediaOverlayPreset;
    includeInBatchExport: boolean;
    bounds?: RectBounds;
};

export type MediaOverlayBatchTarget = MediaOverlayFrameConfig & { bounds: RectBounds };

type UseMediaOverlayArgs = {
    canvas: fabric.Canvas | null;
    designId: string | null;
    designName: string;
    onDirty: () => void;
};

const toNormalizedBounds = (bounds: Partial<RectBounds>): RectBounds => ({
    left: Number(bounds.left),
    top: Number(bounds.top),
    width: Number(bounds.width),
    height: Number(bounds.height),
});

export function useMediaOverlay({ canvas, designId, designName, onDirty }: UseMediaOverlayArgs) {
    const mediaOverlayStorageKey = useMemo(
        () => buildMediaOverlayStorageKey(designId, designName || 'untitled', MEDIA_OVERLAY_STORAGE_KEY_PREFIX),
        [designId, designName],
    );

    const [mediaOverlayEnabled, setMediaOverlayEnabled] = useState(true);
    const [mediaOverlayPreset, setMediaOverlayPreset] = useState<MediaOverlayPreset>('canvas-original');
    const [mediaOverlayFrames, setMediaOverlayFrames] = useState<MediaOverlayFrameConfig[]>([]);
    const [activeMediaOverlayFrameId, setActiveMediaOverlayFrameId] = useState<string | null>(null);

    const mediaOverlayFrameRef = useRef<(fabric.Rect & ExtendedFabricObject & {
        excludeFromExport?: boolean;
        mediaOverlayFrameId?: string;
    }) | null>(null);
    const mediaOverlayLabelRef = useRef<(fabric.Textbox & ExtendedFabricObject & {
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
            return getCanvasFullRect();
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
            };
            if (mediaOverlayFrames.length > 0) {
                payload.frames = mediaOverlayFrames.map((frame) => ({
                    id: frame.id,
                    preset: frame.preset,
                    includeInBatchExport: frame.includeInBatchExport,
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
        mediaOverlayPreset,
        mediaOverlayStorageKey,
    ]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const resetOverlay = () => {
            mediaOverlayPendingRestoreRef.current = null;
            setMediaOverlayPreset('canvas-original');
            setMediaOverlayEnabled(true);
            setMediaOverlayFrames([]);
            setActiveMediaOverlayFrameId(null);
            previousActiveMediaOverlayFrameIdRef.current = null;
        };

        try {
            const raw = window.localStorage.getItem(mediaOverlayStorageKey);
            if (!raw) {
                resetOverlay();
                return;
            }

            const parsed = JSON.parse(raw) as Partial<MediaOverlayPersistedState>;
            const hasValidPreset = MEDIA_OVERLAY_PRESETS.some((item) => item.id === parsed.preset);
            const nextPreset = hasValidPreset ? (parsed.preset as MediaOverlayPreset) : 'canvas-original';
            const legacyBounds = isValidMediaOverlayBounds(parsed.frameBounds)
                ? toNormalizedBounds(parsed.frameBounds)
                : undefined;

            const parsedFrames = (Array.isArray(parsed.frames) ? parsed.frames : [])
                .map((rawFrame) => {
                    const frame = rawFrame as Partial<MediaOverlayFrameConfig>;
                    if (typeof frame.id !== 'string' || frame.id.trim() === '') return null;
                    const frameHasValidPreset = MEDIA_OVERLAY_PRESETS.some((item) => item.id === frame.preset);
                    if (!frameHasValidPreset) return null;

                    const normalizedFrame: MediaOverlayFrameConfig = {
                        id: frame.id,
                        preset: frame.preset as MediaOverlayPreset,
                        includeInBatchExport: frame.includeInBatchExport !== false,
                    };
                    if (isValidMediaOverlayBounds(frame.bounds)) {
                        normalizedFrame.bounds = toNormalizedBounds(frame.bounds);
                    }
                    return normalizedFrame;
                })
                .filter((frame) => frame !== null) as MediaOverlayFrameConfig[];

            if (parsedFrames.length === 0 && nextPreset !== 'canvas-original') {
                parsedFrames.push({
                    id: createMediaOverlayFrameId(),
                    preset: nextPreset,
                    includeInBatchExport: true,
                    bounds: legacyBounds,
                });
            }

            const activeFrame = parsedFrames.find((frame) => frame.id === parsed.activeFrameId) ?? parsedFrames[0] ?? null;
            mediaOverlayPendingRestoreRef.current = activeFrame && isValidMediaOverlayBounds(activeFrame.bounds)
                ? toNormalizedBounds(activeFrame.bounds)
                : null;
            previousActiveMediaOverlayFrameIdRef.current = activeFrame?.id ?? null;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMediaOverlayFrames(parsedFrames);
            setActiveMediaOverlayFrameId(activeFrame?.id ?? null);
            setMediaOverlayPreset(activeFrame?.preset ?? nextPreset);
            setMediaOverlayEnabled(typeof parsed.enabled === 'boolean' ? parsed.enabled : true);
        } catch {
            resetOverlay();
        }
    }, [createMediaOverlayFrameId, isValidMediaOverlayBounds, mediaOverlayStorageKey]);

    useEffect(() => {
        if (mediaOverlayFrames.length === 0) {
            if (activeMediaOverlayFrameId !== null) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setActiveMediaOverlayFrameId(null);
            }
            previousActiveMediaOverlayFrameIdRef.current = null;
            return;
        }

        const activeFrame = activeMediaOverlayFrameId
            ? mediaOverlayFrames.find((frame) => frame.id === activeMediaOverlayFrameId)
            : mediaOverlayFrames[0];
        if (!activeFrame) {
            const firstFrame = mediaOverlayFrames[0];
            previousActiveMediaOverlayFrameIdRef.current = firstFrame.id;
            setActiveMediaOverlayFrameId(firstFrame.id);
            setMediaOverlayPreset(firstFrame.preset);
            mediaOverlayPendingRestoreRef.current = isValidMediaOverlayBounds(firstFrame.bounds)
                ? toNormalizedBounds(firstFrame.bounds)
                : null;
            return;
        }

        if (previousActiveMediaOverlayFrameIdRef.current !== activeFrame.id) {
            previousActiveMediaOverlayFrameIdRef.current = activeFrame.id;
            setMediaOverlayPreset(activeFrame.preset);
            mediaOverlayPendingRestoreRef.current = isValidMediaOverlayBounds(activeFrame.bounds)
                ? toNormalizedBounds(activeFrame.bounds)
                : null;
        }
    }, [activeMediaOverlayFrameId, isValidMediaOverlayBounds, mediaOverlayFrames]);

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

    const handleMediaOverlayPresetChange = useCallback((nextPreset: MediaOverlayPreset) => {
        setMediaOverlayPreset(nextPreset);
        if (!activeMediaOverlayFrameId) {
            onDirty();
            return;
        }
        setMediaOverlayFrames((frames) => frames.map((frame) => (
            frame.id === activeMediaOverlayFrameId
                ? {
                    ...frame,
                    preset: nextPreset,
                    bounds: undefined,
                }
                : frame
        )));
        mediaOverlayPendingRestoreRef.current = null;
        onDirty();
    }, [activeMediaOverlayFrameId, onDirty]);

    const handleAddMediaOverlayFrame = useCallback(() => {
        const presetForFrame = mediaOverlayPreset === 'canvas-original'
            ? 'instagram-square'
            : mediaOverlayPreset;
        const newFrame: MediaOverlayFrameConfig = {
            id: createMediaOverlayFrameId(),
            preset: presetForFrame,
            includeInBatchExport: true,
        };
        setMediaOverlayEnabled(true);
        setMediaOverlayFrames((frames) => [...frames, newFrame]);
        setActiveMediaOverlayFrameId(newFrame.id);
        setMediaOverlayPreset(newFrame.preset);
        mediaOverlayPendingRestoreRef.current = null;
        onDirty();
    }, [createMediaOverlayFrameId, mediaOverlayPreset, onDirty]);

    const handleRemoveActiveMediaOverlayFrame = useCallback(() => {
        if (!activeMediaOverlayFrameId) return;
        const activeIndex = mediaOverlayFrames.findIndex((frame) => frame.id === activeMediaOverlayFrameId);
        if (activeIndex < 0) return;
        const nextFrames = mediaOverlayFrames.filter((frame) => frame.id !== activeMediaOverlayFrameId);
        const fallbackIndex = Math.max(0, Math.min(activeIndex, nextFrames.length - 1));
        const nextActive = nextFrames[fallbackIndex] ?? null;
        setMediaOverlayFrames(nextFrames);
        setActiveMediaOverlayFrameId(nextActive?.id ?? null);
        setMediaOverlayPreset(nextActive?.preset ?? 'canvas-original');
        mediaOverlayPendingRestoreRef.current = nextActive && isValidMediaOverlayBounds(nextActive.bounds)
            ? toNormalizedBounds(nextActive.bounds)
            : null;
        onDirty();
    }, [activeMediaOverlayFrameId, isValidMediaOverlayBounds, mediaOverlayFrames, onDirty]);

    const handleToggleMediaOverlayFrameInclude = useCallback((frameId: string, includeInBatchExport: boolean) => {
        setMediaOverlayFrames((frames) => frames.map((frame) => (
            frame.id === frameId
                ? {
                    ...frame,
                    includeInBatchExport,
                }
                : frame
        )));
        onDirty();
    }, [onDirty]);

    const handleSelectMediaOverlayFrame = useCallback((frameId: string) => {
        const selectedFrame = mediaOverlayFrames.find((frame) => frame.id === frameId);
        if (!selectedFrame) return;
        setActiveMediaOverlayFrameId(selectedFrame.id);
        setMediaOverlayPreset(selectedFrame.preset);
        mediaOverlayPendingRestoreRef.current = isValidMediaOverlayBounds(selectedFrame.bounds)
            ? toNormalizedBounds(selectedFrame.bounds)
            : null;
    }, [isValidMediaOverlayBounds, mediaOverlayFrames]);

    const getMediaOverlayBatchTargets = useCallback((scope: 'selected' | 'all'): MediaOverlayBatchTarget[] => {
        if (mediaOverlayFrames.length === 0) {
            const fallback = getMediaOverlayCropBounds();
            if (!fallback) return [];
            return [{
                id: 'canvas',
                preset: mediaOverlayPreset,
                includeInBatchExport: true,
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

    useEffect(() => {
        if (!mediaOverlayEnabled) return;
        if (mediaOverlayFrames.length > 0) return;
        if (mediaOverlayPreset === 'canvas-original') return;

        const firstFrame: MediaOverlayFrameConfig = {
            id: createMediaOverlayFrameId(),
            preset: mediaOverlayPreset,
            includeInBatchExport: true,
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMediaOverlayFrames([firstFrame]);
        setActiveMediaOverlayFrameId(firstFrame.id);
        onDirty();
    }, [createMediaOverlayFrameId, mediaOverlayEnabled, mediaOverlayFrames.length, mediaOverlayPreset, onDirty]);

    useEffect(() => {
        if (!canvas) return;

        const removeOverlayFrame = () => {
            const frame = mediaOverlayFrameRef.current;
            if (frame) {
                canvas.remove(frame);
                mediaOverlayFrameRef.current = null;
            }
            const label = mediaOverlayLabelRef.current;
            if (label) {
                canvas.remove(label);
                mediaOverlayLabelRef.current = null;
            }
        };

        const activeOverlayFrame = getActiveMediaOverlayFrame();
        const activePreset = activeOverlayFrame?.preset ?? mediaOverlayPreset;
        if (!mediaOverlayEnabled || !activeOverlayFrame || activePreset === 'canvas-original') {
            removeOverlayFrame();
            persistMediaOverlayState();
            canvas.requestRenderAll();
            return;
        }

        const syncActiveOverlayFrame = (frame: fabric.Rect) => {
            const nextBounds = getMediaOverlayFrameBounds(frame);
            setMediaOverlayFrames((frames) => frames.map((entry) => (
                entry.id === activeOverlayFrame.id
                    ? {
                        ...entry,
                        preset: activePreset,
                        bounds: nextBounds,
                    }
                    : entry
            )));
        };

        const existingFrame = mediaOverlayFrameRef.current;
        if (existingFrame) {
            existingFrame.set({
                visible: true,
                selectable: true,
                evented: true,
                hasControls: true,
                hasBorders: true,
            });
            existingFrame.mediaOverlayFrameId = activeOverlayFrame.id;
            applyMediaOverlayPresetToFrame(existingFrame, activePreset);
            const pending = mediaOverlayPendingRestoreRef.current
                ?? (isValidMediaOverlayBounds(activeOverlayFrame.bounds) ? toNormalizedBounds(activeOverlayFrame.bounds) : null);
            if (pending) {
                existingFrame.set({
                    left: pending.left,
                    top: pending.top,
                    width: pending.width,
                    height: pending.height,
                    scaleX: 1,
                    scaleY: 1,
                });
                mediaOverlayPendingRestoreRef.current = null;
            }

            normalizeMediaOverlayFrameOrigin(existingFrame);
            constrainMediaOverlayFrame(existingFrame, activePreset);
            const sourceRect = getMediaOverlayConstraintRect(activePreset);
            const bounds = getMediaOverlayFrameBounds(existingFrame);
            const isPinnedTopLeft = Boolean(
                sourceRect
                && Math.abs(bounds.left - sourceRect.left) <= 1
                && Math.abs(bounds.top - sourceRect.top) <= 1
                && (sourceRect.width - bounds.width) <= 1
                && (sourceRect.height - bounds.height) <= 1,
            );
            if (isPinnedTopLeft) {
                applyMediaOverlayPresetToFrame(existingFrame, activePreset);
                constrainMediaOverlayFrame(existingFrame, activePreset);
            }

            existingFrame.off('moving');
            existingFrame.off('scaling');
            existingFrame.off('modified');
            const syncExistingMoveBounds = () => {
                constrainMediaOverlayFrame(existingFrame, activePreset);
                if (bringMediaOverlayFrameToFront(existingFrame)) {
                    canvas.requestRenderAll();
                    return;
                }
                canvas.requestRenderAll();
            };
            const syncExistingScaling = () => {
                bringMediaOverlayFrameToFront(existingFrame);
                canvas.requestRenderAll();
            };
            const handleExistingModified = () => {
                constrainMediaOverlayFrame(existingFrame, activePreset);
                bringMediaOverlayFrameToFront(existingFrame);
                canvas.requestRenderAll();
                syncActiveOverlayFrame(existingFrame);
                onDirty();
                persistMediaOverlayState();
            };
            existingFrame.on('moving', syncExistingMoveBounds);
            existingFrame.on('scaling', syncExistingScaling);
            existingFrame.on('modified', handleExistingModified);
            canvas.setActiveObject(existingFrame);
            bringMediaOverlayFrameToFront(existingFrame);
            syncActiveOverlayFrame(existingFrame);
            persistMediaOverlayState();
            canvas.requestRenderAll();
            return;
        }

        const frame = new fabric.Rect({
            left: 80,
            top: 80,
            width: 320,
            height: 320,
            originX: 'left',
            originY: 'top',
            fill: 'transparent',
            stroke: '#38bdf8',
            strokeWidth: 2,
            strokeDashArray: [10, 8],
            selectable: true,
            evented: true,
            hasBorders: true,
            hasControls: true,
            lockRotation: true,
            transparentCorners: false,
            cornerColor: '#38bdf8',
            borderColor: '#38bdf8',
            borderDashArray: [10, 8],
            objectCaching: false,
        }) as fabric.Rect & ExtendedFabricObject & {
            excludeFromExport?: boolean;
            mediaOverlayFrameId?: string;
            isSelectionOverlayHelper?: boolean;
        };
        frame.isSelectionOverlayHelper = true;
        frame.mediaOverlayFrameId = activeOverlayFrame.id;
        frame.name = 'Media Overlay Frame';
        frame.excludeFromExport = true;
        frame.visible = true;

        applyMediaOverlayPresetToFrame(frame, activePreset);
        const pending = mediaOverlayPendingRestoreRef.current
            ?? (isValidMediaOverlayBounds(activeOverlayFrame.bounds) ? toNormalizedBounds(activeOverlayFrame.bounds) : null);
        if (pending) {
            frame.set({
                left: pending.left,
                top: pending.top,
                width: pending.width,
                height: pending.height,
                scaleX: 1,
                scaleY: 1,
            });
            mediaOverlayPendingRestoreRef.current = null;
        }

        normalizeMediaOverlayFrameOrigin(frame);
        constrainMediaOverlayFrame(frame, activePreset);
        const sourceRect = getMediaOverlayConstraintRect(activePreset);
        const bounds = getMediaOverlayFrameBounds(frame);
        const isPinnedTopLeft = Boolean(
            sourceRect
            && Math.abs(bounds.left - sourceRect.left) <= 1
            && Math.abs(bounds.top - sourceRect.top) <= 1
            && (sourceRect.width - bounds.width) <= 1
            && (sourceRect.height - bounds.height) <= 1,
        );
        if (isPinnedTopLeft) {
            applyMediaOverlayPresetToFrame(frame, activePreset);
            constrainMediaOverlayFrame(frame, activePreset);
        }

        frame.off('moving');
        frame.off('scaling');
        frame.off('modified');
        const syncMoveBounds = () => {
            constrainMediaOverlayFrame(frame, activePreset);
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
        };
        const syncScaling = () => {
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
        };
        const handleModified = () => {
            constrainMediaOverlayFrame(frame, activePreset);
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
            syncActiveOverlayFrame(frame);
            onDirty();
            persistMediaOverlayState();
        };

        frame.on('moving', syncMoveBounds);
        frame.on('scaling', syncScaling);
        frame.on('modified', handleModified);

        mediaOverlayFrameRef.current = frame;
        canvas.add(frame);
        canvas.setActiveObject(frame);
        bringMediaOverlayFrameToFront(frame);
        syncActiveOverlayFrame(frame);
        persistMediaOverlayState();
        canvas.requestRenderAll();
    }, [
        applyMediaOverlayPresetToFrame,
        bringMediaOverlayFrameToFront,
        canvas,
        constrainMediaOverlayFrame,
        getActiveMediaOverlayFrame,
        getMediaOverlayConstraintRect,
        getMediaOverlayFrameBounds,
        isValidMediaOverlayBounds,
        mediaOverlayEnabled,
        mediaOverlayPreset,
        normalizeMediaOverlayFrameOrigin,
        onDirty,
        persistMediaOverlayState,
    ]);

    useEffect(() => {
        const activeOverlayFrame = getActiveMediaOverlayFrame();
        if (!canvas || !mediaOverlayEnabled || !activeOverlayFrame || activeOverlayFrame.preset === 'canvas-original') {
            return;
        }

        const keepOverlayFrameOnTop = () => {
            const frame = mediaOverlayFrameRef.current;
            if (!frame) return;
            if (bringMediaOverlayFrameToFront(frame)) {
                canvas.requestRenderAll();
            }
        };

        canvas.on('object:added', keepOverlayFrameOnTop);
        canvas.on('object:modified', keepOverlayFrameOnTop);
        canvas.on('object:moving', keepOverlayFrameOnTop);
        canvas.on('object:scaling', keepOverlayFrameOnTop);
        canvas.on('object:rotating', keepOverlayFrameOnTop);
        canvas.on('selection:created', keepOverlayFrameOnTop);
        canvas.on('selection:updated', keepOverlayFrameOnTop);
        keepOverlayFrameOnTop();
        return () => {
            canvas.off('object:added', keepOverlayFrameOnTop);
            canvas.off('object:modified', keepOverlayFrameOnTop);
            canvas.off('object:moving', keepOverlayFrameOnTop);
            canvas.off('object:scaling', keepOverlayFrameOnTop);
            canvas.off('object:rotating', keepOverlayFrameOnTop);
            canvas.off('selection:created', keepOverlayFrameOnTop);
            canvas.off('selection:updated', keepOverlayFrameOnTop);
        };
    }, [bringMediaOverlayFrameToFront, canvas, getActiveMediaOverlayFrame, mediaOverlayEnabled]);

    useEffect(() => {
        return () => {
            if (!canvas) return;
            const frame = mediaOverlayFrameRef.current;
            const label = mediaOverlayLabelRef.current;
            if (frame) {
                canvas.remove(frame);
            }
            if (label) {
                canvas.remove(label);
            }
            mediaOverlayFrameRef.current = null;
            mediaOverlayLabelRef.current = null;
        };
    }, [canvas]);

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
        handleSelectMediaOverlayFrame,
    };
}
