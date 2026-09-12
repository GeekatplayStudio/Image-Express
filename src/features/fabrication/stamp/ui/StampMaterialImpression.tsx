/**
 * 3D Stamp Tool - Top-Down Material Impression Preview
 * Shows the final result of the stamp when applied onto physical materials
 * (positive unmirrored orientation, as seen by someone holding the stamped material).
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
    Download,
    Plus,
    Check,
    Droplets,
    Layers,
    Sparkles,
    Eye,
} from 'lucide-react';
import { StampConfig } from '../domain/stampTypes';

interface StampMaterialImpressionProps {
    imprintDataUrl: string;       // Positive unmirrored artwork
    heightmapData?: Uint8ClampedArray;
    gridWidth?: number;
    gridHeight?: number;
    config: StampConfig;
    onAddToCanvas?: (dataUrl: string) => void;
}

export type ImpressionMaterial = 'paper' | 'leather' | 'wax' | 'clay';

const INK_COLORS = [
    { name: 'Jet Black', hex: '#1e293b' },
    { name: 'Classic Red', hex: '#b91c1c' },
    { name: 'Navy Blue', hex: '#1d4ed8' },
    { name: 'Forest Green', hex: '#15803d' },
    { name: 'Deep Purple', hex: '#6b21a8' },
    { name: 'Antique Bronze', hex: '#92400e' },
];

const LEATHER_TONES = [
    { name: 'Saddle Tan', hex: '#b45309', bg: '#d97706' },
    { name: 'Chestnut', hex: '#78350f', bg: '#92400e' },
    { name: 'Raw Hide', hex: '#d4b996', bg: '#e2cfb7' },
    { name: 'Espresso', hex: '#292524', bg: '#44403c' },
];

const WAX_COLORS = [
    { name: 'Burgundy', hex: '#881337', bg: '#be123c' },
    { name: 'Royal Gold', hex: '#ca8a04', bg: '#facc15' },
    { name: 'Emerald', hex: '#047857', bg: '#10b981' },
    { name: 'Midnight', hex: '#0f172a', bg: '#334155' },
];

export default function StampMaterialImpression({
    imprintDataUrl,
    config,
    onAddToCanvas,
}: StampMaterialImpressionProps) {
    const [material, setMaterial] = useState<ImpressionMaterial>(() =>
        config.stampType === 'wax-seal' ? 'wax' : 'paper'
    );
    const [selectedInk, setSelectedInk] = useState(INK_COLORS[0]);
    const [selectedLeather, setSelectedLeather] = useState(LEATHER_TONES[0]);
    const [selectedWax, setSelectedWax] = useState(WAX_COLORS[0]);
    const [pressure, setPressure] = useState<number>(0.85); // 0.4 to 1.0
    const [added, setAdded] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Draw the realistic physical top-down impression onto material canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imprintDataUrl) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // 1. Draw Material Background Surface
            if (material === 'paper') {
                // Cream textured cardstock
                ctx.fillStyle = '#fbf7ee';
                ctx.fillRect(0, 0, w, h);

                // Subtle paper grain noise
                const grain = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w / 1.3);
                grain.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
                grain.addColorStop(1, 'rgba(230, 220, 200, 0.5)');
                ctx.fillStyle = grain;
                ctx.fillRect(0, 0, w, h);
            } else if (material === 'leather') {
                // Rich vegetable-tanned leather surface
                const leatherGrad = ctx.createLinearGradient(0, 0, w, h);
                leatherGrad.addColorStop(0, selectedLeather.bg);
                leatherGrad.addColorStop(1, selectedLeather.hex);
                ctx.fillStyle = leatherGrad;
                ctx.fillRect(0, 0, w, h);

                // Leather grain vignette
                const vignette = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, w / 1.2);
                vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
                vignette.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
                ctx.fillStyle = vignette;
                ctx.fillRect(0, 0, w, h);
            } else if (material === 'wax') {
                // Envelope paper surface behind wax seal
                ctx.fillStyle = '#f4ede4';
                ctx.fillRect(0, 0, w, h);

                // Melted wax seal puddle pool
                const cx = w / 2;
                const cy = h / 2;
                const waxRadius = Math.min(w, h) * 0.44;

                const waxGrad = ctx.createRadialGradient(
                    cx - waxRadius * 0.25,
                    cy - waxRadius * 0.25,
                    waxRadius * 0.1,
                    cx,
                    cy,
                    waxRadius
                );
                waxGrad.addColorStop(0, selectedWax.bg);
                waxGrad.addColorStop(0.7, selectedWax.hex);
                waxGrad.addColorStop(1, 'rgba(15, 15, 15, 0.9)');

                ctx.save();
                ctx.beginPath();
                // Organic melted scalloped rim
                const points = 36;
                for (let i = 0; i <= points; i++) {
                    const angle = (i / points) * Math.PI * 2;
                    const wobble = Math.sin(angle * 5) * (waxRadius * 0.04) + Math.cos(angle * 7) * (waxRadius * 0.03);
                    const r = waxRadius + wobble;
                    const px = cx + Math.cos(angle) * r;
                    const py = cy + Math.sin(angle) * r;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fillStyle = waxGrad;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
                ctx.shadowBlur = 18;
                ctx.shadowOffsetY = 8;
                ctx.fill();
                ctx.restore();
            } else if (material === 'clay') {
                // Earthy terracotta clay surface
                const clayGrad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 1.2);
                clayGrad.addColorStop(0, '#e07a5f');
                clayGrad.addColorStop(1, '#b85d43');
                ctx.fillStyle = clayGrad;
                ctx.fillRect(0, 0, w, h);
            }

            // 2. Draw Stamped Impression
            const pad = 60;
            const drawW = w - pad * 2;
            const drawH = h - pad * 2;
            const drawX = (w - drawW) / 2;
            const drawY = (h - drawH) / 2;

            // Temp canvas to colorize the artwork mask
            const tintCanvas = document.createElement('canvas');
            tintCanvas.width = drawW;
            tintCanvas.height = drawH;
            const tCtx = tintCanvas.getContext('2d')!;

            // Draw positive artwork
            tCtx.drawImage(img, 0, 0, drawW, drawH);

            // Fail-safe: if the image was fully opaque (e.g. legacy or non-transparent PNG),
            // key out white/light background so a black square is mathematically impossible
            const tImgData = tCtx.getImageData(0, 0, drawW, drawH);
            const tPixels = tImgData.data;
            let fullyOpaque = true;
            for (let i = 3; i < tPixels.length; i += 16) {
                if (tPixels[i] < 250) {
                    fullyOpaque = false;
                    break;
                }
            }

            if (fullyOpaque) {
                for (let i = 0; i < tPixels.length; i += 4) {
                    const luma = 0.299 * tPixels[i] + 0.587 * tPixels[i + 1] + 0.114 * tPixels[i + 2];
                    // Dark is ink, white is removed
                    tPixels[i + 3] = Math.max(0, Math.min(255, Math.round(255 - luma)));
                    tPixels[i] = 0;
                    tPixels[i + 1] = 0;
                    tPixels[i + 2] = 0;
                }
                tCtx.putImageData(tImgData, 0, 0);
            }

            if (material === 'paper') {
                // Hand stamp ink effect with slight bleed & opacity based on pressure
                tCtx.globalCompositeOperation = 'source-in';
                tCtx.fillStyle = selectedInk.hex;
                tCtx.fillRect(0, 0, drawW, drawH);

                ctx.save();
                ctx.globalAlpha = Math.max(0.75, Math.min(1.0, pressure));
                // Subtle ink edge bleed
                ctx.shadowColor = selectedInk.hex;
                ctx.shadowBlur = (1.0 - pressure) * 2;
                ctx.drawImage(tintCanvas, drawX, drawY);
                ctx.restore();
            } else if (material === 'leather' || material === 'clay') {
                // 3D Debossed cavity effect (highlight top-left, drop shadow bottom-right)
                ctx.save();
                // 1. Lower drop shadow for recessed depth
                ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 1.5;
                ctx.shadowOffsetY = 2.5;

                tCtx.globalCompositeOperation = 'source-in';
                tCtx.fillStyle = material === 'leather' ? '#1c0f04' : '#6b2d18'; // burnished darker pressed cavity
                tCtx.fillRect(0, 0, drawW, drawH);

                ctx.globalAlpha = 0.85 * pressure;
                ctx.drawImage(tintCanvas, drawX, drawY);

                // 2. Upper edge bevel specular highlight
                ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
                ctx.shadowBlur = 2;
                ctx.shadowOffsetX = -1;
                ctx.shadowOffsetY = -1;
                ctx.drawImage(tintCanvas, drawX, drawY);
                ctx.restore();
            } else if (material === 'wax') {
                // Embossed wax seal impression inside wax pool
                tCtx.globalCompositeOperation = 'source-in';
                tCtx.fillStyle = 'rgba(255, 255, 255, 0.22)';
                tCtx.fillRect(0, 0, drawW, drawH);

                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetY = 3;
                ctx.drawImage(tintCanvas, drawX, drawY);
                ctx.restore();
            }
        };
        img.src = imprintDataUrl;
    }, [imprintDataUrl, material, selectedInk, selectedLeather, selectedWax, pressure]);

    const handleDownload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = `stamp-impression-${material}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const handleAdd = () => {
        const canvas = canvasRef.current;
        if (!canvas || !onAddToCanvas) return;
        onAddToCanvas(canvas.toDataURL('image/png'));
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
    };

    return (
        <div className="flex flex-col h-full gap-3 p-4 text-xs text-foreground select-none overflow-y-auto">
            {/* Header & Material Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div>
                    <h3 className="font-semibold text-sm flex items-center gap-1.5">
                        <Eye size={16} className="text-primary" />
                        Final Stamped Impression Preview
                    </h3>
                    <p className="text-muted-foreground text-[11px]">
                        Top-down positive view showing how the stamp looks when pressed into real material.
                    </p>
                </div>

                {/* Material Switcher */}
                <div className="flex p-0.5 rounded-lg bg-secondary border border-border">
                    {(
                        [
                            { id: 'paper', label: 'Ink Paper' },
                            { id: 'leather', label: 'Debossed Leather' },
                            { id: 'wax', label: 'Wax Seal' },
                            { id: 'clay', label: 'Clay' },
                        ] as const
                    ).map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => setMaterial(m.id)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                material === m.id
                                    ? 'bg-background text-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Sub-Controls: Colors & Pressure */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/30 p-2.5 rounded-lg border border-border/50">
                {/* Material-specific color palettes */}
                {material === 'paper' && (
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
                            <Droplets size={12} className="text-primary" />
                            Ink Color:
                        </span>
                        <div className="flex items-center gap-1.5">
                            {INK_COLORS.map((ink) => (
                                <button
                                    key={ink.name}
                                    type="button"
                                    onClick={() => setSelectedInk(ink)}
                                    title={ink.name}
                                    className={`w-5 h-5 rounded-full border-2 transition-transform ${
                                        selectedInk.name === ink.name
                                            ? 'border-primary scale-110 shadow-sm'
                                            : 'border-transparent opacity-75 hover:opacity-100'
                                    }`}
                                    style={{ background: ink.hex }}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {material === 'leather' && (
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
                            <Layers size={12} className="text-amber-600" />
                            Leather Tone:
                        </span>
                        <div className="flex items-center gap-1.5">
                            {LEATHER_TONES.map((l) => (
                                <button
                                    key={l.name}
                                    type="button"
                                    onClick={() => setSelectedLeather(l)}
                                    title={l.name}
                                    className={`w-5 h-5 rounded-full border-2 transition-transform ${
                                        selectedLeather.name === l.name
                                            ? 'border-primary scale-110 shadow-sm'
                                            : 'border-transparent opacity-75 hover:opacity-100'
                                    }`}
                                    style={{ background: l.hex }}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {material === 'wax' && (
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
                            <Sparkles size={12} className="text-rose-500" />
                            Wax Color:
                        </span>
                        <div className="flex items-center gap-1.5">
                            {WAX_COLORS.map((w) => (
                                <button
                                    key={w.name}
                                    type="button"
                                    onClick={() => setSelectedWax(w)}
                                    title={w.name}
                                    className={`w-5 h-5 rounded-full border-2 transition-transform ${
                                        selectedWax.name === w.name
                                            ? 'border-primary scale-110 shadow-sm'
                                            : 'border-transparent opacity-75 hover:opacity-100'
                                    }`}
                                    style={{ background: w.hex }}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Pressure / Density Slider */}
                <div className="flex items-center gap-2 ml-auto">
                    <span className="text-muted-foreground text-[11px]">Pressure / Depth:</span>
                    <input
                        type="range"
                        min="0.5"
                        max="1.0"
                        step="0.05"
                        value={pressure}
                        onChange={(e) => setPressure(Number(e.target.value))}
                        className="w-24 accent-primary"
                    />
                    <span className="font-mono text-[10px] w-8">{Math.round(pressure * 100)}%</span>
                </div>
            </div>

            {/* Impression Stage Canvas */}
            <div className="flex-1 flex items-center justify-center p-4 bg-secondary/15 rounded-xl border border-border/60 min-h-[360px] overflow-hidden">
                <canvas
                    ref={canvasRef}
                    width={512}
                    height={512}
                    className="max-h-[380px] w-auto aspect-square rounded-lg shadow-xl border border-border/40 object-contain"
                />
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground">
                    Tip: The impression is positive (unmirrored) so text and dates read correctly.
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-secondary transition-colors text-xs font-medium"
                    >
                        <Download size={13} />
                        Save Impression (PNG)
                    </button>
                    {onAddToCanvas && (
                        <button
                            type="button"
                            onClick={handleAdd}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors text-xs shadow-xs"
                        >
                            {added ? <Check size={13} className="text-emerald-400" /> : <Plus size={13} />}
                            {added ? 'Added to Page!' : 'Add to Page'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
