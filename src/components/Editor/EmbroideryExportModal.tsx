'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, Scissors, ZoomIn, ZoomOut, Maximize2, Play, Pause } from 'lucide-react';

import {
    buildEmbroideryFromDataUrl,
    downloadDst,
    type EmbroideryOptions,
    type EmbroideryPlan,
} from '@/lib/embroidery/embroideryExport';
import { useI18n } from '@/providers/I18nProvider';

type EmbroideryExportModalProps = {
    /** PNG capture of the artboard (transparent background when disabled). */
    sourceDataUrl: string;
    designName: string;
    onClose: () => void;
};

export default function EmbroideryExportModal({ sourceDataUrl, designName, onClose }: EmbroideryExportModalProps) {
    const { t } = useI18n();
    const [colorCount, setColorCount] = useState(6);
    const [widthMm, setWidthMm] = useState(100);
    const [rowSpacingMm, setRowSpacingMm] = useState(0.4);
    const [stitchLengthMm, setStitchLengthMm] = useState(3);
    const [omitBackground, setOmitBackground] = useState(true);
    const [plan, setPlan] = useState<EmbroideryPlan | null>(null);
    const [isBuilding, setIsBuilding] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);

    // Preview zoom/pan. zoom 1 = fit-to-frame; panning only matters above that.
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

    // Stitch-out simulation: how much of the needle path is drawn (0..1).
    const [progress, setProgress] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const totalPoints = plan ? plan.threads.reduce((sum, thread) => sum + thread.points.length, 0) : 0;
    const shownPoints = Math.max(1, Math.round(progress * totalPoints));

    const MIN_ZOOM = 1;
    const MAX_ZOOM = 12;

    const clampZoom = useCallback((value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)), []);

    const resetView = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    const zoomBy = useCallback((factor: number) => {
        setZoom((current) => {
            const next = clampZoom(current * factor);
            // Snapping back to fit should also recentre, otherwise the image
            // can sit off-frame after panning at high zoom.
            if (next === 1) setPan({ x: 0, y: 0 });
            return next;
        });
    }, [clampZoom]);

    const handleWheel = useCallback((event: React.WheelEvent) => {
        if (!plan) return;
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, [plan, zoomBy]);

    const handlePointerDown = useCallback((event: React.PointerEvent) => {
        if (zoom <= 1) return;
        event.preventDefault();
        // Capture keeps the drag alive outside the frame, but must never block
        // panning if the pointer can't be captured.
        try {
            (event.currentTarget as Element).setPointerCapture(event.pointerId);
        } catch {
            // Ignore — dragging still works without capture.
        }
        panDragRef.current = { startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y };
        setIsPanning(true);
    }, [pan.x, pan.y, zoom]);

    const handlePointerMove = useCallback((event: React.PointerEvent) => {
        const drag = panDragRef.current;
        if (!drag) return;
        setPan({
            x: drag.originX + (event.clientX - drag.startX),
            y: drag.originY + (event.clientY - drag.startY),
        });
    }, []);

    const endPan = useCallback((event: React.PointerEvent) => {
        if (!panDragRef.current) return;
        panDragRef.current = null;
        setIsPanning(false);
        try {
            (event.currentTarget as Element).releasePointerCapture(event.pointerId);
        } catch {
            // Capture may never have been granted; nothing to release.
        }
    }, []);

    // Rebuild the stitch plan (debounced) whenever an option changes.
    useEffect(() => {
        let cancelled = false;
        // Rebuilding is an external canvas/image operation triggered by option changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsBuilding(true);
        setBuildError(null);
        const timer = window.setTimeout(() => {
            const options: EmbroideryOptions = { colorCount, widthMm, rowSpacingMm, stitchLengthMm, omitBackground };
            buildEmbroideryFromDataUrl(sourceDataUrl, options, designName)
                .then((next) => {
                    if (cancelled) return;
                    setPlan(next);
                    // A rebuilt design shows complete, not mid-stitch.
                    setIsPlaying(false);
                    setProgress(1);
                })
                .catch((error) => {
                    if (!cancelled) {
                        setPlan(null);
                        setBuildError(error instanceof Error ? error.message : 'Failed to build stitches.');
                    }
                })
                .finally(() => {
                    if (!cancelled) setIsBuilding(false);
                });
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [sourceDataUrl, designName, colorCount, widthMm, rowSpacingMm, stitchLengthMm, omitBackground]);

    // Redraw the needle path up to the current point, plus a marker showing
    // where the needle is. Jumps break the stroke, so travel never looks sewn.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !plan) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = plan.threadWidth;

        let budget = shownPoints;
        let needle: { x: number; y: number } | null = null;

        for (const thread of plan.threads) {
            if (budget <= 0) break;
            ctx.strokeStyle = `rgb(${thread.color.r},${thread.color.g},${thread.color.b})`;
            ctx.beginPath();
            let pen = false;
            for (const point of thread.points) {
                if (budget <= 0) break;
                if (point.jump || !pen) {
                    ctx.moveTo(point.x, point.y);
                    pen = true;
                } else {
                    ctx.lineTo(point.x, point.y);
                }
                needle = point;
                budget -= 1;
            }
            ctx.stroke();
        }

        if (needle && progress < 1) {
            ctx.beginPath();
            ctx.arc(needle.x, needle.y, Math.max(3, plan.threadWidth * 1.8), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fill();
            ctx.lineWidth = Math.max(1, plan.threadWidth * 0.6);
            ctx.strokeStyle = '#ef4444';
            ctx.stroke();
        }
    }, [plan, shownPoints, progress]);

    // Playback ticks through the path at a readable rate regardless of size.
    // The updater only clamps; stopping at the end is handled separately so we
    // never trigger a second state update from inside a state updater.
    useEffect(() => {
        if (!isPlaying || totalPoints === 0) return;
        let frame = 0;
        const perFrame = Math.max(1, Math.round(totalPoints / 600));
        const step = () => {
            setProgress((current) => Math.min(1, current + perFrame / totalPoints));
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [isPlaying, totalPoints]);

    useEffect(() => {
        // Playback completion is synchronized with requestAnimationFrame progress.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (isPlaying && progress >= 1) setIsPlaying(false);
    }, [isPlaying, progress]);

    const togglePlay = useCallback(() => {
        if (isPlaying) {
            setIsPlaying(false);
            return;
        }
        // Pressing play at the end replays from the beginning.
        if (progress >= 1) setProgress(0);
        setIsPlaying(true);
    }, [isPlaying, progress]);

    const handleExport = useCallback(() => {
        if (!plan) return;
        downloadDst(plan, `${designName.replace(/[^\w\- ]+/g, '').trim() || 'design'}.dst`);
        onClose();
    }, [designName, onClose, plan]);

    return (
        <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-150" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/10 shrink-0">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Scissors size={16} className="text-primary" />
                        {t('emb.title')}
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground" aria-label={t('common.cancel')}>
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
                    {/* Preview */}
                    <div className="flex-1 min-h-[260px] min-w-0 flex flex-col">
                    <div className="relative flex-1 min-h-0 bg-secondary/10 checkerboard-bg overflow-hidden">
                        <div
                            className="absolute inset-0 flex items-center justify-center p-4"
                            style={{ cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
                            onWheel={handleWheel}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={endPan}
                            onPointerCancel={endPan}
                            onDoubleClick={resetView}
                        >
                            {isBuilding ? (
                                <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                                    <Loader2 size={22} className="animate-spin" />
                                    {t('emb.building')}
                                </div>
                            ) : plan ? (
                                <canvas
                                    ref={canvasRef}
                                    width={plan.previewWidth}
                                    height={plan.previewHeight}
                                    aria-label={t('emb.previewAlt')}
                                    className="max-w-full max-h-[52vh] object-contain rounded-md border border-border/50 select-none"
                                    style={{
                                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                    }}
                                />
                            ) : (
                                <span className="text-xs text-destructive">{buildError || t('emb.buildFailed')}</span>
                            )}
                        </div>

                        {plan && !isBuilding && (
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-md border border-border/60 bg-background/85 backdrop-blur px-1 py-0.5 shadow-lg">
                                <button
                                    onClick={() => zoomBy(1 / 1.4)}
                                    disabled={zoom <= MIN_ZOOM}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={t('emb.zoomOut')}
                                    aria-label={t('emb.zoomOut')}
                                >
                                    <ZoomOut size={14} />
                                </button>
                                <span className="min-w-[46px] text-center text-[11px] tabular-nums text-muted-foreground">
                                    {Math.round(zoom * 100)}%
                                </span>
                                <button
                                    onClick={() => zoomBy(1.4)}
                                    disabled={zoom >= MAX_ZOOM}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={t('emb.zoomIn')}
                                    aria-label={t('emb.zoomIn')}
                                >
                                    <ZoomIn size={14} />
                                </button>
                                <div className="mx-0.5 h-4 w-px bg-border/70" />
                                <button
                                    onClick={resetView}
                                    disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
                                    className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={t('emb.zoomFit')}
                                    aria-label={t('emb.zoomFit')}
                                >
                                    <Maximize2 size={13} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Stitch-out scrubber: drag to walk the needle through the design */}
                    {plan && !isBuilding && (
                        <div className="shrink-0 border-t border-border/60 bg-card px-3 py-2 flex items-center gap-3">
                            <button
                                onClick={togglePlay}
                                className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                title={isPlaying ? t('emb.pause') : t('emb.play')}
                                aria-label={isPlaying ? t('emb.pause') : t('emb.play')}
                            >
                                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={1000}
                                value={Math.round(progress * 1000)}
                                onChange={(event) => {
                                    setIsPlaying(false);
                                    setProgress(Number(event.target.value) / 1000);
                                }}
                                aria-label={t('emb.stitchScrub')}
                                className="flex-1 h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground min-w-[92px] text-right">
                                {t('emb.stitchOf', {
                                    current: shownPoints.toLocaleString(),
                                    total: totalPoints.toLocaleString(),
                                })}
                            </span>
                        </div>
                    )}
                    </div>

                    {/* Options */}
                    <div className="w-full md:w-72 border-t md:border-t-0 md:border-l border-border p-4 space-y-4 overflow-y-auto shrink-0 text-xs">
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>{t('emb.colors')}</span>
                                <span>{colorCount}</span>
                            </div>
                            <input type="range" min={2} max={12} step={1} value={colorCount} onChange={(e) => setColorCount(parseInt(e.target.value))} className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer" />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>{t('emb.widthMm')}</span>
                                <span>{widthMm} mm</span>
                            </div>
                            <input type="range" min={40} max={300} step={5} value={widthMm} onChange={(e) => setWidthMm(parseInt(e.target.value))} className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer" />
                            {plan && (
                                <div className="text-[10px] text-muted-foreground">{t('emb.outputSize', { width: plan.widthMm.toFixed(0), height: plan.heightMm.toFixed(0) })}</div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>{t('emb.density')}</span>
                                <span>{rowSpacingMm.toFixed(1)} mm</span>
                            </div>
                            <input type="range" min={0.3} max={1} step={0.1} value={rowSpacingMm} onChange={(e) => setRowSpacingMm(parseFloat(e.target.value))} className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer" />
                            <div className="text-[10px] text-muted-foreground">{t('emb.densityHint')}</div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>{t('emb.stitchLength')}</span>
                                <span>{stitchLengthMm.toFixed(1)} mm</span>
                            </div>
                            <input type="range" min={1.5} max={6} step={0.5} value={stitchLengthMm} onChange={(e) => setStitchLengthMm(parseFloat(e.target.value))} className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer" />
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={omitBackground} onChange={(e) => setOmitBackground(e.target.checked)} className="rounded border-border text-primary focus:ring-primary/20" />
                            <span>{t('emb.omitBackground')}</span>
                        </label>
                        <div className="text-[10px] text-muted-foreground -mt-2">{t('emb.omitBackgroundHint')}</div>

                        {plan && (
                            <div className="pt-2 border-t border-border/60 space-y-2">
                                <div className="text-[10px] uppercase text-muted-foreground font-semibold">{t('emb.threadColors')}</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {plan.palette.map((entry, index) => (
                                        <span
                                            key={index}
                                            className={`inline-flex items-center gap-1 rounded-full border border-border/60 pl-1 pr-2 py-0.5 text-[10px] ${entry.isBackground ? 'opacity-45 line-through' : ''}`}
                                            title={entry.isBackground ? t('emb.backgroundSkipped') : `${entry.stitches} ${t('emb.stitches')}`}
                                        >
                                            <span className="h-3 w-3 rounded-full border border-black/20" style={{ backgroundColor: `rgb(${entry.r},${entry.g},${entry.b})` }} />
                                            {entry.isBackground ? t('emb.bg') : entry.stitches.toLocaleString()}
                                        </span>
                                    ))}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    {t('emb.summary', {
                                        stitches: plan.totalStitches.toLocaleString(),
                                        changes: String(plan.colorChanges + 1),
                                    })}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    {t('emb.jumps', { count: plan.jumpCount.toLocaleString() })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-3 border-t border-border flex items-center justify-between gap-2 bg-card shrink-0">
                    <span className="text-[11px] text-muted-foreground">{t('emb.formatHint')}</span>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="h-9 px-3 rounded-md text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors">
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={!plan || isBuilding}
                            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            <Download size={14} />
                            {t('emb.exportDst')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
