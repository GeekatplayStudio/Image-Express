/**
 * 3D Stamp Tool - Press Simulator
 * Simulates physical stamping in real-time:
 * 1. Ink hand stamp onto textured paper
 * 2. Melted wax seal impression with glossy 3D seal bevels
 */

import React, { useState } from 'react';
import { Play, RotateCcw, Plus, Check } from 'lucide-react';
import { StampConfig } from '../domain/stampTypes';

interface StampPressSimulatorProps {
    imprintDataUrl: string;
    dieDataUrl: string;
    config: StampConfig;
    onAddToCanvas?: (dataUrl: string) => void;
}

const INK_COLORS = [
    { name: 'Classic Red', hex: '#dc2626' },
    { name: 'Royal Blue', hex: '#1d4ed8' },
    { name: 'Jet Black', hex: '#1e293b' },
    { name: 'Forest Green', hex: '#15803d' },
    { name: 'Deep Purple', hex: '#6b21a8' },
];

const WAX_COLORS = [
    { name: 'Royal Burgundy', hex: '#881337', gradient: 'radial-gradient(circle at 40% 35%, #be123c, #881337 70%, #4c0519)' },
    { name: 'Antique Gold', hex: '#ca8a04', gradient: 'radial-gradient(circle at 40% 35%, #facc15, #ca8a04 70%, #713f12)' },
    { name: 'Emerald Green', hex: '#047857', gradient: 'radial-gradient(circle at 40% 35%, #10b981, #047857 70%, #064e3b)' },
    { name: 'Pearl White', hex: '#e2e8f0', gradient: 'radial-gradient(circle at 40% 35%, #ffffff, #cbd5e1 70%, #94a3b8)' },
    { name: 'Midnight Black', hex: '#0f172a', gradient: 'radial-gradient(circle at 40% 35%, #334155, #0f172a 70%, #020617)' },
];

