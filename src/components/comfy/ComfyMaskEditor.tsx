'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brush, Check, Eraser, Loader2, Square, Trash2, X } from 'lucide-react';

interface ComfyMaskEditorProps {
    /** Captured source image the mask is painted over. */
    sourceDataUrl: string;
    /** Native pixel size of the source (mask is exported at this resolution). */
    width: number;
    height: number;
    /** Previously painted mask (white = regenerate) to continue editing. */
    initialMaskDataUrl?: string | null;
    onApply: (maskDataUrl: string) => void;
    onCancel: () => void;
}

type MaskTool = 'paint' | 'erase';

const PREVIEW_STROKE_COLOR = '#ff3355';

/**
 * Paints an inpaint mask over the captured source. Strokes are shown as a red
 * overlay; Apply exports a white-on-black mask PNG at source resolution
 * (white = area ComfyUI regenerates).
 */
export default function ComfyMaskEditor({
    sourceDataUrl,
    width,
    height,
    initialMaskDataUrl,
    onApply,
    onCancel,
}: ComfyMaskEditorProps) {
    const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [tool, setTool] = useState<MaskTool>('paint');
    const [brushSize, setBrushSize] = useState(48);
    const [hasStrokes, setHasStrokes] = useState(false);
    const [isImportingMask, setIsImportingMask] = useState(Boolean(initialMaskDataUrl));

    // Re-import an existing white-on-black mask as red preview strokes.
    useEffect(() => {
        if (!initialMaskDataUrl) return;
        const canvas = paintCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) {
            setIsImportingMask(false);
            return;
        }

        let cancelled = false;
        const maskImage = new Image();
        maskImage.onload = () => {
            if (cancelled) return;
            try {
                const probe = document.createElement('canvas');
                probe.width = canvas.width;
                probe.height = canvas.height;
                const probeCtx = probe.getContext('2d');
                if (!probeCtx) return;

                probeCtx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
                const maskData = probeCtx.getImageData(0, 0, canvas.width, canvas.height);
                const overlay = ctx.createImageData(canvas.width, canvas.height);
                let found = false;

                for (let index = 0; index < maskData.data.length; index += 4) {
                    const luminance = (maskData.data[index] + maskData.data[index + 1] + maskData.data[index + 2]) / 3;
                    if (luminance > 127 && maskData.data[index + 3] > 127) {
                        overlay.data[index] = 255;
                        overlay.data[index + 1] = 51;
                        overlay.data[index + 2] = 85;
                        overlay.data[index + 3] = 255;
                        found = true;
                    }
                }

                ctx.putImageData(overlay, 0, 0);
                setHasStrokes(found);
            } catch {
                // Ignore unreadable masks; user starts from scratch.
            } finally {
                setIsImportingMask(false);
            }
        };
        maskImage.onerror = () => setIsImportingMask(false);
        maskImage.src = initialMaskDataUrl;

        return () => {
            cancelled = true;
        };
    }, [initialMaskDataUrl]);

    const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = paintCanvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return {
            x: ((event.clientX - rect.left) / rect.width) * canvas.width,
            y: ((event.clientY - rect.top) / rect.height) * canvas.height,
        };
    }, []);

    const drawStroke = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
        const ctx = paintCanvasRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.save();
        ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = PREVIEW_STROKE_COLOR;
        ctx.fillStyle = PREVIEW_STROKE_COLOR;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();

        if (tool === 'paint') {
            setHasStrokes(true);
        }
    }, [brushSize, tool]);

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const point = getCanvasPoint(event);
        if (!point) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        isDrawingRef.current = true;
        lastPointRef.current = point;
        drawStroke(point, point);
    }, [drawStroke, getCanvasPoint]);

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return;
        const point = getCanvasPoint(event);
        if (!point) return;
        drawStroke(lastPointRef.current || point, point);
        lastPointRef.current = point;
    }, [drawStroke, getCanvasPoint]);

    const stopDrawing = useCallback(() => {
        isDrawingRef.current = false;
        lastPointRef.current = null;
    }, []);

    const clearMask = useCallback(() => {
        const canvas = paintCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasStrokes(false);
    }, []);

    const fillMask = useCallback(() => {
        const canvas = paintCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = PREVIEW_STROKE_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        setHasStrokes(true);
    }, []);

    const applyMask = useCallback(() => {
        const canvas = paintCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        try {
            const painted = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = canvas.width;
            maskCanvas.height = canvas.height;
            const maskCtx = maskCanvas.getContext('2d');
            if (!maskCtx) return;

            const mask = maskCtx.createImageData(canvas.width, canvas.height);
            for (let index = 0; index < painted.data.length; index += 4) {
                const value = painted.data[index + 3] > 24 ? 255 : 0;
                mask.data[index] = value;
                mask.data[index + 1] = value;
                mask.data[index + 2] = value;
                mask.data[index + 3] = 255;
            }

            maskCtx.putImageData(mask, 0, 0);
            onApply(maskCanvas.toDataURL('image/png'));
        } catch {
            // Leave the editor open; the parent shows run-time errors.
        }
    }, [onApply]);

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Paint Inpaint Mask</h3>
                    <p className="text-[11px] text-muted-foreground">
                        Painted (red) areas are regenerated by the workflow; everything else is preserved.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                        <X size={13} />
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={applyMask}
                        disabled={!hasStrokes}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Check size={13} />
                        Apply Mask
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
                <button
                    type="button"
                    onClick={() => setTool('paint')}
                    aria-pressed={tool === 'paint'}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${tool === 'paint'
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                >
                    <Brush size={12} />
                    Paint
                </button>
                <button
                    type="button"
                    onClick={() => setTool('erase')}
                    aria-pressed={tool === 'erase'}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${tool === 'erase'
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                >
                    <Eraser size={12} />
                    Erase
                </button>
                <label className="ml-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    Brush
                    <input
                        type="range"
                        min={4}
                        max={256}
                        value={brushSize}
                        onChange={(event) => setBrushSize(Number(event.target.value))}
                        aria-label="Mask brush size"
                        className="w-28"
                    />
                    <span className="w-8 tabular-nums">{brushSize}px</span>
                </label>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={fillMask}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                        <Square size={12} />
                        Fill All
                    </button>
                    <button
                        type="button"
                        onClick={clearMask}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                        <Trash2 size={12} />
                        Clear
                    </button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/20 p-4">
                <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${width} / ${height}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={sourceDataUrl}
                        alt="Inpaint source"
                        className="pointer-events-none block max-h-[60vh] max-w-full rounded border border-border object-contain"
                        draggable={false}
                    />
                    <canvas
                        ref={paintCanvasRef}
                        width={Math.max(1, Math.round(width))}
                        height={Math.max(1, Math.round(height))}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={stopDrawing}
                        onPointerLeave={stopDrawing}
                        aria-label="Mask painting canvas"
                        className="absolute inset-0 h-full w-full cursor-crosshair opacity-60 touch-none"
                    />
                    {isImportingMask && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Loader2 size={20} className="animate-spin text-white" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
