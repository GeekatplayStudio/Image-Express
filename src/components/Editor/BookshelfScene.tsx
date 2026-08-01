'use client';
// The Bookshelf level: the widest zoom-out. Every bookshelf is a wireframe
// box on the 3D lattice, with the albums it holds visible as glass slices
// inside — the same read as an album box showing its pages.
//
// Deliberately has no connection curves. Shelves never share resources, and
// the absence of curves here (against their presence one level down, between
// albums) is what makes that boundary visible.

import React, { useMemo } from 'react';
import type { StackCamera } from '@/lib/multicanvas/stack3dMath';
import type { Bookshelf, ProjectsState } from '@/lib/multicanvas/projectStore';
import { projectsInBookshelf } from '@/lib/multicanvas/projectStore';
import LatticeBox, { sortByDepth } from '@/components/Editor/LatticeBox';
import { useLatticeSettle } from '@/components/Editor/useLatticeSettle';

type BookshelfSceneProps = {
    cam: StackCamera;
    projectsState: ProjectsState;
    onSelectBookshelf: (bookshelfId: string) => void;
    onEnterBookshelf: (bookshelfId: string) => void;
    /** Box under the cursor; its neighbours drift aside. Owned by the parent
     *  so an orbit drag can suppress it. */
    hoveredId?: string | null;
    onHoverBox?: (bookshelfId: string | null) => void;
    /** Shelf mid-delete, with its wind-up/swell scale. */
    destroying?: { id: string; scale: number } | null;
    /** i18n label formatter for the "<n> albums · <m> pages" caption. */
    formatCaption: (albumCount: number, pageCount: number) => string;
};

export default function BookshelfScene({
    cam, projectsState, onSelectBookshelf, onEnterBookshelf,
    hoveredId = null, onHoverBox, destroying = null, formatCaption,
}: BookshelfSceneProps) {
    const { bookshelves, activeBookshelfId } = projectsState;
    const poses = useLatticeSettle(bookshelves.map((shelf) => shelf.id), { hoveredId });

    const boxes = useMemo(() => {
        const entries = bookshelves.map((shelf: Bookshelf, index) => {
            const albums = projectsInBookshelf(projectsState, shelf.id);
            return {
                shelf,
                pose: poses[shelf.id] ?? { cx: index * 0, cy: 0, cz: 0 },
                albumCount: albums.length,
                pageCount: albums.reduce((sum, album) => sum + album.canvases.length, 0),
            };
        });
        return sortByDepth(entries, cam);
    }, [bookshelves, cam, poses, projectsState]);

    return (
        <g data-testid="bookshelf-scene">
            {boxes.map(({ shelf, pose, albumCount, pageCount }) => (
                <LatticeBox
                    key={shelf.id}
                    cam={cam}
                    pose={pose}
                    active={shelf.id === activeBookshelfId}
                    label={shelf.name}
                    caption={formatCaption(albumCount, pageCount)}
                    sliceCount={albumCount}
                    onSelect={() => onSelectBookshelf(shelf.id)}
                    onEnter={() => onEnterBookshelf(shelf.id)}
                    onHover={(hovering) => onHoverBox?.(hovering ? shelf.id : null)}
                    scale={destroying?.id === shelf.id ? destroying.scale : 1}
                    testId={`bookshelf-box-${shelf.id}`}
                />
            ))}
        </g>
    );
}