export default function StampPressSimulator({
    imprintDataUrl,
    dieDataUrl,
    config,
    onAddToCanvas,
}: StampPressSimulatorProps) {
    const isWaxSeal = config.stampType === 'wax-seal';
    const [selectedInk, setSelectedInk] = useState(INK_COLORS[0]);
    const [selectedWax, setSelectedWax] = useState(WAX_COLORS[0]);
    const [isPressed, setIsPressed] = useState(true);
    const [isPressing, setIsPressing] = useState(false);
    const [added, setAdded] = useState(false);

    const triggerPressAnimation = () => {
        setIsPressing(true);
        setIsPressed(false);
        setTimeout(() => {
            setIsPressed(true);
            setIsPressing(false);
        }, 600);
    };

    const handleAdd = () => {
        if (!onAddToCanvas || !imprintDataUrl) return;
        onAddToCanvas(imprintDataUrl);
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
    };

    return (
        <div className="flex flex-col h-full gap-4 p-4 text-xs text-foreground select-none overflow-y-auto">
            {/* Header & Controls */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <div className="space-y-0.5">
                    <h3 className="font-semibold text-sm">
                        {isWaxSeal ? 'Wax Seal Press Simulator' : 'Ink Hand Stamp Simulator'}
                    </h3>
                    <p className="text-muted-foreground text-[11px]">
                        Verify physical orientation and see how the stamp imprints when pressed.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={triggerPressAnimation}
                        disabled={isPressing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                    >
                        <Play size={13} className={isPressing ? 'animate-spin' : ''} />
                        Press Stamp
                    </button>
                    {onAddToCanvas && (
                        <button
                            type="button"
                            onClick={handleAdd}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                            {added ? <Check size={13} className="text-emerald-500" /> : <Plus size={13} />}
                            {added ? 'Added!' : 'Add to Canvas'}
                        </button>
                    )}
                </div>
            </div>

            {/* Color Swatches */}
            <div className="flex items-center gap-3">
                <span className="text-muted-foreground font-medium">
                    {isWaxSeal ? 'Sealing Wax Color:' : 'Stamp Ink Color:'}
                </span>
                <div className="flex items-center gap-1.5">
                    {isWaxSeal
                        ? WAX_COLORS.map((wax) => (
                              <button
                                  key={wax.name}
                                  type="button"
                                  onClick={() => setSelectedWax(wax)}
                                  title={wax.name}
                                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                                      selectedWax.name === wax.name
                                          ? 'border-primary scale-110 shadow-md'
                                          : 'border-transparent opacity-80 hover:opacity-100'
                                  }`}
                                  style={{ background: wax.hex }}
                              />
                          ))
                        : INK_COLORS.map((ink) => (
                              <button
                                  key={ink.name}
                                  type="button"
                                  onClick={() => setSelectedInk(ink)}
                                  title={ink.name}
                                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                                      selectedInk.name === ink.name
                                          ? 'border-primary scale-110 shadow-md'
                                          : 'border-transparent opacity-80 hover:opacity-100'
                                  }`}
                                  style={{ background: ink.hex }}
                              />
                          ))}
                </div>
            </div>

            {/* Simulation Stage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-[300px]">
                {/* Physical Die Face View */}
                <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-border/60 bg-secondary/20 relative">
                    <span className="absolute top-3 left-3 px-2 py-0.5 rounded bg-background/80 border border-border text-[10px] font-mono text-muted-foreground">
                        Physical 3D Die (Mirrored)
                    </span>
                    {dieDataUrl ? (
                        <div className="w-56 h-56 rounded-lg border border-border/80 bg-zinc-900 flex items-center justify-center p-3 shadow-inner">
                            <img
                                src={dieDataUrl}
                                alt="Stamp Die Face"
                                className="max-w-full max-h-full object-contain filter invert opacity-90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                            />
                        </div>
                    ) : (
                        <div className="text-muted-foreground">Generating die...</div>
                    )}
                    <span className="mt-2 text-[10px] text-muted-foreground text-center">
                        The physical face is mirrored so left-to-right text stamps correctly.
                    </span>
                </div>

                {/* Stamped Result Simulation */}
                <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-border/60 bg-amber-50/5 relative overflow-hidden">
                    <span className="absolute top-3 left-3 px-2 py-0.5 rounded bg-background/80 border border-border text-[10px] font-mono text-emerald-500 font-semibold">
                        ✓ Stamped Result (Right-Side Up)
                    </span>

                    {isWaxSeal ? (
                        /* Melted Wax Seal Pool */
                        <div
                            className={`w-56 h-56 rounded-full flex items-center justify-center p-4 shadow-2xl transition-all duration-500 ${
                                isPressing ? 'scale-90 opacity-70' : 'scale-100 opacity-100'
                            }`}
                            style={{
                                background: selectedWax.gradient,
                                boxShadow: 'inset 0 3px 6px rgba(255,255,255,0.35), 0 8px 24px rgba(0,0,0,0.5)',
                            }}
                        >
                            {isPressed && imprintDataUrl && (
                                <div className="w-44 h-44 rounded-full border border-amber-200/20 flex items-center justify-center p-2 shadow-inner overflow-hidden">
                                    <img
                                        src={imprintDataUrl}
                                        alt="Wax Seal Impression"
                                        className="max-w-full max-h-full object-contain filter invert opacity-85 mix-blend-overlay drop-shadow-[1px_2px_2px_rgba(0,0,0,0.8)]"
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Textured Paper Ink Impression */
                        <div
                            className={`w-60 h-60 rounded-md border border-amber-200/40 bg-amber-50 flex items-center justify-center p-4 shadow-lg transition-all duration-500 ${
                                isPressing ? 'scale-95' : 'scale-100'
                            }`}
                            style={{
                                backgroundImage: 'radial-gradient(#d6d3d1 1px, transparent 1px)',
                                backgroundSize: '16px 16px',
                            }}
                        >
                            {isPressed && imprintDataUrl && (
                                <div
                                    className="w-48 h-48 flex items-center justify-center transition-opacity duration-300"
                                    style={{
                                        filter: 'contrast(1.2) drop-shadow(0 1px 1px rgba(0,0,0,0.15))',
                                    }}
                                >
                                    <img
                                        src={imprintDataUrl}
                                        alt="Stamped Ink"
                                        className="max-w-full max-h-full object-contain"
                                        style={{
                                            filter: `drop-shadow(0 0 0 ${selectedInk.hex})`,
                                            mixBlendMode: 'multiply',
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <span className="mt-2 text-[10px] text-muted-foreground text-center">
                        {isWaxSeal
                            ? 'Deep embossed brass seal impression in hot sealing wax pool.'
                            : 'Authentic ink stamp impression on heavy vellum paper.'}
                    </span>
                </div>
            </div>
        </div>
    );
}
