'use client';
// The Album level: every album on the current bookshelf renders as a
// wireframe box with its pages visible as glass slices inside, linked by
// glowing channel curves between albums that share linked layers.
//
// Albums sit on the same 3D lattice as bookshelves (gridPose), so the two
// levels read as one spatial model. This replaced an earlier ring layout,
// whose radius grew with the album count — every new album pushed the camera
// further back and crowded the labels. The lattice spreads growth across
// three axes instead, stacking a new layer once the floor is full.
//
// Scoped to one shelf: shelves never share resources, so an album on another
// shelf is neither drawn here nor reachable by a link curve.
// Adapted from GeekatplayStudio/LogiTensor (federation-scene.tsx).
import React, { useMemo } from 'react';
import { StackCamera, project as project3d } from '@/lib/multicanvas/stack3dMath';
import type { ProjectLink, ProjectsState } from '@/lib/multicanvas/projectStore';
import { listProjectLinks, projectsInBookshelf } from '@/lib/multicanvas/projectStore';
import LatticeBox, { sortByDepth } from '@/components/Editor/LatticeBox';
import { useLatticeSettle } from '@/components/Editor/useLatticeSettle';

type FederationSceneProps = {
    cam: StackCamera;
    projectsState: ProjectsState;
    onSelectProject: (projectId: string) => void;
    onEnterProject: (projectId: string) => void;
    /**
     * A connection curve was clicked. Receives every link between that album
     * pair so the caller can list all assets the two albums share.
     */
    onSelectLink?: (links: ProjectLink[]) => void;
    /** Currently inspected pair, as "idA::idB" — highlights those curves. */
    selectedPairKey?: string | null;
    /** Box under the cursor; its neighbours drift aside. Owned by the parent
     *  so an orbit drag can suppress it. */
    hoveredId?: string | null;
    onHoverBox?: (projectId: string | null) => void;
    /** Album mid-delete, with its wind-up/swell scale. */
    destroying?: { id: string; scale: number } | null;
    /** i18n label formatter for the "<n> canvases · <m> linked" caption. */
    formatCaption: (canvasCount: number, linkedCount: number) => string;
};

export const pairKeyOf = (a: string, b: string): string => (a < b ? `${a}::${b}` : `${b}::${a}`);

export default function FederationScene({
    cam, projectsState, onSelectProject, onEnterProject, onSelectLink, selectedPairKey,
    hoveredId = null, onHoverBox, destroying = null, formatCaption,
}: FederationSceneProps) {
    const { activeProjectId, activeBookshelfId } = projectsState;

    // Only this shelf's albums.
    const projects = useMemo(
        () => projectsInBookshelf(projectsState, activeBookshelfId),
        [projectsState, activeBookshelfId],
    );

    const poses = useLatticeSettle(projects.map((project) => project.id), { hoveredId });

    const boxes = useMemo(() => {
        const entries = projects.map((project, index) => ({
            project,
            pose: poses[project.id] ?? { cx: index * 0, cy: 0, cz: 0 },
        }));
        return sortByDepth(entries, cam);
    }, [projects, poses, cam]);

    const links = useMemo(
        () => listProjectLinks(projectsState, activeBookshelfId),
        [projectsState, activeBookshelfId],
    );
    // All links between the same album pair, so a click can report the full
    // shared-asset list and the curves can fan out instead of overlapping.
    const linksByPair = useMemo(() => {
        const groups = new Map<string, ProjectLink[]>();
        for (const link of links) {
            const key = pairKeyOf(link.a, link.b);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(link);
        }
        return groups;
    }, [links]);
    const poseById = useMemo(
        () => new Map(boxes.map((entry) => [entry.project.id, entry.pose])),
        [boxes],
    );

    return (
        <g data-testid="federation-scene">
            {boxes.map(({ project, pose }) => {
                const linkedCount = project.canvases.reduce(
                    (sum, canvasEntry) => sum + (canvasEntry.json?.objects ?? []).filter((layer) => layer.sharedLayerId).length,
                    0,
                );
                return (
                    <LatticeBox
                        key={project.id}
                        cam={cam}
                        pose={pose}
                        active={project.id === activeProjectId}
                        label={project.name}
                        caption={formatCaption(project.canvases.length, linkedCount)}
                        sliceCount={project.canvases.length}
                        onSelect={() => onSelectProject(project.id)}
                        onEnter={() => onEnterProject(project.id)}
                        onHover={(hovering) => onHoverBox?.(hovering ? project.id : null)}
                        scale={destroying?.id === project.id ? destroying.scale : 1}
                        testId={`federation-cube-${project.id}`}
                    />
                );
            })}

            {/*
              * One curve PER shared asset. Curves between the same album pair
              * fan out at staggered heights so three shared assets read as
              * three distinct connections, and each is clickable to inspect
              * exactly what the two albums share.
              */}
            {links.map((link, i) => {
                const pa = poseById.get(link.a);
                const pb = poseById.get(link.b);
                if (!pa || !pb) return null;
                const key = pairKeyOf(link.a, link.b);
                const group = linksByPair.get(key) ?? [link];
                const fanIndex = group.findIndex((entry) => entry.sharedLayerId === link.sharedLayerId);
                const fanSpread = (fanIndex - (group.length - 1) / 2) * 42;
                const inspected = selectedPairKey === key;
                const p1 = project3d(pa.cx, pa.cy, pa.cz, cam);
                const p2 = project3d(pb.cx, pb.cy, pb.cz, cam);
                const qx = (p1.x + p2.x) / 2 + fanSpread * 0.4;
                const qy = Math.min(p1.y, p2.y) - 130 - fanSpread;
                const d = `M ${p1.x} ${p1.y} Q ${qx} ${qy} ${p2.x} ${p2.y}`;
                return (
                    <g
                        key={`fed_${link.sharedLayerId}_${i}`}
                        className="cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelectLink?.(group);
                        }}
                        data-testid={`federation-link-${link.sharedLayerId}`}
                    >
                        {/* Wide invisible hit area — the visible curve is 2px. */}
                        <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                        <path
                            d={d}
                            fill="none"
                            stroke="url(#csv-bridge)"
                            strokeWidth={inspected ? 2.6 : 1.8}
                            opacity={inspected ? 1 : 0.75}
                            filter="url(#csv-glow)"
                            className="csv-flow"
                            pointerEvents="none"
                        />
                        <circle r={inspected ? 4 : 3.2} fill="#AC9BC4" filter="url(#csv-glow)" pointerEvents="none">
                            <animateMotion dur="3s" repeatCount="indefinite" path={d} />
                        </circle>
                    </g>
                );
            })}
        </g>
    );
}
