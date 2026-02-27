import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { MEDIA_OVERLAY_PRESETS, MEDIA_OVERLAY_STORAGE_KEY_PREFIX, type MediaOverlayPersistedState, type MediaOverlayPreset } from '@/components/Editor/editorViewConfig';
import { buildAspectCropRect, buildMediaOverlayStorageKey, getFrameBounds, normalizeFrameOrigin } from '@/components/Editor/editorViewGeometry';
import type { ExtendedFabricObject } from '@/types';
import type { CanvasWithArtboard, RectBounds } from '@/components/Editor/editorView.types';

type UseMediaOverlayArgs = {
    canvas: fabric.Canvas | null;
    designId: string | null;
    designName: string;
    onDirty: () => void;
};

export function useMediaOverlay({ canvas, designId, designName, onDirty }: UseMediaOverlayArgs) {
    const mediaOverlayStorageKey = useMemo(
        () => buildMediaOverlayStorageKey(designId, designName || 'untitled', MEDIA_OVERLAY_STORAGE_KEY_PREFIX),
        [designId, designName],
    );

    const initialPersistedState = useMemo(() => {
        if (typeof window === 'undefined') {
            return {
                enabled: true,
                preset: 'canvas-original' as MediaOverlayPreset,
                pendingBounds: null as RectBounds | null,
            };
        }

        try {
            const raw = window.localStorage.getItem(mediaOverlayStorageKey);
            if (!raw) {
                return {
                    enabled: true,
                    preset: 'canvas-original' as MediaOverlayPreset,
                    pendingBounds: null as RectBounds | null,
                };
            }

            const parsed = JSON.parse(raw) as Partial<MediaOverlayPersistedState>;
            const hasValidPreset = MEDIA_OVERLAY_PRESETS.some((item) => item.id === parsed.preset);
            const preset = hasValidPreset ? (parsed.preset as MediaOverlayPreset) : 'canvas-original';
            const frameBounds = parsed.frameBounds;
            const hasValidBounds = Boolean(
                frameBounds
                && Number.isFinite(frameBounds.left)
                && Number.isFinite(frameBounds.top)
                && Number.isFinite(frameBounds.width)
                && Number.isFinite(frameBounds.height)
                && frameBounds.width > 1
                && frameBounds.height > 1
            );

            return {
                enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
                preset,
                pendingBounds: hasValidBounds
                    ? {
                        left: Number(frameBounds!.left),
                        top: Number(frameBounds!.top),
                        width: Number(frameBounds!.width),
                        height: Number(frameBounds!.height),
                    }
                    : null,
            };
        } catch {
            return {
                enabled: true,
                preset: 'canvas-original' as MediaOverlayPreset,
                pendingBounds: null as RectBounds | null,
            };
        }
    }, [mediaOverlayStorageKey]);

    const [mediaOverlayEnabled, setMediaOverlayEnabled] = useState(initialPersistedState.enabled);
    const [mediaOverlayPreset, setMediaOverlayPreset] = useState<MediaOverlayPreset>(initialPersistedState.preset);
    const mediaOverlayFrameRef = useRef<(fabric.Rect & ExtendedFabricObject & { excludeFromExport?: boolean }) | null>(null);
    const mediaOverlayLabelRef = useRef<(fabric.Textbox & ExtendedFabricObject & { excludeFromExport?: boolean }) | null>(null);
    const mediaOverlayPendingRestoreRef = useRef<RectBounds | null>(initialPersistedState.pendingBounds);

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
            const frame = mediaOverlayFrameRef.current;
            const payload: MediaOverlayPersistedState = {
                enabled: mediaOverlayEnabled,
                preset: mediaOverlayPreset,
            };
            if (frame && mediaOverlayEnabled && mediaOverlayPreset !== 'canvas-original') {
                payload.frameBounds = getMediaOverlayFrameBounds(frame);
            }
            window.localStorage.setItem(mediaOverlayStorageKey, JSON.stringify(payload));
        } catch {
            // ignore storage write failures
        }
    }, [getMediaOverlayFrameBounds, mediaOverlayEnabled, mediaOverlayPreset, mediaOverlayStorageKey]);

    const getMediaOverlayCropBounds = useCallback((): RectBounds | null => {
        if (!mediaOverlayEnabled) return null;

        const sourceRect = getMediaOverlayConstraintRect(mediaOverlayPreset);
        if (!sourceRect) return null;

        if (mediaOverlayPreset === 'canvas-original') {
            return {
                left: sourceRect.left,
                top: sourceRect.top,
                width: sourceRect.width,
                height: sourceRect.height,
            };
        }

        const frame = mediaOverlayFrameRef.current;
        if (frame) {
            const frameBounds = getMediaOverlayFrameBounds(frame);
            const clampedWidth = Math.max(1, Math.min(frameBounds.width, sourceRect.width));
            const clampedHeight = Math.max(1, Math.min(frameBounds.height, sourceRect.height));
            const minLeft = sourceRect.left;
            const minTop = sourceRect.top;
            const maxLeft = sourceRect.left + sourceRect.width - clampedWidth;
            const maxTop = sourceRect.top + sourceRect.height - clampedHeight;

            return {
                left: Math.min(Math.max(frameBounds.left, minLeft), maxLeft),
                top: Math.min(Math.max(frameBounds.top, minTop), maxTop),
                width: clampedWidth,
                height: clampedHeight,
            };
        }

        const spec = MEDIA_OVERLAY_PRESETS.find((item) => item.id === mediaOverlayPreset) ?? MEDIA_OVERLAY_PRESETS[0];
        const targetAspectRatio = spec.width / spec.height;
        return buildAspectCropRect(sourceRect, targetAspectRatio);
    }, [getMediaOverlayConstraintRect, getMediaOverlayFrameBounds, mediaOverlayEnabled, mediaOverlayPreset]);

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

        if (!mediaOverlayEnabled || mediaOverlayPreset === 'canvas-original') {
            removeOverlayFrame();
            persistMediaOverlayState();
            canvas.requestRenderAll();
            return;
        }

        const existingFrame = mediaOverlayFrameRef.current;
        if (existingFrame) {
            existingFrame.set({
                visible: true,
                selectable: true,
                evented: true,
                hasControls: true,
                hasBorders: true,
            });
            applyMediaOverlayPresetToFrame(existingFrame, mediaOverlayPreset);
            const pending = mediaOverlayPendingRestoreRef.current;
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
            constrainMediaOverlayFrame(existingFrame, mediaOverlayPreset);
            const sourceRect = getMediaOverlayConstraintRect(mediaOverlayPreset);
            const bounds = getMediaOverlayFrameBounds(existingFrame);
            const isPinnedTopLeft = Boolean(
                sourceRect
                && Math.abs(bounds.left - sourceRect.left) <= 1
                && Math.abs(bounds.top - sourceRect.top) <= 1
                && (sourceRect.width - bounds.width) <= 1
                && (sourceRect.height - bounds.height) <= 1
            );
            if (isPinnedTopLeft) {
                applyMediaOverlayPresetToFrame(existingFrame, mediaOverlayPreset);
                constrainMediaOverlayFrame(existingFrame, mediaOverlayPreset);
            }
            existingFrame.off('moving');
            existingFrame.off('scaling');
            existingFrame.off('modified');
            const syncExistingMoveBounds = () => {
                constrainMediaOverlayFrame(existingFrame, mediaOverlayPreset);
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
                constrainMediaOverlayFrame(existingFrame, mediaOverlayPreset);
                bringMediaOverlayFrameToFront(existingFrame);
                canvas.requestRenderAll();
                onDirty();
                persistMediaOverlayState();
            };
            existingFrame.on('moving', syncExistingMoveBounds);
            existingFrame.on('scaling', syncExistingScaling);
            existingFrame.on('modified', handleExistingModified);
            canvas.setActiveObject(existingFrame);
            bringMediaOverlayFrameToFront(existingFrame);
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
        }) as fabric.Rect & ExtendedFabricObject & { excludeFromExport?: boolean };
        (frame as fabric.Rect & { isSelectionOverlayHelper?: boolean }).isSelectionOverlayHelper = true;
        frame.name = 'Media Overlay Frame';
        frame.excludeFromExport = true;
        frame.visible = true;

        applyMediaOverlayPresetToFrame(frame, mediaOverlayPreset);
        const pending = mediaOverlayPendingRestoreRef.current;
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
        constrainMediaOverlayFrame(frame, mediaOverlayPreset);
        const sourceRect = getMediaOverlayConstraintRect(mediaOverlayPreset);
        const bounds = getMediaOverlayFrameBounds(frame);
        const isPinnedTopLeft = Boolean(
            sourceRect
            && Math.abs(bounds.left - sourceRect.left) <= 1
            && Math.abs(bounds.top - sourceRect.top) <= 1
            && (sourceRect.width - bounds.width) <= 1
            && (sourceRect.height - bounds.height) <= 1
        );
        if (isPinnedTopLeft) {
            applyMediaOverlayPresetToFrame(frame, mediaOverlayPreset);
            constrainMediaOverlayFrame(frame, mediaOverlayPreset);
        }
        frame.off('moving');
        frame.off('scaling');
        frame.off('modified');
        const syncMoveBounds = () => {
            constrainMediaOverlayFrame(frame, mediaOverlayPreset);
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
        };
        const syncScaling = () => {
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
        };
        const handleModified = () => {
            constrainMediaOverlayFrame(frame, mediaOverlayPreset);
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
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
        persistMediaOverlayState();
        canvas.requestRenderAll();
    }, [
        applyMediaOverlayPresetToFrame,
        bringMediaOverlayFrameToFront,
        canvas,
        constrainMediaOverlayFrame,
        getMediaOverlayConstraintRect,
        getMediaOverlayFrameBounds,
        mediaOverlayEnabled,
        mediaOverlayPreset,
        normalizeMediaOverlayFrameOrigin,
        onDirty,
        persistMediaOverlayState,
    ]);

    useEffect(() => {
        if (!canvas || !mediaOverlayEnabled || mediaOverlayPreset === 'canvas-original') {
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
    }, [bringMediaOverlayFrameToFront, canvas, mediaOverlayEnabled, mediaOverlayPreset]);

    useEffect(() => {
        return () => {
            const frame = mediaOverlayFrameRef.current;
            const label = mediaOverlayLabelRef.current;
            if (!canvas) return;
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
        setMediaOverlayPreset,
        mediaOverlayFrameRef,
        mediaOverlayLabelRef,
        getMediaOverlayCropBounds,
    };
}
