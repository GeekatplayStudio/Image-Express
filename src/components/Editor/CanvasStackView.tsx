'use client';
// True-3D canvas stack: every canvas in the project is a horizontal plane in
// world space that the camera orbits around. Unselected planes render in
// x-ray; shared (linked) layers are drawn as flowing bridge paths between
// planes, node-editor style. Adapted from GeekatplayStudio/LogiTensor.
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Copy, Trash2, Plus, X, Layers, Boxes } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import {
    StackCamera, DEFAULT_STACK_CAMERA, VIEW_W, VIEW_H, project as project3d, clampPitch, clampZoom,
} from '@/lib/multicanvas/stack3dMath';
import type { Project, ProjectsState, SerializedLayer } from '@/lib/multicanvas/projectStore';
import { listSharedLayerBridges } from '@/lib/multicanvas/projectStore';
import FederationScene from '@/components/Editor/FederationScene';

const PLANE_W = 860; // world-space plane width (x)
const PLANE_D = 520; // fallback plane depth (z) when a canvas has no size

// Plane depth follows the canvas's own aspect ratio, so a 16:9 artboard
// reads as a wide plane and a 9:16 one as a deep plane.
const planeDepthFor = (width: number, height: number): number => {
    if (!width || !height) return PLANE_D;
    return Math.min(900, Math.max(180, PLANE_W * (height / width)));
};
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
    onClose: () => void;
};

