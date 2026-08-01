'use client';
// True-3D canvas stack: every canvas in the project is a horizontal plane in
// world space that the camera orbits around. Unselected planes render in
// x-ray; shared (linked) layers are drawn as flowing bridge paths between
// planes, node-editor style. Adapted from GeekatplayStudio/LogiTensor.
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Copy, Trash2, Plus, X, Layers, Boxes, Library, Link2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { useDialog } from '@/providers/DialogProvider';
import {
    StackCamera, DEFAULT_STACK_CAMERA, VIEW_W, VIEW_H, project as project3d,
    clampPitch, clampZoom, clampDepth,
} from '@/lib/multicanvas/stack3dMath';
import type { Project, ProjectLink, ProjectsState, SerializedLayer } from '@/lib/multicanvas/projectStore';
import { getActiveBookshelf, listSharedLayerBridges, projectsInBookshelf } from '@/lib/multicanvas/projectStore';
import StackEffects, { EXPLOSION_DURATION_MS, SPARKLE_DURATION_MS, type StackFx } from '@/components/Editor/StackEffects';
import {
    hasDrawableSource, layerCenterNormalized, layerCorners, layerFill,
    normalizeToCanvas, planeExtentFor,
} from '@/lib/multicanvas/layerPlacement';
import FederationScene, { pairKeyOf } from '@/components/Editor/FederationScene';
import BookshelfScene from '@/components/Editor/BookshelfScene';
import { gridPose } from '@/lib/multicanvas/gridPose';

// World size the album's longest page edge maps to. Every page is scaled
// against that, so plane footprints show real relative page sizes.
const PLANE_SPAN = 860;
const LAYER_GAP = 112; // vertical distance between canvas planes
const PULL_X = 300; // selected canvas slides out of the stack along +x

const LAYER_COLORS: Record<string, string> = {
    image: '#7FAAB0',
    'i-text': '#AD8BB0',
    textbox: '#AD8BB0',
    text: '#AD8BB0',
    rect: '#9AC0C4',
    circle: '#9AC0C4',
    triangle: '#9AC0C4',
    polygon: '#9AC0C4',
    path: '#C4B08B',
    group: '#AC9BC4',
};

const layerColor = (type?: string) => (type && LAYER_COLORS[type.toLowerCase()]) || '#8BA8AD';

type CanvasStackViewProps = {
    project: Project;
    projectsState: ProjectsState;
    onSelectCanvas: (canvasId: string) => void;
    onOpenCanvas: (canvasId: string) => void;
    onAddCanvas: () => void;
    onDuplicateCanvas: (canvasId: string) => void;
    onDeleteCanvas: (canvasId: string) => void;
    onRenameCanvas: (canvasId: string, name: string) => void;
    onSelectProject: (projectId: string) => void;
    onOpenProject: (projectId: string) => void;
    onAddProject: () => void;
    onDuplicateProject: (projectId: string) => void;
    onDeleteProject: (projectId: string) => void;
    onRenameProject: (projectId: string, name: string) => void;
    onSelectBookshelf: (bookshelfId: string) => void;
    onOpenBookshelf: (bookshelfId: string) => void;
    onAddBookshelf: () => void;
    onDuplicateBookshelf: (bookshelfId: string) => void;
    onDeleteBookshelf: (bookshelfId: string) => void;
    onRenameBookshelf: (bookshelfId: string, name: string) => void;
    onClose: () => void;
};

/** Zoom-out level: pages inside an album, albums on a shelf, shelves. */
type StackMode = 'stack' | 'federation' | 'bookshelf';

/** Zoom past this while pulling back and the view rises to the next level up. */
const ZOOM_OUT_THRESHOLD = 0.42;
/** Zoom past this while pushing in and the view dives to the next level down. */
const ZOOM_IN_THRESHOLD = 2.1;

