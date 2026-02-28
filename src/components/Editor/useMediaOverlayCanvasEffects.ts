import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import * as fabric from 'fabric';

import { MEDIA_OVERLAY_SAFE_AREA_PRESETS, type MediaOverlayPreset } from '@/components/Editor/editorViewConfig';
import type { MediaOverlayFrameConfig } from '@/components/Editor/mediaOverlayTypes';
import type { ExtendedFabricObject } from '@/types';
import type { RectBounds } from '@/components/Editor/editorView.types';

type OverlayFrameRef = MutableRefObject<(
    fabric.Rect & ExtendedFabricObject & {
        excludeFromExport?: boolean;
        mediaOverlayFrameId?: string;
    }
) | null>;

type OverlayLabelRef = MutableRefObject<(
    fabric.Rect & ExtendedFabricObject & {
        excludeFromExport?: boolean;
    }
) | null>;

type UseMediaOverlayCanvasEffectsArgs = {
    canvas: fabric.Canvas | null;
    mediaOverlayEnabled: boolean;
    mediaOverlayPreset: MediaOverlayPreset;
    mediaOverlayFrameRef: OverlayFrameRef;
    mediaOverlayLabelRef: OverlayLabelRef;
    mediaOverlayPendingRestoreRef: MutableRefObject<RectBounds | null>;
    getActiveMediaOverlayFrame: () => MediaOverlayFrameConfig | null;
    getMediaOverlayFrameBounds: (frame: fabric.Rect) => RectBounds;
    getMediaOverlayConstraintRect: (preset: MediaOverlayPreset) => RectBounds | null;
    applyMediaOverlayPresetToFrame: (frame: fabric.Rect, preset: MediaOverlayPreset) => void;
    normalizeMediaOverlayFrameOrigin: (frame: fabric.Rect) => void;
    constrainMediaOverlayFrame: (frame: fabric.Rect, presetOverride?: MediaOverlayPreset) => void;
    bringMediaOverlayFrameToFront: (frameOverride?: fabric.Rect) => boolean;
    isValidMediaOverlayBounds: (bounds: Partial<RectBounds> | null | undefined) => bounds is RectBounds;
    toNormalizedBounds: (bounds: Partial<RectBounds>) => RectBounds;
    persistMediaOverlayState: () => void;
    setMediaOverlayFrames: Dispatch<SetStateAction<MediaOverlayFrameConfig[]>>;
    onDirty: () => void;
};

export function useMediaOverlayCanvasEffects({
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
}: UseMediaOverlayCanvasEffectsArgs) {
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

        const syncSafeAreaGuide = (frame: fabric.Rect, frameConfig: MediaOverlayFrameConfig) => {
            const safeAreaSpec = MEDIA_OVERLAY_SAFE_AREA_PRESETS.find((item) => item.id === frameConfig.safeAreaPreset)
                ?? MEDIA_OVERLAY_SAFE_AREA_PRESETS[0];

            if (safeAreaSpec.id === 'none' || safeAreaSpec.insetRatio <= 0) {
                const existingGuide = mediaOverlayLabelRef.current;
                if (existingGuide) {
                    canvas.remove(existingGuide);
                    mediaOverlayLabelRef.current = null;
                }
                return;
            }

            const bounds = getMediaOverlayFrameBounds(frame);
            const insetX = bounds.width * safeAreaSpec.insetRatio;
            const insetY = bounds.height * safeAreaSpec.insetRatio;
            const guideRect = {
                left: bounds.left + insetX,
                top: bounds.top + insetY,
                width: Math.max(1, bounds.width - (insetX * 2)),
                height: Math.max(1, bounds.height - (insetY * 2)),
            };

            const existingGuide = mediaOverlayLabelRef.current;
            if (existingGuide) {
                existingGuide.set({
                    left: guideRect.left,
                    top: guideRect.top,
                    width: guideRect.width,
                    height: guideRect.height,
                    visible: true,
                });
                existingGuide.setCoords();
                return;
            }

            const guide = new fabric.Rect({
                left: guideRect.left,
                top: guideRect.top,
                width: guideRect.width,
                height: guideRect.height,
                originX: 'left',
                originY: 'top',
                fill: 'transparent',
                stroke: '#f59e0b',
                strokeWidth: 1,
                strokeDashArray: [6, 6],
                selectable: false,
                evented: false,
                objectCaching: false,
            }) as fabric.Rect & ExtendedFabricObject & {
                excludeFromExport?: boolean;
            };
            guide.excludeFromExport = true;
            guide.name = 'Media Overlay Safe Area Guide';

            mediaOverlayLabelRef.current = guide;
            canvas.add(guide);
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
            setMediaOverlayFrames((frames) => {
                let didChange = false;
                const nextFrames = frames.map((entry) => {
                    if (entry.id !== activeOverlayFrame.id) {
                        return entry;
                    }

                    const currentBounds = entry.bounds;
                    const boundsUnchanged = Boolean(
                        currentBounds
                        && Math.abs(currentBounds.left - nextBounds.left) <= 0.5
                        && Math.abs(currentBounds.top - nextBounds.top) <= 0.5
                        && Math.abs(currentBounds.width - nextBounds.width) <= 0.5
                        && Math.abs(currentBounds.height - nextBounds.height) <= 0.5,
                    );

                    if (entry.preset === activePreset && boundsUnchanged) {
                        return entry;
                    }

                    didChange = true;
                    return {
                        ...entry,
                        preset: activePreset,
                        bounds: nextBounds,
                    };
                });

                return didChange ? nextFrames : frames;
            });
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
                syncSafeAreaGuide(existingFrame, activeOverlayFrame);
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
                syncSafeAreaGuide(existingFrame, activeOverlayFrame);
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
            syncSafeAreaGuide(existingFrame, activeOverlayFrame);
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
            syncSafeAreaGuide(frame, activeOverlayFrame);
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
        };
        const syncScaling = () => {
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
        };
        const handleModified = () => {
            constrainMediaOverlayFrame(frame, activePreset);
            syncSafeAreaGuide(frame, activeOverlayFrame);
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
        syncSafeAreaGuide(frame, activeOverlayFrame);
        bringMediaOverlayFrameToFront(frame);
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
        setMediaOverlayFrames,
        toNormalizedBounds,
        mediaOverlayFrameRef,
        mediaOverlayLabelRef,
        mediaOverlayPendingRestoreRef,
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
    }, [bringMediaOverlayFrameToFront, canvas, getActiveMediaOverlayFrame, mediaOverlayEnabled, mediaOverlayFrameRef]);

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
    }, [canvas, mediaOverlayFrameRef, mediaOverlayLabelRef]);
}