export default function CanvasStackView({
    project, projectsState, onSelectCanvas, onOpenCanvas, onAddCanvas,
    onDuplicateCanvas, onDeleteCanvas, onRenameCanvas,
    onSelectProject, onOpenProject, onAddProject, onDuplicateProject, onDeleteProject, onRenameProject,
    onClose,
}: CanvasStackViewProps) {
    const { t } = useI18n();
    const [mode, setMode] = useState<'stack' | 'federation'>('stack');
    const [cam, setCam] = useState<StackCamera>(DEFAULT_STACK_CAMERA);
    const dragRef = useRef<{ x: number; y: number; cam: StackCamera; pan: boolean; moved: boolean } | null>(null);

    const canvases = project.canvases;
    const activeCanvasId = project.activeCanvasId;
    const activeCanvas = canvases.find((c) => c.id === activeCanvasId);

    // World position of a layer on a given canvas plane (normalized by the
    // canvas's own artboard size so every plane uses the same frame).
    const worldOf = useCallback((layer: SerializedLayer, canvasIdx: number, xOff: number, w: number, h: number) => {
        const left = typeof layer.left === 'number' ? layer.left : 0;
        const top = typeof layer.top === 'number' ? layer.top : 0;
        const u = w > 0 ? Math.min(1, Math.max(0, left / w)) : 0.5;
        const v = h > 0 ? Math.min(1, Math.max(0, top / h)) : 0.5;
        const yWorld = ((canvases.length - 1) / 2 - canvasIdx) * LAYER_GAP;
        return { x: (u - 0.5) * PLANE_W + xOff, y: yWorld, z: (v - 0.5) * planeDepthFor(w, h) };
    }, [canvases.length]);

    const planeMeta = useMemo(() => canvases.map((canvas, idx) => {
        const selected = canvas.id === activeCanvasId;
        const xOff = selected ? PULL_X : 0;
        const yWorld = ((canvases.length - 1) / 2 - idx) * LAYER_GAP;
        return { canvas, idx, selected, xOff, yWorld };
    }), [canvases, activeCanvasId]);

    // Painter's algorithm on plane centers.
    const drawOrder = useMemo(() => [...planeMeta].sort(
        (a, b) => project3d(a.xOff, a.yWorld, 0, cam).depth - project3d(b.xOff, b.yWorld, 0, cam).depth
    ).reverse(), [planeMeta, cam]);

    const bridges = useMemo(() => listSharedLayerBridges(project), [project]);

    const guarded = (fn: () => void) => {
        if (dragRef.current?.moved) return;
        fn();
    };

    // Zooming far out transitions to the Federation level (projects as
    // cubes); zooming far in from Federation dives back into the stack.
    const onWheel = (e: React.WheelEvent) => {
        const nz = clampZoom(cam.zoom * (e.deltaY < 0 ? 1.08 : 0.92));
        if (mode === 'stack' && nz <= 0.42) {
            setMode('federation');
            setCam((c) => ({ ...c, zoom: 1, panX: 0, panY: 0 }));
        } else if (mode === 'federation' && nz >= 2.1) {
            setMode('stack');
            setCam((c) => ({ ...c, zoom: 1, panX: 0, panY: 0 }));
        } else {
            setCam((c) => ({ ...c, zoom: nz }));
        }
    };

    // Keyboard: arrows step between planes (stack) or cubes (federation),
    // Enter opens/dives, Esc closes (or returns from federation to stack).
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const items = mode === 'stack' ? canvases : projectsState.projects;
            const activeId = mode === 'stack' ? activeCanvasId : projectsState.activeProjectId;
            const select = mode === 'stack' ? onSelectCanvas : onSelectProject;
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
                } else {
                    onOpenProject(projectsState.activeProjectId);
                    setMode('stack');
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (mode === 'federation') {
                    setMode('stack');
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeCanvasId, canvases, mode, onClose, onOpenCanvas, onOpenProject, onSelectCanvas, onSelectProject, projectsState]);

    const layerCount = activeCanvas?.json?.objects?.length ?? 0;

    return (
        <div className="absolute inset-0 z-40 bg-background/95 backdrop-blur-sm flex flex-col" data-testid="canvas-stack-view">
            {/* Control strip */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-card/80 backdrop-blur-md border border-border/60 rounded-lg px-3 py-1.5 shadow-lg">
                {mode === 'stack' ? (
                    <>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wide" title={t('stack.projectLabel')}>{project.name}</span>
                        <span className="text-muted-foreground/40">/</span>
                        <input
                            value={activeCanvas?.name ?? ''}
                            onChange={(e) => onRenameCanvas(activeCanvasId, e.target.value)}
                            className="bg-transparent text-xs font-semibold text-foreground outline-none w-32 border-b border-transparent focus:border-primary/50"
                            title={t('stack.renameCanvas')}
                        />
                        <span className="text-[10px] text-muted-foreground">
                            {t('stack.summary', { layers: layerCount, links: bridges.length })}
                        </span>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => onDuplicateCanvas(activeCanvasId)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.duplicateCanvas')}>
                            <Copy size={13} />
                        </button>
                        <button onClick={() => onDeleteCanvas(activeCanvasId)} disabled={canvases.length <= 1} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-secondary disabled:opacity-30 transition" title={t('stack.deleteCanvas')}>
                            <Trash2 size={13} />
                        </button>
                        <button onClick={onAddCanvas} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.newCanvas')} data-testid="stack-add-canvas">
                            <Plus size={13} />
                        </button>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => setMode('federation')} className="flex items-center gap-1 p-1 px-1.5 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition text-[10px] font-bold" title={t('stack.toFederation')} data-testid="stack-to-federation">
                            <Boxes size={13} /> {t('stack.federation')}
                        </button>
                        <button onClick={() => onOpenCanvas(activeCanvasId)} className="flex items-center gap-1 p-1 px-1.5 rounded text-primary hover:bg-secondary transition text-[10px] font-bold" title={t('stack.openCanvas')}>
                            <Layers size={13} /> {t('stack.open')}
                        </button>
                    </>
                ) : (
                    <>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wide">{t('stack.federation')}</span>
                        <span className="text-muted-foreground/40">/</span>
                        <input
                            value={project.name}
                            onChange={(e) => onRenameProject(project.id, e.target.value)}
                            className="bg-transparent text-xs font-semibold text-foreground outline-none w-32 border-b border-transparent focus:border-primary/50"
                            title={t('stack.renameProject')}
                        />
                        <span className="text-[10px] text-muted-foreground">
                            {t('stack.projectCount', { count: projectsState.projects.length })}
                        </span>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => onDuplicateProject(project.id)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.duplicateProject')}>
                            <Copy size={13} />
                        </button>
                        <button onClick={() => onDeleteProject(project.id)} disabled={projectsState.projects.length <= 1} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-secondary disabled:opacity-30 transition" title={t('stack.deleteProject')}>
                            <Trash2 size={13} />
                        </button>
                        <button onClick={onAddProject} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('stack.newProject')} data-testid="federation-add-project">
                            <Plus size={13} />
                        </button>
                        <div className="w-px h-4 bg-border" />
                        <button onClick={() => setMode('stack')} className="flex items-center gap-1 p-1 px-1.5 rounded text-primary hover:bg-secondary transition text-[10px] font-bold" title={t('stack.toStack')} data-testid="federation-to-stack">
                            <Layers size={13} /> {t('stack.stack')}
                        </button>
                    </>
                )}
                <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition" title={t('common.close')} data-testid="stack-close">
                    <X size={13} />
                </button>
            </div>

            <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="w-full h-full cursor-grab active:cursor-grabbing"
                onWheel={onWheel}
                onPointerDown={(e) => {
                    dragRef.current = { x: e.clientX, y: e.clientY, cam, pan: e.shiftKey, moved: false };
                }}
                onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d) return;
                    const dx = e.clientX - d.x, dy = e.clientY - d.y;
                    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
                    if (!d.moved) return;
                    if (d.pan) {
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

                {mode === 'federation' ? (
                    <FederationScene
                        cam={cam}
                        projectsState={projectsState}
                        onSelectProject={(id) => guarded(() => onSelectProject(id))}
                        onEnterProject={(id) => {
                            onSelectProject(id);
                            setMode('stack');
                            setCam((c) => ({ ...c, zoom: 1 }));
                        }}
                        formatCaption={(pageCount, linkedCount) => t('stack.cubeCaption', { pages: pageCount, linked: linkedCount })}
                    />
                ) : (
                <g>
                    {drawOrder.map(({ canvas, idx, selected, xOff, yWorld }) => {
                        const planeD = planeDepthFor(canvas.width, canvas.height);
                        const c00 = project3d(-PLANE_W / 2 + xOff, yWorld, -planeD / 2, cam);
                        const c10 = project3d(PLANE_W / 2 + xOff, yWorld, -planeD / 2, cam);
                        const c11 = project3d(PLANE_W / 2 + xOff, yWorld, planeD / 2, cam);
                        const c01 = project3d(-PLANE_W / 2 + xOff, yWorld, planeD / 2, cam);
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
                                        <image
                                            href={canvas.thumbnail}
                                            width={1}
                                            height={1}
                                            preserveAspectRatio="none"
                                            transform={triangleATransform}
                                            clipPath={`url(#${clipAId})`}
                                            opacity={selected ? 0.95 : 0.55}
                                            style={{ imageRendering: 'auto' }}
                                        />
                                        <image
                                            href={canvas.thumbnail}
                                            width={1}
                                            height={1}
                                            preserveAspectRatio="none"
                                            transform={triangleBTransform}
                                            clipPath={`url(#${clipBId})`}
                                            opacity={selected ? 0.95 : 0.55}
                                            style={{ imageRendering: 'auto' }}
                                        />
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

                                {objects.map((layer, li) => {
                                    const w = worldOf(layer, idx, xOff, canvas.width, canvas.height);
                                    const p = project3d(w.x, w.y, w.z, cam);
                                    const color = layerColor(layer.type);
                                    const shared = Boolean(layer.sharedLayerId);
                                    if (!selected) {
                                        return (
                                            <g key={li}>
                                                {shared && <circle cx={p.x} cy={p.y} r={8} fill="none" stroke="#7FAAB0" strokeWidth={1} opacity={0.7} />}
                                                <circle cx={p.x} cy={p.y} r={4.5} fill={color} opacity={0.9} />
                                            </g>
                                        );
                                    }
                                    const bw = 78, bh = 20;
                                    const label = String(layer.name || layer.type || '').slice(0, 13);
                                    return (
                                        <g key={li}>
                                            {shared && (
                                                <rect x={p.x - bw / 2 - 4} y={p.y - bh / 2 - 4} width={bw + 8} height={bh + 8} rx={7} fill="none" stroke="#7FAAB0" strokeWidth={1.2} opacity={0.75} filter="url(#csv-glow)" />
                                            )}
                                            <rect x={p.x - bw / 2} y={p.y - bh / 2} width={bw} height={bh} rx={5} fill="#0c0c10" stroke={color} strokeWidth={1.3} />
                                            <circle cx={p.x - bw / 2 + 8} cy={p.y} r={2.6} fill={color} />
                                            <text x={p.x - bw / 2 + 15} y={p.y + 3.3} fontSize={9} fill="#d4d4d8" fontWeight={600}>
                                                {label}
                                            </text>
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
            </svg>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                {mode === 'stack' ? t('stack.hints') : t('stack.hintsFederation')}
            </div>
        </div>
    );
}
