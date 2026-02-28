import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { MediaOverlayPreset, MediaOverlaySafeAreaPreset } from '@/components/Editor/editorViewConfig';
import type { MediaOverlayFrameConfig } from '@/components/Editor/mediaOverlayTypes';
import type { RectBounds } from '@/components/Editor/editorView.types';

type UseMediaOverlayFrameActionsArgs = {
    activeMediaOverlayFrameId: string | null;
    mediaOverlayFrames: MediaOverlayFrameConfig[];
    mediaOverlayPreset: MediaOverlayPreset;
    createMediaOverlayFrameId: () => string;
    isValidMediaOverlayBounds: (bounds: Partial<RectBounds> | null | undefined) => bounds is RectBounds;
    toNormalizedBounds: (bounds: Partial<RectBounds>) => RectBounds;
    mediaOverlayPendingRestoreRef: MutableRefObject<RectBounds | null>;
    setMediaOverlayPreset: (preset: MediaOverlayPreset) => void;
    setMediaOverlayEnabled: (enabled: boolean) => void;
    setMediaOverlayFrames: Dispatch<SetStateAction<MediaOverlayFrameConfig[]>>;
    setActiveMediaOverlayFrameId: (frameId: string | null) => void;
    onDirty: () => void;
};

export function useMediaOverlayFrameActions({
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
}: UseMediaOverlayFrameActionsArgs) {
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
    }, [activeMediaOverlayFrameId, mediaOverlayPendingRestoreRef, onDirty, setMediaOverlayFrames, setMediaOverlayPreset]);

    const handleAddMediaOverlayFrame = useCallback(() => {
        const presetForFrame = mediaOverlayPreset === 'canvas-original'
            ? 'instagram-square'
            : mediaOverlayPreset;
        const newFrame: MediaOverlayFrameConfig = {
            id: createMediaOverlayFrameId(),
            preset: presetForFrame,
            includeInBatchExport: true,
            safeAreaPreset: 'none',
        };
        setMediaOverlayEnabled(true);
        setMediaOverlayFrames((frames) => [...frames, newFrame]);
        setActiveMediaOverlayFrameId(newFrame.id);
        setMediaOverlayPreset(newFrame.preset);
        mediaOverlayPendingRestoreRef.current = null;
        onDirty();
    }, [
        createMediaOverlayFrameId,
        mediaOverlayPendingRestoreRef,
        mediaOverlayPreset,
        onDirty,
        setActiveMediaOverlayFrameId,
        setMediaOverlayEnabled,
        setMediaOverlayFrames,
        setMediaOverlayPreset,
    ]);

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
    }, [
        activeMediaOverlayFrameId,
        isValidMediaOverlayBounds,
        mediaOverlayFrames,
        mediaOverlayPendingRestoreRef,
        onDirty,
        setActiveMediaOverlayFrameId,
        setMediaOverlayFrames,
        setMediaOverlayPreset,
        toNormalizedBounds,
    ]);

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
    }, [onDirty, setMediaOverlayFrames]);

    const handleSelectMediaOverlayFrame = useCallback((frameId: string) => {
        const selectedFrame = mediaOverlayFrames.find((frame) => frame.id === frameId);
        if (!selectedFrame) return;
        setActiveMediaOverlayFrameId(selectedFrame.id);
        setMediaOverlayPreset(selectedFrame.preset);
        mediaOverlayPendingRestoreRef.current = isValidMediaOverlayBounds(selectedFrame.bounds)
            ? toNormalizedBounds(selectedFrame.bounds)
            : null;
    }, [
        isValidMediaOverlayBounds,
        mediaOverlayFrames,
        mediaOverlayPendingRestoreRef,
        setActiveMediaOverlayFrameId,
        setMediaOverlayPreset,
        toNormalizedBounds,
    ]);

    const handleActiveMediaOverlayFrameSafeAreaPresetChange = useCallback((nextSafeAreaPreset: MediaOverlaySafeAreaPreset) => {
        if (!activeMediaOverlayFrameId) return;
        setMediaOverlayFrames((frames) => frames.map((frame) => (
            frame.id === activeMediaOverlayFrameId
                ? {
                    ...frame,
                    safeAreaPreset: nextSafeAreaPreset,
                }
                : frame
        )));
        onDirty();
    }, [activeMediaOverlayFrameId, onDirty, setMediaOverlayFrames]);

    return {
        handleMediaOverlayPresetChange,
        handleAddMediaOverlayFrame,
        handleRemoveActiveMediaOverlayFrame,
        handleToggleMediaOverlayFrameInclude,
        handleSelectMediaOverlayFrame,
        handleActiveMediaOverlayFrameSafeAreaPresetChange,
    };
}
