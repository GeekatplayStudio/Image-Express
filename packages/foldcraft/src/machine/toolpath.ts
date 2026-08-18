/**
 * Foldcraft machine layer — toolpath intermediate representation.
 *
 * The bridge between planned geometry and any real machine. A `Toolpath` is a
 * flat list of operations in sheet millimetres with explicit blade state —
 * depth, tilt, swivel — so a post-processor only translates, never decides.
 * The simulator executes the same IR the G-code post consumes, which is what
 * makes a simulation trustworthy: there is no second interpretation to drift.
 *
 * Conventions, chosen once here and relied on everywhere:
 *  - X/Y are sheet coordinates in mm, origin at the sheet's top-left.
 *  - Z is blade depth in mm, 0 at the stock surface, negative into the stock.
 *  - `tiltDeg` leans the blade across the direction of travel; sign is
 *    right-hand about the travel direction.
 *  - `swivelDeg` faces a tangential knife along travel; the planner emits it,
 *    machines that self-align (drag knives) ignore it.
 */

import type { FlatPanel, GrooveSpec, MachineProfile, SheetLayout, Vec2 } from '../foldcraftTypes';
import { placePoint } from '../packSheets';

export type ToolpathOp =
    | { kind: 'rapid'; x: number; y: number }
    | { kind: 'cut'; x: number; y: number; z: number; tiltDeg: number; swivelDeg: number }
    | { kind: 'lift' }
    | { kind: 'comment'; text: string };

export type Toolpath = {
    sheetIndex: number;
    ops: ToolpathOp[];
    /** Total cutting distance, for time estimates. */
    cutLengthMm: number;
};

export type ToolpathOptions = {
    /** Cut past the stock bottom on through-cuts so corners release. */
    overcutMm?: number;
    thicknessMm: number;
};

const headingDeg = (a: Vec2, b: Vec2) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const round = (value: number) => Number(value.toFixed(4));

/**
 * Chain boundary segments into loops so the outline cuts continuously instead
 * of lifting between every edge. Falls back to individual segments for any
 * edges that do not chain, rather than guessing at a join.
 */
