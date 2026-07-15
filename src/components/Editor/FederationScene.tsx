'use client';
// The zoomed-out Federation level: every Project renders as a wireframe cube
// with its canvases visible as glass slices inside, linked by glowing channel
// curves between projects that share linked layers. Adapted from
// GeekatplayStudio/LogiTensor (federation-scene.tsx).
import React, { useMemo } from 'react';
import { StackCamera, project as project3d } from '@/lib/multicanvas/stack3dMath';
import type { ProjectsState } from '@/lib/multicanvas/projectStore';
import { listProjectLinks } from '@/lib/multicanvas/projectStore';

const CUBE_HALF = 96;

// Cube face definitions as corner multipliers [x, y, z] of CUBE_HALF
const FACES: [number, number, number][][] = [
    [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], // front
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],     // back
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], // left
    [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]],     // right
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], // top
    [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]],     // bottom
];

type FederationSceneProps = {
    cam: StackCamera;
    projectsState: ProjectsState;
    onSelectProject: (projectId: string) => void;
    onEnterProject: (projectId: string) => void;
    /** i18n label formatter for the "<n> canvases · <m> linked" caption. */
    formatCaption: (canvasCount: number, linkedCount: number) => string;
};

export default function FederationScene({
    cam, projectsState, onSelectProject, onEnterProject, formatCaption,
}: FederationSceneProps) {
    const { projects, activeProjectId } = projectsState;

    // Projects float on a ring with a slight per-project vertical drift.
    const poses = useMemo(() => {
        const n = projects.length;
        const radius = n <= 1 ? 0 : Math.max(300, n * 95);
        return projects.map((project, i) => {
            const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
            const cx = Math.cos(angle) * radius;
            const cz = Math.sin(angle) * radius;
            const cy = (i % 3 - 1) * 46;
            const center = project3d(cx, cy, cz, cam);
            return { project, cx, cy, cz, depth: center.depth };
        });
    }, [projects, cam]);

    const links = useMemo(() => listProjectLinks(projectsState), [projectsState]);
    const poseById = useMemo(() => new Map(poses.map((p) => [p.project.id, p])), [poses]);
    const drawOrder = useMemo(() => [...poses].sort((a, b) => b.depth - a.depth), [poses]);

    return (
        <g data-testid="federation-scene">
            {drawOrder.map(({ project, cx, cy, cz }) => {
                const active = project.id === activeProjectId;
                const h = CUBE_HALF * (active ? 1.12 : 1);
                const stroke = active ? 'rgba(127,170,176,0.6)' : 'rgba(148,163,184,0.32)';

                const faceEls = FACES.map((face, fi) => {
                    const pts = face.map(([mx, my, mz]) => project3d(cx + mx * h, cy + my * h, cz + mz * h, cam));
                    const depth = pts.reduce((s, p) => s + p.depth, 0) / 4;
                    const d = `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`;
                    return { fi, depth, d };
                }).sort((a, b) => b.depth - a.depth);

                // Canvases as horizontal glass slices stacked inside the cube
                const sliceCount = Math.min(project.canvases.length, 5);
                const slices = Array.from({ length: sliceCount }, (_, j) => {
                    const y = cy + h - ((j + 1) * (2 * h)) / (sliceCount + 1);
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
                const linkedCount = project.canvases.reduce(
                    (sum, canvasEntry) => sum + (canvasEntry.json?.objects ?? []).filter((layer) => layer.sharedLayerId).length,
                    0,
                );

                return (
                    <g
                        key={project.id}
                        onClick={() => onSelectProject(project.id)}
                        onDoubleClick={() => onEnterProject(project.id)}
                        className="cursor-pointer"
                        opacity={active ? 1 : 0.72}
                        style={{ transition: 'opacity 0.3s' }}
                        data-testid={`federation-cube-${project.id}`}
                    >
                        {faceEls.map((f) => (
                            <path
                                key={f.fi}
                                d={f.d}
                                fill={active ? 'rgba(127,170,176,0.04)' : 'rgba(255,255,255,0.02)'}
                                stroke={stroke}
                                strokeWidth={active ? 1.4 : 0.9}
                                filter={active ? 'url(#csv-glow)' : undefined}
                            />
                        ))}
                        {slices.map((d, j) => (
                            <path key={j} d={d} fill="rgba(127,170,176,0.04)" stroke="rgba(127,170,176,0.3)" strokeWidth={0.8} />
                        ))}
                        <text x={top.x} y={top.y} textAnchor="middle" fontSize={active ? 16 : 13} fontWeight={600} fill={active ? '#B9D3D6' : '#94a3b8'}>
                            {project.name}
                        </text>
                        <text x={top.x} y={top.y + 15} textAnchor="middle" fontSize={9.5} fill="#64748b">
                            {formatCaption(project.canvases.length, linkedCount)}
                        </text>
                    </g>
                );
            })}

            {links.map((link, i) => {
                const pa = poseById.get(link.a);
                const pb = poseById.get(link.b);
                if (!pa || !pb) return null;
                const p1 = project3d(pa.cx, pa.cy, pa.cz, cam);
                const p2 = project3d(pb.cx, pb.cy, pb.cz, cam);
                const qx = (p1.x + p2.x) / 2;
                const qy = Math.min(p1.y, p2.y) - 130;
                const d = `M ${p1.x} ${p1.y} Q ${qx} ${qy} ${p2.x} ${p2.y}`;
                return (
                    <g key={`fed_${i}`} pointerEvents="none">
                        <path d={d} fill="none" stroke="url(#csv-bridge)" strokeWidth={1.8} opacity={0.75} filter="url(#csv-glow)" className="csv-flow" />
                        <circle r={3.2} fill="#AC9BC4" filter="url(#csv-glow)">
                            <animateMotion dur="3s" repeatCount="indefinite" path={d} />
                        </circle>
                    </g>
                );
            })}
        </g>
    );
}