export default function CanvasStackView({
    project, projectsState, onSelectCanvas, onOpenCanvas, onAddCanvas,
    onDuplicateCanvas, onDeleteCanvas, onRenameCanvas,
    onSelectProject, onOpenProject, onAddProject, onDuplicateProject, onDeleteProject, onRenameProject,
    onSelectBookshelf, onOpenBookshelf, onAddBookshelf, onDuplicateBookshelf, onDeleteBookshelf,
    onRenameBookshelf,
    onClose,
}: CanvasStackViewProps) {
    const { t } = useI18n();
    const dialog = useDialog();
    const [mode, setMode] = useState<StackMode>('stack');
    const [cam, setCam] = useState<StackCamera>(DEFAULT_STACK_CAMERA);
    const dragRef = useRef<{ x: number; y: number; cam: StackCamera; pan: boolean; moved: boolean } | null>(null);

    const activeBookshelf = getActiveBookshelf(projectsState);
    const shelfAlbums = useMemo(
        () => projectsInBookshelf(projectsState, projectsState.activeBookshelfId),
        [projectsState],
    );

    // Space held = pan instead of orbit, the standard 3D-viewport convention.
    // Tracked on window so it works wherever the pointer is, and cleared on
    // blur so alt-tabbing mid-drag does not leave the view stuck in pan.
    const [spaceDown, setSpaceDown] = useState(false);
    const spaceRef = useRef(false);
    useEffect(() => {
        const isTypingTarget = (target: EventTarget | null) => {
            const el = target as HTMLElement | null;
            return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable === true;
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target)) return;
            e.preventDefault();
            spaceRef.current = true;
            setSpaceDown(true);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
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

    // Particle bursts (sparkle dust on create/duplicate, explosion on delete).
    const [effects, setEffects] = useState<StackFx[]>([]);
    const fxSeqRef = useRef(0);
    const spawnFx = useCallback((kind: StackFx['kind'], x: number, y: number) => {
        const id = fxSeqRef.current += 1;
        setEffects((prev) => [...prev, { id, kind, x, y }]);
        const ttl = (kind === 'sparkle' ? SPARKLE_DURATION_MS : EXPLOSION_DURATION_MS) + 300;
        window.setTimeout(() => {
            setEffects((prev) => prev.filter((fx) => fx.id !== id));
        }, ttl);
    }, []);

    // Which album pair's shared assets are being inspected (federation view).
    const [inspectedLinks, setInspectedLinks] = useState<ProjectLink[] | null>(null);

    // Box under the cursor. Owned here rather than in each scene so an orbit
    // drag can clear it — otherwise sweeping the pointer across the lattice
    // mid-drag sets neighbours drifting while the camera is already moving.
    const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);

    /**
     * The box being deleted, and how big it is right now.
     *
     * A box does not simply vanish: it winds up (shrinks), swells past its
     * original size, and only then bursts — so the eye has somewhere to land
     * before the particles appear. The row is removed from the store at the
     * moment of the burst, not before, so the shrink is visible.
     */
    const [destroying, setDestroying] = useState<{ id: string; scale: number } | null>(null);
    const destroyRafRef = useRef<number | null>(null);
    useEffect(() => () => {
        if (destroyRafRef.current !== null) cancelAnimationFrame(destroyRafRef.current);
    }, []);

    /** Wind-up, swell, burst, then commit the deletion. */
    const playDestroy = useCallback((id: string, burstAt: { x: number; y: number }, commit: () => void) => {
        const SHRINK_MS = 190;
        const SWELL_MS = 150;
        if (destroyRafRef.current !== null) cancelAnimationFrame(destroyRafRef.current);
        setHoveredBoxId(null);
        let t0: number | null = null;
        const step = (now: number) => {
            if (t0 === null) t0 = now;
            const elapsed = now - t0;
            if (elapsed < SHRINK_MS) {
                // Ease in: the collapse accelerates, like something being pulled inward.
                const k = (elapsed / SHRINK_MS) ** 2;
                setDestroying({ id, scale: 1 - 0.55 * k });
                destroyRafRef.current = requestAnimationFrame(step);
                return;
            }
            if (elapsed < SHRINK_MS + SWELL_MS) {
                // Ease out: the rebound overshoots well past full size.
                const k = 1 - (1 - (elapsed - SHRINK_MS) / SWELL_MS) ** 2;
                setDestroying({ id, scale: 0.45 + 1.05 * k });
                destroyRafRef.current = requestAnimationFrame(step);
                return;
            }
            destroyRafRef.current = null;
            setDestroying(null);
            spawnFx('explosion', burstAt.x, burstAt.y);
            commit();
        };
        destroyRafRef.current = requestAnimationFrame(step);
    }, [spawnFx]);

    // Eased camera moves for wheel zoom and mode transitions. Dragging stays
    // 1:1 with the pointer — easing there would feel like lag, not polish.
    const camRef = useRef(cam);
    useEffect(() => { camRef.current = cam; }, [cam]);
    const camAnimRef = useRef<number | null>(null);
    const animateCam = useCallback((target: Partial<StackCamera>, duration = 260) => {
        if (camAnimRef.current !== null) cancelAnimationFrame(camAnimRef.current);
        const from = { ...camRef.current };
        const to = { ...from, ...target };
        const t0 = performance.now();
        const step = (now: number) => {
            const k = Math.min(1, (now - t0) / duration);
            const e = 1 - Math.pow(1 - k, 3);
            const fromDepth = from.depth ?? 0;
            const toDepth = to.depth ?? 0;
            setCam({
                yaw: from.yaw + (to.yaw - from.yaw) * e,
                pitch: from.pitch + (to.pitch - from.pitch) * e,
                zoom: from.zoom + (to.zoom - from.zoom) * e,
                panX: from.panX + (to.panX - from.panX) * e,
                panY: from.panY + (to.panY - from.panY) * e,
                depth: fromDepth + (toDepth - fromDepth) * e,
            });
            camAnimRef.current = k < 1 ? requestAnimationFrame(step) : null;
        };
        camAnimRef.current = requestAnimationFrame(step);
    }, []);
    useEffect(() => () => {
        if (camAnimRef.current !== null) cancelAnimationFrame(camAnimRef.current);
    }, []);

    const canvases = project.canvases;
    const activeCanvasId = project.activeCanvasId;
    const activeCanvas = canvases.find((c) => c.id === activeCanvasId);

    // Selected-plane pull-out slides instead of jumping: pullT eases 0→1 on
    // every selection change (mouse or arrow keys), the newly selected plane
    // slides out while the previous one slides back in.
    const prevActiveRef = useRef(activeCanvasId);
    const [leavingId, setLeavingId] = useState<string | null>(null);
    const [pullT, setPullT] = useState(1);
    useEffect(() => {
        if (prevActiveRef.current === activeCanvasId) return undefined;
        setLeavingId(prevActiveRef.current);
        prevActiveRef.current = activeCanvasId;
        setPullT(0);
        let raf = 0;
        const t0 = performance.now();
        const step = (now: number) => {
            const k = Math.min(1, (now - t0) / 340);
            setPullT(1 - Math.pow(1 - k, 3));
            if (k < 1)

                raf = requestAnimationFrame(step);
            else setLeavingId(null);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [activeCanvasId]);

    // Page footprints are scaled against the album's largest page, so the
    // stack shows real relative canvas sizes rather than one fixed rectangle.
    const extentOf = useMemo(() => planeExtentFor(canvases, PLANE_SPAN), [canvases]);

    // Map a point in a page's normalized (0..1) space onto its world plane.
    const planePoint = useCallback((
        u: number, v: number, canvasIdx: number, xOff: number, w: number, h: number,
    ) => {
        const extent = extentOf(w, h);
        const yWorld = ((canvases.length - 1) / 2 - canvasIdx) * LAYER_GAP;
        return { x: (u - 0.5) * extent.width + xOff, y: yWorld, z: (v - 0.5) * extent.depth };
    }, [canvases.length, extentOf]);

    // World position of a layer's centre — used for the shared-layer bridges.
    const worldOf = useCallback((layer: SerializedLayer, canvasIdx: number, xOff: number, w: number, h: number) => {
        const c = layerCenterNormalized(layer, w, h);
        return planePoint(c.x, c.y, canvasIdx, xOff, w, h);
    }, [planePoint]);

    const planeMeta = useMemo(() => canvases.map((canvas, idx) => {
        const selected = canvas.id === activeCanvasId;
        const xOff = selected
            ? PULL_X * pullT
            : canvas.id === leavingId
                ? PULL_X * (1 - pullT)
                : 0;
        const yWorld = ((canvases.length - 1) / 2 - idx) * LAYER_GAP;
        return { canvas, idx, selected, xOff, yWorld };
    }), [canvases, activeCanvasId, leavingId, pullT]);

    // Painter's algorithm on plane centers.
    const drawOrder = useMemo(() => [...planeMeta].sort(
        (a, b) => project3d(a.xOff, a.yWorld, 0, cam).depth - project3d(b.xOff, b.yWorld, 0, cam).depth
    ).reverse(), [planeMeta, cam]);

    const bridges = useMemo(() => listSharedLayerBridges(project), [project]);

    const guarded = (fn: () => void) => {
        if (dragRef.current?.moved) return;
        fn();
    };

    /** Reset the framing when crossing between levels — each arrives centred. */
    const enterMode = useCallback((next: StackMode) => {
        setMode(next);
        if (next !== 'federation') setInspectedLinks(null);
        animateCam({ zoom: 1, panX: 0, panY: 0, depth: 0 }, 420);
    }, [animateCam]);

    // Wheel zooms; passing a threshold rises to the level above (pages →
    // albums → bookshelves) or dives back down. Alt+wheel dollies through the
    // scene in depth instead of zooming.
    const onWheel = (e: React.WheelEvent) => {
        if (e.altKey) {
            animateCam({ depth: clampDepth((camRef.current.depth ?? 0) + (e.deltaY > 0 ? 90 : -90)) }, 160);
            return;
        }
        const nz = clampZoom(camRef.current.zoom * (e.deltaY < 0 ? 1.08 : 0.92));
        const zoomingOut = nz <= ZOOM_OUT_THRESHOLD;
        const zoomingIn = nz >= ZOOM_IN_THRESHOLD;
        if (zoomingOut && mode === 'stack') {
            enterMode('federation');
        } else if (zoomingOut && mode === 'federation') {
            enterMode('bookshelf');
        } else if (zoomingIn && mode === 'bookshelf') {
            enterMode('federation');
        } else if (zoomingIn && mode === 'federation') {
            enterMode('stack');
        } else {
            animateCam({ zoom: nz }, 160);
        }
    };

    // Keyboard, uniform across the three levels: arrows cycle the selection,
    // Enter dives into it, Esc steps back down toward the pages and closes
    // from there — the existing two-level Esc rule, extended. Rising a level
    // stays on the wheel and the toolbar. Album cycling stays inside the
    // current shelf.
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const level = mode === 'stack'
                ? { items: canvases, activeId: activeCanvasId, select: onSelectCanvas }
                : mode === 'federation'
                    ? { items: shelfAlbums, activeId: projectsState.activeProjectId, select: onSelectProject }
                    : {
                        items: projectsState.bookshelves,
                        activeId: projectsState.activeBookshelfId,
                        select: onSelectBookshelf,
                    };
            const { items, activeId, select } = level;
            const idx = items.findIndex((item) => item.id === activeId);
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const next = items[Math.max(0, idx - 1)];
                if (next) select(next.id);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                const next = items[Math.min(items.length - 1, idx + 1)];
                if (next) select(next.id);
            } else if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
                e.preventDefault();
                if (mode === 'stack') {
                    onOpenCanvas(activeCanvasId);
                } else if (mode === 'federation') {
                    onOpenProject(projectsState.activeProjectId);
                    enterMode('stack');
                } else {
                    onOpenBookshelf(projectsState.activeBookshelfId);
                    enterMode('federation');
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (mode === 'bookshelf') enterMode('federation');
                else if (mode === 'federation') enterMode('stack');
                else onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        activeCanvasId, canvases, enterMode, mode, onClose, onOpenBookshelf, onOpenCanvas, onOpenProject,
        onSelectBookshelf, onSelectCanvas, onSelectProject, projectsState, shelfAlbums,
    ]);

    const layerCount = activeCanvas?.json?.objects?.length ?? 0;

    // The pixie-dust flourish plays centre-stage: the new page slides out
    // and the stack re-spaces at the same moment, so any plane-anchored point
    // is stale by the time the wisp flies. Centre is always on screen.
    const handleAddCanvasFx = useCallback(() => {
        onAddCanvas();
        spawnFx('sparkle', VIEW_W / 2, VIEW_H / 2 - 40);
    }, [onAddCanvas, spawnFx]);

    const handleDuplicateCanvasFx = useCallback((canvasId: string) => {
        onDuplicateCanvas(canvasId);
        spawnFx('sparkle', VIEW_W / 2, VIEW_H / 2 - 40);
    }, [onDuplicateCanvas, spawnFx]);

    const handleDeleteCanvasFx = useCallback(async (canvasId: string) => {
        const entry = canvases.find((c) => c.id === canvasId);
        if (!entry) return;
        // A page with artwork gets a warning; an empty one just goes.
        if ((entry.json?.objects?.length ?? 0) > 0) {
            const confirmed = await dialog.confirm(
                t('stack.deletePageQuestion', { name: entry.name }),
                { title: t('stack.deleteCanvas'), variant: 'destructive' },
            );
            if (!confirmed) return;
        }
        const meta = planeMeta.find((m) => m.canvas.id === canvasId);
        const point = meta ? project3d(meta.xOff, meta.yWorld, 0, cam) : { x: VIEW_W / 2, y: VIEW_H / 2 };
        spawnFx('explosion', point.x, point.y);
        onDeleteCanvas(canvasId);
    }, [cam, canvases, dialog, onDeleteCanvas, planeMeta, spawnFx, t]);

    const handleAddProjectFx = useCallback(() => {
        onAddProject();
        spawnFx('sparkle', VIEW_W / 2, VIEW_H / 2 - 60);
    }, [onAddProject, spawnFx]);

    const handleDuplicateProjectFx = useCallback((projectId: string) => {
        onDuplicateProject(projectId);
        spawnFx('sparkle', VIEW_W / 2, VIEW_H / 2 - 60);
    }, [onDuplicateProject, spawnFx]);

    /**
     * Where a lattice box sits on screen right now, so the burst goes off at
     * the box the user actually clicked rather than at the centre of the view.
     */
    const boxScreenPoint = useCallback((index: number, total: number) => {
        if (index < 0) return { x: VIEW_W / 2, y: VIEW_H / 2 - 40 };
        const pose = gridPose(index, total);
        return project3d(pose.cx, pose.cy, pose.cz, cam);
    }, [cam]);

    const handleDeleteProjectFx = useCallback(async (projectId: string) => {
        const target = projectsState.projects.find((entry) => entry.id === projectId);
        if (!target) return;
        const hasContent = target.canvases.some((c) => (c.json?.objects?.length ?? 0) > 0);
        if (hasContent) {
            const confirmed = await dialog.confirm(
                t('stack.deleteAlbumQuestion', { name: target.name }),
                { title: t('stack.deleteProject'), variant: 'destructive' },
            );
            if (!confirmed) return;
        }
        setInspectedLinks(null);
        const at = boxScreenPoint(shelfAlbums.findIndex((a) => a.id === projectId), shelfAlbums.length);
        playDestroy(projectId, at, () => onDeleteProject(projectId));
    }, [boxScreenPoint, dialog, onDeleteProject, playDestroy, projectsState.projects, shelfAlbums, t]);

    const handleAddBookshelfFx = useCallback(() => {
        onAddBookshelf();
        spawnFx('sparkle', VIEW_W / 2, VIEW_H / 2 - 60);
    }, [onAddBookshelf, spawnFx]);

    const handleDuplicateBookshelfFx = useCallback((bookshelfId: string) => {
        onDuplicateBookshelf(bookshelfId);
        spawnFx('sparkle', VIEW_W / 2, VIEW_H / 2 - 60);
    }, [onDuplicateBookshelf, spawnFx]);

    const handleDeleteBookshelfFx = useCallback(async (bookshelfId: string) => {
        const shelf = projectsState.bookshelves.find((entry) => entry.id === bookshelfId);
        if (!shelf) return;
        // A shelf takes every album on it, so this is confirmed whenever any of
        // those albums holds artwork — a far bigger loss than deleting one album.
        const albums = projectsInBookshelf(projectsState, bookshelfId);
        const hasContent = albums.some((album) => album.canvases.some((c) => (c.json?.objects?.length ?? 0) > 0));
        if (hasContent) {
            const confirmed = await dialog.confirm(
                t('stack.deleteBookshelfQuestion', { name: shelf.name, albums: albums.length }),
                { title: t('stack.deleteBookshelf'), variant: 'destructive' },
            );
            if (!confirmed) return;
        }
        setInspectedLinks(null);
        const shelves = projectsState.bookshelves;
        const at = boxScreenPoint(shelves.findIndex((s) => s.id === bookshelfId), shelves.length);
        playDestroy(bookshelfId, at, () => onDeleteBookshelf(bookshelfId));
    }, [boxScreenPoint, dialog, onDeleteBookshelf, playDestroy, projectsState, t]);

    const projectNameOf = useCallback((projectId: string) => (
        projectsState.projects.find((entry) => entry.id === projectId)?.name ?? projectId
    ), [projectsState.projects]);

    // select-none on the root: every box and plane carries an SVG <text>
    // label, and without it a drag to orbit starts a text selection instead —
    // the labels highlight and the camera fights the selection. The rename
    // inputs opt back in with select-text.
    return (
        <div className="absolute inset-0 z-40 bg-background/95 backdrop-blur-sm flex flex-col select-none" data-testid="canvas-stack-view">
            {/* Control strip */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-card/80 backdrop-blur-md border border-border/60 rounded-lg px-3 py-1.5 shadow-lg">
                {mode === 'stack' && (
                    <>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wide" title={t('stack.projectLabel')}>{project.name}</span>
                        <span className="text-muted-foreground/40">/</span>
                        <input
                            value={activeCanvas?.name ?? ''}
                            onChange={(e) => onRenameCanvas(activeCanvasId, e.target.value)}
                            className="select-text bg-transparent text-xs font-semibold text-foreground outline-none w-32 border-b border-transparent focus:border-primary/50"
                            title={t('stack.renameCanvas')}
                        />
                        <span className="text-[10px] text-muted-foreground">
                            {t('stack.summary', { layers: layerCount, links: bridges.length })}
                        </span>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => handleDuplicateCanvasFx(activeCanvasId)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.duplicateCanvas')}>
                            <Copy size={13} />
                        </button>
                        <button onClick={() => void handleDeleteCanvasFx(activeCanvasId)} disabled={canvases.length <= 1} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-secondary disabled:opacity-30 transition" title={t('stack.deleteCanvas')}>
                            <Trash2 size={13} />
                        </button>
                        <button onClick={handleAddCanvasFx} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.newCanvas')} data-testid="stack-add-canvas">
                            <Plus size={13} />
                        </button>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => enterMode('federation')} className="flex items-center gap-1 p-1 px-1.5 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition text-[10px] font-bold" title={t('stack.toFederation')} data-testid="stack-to-federation">
                            <Boxes size={13} /> {t('stack.federation')}
                        </button>
                        <button onClick={() => onOpenCanvas(activeCanvasId)} className="flex items-center gap-1 p-1 px-1.5 rounded text-primary hover:bg-secondary transition text-[10px] font-bold" title={t('stack.openCanvas')}>
                            <Layers size={13} /> {t('stack.open')}
                        </button>
                    </>
                )}

                {mode === 'federation' && (
                    <>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wide" title={t('stack.bookshelfLabel')}>{activeBookshelf.name}</span>
                        <span className="text-muted-foreground/40">/</span>
                        <input
                            value={project.name}
                            onChange={(e) => onRenameProject(project.id, e.target.value)}
                            className="select-text bg-transparent text-xs font-semibold text-foreground outline-none w-32 border-b border-transparent focus:border-primary/50"
                            title={t('stack.renameProject')}
                        />
                        <span className="text-[10px] text-muted-foreground">
                            {t('stack.projectCount', { count: shelfAlbums.length })}
                        </span>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => handleDuplicateProjectFx(project.id)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.duplicateProject')}>
                            <Copy size={13} />
                        </button>
                        <button onClick={() => void handleDeleteProjectFx(project.id)} disabled={shelfAlbums.length <= 1} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-secondary disabled:opacity-30 transition" title={t('stack.deleteProject')}>
                            <Trash2 size={13} />
                        </button>
                        <button onClick={handleAddProjectFx} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.newProject')} data-testid="federation-add-project">
                            <Plus size={13} />
                        </button>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => enterMode('bookshelf')} className="flex items-center gap-1 p-1 px-1.5 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition text-[10px] font-bold" title={t('stack.toBookshelves')} data-testid="federation-to-bookshelf">
                            <Library size={13} /> {t('stack.bookshelves')}
                        </button>
                        <button onClick={() => enterMode('stack')} className="flex items-center gap-1 p-1 px-1.5 rounded text-primary hover:bg-secondary transition text-[10px] font-bold" title={t('stack.toStack')} data-testid="federation-to-stack">
                            <Layers size={13} /> {t('stack.stack')}
                        </button>
                    </>
                )}

                {mode === 'bookshelf' && (
                    <>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wide">{t('stack.bookshelves')}</span>
                        <span className="text-muted-foreground/40">/</span>
                        <input
                            value={activeBookshelf.name}
                            onChange={(e) => onRenameBookshelf(activeBookshelf.id, e.target.value)}
                            className="select-text bg-transparent text-xs font-semibold text-foreground outline-none w-32 border-b border-transparent focus:border-primary/50"
                            title={t('stack.renameBookshelf')}
                            data-testid="bookshelf-rename"
                        />
                        <span className="text-[10px] text-muted-foreground">
                            {t('stack.bookshelfCount', { count: projectsState.bookshelves.length })}
                        </span>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => handleDuplicateBookshelfFx(activeBookshelf.id)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.duplicateBookshelf')} data-testid="bookshelf-duplicate">
                            <Copy size={13} />
                        </button>
                        <button onClick={() => void handleDeleteBookshelfFx(activeBookshelf.id)} disabled={projectsState.bookshelves.length <= 1} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-secondary disabled:opacity-30 transition" title={t('stack.deleteBookshelf')} data-testid="bookshelf-delete">
                            <Trash2 size={13} />
                        </button>
                        <button onClick={handleAddBookshelfFx} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.newBookshelf')} data-testid="bookshelf-add">
                            <Plus size={13} />
                        </button>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => { onOpenBookshelf(activeBookshelf.id); enterMode('federation'); }} className="flex items-center gap-1 p-1 px-1.5 rounded text-primary hover:bg-secondary transition text-[10px] font-bold" title={t('stack.toFederation')} data-testid="bookshelf-to-federation">
                            <Boxes size={13} /> {t('stack.federation')}
                        </button>
                    </>
                )}
                <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('common.close')} data-testid="stack-close">
                    <X size={13} />
                </button>
            </div>

            <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                // Space held reads as "about to pan", so the cursor commits to
                // the grab state rather than only showing it mid-drag.
                className={spaceDown ? 'w-full h-full cursor-grabbing' : 'w-full h-full cursor-grab active:cursor-grabbing'}
                onWheel={onWheel}
                onPointerDown={(e) => {
                    dragRef.current = {
                        x: e.clientX,
                        y: e.clientY,
                        cam,
                        // Space, Shift or middle-drag all pan; plain left-drag orbits.
                        pan: spaceRef.current || e.shiftKey || e.button === 1,
                        moved: false,
                    };
                }}
                onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d) return;
                    const dx = e.clientX - d.x, dy = e.clientY - d.y;
                    if (Math.abs(dx) + Math.abs(dy) > 4 && !d.moved) {
                        d.moved = true;
                        // The camera is moving now; boxes sliding under the
                        // cursor should not also trigger the hover repulsion.
                        setHoveredBoxId(null);
                    }
                    if (!d.moved) return;
                    // Pressing Space mid-drag switches to pan without releasing.
                    if (d.pan || spaceRef.current) {
                        setCam({ ...d.cam, panX: d.cam.panX + dx, panY: d.cam.panY + dy });
                    } else {
                        setCam({ ...d.cam, yaw: d.cam.yaw + dx * 0.005, pitch: clampPitch(d.cam.pitch + dy * 0.004) });
                    }
                }}
                onPointerUp={() => { setTimeout(() => (dragRef.current = null), 0); }}
                onPointerLeave={() => { dragRef.current = null; }}
            >
                <defs>
                    <radialGradient id="csv-ambient" cx="50%" cy="45%" r="55%">
                        <stop offset="0%" stopColor="#3f5f66" stopOpacity="0.08" />
                        <stop offset="60%" stopColor="#4a3f5f" stopOpacity="0.04" />
                        <stop offset="100%" stopColor="#000" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="csv-bridge" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#7FAAB0" />
                        <stop offset="100%" stopColor="#AC9BC4" />
                    </linearGradient>
                    <filter id="csv-glow" x="-60%" y="-60%" width="220%" height="220%">
                        <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#7FAAB0" floodOpacity="0.45" />
                    </filter>
                    <style>{`
                        .csv-flow { stroke-dasharray: 5 9; animation: csvFlow 1.4s linear infinite; }
                        @keyframes csvFlow { to { stroke-dashoffset: -14; } }
                    `}</style>
                </defs>

                <ellipse cx={VIEW_W / 2} cy={VIEW_H / 2} rx={640} ry={380} fill="url(#csv-ambient)" />

                {mode === 'bookshelf' ? (
                    <BookshelfScene
                        cam={cam}
                        projectsState={projectsState}
                        onSelectBookshelf={(id) => guarded(() => onSelectBookshelf(id))}
                        onEnterBookshelf={(id) => {
                            onOpenBookshelf(id);
                            enterMode('federation');
                        }}
                        hoveredId={hoveredBoxId}
                        onHoverBox={setHoveredBoxId}
                        destroying={destroying}
                        // Composed from two single-count keys rather than one
                        // two-count string: plural resolution keys off `count`,
                        // so a combined string would render "1 albums · 1 pages".
                        formatCaption={(albumCount, pageCount) => (
                            `${t('stack.projectCount', { count: albumCount })} · ${t('dashboard.canvasCount', { count: pageCount })}`
                        )}
                    />
                ) : mode === 'federation' ? (
                    <FederationScene
                        cam={cam}
                        projectsState={projectsState}
                        onSelectProject={(id) => guarded(() => onSelectProject(id))}
                        onEnterProject={(id) => {
                            onSelectProject(id);
                            enterMode('stack');
                        }}
                        onSelectLink={setInspectedLinks}
                        selectedPairKey={inspectedLinks && inspectedLinks.length > 0
                            ? pairKeyOf(inspectedLinks[0].a, inspectedLinks[0].b)
                            : null}
                        hoveredId={hoveredBoxId}
                        onHoverBox={setHoveredBoxId}
                        destroying={destroying}
                        formatCaption={(pageCount, linkedCount) => t('stack.cubeCaption', { pages: pageCount, linked: linkedCount })}
                    />
                ) : (
                <g>
                    {drawOrder.map(({ canvas, idx, selected, xOff, yWorld }) => {
                        const extent = extentOf(canvas.width, canvas.height);
                        const c00 = project3d(-extent.width / 2 + xOff, yWorld, -extent.depth / 2, cam);
                        const c10 = project3d(extent.width / 2 + xOff, yWorld, -extent.depth / 2, cam);
                        const c11 = project3d(extent.width / 2 + xOff, yWorld, extent.depth / 2, cam);
                        const c01 = project3d(-extent.width / 2 + xOff, yWorld, extent.depth / 2, cam);
                        const xray = selected ? 1 : 0.38;
                        const objects = canvas.json?.objects ?? [];
                        // The camera does a true perspective projection (see
                        // stack3dMath.project), so the plane's 4 corners form a
                        // trapezoid, not a parallelogram. An SVG matrix() transform
                        // is affine and can only map the unit square onto a
                        // parallelogram — mapping all 4 corners with one matrix
                        // would place 3 corners correctly and leave the 4th
                        // wherever the parallelogram math puts it, not where the
                        // border path (which uses the real projected c11) draws
                        // it. That mismatch is what read as a "floating
                        // border"/warped thumbnail. Splitting into two triangles,
                        // each with its own exact 3-point affine map, keeps every
                        // corner pinned to its true projected position.
                        const triangleATransform = `matrix(${c10.x - c00.x} ${c10.y - c00.y} ${c01.x - c00.x} ${c01.y - c00.y} ${c00.x} ${c00.y})`;
                        const triangleBTransform = `matrix(${c11.x - c01.x} ${c11.y - c01.y} ${c11.x - c10.x} ${c11.y - c10.y} ${c01.x + c10.x - c11.x} ${c01.y + c10.y - c11.y})`;
                        const clipAId = `csv-clip-a-${canvas.id}`;
                        const clipBId = `csv-clip-b-${canvas.id}`;
                        // In-canvas layer chain: connect layers in stacking order.
                        const chainPoints = objects.map((layer) => {
                            const w = worldOf(layer, idx, xOff, canvas.width, canvas.height);
                            return project3d(w.x, w.y, w.z, cam);
                        });
                        // Project a layer's own box onto the page plane, so the
                        // view can draw the artwork where it actually sits.
                        const layerScreenQuad = (layer: SerializedLayer) => layerCorners(layer)
                            .map((corner) => {
                                const n = normalizeToCanvas(corner, canvas.width, canvas.height);
                                const w = planePoint(n.x, n.y, idx, xOff, canvas.width, canvas.height);
                                return project3d(w.x, w.y, w.z, cam);
                            });

                        return (
                            <g
                                key={canvas.id}
                                opacity={xray}
                                style={{ transition: 'opacity 0.4s' }}
                                onClick={() => guarded(() => onSelectCanvas(canvas.id))}
                                onDoubleClick={() => onOpenCanvas(canvas.id)}
                                className="cursor-pointer"
                                data-testid={`stack-plane-${canvas.id}`}
                            >
                                {canvas.thumbnail && (
                                    <>
                                        <clipPath id={clipAId}>
                                            <path d={`M ${c00.x} ${c00.y} L ${c10.x} ${c10.y} L ${c01.x} ${c01.y} Z`} />
                                        </clipPath>
                                        <clipPath id={clipBId}>
                                            <path d={`M ${c10.x} ${c10.y} L ${c11.x} ${c11.y} L ${c01.x} ${c01.y} Z`} />
                                        </clipPath>
                                        {/*
                                          * The clip lives on an UNTRANSFORMED
                                          * group: clip-path evaluates in the
                                          * referencing element's own space, so
                                          * putting it on the warped <image>
                                          * would drag the clip triangle through
                                          * the warp matrix and clip everything
                                          * away — planes rendered blank.
                                          */}
                                        <g clipPath={`url(#${clipAId})`}>
                                            <image
                                                href={canvas.thumbnail}
                                                width={1}
                                                height={1}
                                                preserveAspectRatio="none"
                                                transform={triangleATransform}
                                                opacity={selected ? 0.95 : 0.55}
                                                style={{ imageRendering: 'auto' }}
                                            />
                                        </g>
                                        <g clipPath={`url(#${clipBId})`}>
                                            <image
                                                href={canvas.thumbnail}
                                                width={1}
                                                height={1}
                                                preserveAspectRatio="none"
                                                transform={triangleBTransform}
                                                opacity={selected ? 0.95 : 0.55}
                                                style={{ imageRendering: 'auto' }}
                                            />
                                        </g>
                                    </>
                                )}
                                <path
                                    d={`M ${c00.x} ${c00.y} L ${c10.x} ${c10.y} L ${c11.x} ${c11.y} L ${c01.x} ${c01.y} Z`}
                                    fill={canvas.thumbnail ? 'none' : (selected ? 'rgba(127,170,176,0.06)' : 'rgba(127,127,140,0.04)')}
                                    stroke={selected ? 'rgba(127,170,176,0.55)' : 'rgba(120,130,150,0.28)'}
                                    strokeWidth={selected ? 1.4 : 0.8}
                                    filter={selected ? 'url(#csv-glow)' : undefined}
                                />
                                {chainPoints.length > 1 && (
                                    <path
                                        d={chainPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                                        fill="none"
                                        stroke="#9AC0C4"
                                        strokeWidth={selected ? 1.2 : 0.7}
                                        opacity={selected ? 0.6 : 0.35}
                                        strokeDasharray="3 5"
                                        pointerEvents="none"
                                    />
                                )}
                                <text x={c00.x} y={c00.y - 10} fontSize={selected ? 15 : 12} fontWeight={600} fill={selected ? 'currentColor' : '#71717a'} className="text-foreground fill-current">
                                    {canvas.name}
                                </text>

                                {/*
                                  * Every layer gets an outline showing its real
                                  * box on the page.
                                  *
                                  * Its CONTENT is only painted when the page has
                                  * no thumbnail. The thumbnail is already a
                                  * composite of every layer, so painting the
                                  * layers over it draws the same artwork twice —
                                  * and because the layer quad and the page plane
                                  * are projected by different routes, the two
                                  * copies never line up exactly and every asset
                                  * ghosts against itself. Outlines alone keep
                                  * the layers legible over a thumbnail; without
                                  * one they are the only way to see anything.
                                  */}
                                {objects.map((layer, li) => {
                                    const q = layerScreenQuad(layer);
                                    if (q.length !== 4) return null;
                                    const [q00, q10, q11, q01] = q;
                                    const shared = Boolean(layer.sharedLayerId);
                                    const outline = `M ${q00.x} ${q00.y} L ${q10.x} ${q10.y} L ${q11.x} ${q11.y} L ${q01.x} ${q01.y} Z`;
                                    const drawable = hasDrawableSource(layer);
                                    const paintContent = !canvas.thumbnail;
                                    // Same two-triangle affine split the page
                                    // thumbnail uses: one matrix cannot map a
                                    // square onto a perspective trapezoid.
                                    const triA = `matrix(${q10.x - q00.x} ${q10.y - q00.y} ${q01.x - q00.x} ${q01.y - q00.y} ${q00.x} ${q00.y})`;
                                    const triB = `matrix(${q11.x - q01.x} ${q11.y - q01.y} ${q11.x - q10.x} ${q11.y - q10.y} ${q01.x + q10.x - q11.x} ${q01.y + q10.y - q11.y})`;
                                    const clipA = `csv-lyr-a-${canvas.id}-${li}`;
                                    const clipB = `csv-lyr-b-${canvas.id}-${li}`;
                                    return (
                                        <g key={li} opacity={selected ? 1 : 0.75}>
                                            {paintContent && (drawable ? (
                                                <>
                                                    <clipPath id={clipA}>
                                                        <path d={`M ${q00.x} ${q00.y} L ${q10.x} ${q10.y} L ${q01.x} ${q01.y} Z`} />
                                                    </clipPath>
                                                    <clipPath id={clipB}>
                                                        <path d={`M ${q10.x} ${q10.y} L ${q11.x} ${q11.y} L ${q01.x} ${q01.y} Z`} />
                                                    </clipPath>
                                                    <g clipPath={`url(#${clipA})`}>
                                                        <image
                                                            href={layer.src as string}
                                                            width={1}
                                                            height={1}
                                                            preserveAspectRatio="none"
                                                            transform={triA}
                                                            opacity={typeof layer.opacity === 'number' ? layer.opacity : 1}
                                                        />
                                                    </g>
                                                    <g clipPath={`url(#${clipB})`}>
                                                        <image
                                                            href={layer.src as string}
                                                            width={1}
                                                            height={1}
                                                            preserveAspectRatio="none"
                                                            transform={triB}
                                                            opacity={typeof layer.opacity === 'number' ? layer.opacity : 1}
                                                        />
                                                    </g>
                                                </>
                                            ) : (
                                                <path
                                                    d={outline}
                                                    fill={layerFill(layer)}
                                                    opacity={(typeof layer.opacity === 'number' ? layer.opacity : 1) * (selected ? 0.75 : 0.5)}
                                                />
                                            ))}
                                            <path
                                                d={outline}
                                                fill="none"
                                                stroke={shared ? '#7FAAB0' : layerColor(layer.type)}
                                                strokeWidth={shared ? 1.4 : 0.8}
                                                opacity={selected ? 0.85 : 0.45}
                                                filter={shared ? 'url(#csv-glow)' : undefined}
                                            />
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}

                    {/* Cross-canvas shared-layer connectors (node-style paths) */}
                    {bridges.map((bridge, gi) =>
                        bridge.members.slice(0, -1).map((a, i) => {
                            const b = bridge.members[i + 1];
                            const ma = planeMeta[a.canvasIndex];
                            const mb = planeMeta[b.canvasIndex];
                            if (!ma || !mb) return null;
                            const wa = worldOf(a.layer, a.canvasIndex, ma.xOff, ma.canvas.width, ma.canvas.height);
                            const wb = worldOf(b.layer, b.canvasIndex, mb.xOff, mb.canvas.width, mb.canvas.height);
                            const pa = project3d(wa.x, wa.y, wa.z, cam);
                            const pb = project3d(wb.x, wb.y, wb.z, cam);
                            const bow = 74;
                            const d = `M ${pa.x} ${pa.y} C ${pa.x + bow} ${pa.y - 22}, ${pb.x + bow} ${pb.y + 22}, ${pb.x} ${pb.y}`;
                            return (
                                <g key={`br_${gi}_${i}`} pointerEvents="none">
                                    <path d={d} fill="none" stroke="url(#csv-bridge)" strokeWidth={1.8} opacity={0.75} filter="url(#csv-glow)" className="csv-flow" />
                                    <circle r={3} fill="#7FAAB0" filter="url(#csv-glow)">
                                        <animateMotion dur="2.6s" repeatCount="indefinite" path={d} />
                                    </circle>
                                    <circle cx={pa.x} cy={pa.y} r={3.2} fill="#7FAAB0" opacity={0.8} />
                                    <circle cx={pb.x} cy={pb.y} r={3.2} fill="#AC9BC4" opacity={0.8} />
                                </g>
                            );
                        })
                    )}
                </g>
                )}
                <StackEffects effects={effects} />
            </svg>

            {/* Shared-asset inspector: opened by clicking a connection curve. */}
            {mode === 'federation' && inspectedLinks && inspectedLinks.length > 0 && (
                <div
                    className="absolute right-4 top-16 z-10 w-64 rounded-xl border border-border/60 bg-card/90 backdrop-blur-md shadow-xl p-3"
                    data-testid="federation-link-inspector"
                >
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-primary flex items-center gap-1.5">
                                <Link2 size={12} /> {t('stack.sharedAssetsTitle')}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                                {projectNameOf(inspectedLinks[0].a)} ↔ {projectNameOf(inspectedLinks[0].b)}
                            </div>
                        </div>
                        <button
                            onClick={() => setInspectedLinks(null)}
                            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                            title={t('common.close')}
                        >
                            <X size={12} />
                        </button>
                    </div>
                    <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
                        {inspectedLinks.map((link) => (
                            <div key={link.sharedLayerId} className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2 py-1.5">
                                {link.layerSrc ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={link.layerSrc} alt="" className="h-8 w-8 rounded object-cover shrink-0 border border-border/40" />
                                ) : (
                                    <span
                                        className="h-8 w-8 rounded shrink-0 border border-border/40"
                                        style={{ backgroundColor: layerColor(link.layerType) }}
                                    />
                                )}
                                <div className="min-w-0">
                                    <div className="text-[11px] font-medium text-foreground truncate">
                                        {link.layerName || t('stack.unnamedLayer')}
                                    </div>
                                    {link.layerType && (
                                        <div className="text-[10px] text-muted-foreground">{link.layerType}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                {mode === 'stack' && t('stack.hints')}
                {mode === 'federation' && t('stack.hintsFederation')}
                {mode === 'bookshelf' && t('stack.hintsBookshelf')}
            </div>
        </div>
    );
}