export function chainSegments(segments: Array<{ a: Vec2; b: Vec2 }>): Vec2[][] {
    const key = (point: Vec2) => `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
    const remaining = new Set(segments.map((_, index) => index));
    const byStart = new Map<string, number[]>();
    segments.forEach((segment, index) => {
        for (const [from] of [[segment.a, segment.b], [segment.b, segment.a]] as const) {
            const list = byStart.get(key(from));
            if (list) list.push(index); else byStart.set(key(from), [index]);
        }
    });

    const chains: Vec2[][] = [];
    while (remaining.size > 0) {
        const startIndex = remaining.values().next().value as number;
        remaining.delete(startIndex);
        const chain: Vec2[] = [segments[startIndex].a, segments[startIndex].b];
        let extended = true;
        while (extended) {
            extended = false;
            const tail = chain[chain.length - 1];
            for (const candidate of byStart.get(key(tail)) ?? []) {
                if (!remaining.has(candidate)) continue;
                const segment = segments[candidate];
                const next = key(segment.a) === key(tail) ? segment.b
                    : key(segment.b) === key(tail) ? segment.a : null;
                if (!next) continue;
                remaining.delete(candidate);
                chain.push(next);
                extended = true;
                break;
            }
        }
        chains.push(chain);
    }
    return chains;
}

/**
 * Toolpath for one sheet.
 *
 * Ordering is safety-ordered, not travel-optimised: all partial-depth work
 * (scores, grooves) cuts first while every panel is still held by the
 * surrounding sheet, and through-cut outlines run last so nothing moves until
 * nothing else needs the material still anchored.
 */
export function buildSheetToolpath(
    panels: FlatPanel[],
    grooves: GrooveSpec[][],
    layout: SheetLayout,
    machine: MachineProfile,
    options: ToolpathOptions,
): Toolpath {
    const byId = new Map(panels.map((panel, index) => [panel.patchId, { panel, grooves: grooves[index] ?? [] }]));
    const ops: ToolpathOp[] = [];
    let cutLength = 0;

    const cutSegment = (a: Vec2, b: Vec2, depth: number, tiltDeg: number) => {
        const swivel = machine.requiresTangentialSwivel ? round(headingDeg(a, b)) : 0;
        ops.push({ kind: 'rapid', x: round(a.x), y: round(a.y) });
        ops.push({ kind: 'cut', x: round(a.x), y: round(a.y), z: round(-depth), tiltDeg: round(tiltDeg), swivelDeg: swivel });
        ops.push({ kind: 'cut', x: round(b.x), y: round(b.y), z: round(-depth), tiltDeg: round(tiltDeg), swivelDeg: swivel });
        ops.push({ kind: 'lift' });
        cutLength += Math.hypot(b.x - a.x, b.y - a.y);
    };

    // Pass 1 — grooves and scores, panel by panel.
    layout.placements.forEach((placement) => {
        const entry = byId.get(placement.panelId);
        if (!entry) return;
        const at = (point: Vec2) => placePoint(entry.panel, placement, point);
        ops.push({ kind: 'comment', text: `panel P${entry.panel.patchId + 1} grooves` });
        entry.grooves.forEach((groove) => {
            if (groove.method === 'through-cut') return; // cut with the outlines
            const a = at(groove.a);
            const b = at(groove.b);
            groove.passes.forEach((pass) => {
                // Offset is perpendicular to the fold line, in sheet space.
                const heading = headingDeg(a, b) * Math.PI / 180;
                const nx = -Math.sin(heading) * pass.offsetMm;
                const ny = Math.cos(heading) * pass.offsetMm;
                cutSegment(
                    { x: a.x + nx, y: a.y + ny },
                    { x: b.x + nx, y: b.y + ny },
                    pass.depthMm,
                    pass.bladeTiltDeg,
                );
            });
        });
    });

    // Pass 2 — through-cuts, outlines last.
    const throughDepth = options.thicknessMm + (options.overcutMm ?? 0.3);
    layout.placements.forEach((placement) => {
        const entry = byId.get(placement.panelId);
        if (!entry) return;
        const at = (point: Vec2) => placePoint(entry.panel, placement, point);

        entry.grooves.filter((groove) => groove.method === 'through-cut').forEach((groove) => {
            cutSegment(at(groove.a), at(groove.b), throughDepth, 0);
        });

        ops.push({ kind: 'comment', text: `panel P${entry.panel.patchId + 1} outline` });
        const segments = entry.panel.boundaryEdges.map((edge) => ({ a: at(edge.a), b: at(edge.b) }));
        chainSegments(segments).forEach((chain) => {
            if (chain.length < 2) return;
            // A tangential knife must face along travel, and swivelling while
            // buried tears the material and snaps blades — the simulator
            // rejects it as `buried-rotation`. So the blade lifts at every
            // corner where the heading changes, re-orients, and plunges again;
            // only straight-through joints are cut without lifting.
            let currentSwivel: number | null = null;
            for (let index = 0; index + 1 < chain.length; index += 1) {
                const from = chain[index];
                const to = chain[index + 1];
                const swivel = machine.requiresTangentialSwivel ? round(headingDeg(from, to)) : 0;
                const continues = currentSwivel !== null && Math.abs(swivel - currentSwivel) < 1e-6;
                if (!continues) {
                    if (currentSwivel !== null) ops.push({ kind: 'lift' });
                    ops.push({ kind: 'rapid', x: round(from.x), y: round(from.y) });
                    ops.push({ kind: 'cut', x: round(from.x), y: round(from.y), z: round(-throughDepth), tiltDeg: 0, swivelDeg: swivel });
                }
                ops.push({ kind: 'cut', x: round(to.x), y: round(to.y), z: round(-throughDepth), tiltDeg: 0, swivelDeg: swivel });
                cutLength += Math.hypot(to.x - from.x, to.y - from.y);
                currentSwivel = swivel;
            }
            ops.push({ kind: 'lift' });
        });
    });

    return { sheetIndex: layout.index, ops, cutLengthMm: Number(cutLength.toFixed(2)) };
}
