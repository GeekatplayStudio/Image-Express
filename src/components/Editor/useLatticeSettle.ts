'use client';
// Box motion for the lattice levels (Bookshelves, Albums). Two independent
// animations composed into one pose per box:
//
//   settle    — adding/deleting a box changes `total`, which moves EVERY box's
//               target. A jump-cut there loses the user's sense of which box
//               is which, so they slide instead.
//   repulsion — the box under the cursor pushes its neighbours gently aside,
//               so the hovered box reads as having room around it.
//
// They are kept separate because they have different inputs and different
// settling times; composing at the end is simpler than one blended spring.
// Repulsion is measured against the *target* lattice rather than the settling
// positions, so a mid-settle hover does not feed the two animations into each
// other.

import { useEffect, useRef, useState } from 'react';
import {
    DEFAULT_GRID_OPTIONS,
    gridPose,
    repulsionOffset,
    type GridPose,
    type GridPoseOptions,
} from '@/lib/multicanvas/gridPose';

const SETTLE_MS = 420;
/** Per-frame approach rate for the repulsion drift — higher is snappier. */
const REPULSION_EASE = 0.18;
/** Below this the drift is visually done, so the frame loop can stop. */
const REPULSION_EPSILON = 0.15;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const ZERO: GridPose = { cx: 0, cy: 0, cz: 0 };

const posesFor = (ids: string[], options: Required<GridPoseOptions>): Record<string, GridPose> => {
    const out: Record<string, GridPose> = {};
    ids.forEach((id, index) => {
        out[id] = gridPose(index, ids.length, options);
    });
    return out;
};

export type LatticeLayoutOptions = GridPoseOptions & {
    /** Box currently under the cursor; its neighbours drift away from it. */
    hoveredId?: string | null;
};

/**
 * Animated lattice poses keyed by id. New boxes appear at their final spot
 * (there is nowhere sensible to slide them from); existing boxes slide.
 */
export function useLatticeSettle(ids: string[], options: LatticeLayoutOptions = {}): Record<string, GridPose> {
    const { hoveredId = null, ...gridOptions } = options;
    const { spacingX, spacingZ, spacingY, growAfter } = { ...DEFAULT_GRID_OPTIONS, ...gridOptions };
    const layout = { spacingX, spacingZ, spacingY, growAfter };

    const [poses, setPoses] = useState<Record<string, GridPose>>(() => posesFor(ids, layout));
    // Where each box currently sits. Written only from the animation frame and
    // the effect — never during render — so a mid-flight re-render (an orbit
    // drag, say) does not restart the slide from a stale position.
    const posesRef = useRef<Record<string, GridPose>>(poses);
    const rafRef = useRef<number | null>(null);
    const key = ids.join('|');

    useEffect(() => {
        const list = key ? key.split('|') : [];
        const targets = posesFor(list, layout);

        const from: Record<string, GridPose> = {};
        for (const id of list) {
            from[id] = posesRef.current[id] ?? targets[id];
        }

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        // The first frame's own timestamp is the start, so the animation needs
        // no clock of its own and cannot drift against the frame callback.
        let t0: number | null = null;
        const step = (now: number) => {
            if (t0 === null) t0 = now;
            const k = easeOutCubic(Math.min(1, (now - t0) / SETTLE_MS));
            const next: Record<string, GridPose> = {};
            for (const id of list) {
                const a = from[id];
                const b = targets[id];
                next[id] = {
                    cx: lerp(a.cx, b.cx, k),
                    cy: lerp(a.cy, b.cy, k),
                    cz: lerp(a.cz, b.cz, k),
                };
            }
            posesRef.current = next;
            setPoses(next);
            rafRef.current = k < 1 ? requestAnimationFrame(step) : null;
        };
        rafRef.current = requestAnimationFrame(step);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
        // `layout` is a fresh object each render; its four primitives are the
        // real inputs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, spacingX, spacingZ, spacingY, growAfter]);

    // --- Hover repulsion -----------------------------------------------------

    const [drift, setDrift] = useState<Record<string, GridPose>>({});
    const driftRef = useRef<Record<string, GridPose>>(drift);
    const driftRafRef = useRef<number | null>(null);

    useEffect(() => {
        const list = key ? key.split('|') : [];
        const targets: Record<string, GridPose> = {};
        if (hoveredId && list.includes(hoveredId)) {
            const lattice = posesFor(list, layout);
            const centre = lattice[hoveredId];
            for (const id of list) {
                targets[id] = id === hoveredId ? ZERO : repulsionOffset(lattice[id], centre);
            }
        } else {
            for (const id of list) targets[id] = ZERO;
        }

        if (driftRafRef.current !== null) cancelAnimationFrame(driftRafRef.current);
        const step = () => {
            let moving = false;
            const next: Record<string, GridPose> = {};
            for (const id of list) {
                const current = driftRef.current[id] ?? ZERO;
                const target = targets[id];
                const cx = lerp(current.cx, target.cx, REPULSION_EASE);
                const cy = lerp(current.cy, target.cy, REPULSION_EASE);
                const cz = lerp(current.cz, target.cz, REPULSION_EASE);
                if (
                    Math.abs(cx - target.cx) > REPULSION_EPSILON
                    || Math.abs(cy - target.cy) > REPULSION_EPSILON
                    || Math.abs(cz - target.cz) > REPULSION_EPSILON
                ) {
                    moving = true;
                    next[id] = { cx, cy, cz };
                } else {
                    // Snap the last fraction of a unit so the loop can stop
                    // rather than approach the target forever.
                    next[id] = target;
                }
            }
            driftRef.current = next;
            setDrift(next);
            driftRafRef.current = moving ? requestAnimationFrame(step) : null;
        };
        driftRafRef.current = requestAnimationFrame(step);
        return () => {
            if (driftRafRef.current !== null) cancelAnimationFrame(driftRafRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, hoveredId, spacingX, spacingZ, spacingY, growAfter]);

    // First paint — and jsdom, where a frame may never run — still needs a
    // pose for every id, so fall back to the exact target.
    const resolved: Record<string, GridPose> = {};
    ids.forEach((id, index) => {
        const settled = poses[id] ?? gridPose(index, ids.length, layout);
        const offset = drift[id] ?? ZERO;
        resolved[id] = {
            cx: settled.cx + offset.cx,
            cy: settled.cy + offset.cy,
            cz: settled.cz + offset.cz,
        };
    });
    return resolved;
}
