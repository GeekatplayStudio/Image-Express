'use client';
// One box on the 3D lattice, shared by the Bookshelf and Album levels.
//
// A bookshelf and an album look alike on purpose: both are a wireframe cube
// with its contents showing as glass slices inside (albums in a bookshelf,
// pages in an album). What differs is the level you are on, shown by the
// caption and — at the album level — the connection curves between boxes.
//
// Renders into CanvasStackView's <svg>, so it relies on the `csv-glow` filter
// defined there.

import React from 'react';
import { StackCamera, project as project3d } from '@/lib/multicanvas/stack3dMath';
import type { GridPose } from '@/lib/multicanvas/gridPose';

/** Cube face corner multipliers [x, y, z] of the box half-extent. */
const FACES: [number, number, number][][] = [
    [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], // front
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],     // back
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], // left
    [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]],     // right
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], // top
    [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]],     // bottom
];

/** Most slices worth drawing — past this they stop being individually legible. */
const MAX_SLICES = 5;

export const BOX_HALF = 96;

export type LatticeBoxProps = {
    cam: StackCamera;
    pose: GridPose;
    /** Half-extent before the selected-box swell. */
    half?: number;
    active: boolean;
    label: string;
    caption: string;
    /** How many things are inside — drawn as horizontal glass slices. */
    sliceCount: number;
    onSelect: () => void;
    onEnter: () => void;
    onHover?: (hovering: boolean) => void;
    /**
     * Extra size multiplier, driven by the delete animation (wind-up shrink,
     * then a swell before the burst). 1 at rest.
     */
    scale?: number;
    testId: string;
};

export default function LatticeBox({
    cam, pose, half = BOX_HALF, active, label, caption, sliceCount,
    onSelect, onEnter, onHover, scale = 1, testId,
}: LatticeBoxProps) {
    const { cx, cy, cz } = pose;
    const h = half * (active ? 1.12 : 1) * scale;
    const stroke = active ? 'rgba(127,170,176,0.6)' : 'rgba(148,163,184,0.32)';

    const faces = FACES.map((face, fi) => {
        const pts = face.map(([mx, my, mz]) => project3d(cx + mx * h, cy + my * h, cz + mz * h, cam));
        const depth = pts.reduce((sum, p) => sum + p.depth, 0) / 4;
        return { fi, depth, d: `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')} Z` };
    }).sort((a, b) => b.depth - a.depth);

    const slices = Math.min(sliceCount, MAX_SLICES);
    const slicePaths = Array.from({ length: slices }, (_, j) => {
        const y = cy + h - ((j + 1) * (2 * h)) / (slices + 1);
        const inset = h - 16;
        const pts = [
            project3d(cx - inset, y, cz - inset, cam),
            project3d(cx + inset, y, cz - inset, cam),
            project3d(cx + inset, y, cz + inset, cam),
            project3d(cx - inset, y, cz + inset, cam),
        ];
        return `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`;
    });

    const top = project3d(cx, cy - h - 30, cz, cam);

    return (
        <g
            onClick={onSelect}
            onDoubleClick={onEnter}
            onPointerEnter={() => onHover?.(true)}
            onPointerLeave={() => onHover?.(false)}
            className="cursor-pointer"
            opacity={active ? 1 : 0.72}
            style={{ transition: 'opacity 0.3s' }}
            data-testid={testId}
        >
            {faces.map((f) => (
                <path
                    key={f.fi}
                    d={f.d}
                    fill={active ? 'rgba(127,170,176,0.04)' : 'rgba(255,255,255,0.02)'}
                    stroke={stroke}
                    strokeWidth={active ? 1.4 : 0.9}
                    filter={active ? 'url(#csv-glow)' : undefined}
                />
            ))}
            {slicePaths.map((d, j) => (
                <path key={j} d={d} fill="rgba(127,170,176,0.04)" stroke="rgba(127,170,176,0.3)" strokeWidth={0.8} />
            ))}
            <text
                x={top.x}
                y={top.y}
                textAnchor="middle"
                fontSize={active ? 16 : 13}
                fontWeight={600}
                fill={active ? '#B9D3D6' : '#94a3b8'}
            >
                {label}
            </text>
            <text x={top.x} y={top.y + 15} textAnchor="middle" fontSize={9.5} fill="#64748b">
                {caption}
            </text>
        </g>
    );
}

/** Painter's-algorithm ordering: farthest box drawn first. */
export function sortByDepth<T extends { pose: GridPose }>(items: T[], cam: StackCamera): T[] {
    return [...items].sort((a, b) => (
        project3d(b.pose.cx, b.pose.cy, b.pose.cz, cam).depth
        - project3d(a.pose.cx, a.pose.cy, a.pose.cz, cam).depth
    ));
}
