'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent, type WheelEvent } from 'react';
import {
    StackCamera,
    DEFAULT_STACK_CAMERA,
    clampPitch,
    clampZoom,
} from '@/lib/multicanvas/stack3dMath';

export type VaultSceneNav = {
    cam: StackCamera;
    /** World-space depth shift (Alt+scroll). */
    depthShift: number;
    dragRef: MutableRefObject<{ x: number; y: number; cam: StackCamera; depthShift: number; pan: boolean; moved: boolean } | null>;
    spaceDown: boolean;
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: () => void;
    /** Call from clickable scene objects; returns true if the gesture was a click (not a drag). */
    finishPointerGesture: () => boolean;
    onWheel: (event: WheelEvent<HTMLDivElement>) => void;
    resetView: () => void;
};

const DEFAULT_ROOM_CAM: StackCamera = { ...DEFAULT_STACK_CAMERA, yaw: -0.38, pitch: 0.42, zoom: 1.0, panX: 0, panY: 40 };

/**
 * Natural 3D navigation for vault scenes:
 * - Left-drag: orbit
 * - Space+left-drag (or middle / Shift-drag): pan
 * - Scroll: zoom
 * - Alt+scroll: move in depth through the grid
 * - Double-click empty / resetView: home camera
 */
export function useVaultSceneCamera(initial: StackCamera = DEFAULT_ROOM_CAM): VaultSceneNav {
    const [cam, setCam] = useState<StackCamera>(initial);
    const [depthShift, setDepthShift] = useState(0);
    const [spaceDown, setSpaceDown] = useState(false);
    const dragRef = useRef<{
        x: number;
        y: number;
        cam: StackCamera;
        depthShift: number;
        pan: boolean;
        moved: boolean;
    } | null>(null);
    const spaceRef = useRef(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'Space') return;
            if (event.repeat) return;
            const tag = (event.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable) return;
            event.preventDefault();
            spaceRef.current = true;
            setSpaceDown(true);
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.code !== 'Space') return;
            spaceRef.current = false;
            setSpaceDown(false);
        };
        const onBlur = () => {
            spaceRef.current = false;
            setSpaceDown(false);
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
    }, []);

    const resetView = useCallback(() => {
        setCam(initial);
        setDepthShift(0);
    }, [initial]);

    const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
        dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            cam,
            depthShift,
            pan: spaceRef.current || event.shiftKey || event.button === 1,
            moved: false,
        };
        // Do not capture yet — capture steals pointerup from album/page hit targets.
        // Capture starts only after the gesture becomes a real drag.
    }, [cam, depthShift]);

    const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
            if (!drag.moved) {
                drag.moved = true;
                try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                    // Ignore capture failures (pointer already released).
                }
            }
        }
        // Live-switch to pan if Space is pressed mid-drag.
        const pan = drag.pan || spaceRef.current;
        if (pan) {
            setCam({
                ...drag.cam,
                panX: drag.cam.panX + dx,
                panY: drag.cam.panY + dy,
            });
            return;
        }
        setCam({
            ...drag.cam,
            yaw: drag.cam.yaw + dx * 0.006,
            pitch: clampPitch(drag.cam.pitch + dy * 0.004),
        });
    }, []);

    const finishPointerGesture = useCallback(() => {
        const drag = dragRef.current;
        const wasClick = !!drag && !drag.moved;
        dragRef.current = null;
        return wasClick;
    }, []);

    const onPointerUp = useCallback(() => {
        finishPointerGesture();
    }, [finishPointerGesture]);

    const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.altKey) {
            // Move through the grid in depth (world Z).
            setDepthShift((prev) => Math.max(-600, Math.min(600, prev + (event.deltaY > 0 ? 28 : -28))));
            return;
        }
        setCam((prev) => ({
            ...prev,
            zoom: clampZoom(prev.zoom * (event.deltaY > 0 ? 0.9 : 1.1)),
        }));
    }, []);

    return {
        cam,
        depthShift,
        dragRef,
        spaceDown,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        finishPointerGesture,
        onWheel,
        resetView,
    };
}
