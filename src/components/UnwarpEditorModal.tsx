'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/providers/I18nProvider';
import {
    applyHomography,
    dragEdgePreservingPerspective,
    isQuadValid,
    unitSquareToQuad,
    type Vec2,
} from '@/lib/threeDLayer/homography';
import { defaultCorners } from '@/lib/threeDLayer/warpRender';

export type UnwarpEditorResult = {
    corners: Vec2[];
    aspectMode: 'auto' | 'metric';
    focal35: number;
    gridDivisions: number;
};

interface UnwarpEditorModalProps {
    imageSrc: string;
    initialCorners?: Vec2[];
    initialAspectMode?: 'auto' | 'metric';
    initialFocal35?: number;
    initialGridDivisions?: number;
    onCancel: () => void;
    onApply: (result: UnwarpEditorResult) => void;
}

type DragState =
    | { kind: 'corner'; index: number }
    | { kind: 'edge'; index: number }
    | { kind: 'pan'; startX: number; startY: number; origOffset: { x: number; y: number } }
    | null;

const HANDLE_RADIUS = 8;

export default function UnwarpEditorModal({
    imageSrc,
    initialCorners,
    initialAspectMode = 'auto',
    initialFocal35 = 35,
    initialGridDivisions = 4,
    onCancel,
    onApply,
}: UnwarpEditorModalProps) {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [corners, setCorners] = useState<Vec2[]>(initialCorners?.length === 4 ? initialCorners : defaultCorners());
    const [aspectMode, setAspectMode] = useState<'auto' | 'metric'>(initialAspectMode);
    const [focal35, setFocal35] = useState(initialFocal35);
    const [gridDivisions, setGridDivisions] = useState(initialGridDivisions);
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
    const [drag, setDrag] = useState<DragState>(null);
    const [pointer, setPointer] = useState<Vec2 | null>(null);

    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setImage(img);
        img.src = imageSrc;
    }, [imageSrc]);

    // Fit the image into the viewport on load / resize.
    const fitView = useCallback(() => {
        const el = containerRef.current;
        if (!el || !image) return;
        const pad = 48;
        const scale = Math.min(
            (el.clientWidth - pad * 2) / image.naturalWidth,
            (el.clientHeight - pad * 2) / image.naturalHeight,
        );
        setView({
            scale,
            x: (el.clientWidth - image.naturalWidth * scale) / 2,
            y: (el.clientHeight - image.naturalHeight * scale) / 2,
        });
    }, [image]);

    useEffect(() => { fitView(); }, [fitView]);
    useEffect(() => {
        const onResize = () => fitView();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [fitView]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);

    // Normalized image coords <-> screen coords.
    const toScreen = useCallback((p: Vec2): Vec2 => {
        if (!image) return p;
        return [p[0] * image.naturalWidth * view.scale + view.x, p[1] * image.naturalHeight * view.scale + view.y];
    }, [image, view]);
    const toImage = useCallback((sx: number, sy: number): Vec2 => {
        if (!image) return [sx, sy];
        return [(sx - view.x) / (view.scale * image.naturalWidth), (sy - view.y) / (view.scale * image.naturalHeight)];
    }, [image, view]);

    const edgeMidpoints = useMemo<Vec2[]>(() => (
        corners.map((c, i) => {
            const n = corners[(i + 1) % 4];
            return [(c[0] + n[0]) / 2, (c[1] + n[1]) / 2] as Vec2;
        })
    ), [corners]);

    // ---- drawing ----
    useEffect(() => {
        const canvas = canvasRef.current;
        const el = containerRef.current;
        if (!canvas || !el || !image) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = el.clientWidth * dpr;
        canvas.height = el.clientHeight * dpr;
        canvas.style.width = `${el.clientWidth}px`;
        canvas.style.height = `${el.clientHeight}px`;
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);

        ctx.save();
        ctx.translate(view.x, view.y);
        ctx.scale(view.scale, view.scale);
        ctx.drawImage(image, 0, 0);
        ctx.restore();

        const quadScreen = corners.map(toScreen);
        const valid = isQuadValid(corners);

        // Dim outside the quad.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, el.clientWidth, el.clientHeight);
        ctx.moveTo(quadScreen[0][0], quadScreen[0][1]);
        for (let i = 3; i >= 1; i--) ctx.lineTo(quadScreen[i][0], quadScreen[i][1]);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill('evenodd');
        ctx.restore();

        // Projective grid inside the quad.
        const h = unitSquareToQuad(corners);
        if (h && gridDivisions > 0) {
            ctx.strokeStyle = valid ? 'rgba(120,190,255,0.55)' : 'rgba(255,120,120,0.6)';
            ctx.lineWidth = 1;
            const steps = gridDivisions + 1;
            for (let i = 0; i <= steps; i++) {
                const v = i / steps;
                for (const horizontal of [true, false]) {
                    ctx.beginPath();
                    for (let s = 0; s <= 24; s++) {
                        const u = s / 24;
                        const p = applyHomography(h, horizontal ? [u, v] : [v, u]);
                        const sp = toScreen(p);
                        if (s === 0) ctx.moveTo(sp[0], sp[1]);
                        else ctx.lineTo(sp[0], sp[1]);
                    }
                    ctx.stroke();
                }
            }
        }

        // Quad outline.
        ctx.strokeStyle = valid ? '#7dd3fc' : '#f87171';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(quadScreen[0][0], quadScreen[0][1]);
        for (let i = 1; i <= 4; i++) ctx.lineTo(quadScreen[i % 4][0], quadScreen[i % 4][1]);
        ctx.stroke();

        // Edge midpoint diamonds.
        edgeMidpoints.forEach((m) => {
            const [x, y] = toScreen(m);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = 'rgba(15,23,42,0.85)';
            ctx.strokeStyle = '#7dd3fc';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(-5, -5, 10, 10);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });

        // Corner rings + labels.
        const labels = ['TL', 'TR', 'BR', 'BL'];
        quadScreen.forEach(([x, y], i) => {
            ctx.beginPath();
            ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(56,189,248,0.15)';
            ctx.fill();
            ctx.fillStyle = '#e0f2fe';
            ctx.font = '10px sans-serif';
            ctx.fillText(labels[i], x + HANDLE_RADIUS + 3, y - HANDLE_RADIUS + 2);
        });

        // Magnifier loupe while dragging a handle.
        if (drag && (drag.kind === 'corner' || drag.kind === 'edge') && pointer) {
            const LOUPE = 148;
            const SRC = 30; // source window in screen px
            const [px, py] = pointer;
            let lx = px + 24;
            let ly = py - LOUPE - 24;
            if (lx + LOUPE > el.clientWidth) lx = px - LOUPE - 24;
            if (ly < 0) ly = py + 24;
            ctx.save();
            ctx.beginPath();
            ctx.arc(lx + LOUPE / 2, ly + LOUPE / 2, LOUPE / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(lx, ly, LOUPE, LOUPE);
            const imgPt = toImage(px, py);
            const srcPx = imgPt[0] * image.naturalWidth;
            const srcPy = imgPt[1] * image.naturalHeight;
            const srcWindow = SRC / view.scale;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
                image,
                srcPx - srcWindow / 2, srcPy - srcWindow / 2, srcWindow, srcWindow,
                lx, ly, LOUPE, LOUPE,
            );
            ctx.strokeStyle = 'rgba(125,211,252,0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(lx + LOUPE / 2, ly);
            ctx.lineTo(lx + LOUPE / 2, ly + LOUPE);
            ctx.moveTo(lx, ly + LOUPE / 2);
            ctx.lineTo(lx + LOUPE, ly + LOUPE / 2);
            ctx.stroke();
            ctx.restore();
            ctx.beginPath();
            ctx.arc(lx + LOUPE / 2, ly + LOUPE / 2, LOUPE / 2, 0, Math.PI * 2);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }, [image, corners, view, gridDivisions, edgeMidpoints, drag, pointer, toScreen, toImage]);

    // ---- interaction ----
    const hitTest = useCallback((sx: number, sy: number): DragState => {
        const r2 = (HANDLE_RADIUS + 4) ** 2;
        for (let i = 0; i < 4; i++) {
            const [x, y] = toScreen(corners[i]);
            if ((x - sx) ** 2 + (y - sy) ** 2 <= r2) return { kind: 'corner', index: i };
        }
        for (let i = 0; i < 4; i++) {
            const [x, y] = toScreen(edgeMidpoints[i]);
            if ((x - sx) ** 2 + (y - sy) ** 2 <= r2) return { kind: 'edge', index: i };
        }
        return null;
    }, [corners, edgeMidpoints, toScreen]);

    const onPointerDown = (e: React.PointerEvent) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const hit = hitTest(sx, sy);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        if (hit) {
            setDrag(hit);
            setPointer([sx, sy]);
        } else {
            setDrag({ kind: 'pan', startX: sx, startY: sy, origOffset: { x: view.x, y: view.y } });
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag) return;
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        setPointer([sx, sy]);
        if (drag.kind === 'pan') {
            setView((v) => ({ ...v, x: drag.origOffset.x + (sx - drag.startX), y: drag.origOffset.y + (sy - drag.startY) }));
            return;
        }
        const p = toImage(sx, sy);
        if (drag.kind === 'corner') {
            setCorners((c) => c.map((old, i) => (i === drag.index ? p : old)) as Vec2[]);
        } else {
            setCorners((c) => {
                const res = dragEdgePreservingPerspective(c, drag.index, p);
                if (!res) return c;
                const next = [...c] as Vec2[];
                next[drag.index] = res.corners[0];
                next[(drag.index + 1) % 4] = res.corners[1];
                return next;
            });
        }
    };

    const onPointerUp = () => { setDrag(null); setPointer(null); };

    const onWheel = (e: React.WheelEvent) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        setView((v) => {
            const scale = Math.min(16, Math.max(0.05, v.scale * factor));
            const k = scale / v.scale;
            return { scale, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
        });
    };

    const valid = isQuadValid(corners);

    return createPortal(
        <div className="fixed inset-0 z-[300] flex flex-col bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="flex items-center gap-4 px-4 py-2 border-b border-border/40 bg-card/90 text-sm">
                <span className="font-semibold">{t('layer3d.unwarp.title')}</span>
                <span className="text-xs text-muted-foreground hidden md:inline">{t('layer3d.unwarp.hint')}</span>
                <div className="flex-1" />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t('layer3d.unwarp.grid')}
                    <input
                        type="range" min={0} max={16} value={gridDivisions}
                        onChange={(e) => setGridDivisions(parseInt(e.target.value))}
                        className="w-24 h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t('layer3d.unwarp.aspect')}
                    <select
                        value={aspectMode}
                        onChange={(e) => setAspectMode(e.target.value as 'auto' | 'metric')}
                        className="bg-background border border-border rounded px-1.5 py-0.5 text-xs"
                    >
                        <option value="auto">{t('layer3d.unwarp.aspectAuto')}</option>
                        <option value="metric">{t('layer3d.unwarp.aspectMetric')}</option>
                    </select>
                </label>
                {aspectMode === 'metric' && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {t('layer3d.unwarp.focal')}
                        <input
                            type="number" min={8} max={300} value={focal35}
                            onChange={(e) => setFocal35(Math.max(1, parseFloat(e.target.value) || 35))}
                            className="w-16 bg-background border border-border rounded px-1.5 py-0.5 text-xs"
                        />
                    </label>
                )}
                <button
                    onClick={onCancel}
                    className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary transition-colors"
                >
                    {t('common.cancel')}
                </button>
                <button
                    onClick={() => valid && onApply({ corners, aspectMode, focal35, gridDivisions })}
                    disabled={!valid}
                    className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                    {t('layer3d.unwarp.apply')}
                </button>
            </div>
            <div ref={containerRef} className="relative flex-1 overflow-hidden touch-none">
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 cursor-crosshair"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onWheel={onWheel}
                />
                {!valid && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-red-500/15 border border-red-400/40 text-red-200 text-xs">
                        {t('layer3d.unwarp.invalidQuad')}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
