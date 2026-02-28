import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import {
    MEDIA_OVERLAY_PRESETS,
    type MediaOverlayNamingTemplate,
    type MediaOverlayPersistedState,
    type MediaOverlayPreset,
    type MediaOverlaySafeAreaPreset,
} from '@/components/Editor/editorViewConfig';
import type { MediaOverlayFrameConfig } from '@/components/Editor/mediaOverlayTypes';
import type { RectBounds } from '@/components/Editor/editorView.types';

type UseMediaOverlayStateEffectsArgs = {
    mediaOverlayStorageKey: string;
    mediaOverlayPreset: MediaOverlayPreset;
    mediaOverlayEnabled: boolean;
    mediaOverlayFrames: MediaOverlayFrameConfig[];
    activeMediaOverlayFrameId: string | null;
    createMediaOverlayFrameId: () => string;
    isValidMediaOverlayBounds: (bounds: Partial<RectBounds> | null | undefined) => bounds is RectBounds;
    isValidSafeAreaPreset: (preset: unknown) => preset is MediaOverlaySafeAreaPreset;
    isValidNamingTemplate: (template: unknown) => template is MediaOverlayNamingTemplate;
    toNormalizedBounds: (bounds: Partial<RectBounds>) => RectBounds;
    mediaOverlayPendingRestoreRef: MutableRefObject<RectBounds | null>;
    previousActiveMediaOverlayFrameIdRef: MutableRefObject<string | null>;
    setMediaOverlayPreset: (preset: MediaOverlayPreset) => void;
    setMediaOverlayEnabled: (enabled: boolean) => void;
    setMediaOverlayFrames: Dispatch<SetStateAction<MediaOverlayFrameConfig[]>>;
    setActiveMediaOverlayFrameId: (frameId: string | null) => void;
    setMediaOverlayNamingTemplate: (template: MediaOverlayNamingTemplate) => void;
    onDirty: () => void;
};

export function useMediaOverlayStateEffects({
    mediaOverlayStorageKey,
    mediaOverlayPreset,
    mediaOverlayEnabled,
    mediaOverlayFrames,
    activeMediaOverlayFrameId,
    createMediaOverlayFrameId,
    isValidMediaOverlayBounds,
    isValidSafeAreaPreset,
    isValidNamingTemplate,
    toNormalizedBounds,
    mediaOverlayPendingRestoreRef,
    previousActiveMediaOverlayFrameIdRef,
    setMediaOverlayPreset,
    setMediaOverlayEnabled,
    setMediaOverlayFrames,
    setActiveMediaOverlayFrameId,
    setMediaOverlayNamingTemplate,
    onDirty,
}: UseMediaOverlayStateEffectsArgs) {
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const resetOverlay = () => {
            mediaOverlayPendingRestoreRef.current = null;
            setMediaOverlayPreset('canvas-original');
            setMediaOverlayEnabled(true);
            setMediaOverlayFrames([]);
            setActiveMediaOverlayFrameId(null);
            setMediaOverlayNamingTemplate('frame-preset');
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
                        safeAreaPreset: isValidSafeAreaPreset(frame.safeAreaPreset) ? frame.safeAreaPreset : 'none',
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
                    safeAreaPreset: 'none',
                    bounds: legacyBounds,
                });
            }

            const activeFrame = parsedFrames.find((frame) => frame.id === parsed.activeFrameId) ?? parsedFrames[0] ?? null;
            mediaOverlayPendingRestoreRef.current = activeFrame && isValidMediaOverlayBounds(activeFrame.bounds)
                ? toNormalizedBounds(activeFrame.bounds)
                : null;
            previousActiveMediaOverlayFrameIdRef.current = activeFrame?.id ?? null;
            setMediaOverlayFrames(parsedFrames);
            setActiveMediaOverlayFrameId(activeFrame?.id ?? null);
            setMediaOverlayPreset(activeFrame?.preset ?? nextPreset);
            setMediaOverlayEnabled(typeof parsed.enabled === 'boolean' ? parsed.enabled : true);
            setMediaOverlayNamingTemplate(
                isValidNamingTemplate(parsed.namingTemplate) ? parsed.namingTemplate : 'frame-preset',
            );
        } catch {
            resetOverlay();
        }
    }, [
        createMediaOverlayFrameId,
        isValidMediaOverlayBounds,
        isValidNamingTemplate,
        isValidSafeAreaPreset,
        mediaOverlayStorageKey,
        previousActiveMediaOverlayFrameIdRef,
        mediaOverlayPendingRestoreRef,
        setActiveMediaOverlayFrameId,
        setMediaOverlayEnabled,
        setMediaOverlayFrames,
        setMediaOverlayNamingTemplate,
        setMediaOverlayPreset,
        toNormalizedBounds,
    ]);

    useEffect(() => {
        if (mediaOverlayFrames.length === 0) {
            if (activeMediaOverlayFrameId !== null) {
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
    }, [
        activeMediaOverlayFrameId,
        isValidMediaOverlayBounds,
        mediaOverlayFrames,
        mediaOverlayPendingRestoreRef,
        previousActiveMediaOverlayFrameIdRef,
        setActiveMediaOverlayFrameId,
        setMediaOverlayPreset,
        toNormalizedBounds,
    ]);

    useEffect(() => {
        if (!mediaOverlayEnabled) return;
        if (mediaOverlayFrames.length > 0) return;
        if (mediaOverlayPreset === 'canvas-original') return;

        const firstFrame: MediaOverlayFrameConfig = {
            id: createMediaOverlayFrameId(),
            preset: mediaOverlayPreset,
            includeInBatchExport: true,
            safeAreaPreset: 'none',
        };
        setMediaOverlayFrames([firstFrame]);
        setActiveMediaOverlayFrameId(firstFrame.id);
        onDirty();
    }, [
        createMediaOverlayFrameId,
        mediaOverlayEnabled,
        mediaOverlayFrames.length,
        mediaOverlayPreset,
        onDirty,
        setActiveMediaOverlayFrameId,
        setMediaOverlayFrames,
    ]);
}
