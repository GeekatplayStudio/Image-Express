/**
 * 3D Stamp Tool - Artwork Levels & Line Adjustments Controls
 * Controls threshold binarization, line thickening, Photoshop-style levels, and bit-depth.
 */

'use client';

import React from 'react';
import { Bold, SlidersHorizontal, RefreshCw } from 'lucide-react';
import { StampArtworkConfig } from '../domain/stampTypes';

interface StampArtworkLevelsControlsProps {
    artwork: StampArtworkConfig;
    updateArtwork: (patch: Partial<StampArtworkConfig>) => void;
    showImageThreshold?: boolean;
}

export const StampArtworkLevelsControls: React.FC<StampArtworkLevelsControlsProps> = ({
    artwork,
    updateArtwork,
    showImageThreshold = false,
}) => {
    return (
        <div className="space-y-3">
            {/* Optional Binarization Threshold Slider */}
            {showImageThreshold && (
                <div className="space-y-2">
                    <div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                            <span className="font-medium text-foreground">Stamp Threshold Cutoff</span>
                            <span className="font-mono text-primary font-bold">
                                {artwork.threshold ?? 128} / 255
                            </span>
                        </div>
                        <input
                            type="range"
                            min="10"
                            max="245"
                            value={artwork.threshold ?? 128}
                            onChange={(e) => updateArtwork({ threshold: Number(e.target.value) })}
                            className="w-full accent-primary"
                        />
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Controls the black/white line cut-point. Lower captures finer faint lines; higher isolates only heavy bold strokes.
                        </p>
                    </div>

                    {/* Grayscale vs Binary Heightmap Mode */}
                    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-secondary/40 border border-border text-[10px]">
                        <button
                            type="button"
                            onClick={() => updateArtwork({ useContinuousGrayscale: false })}
                            className={`py-1 rounded text-center font-medium transition-colors ${
                                !artwork.useContinuousGrayscale
                                    ? 'bg-background shadow-xs text-foreground font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Crisp Binary Relief
                        </button>
                        <button
                            type="button"
                            onClick={() => updateArtwork({ useContinuousGrayscale: true })}
                            className={`py-1 rounded text-center font-medium transition-colors ${
                                artwork.useContinuousGrayscale
                                    ? 'bg-background shadow-xs text-foreground font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Grayscale Heightmap
                        </button>
                    </div>
                </div>
            )}

            {/* Line & Edge Thickness (Dilation) */}
            <div className="space-y-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Bold size={13} className="text-primary" />
                        Line & Text Thickness
                    </span>
                    <span className="font-mono text-primary font-bold">
                        {(artwork.lineThickening ?? 0) > 0 ? `+${artwork.lineThickening} px` : 'Normal'}
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="6"
                    step="0.5"
                    value={artwork.lineThickening ?? 0}
                    onChange={(e) => updateArtwork({ lineThickening: Number(e.target.value) })}
                    className="w-full accent-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                    Reinforces thin text lines and fine graphics so stamp details don&apos;t snap or fail to print.
                </p>
            </div>

            {/* Photoshop-style Levels & Bit-Depth Reduction */}
            <div className="space-y-2.5 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <SlidersHorizontal size={13} className="text-primary" />
                        Levels & Bit-Depth (Photoshop Range)
                    </span>
                    <button
                        type="button"
                        onClick={() => updateArtwork({ blackLevel: 0, whiteLevel: 255, gamma: 1.0 })}
                        className="text-[10px] text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1"
                        title="Reset Levels to default"
                    >
                        <RefreshCw size={10} />
                        Reset
                    </button>
                </div>

                {/* Input Black Point & White Point */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                        <div className="flex justify-between text-muted-foreground mb-0.5">
                            <span>Black Point:</span>
                            <span className="font-mono">{artwork.blackLevel ?? 0}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="254"
                            value={artwork.blackLevel ?? 0}
                            onChange={(e) => updateArtwork({ blackLevel: Number(e.target.value) })}
                            className="w-full accent-primary"
                        />
                    </div>
                    <div>
                        <div className="flex justify-between text-muted-foreground mb-0.5">
                            <span>White Point:</span>
                            <span className="font-mono">{artwork.whiteLevel ?? 255}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="255"
                            value={artwork.whiteLevel ?? 255}
                            onChange={(e) => updateArtwork({ whiteLevel: Number(e.target.value) })}
                            className="w-full accent-primary"
                        />
                    </div>
                </div>

                {/* Gamma / Midtones */}
                <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>Midtones / Gamma:</span>
                        <span className="font-mono font-medium text-foreground">
                            {(artwork.gamma ?? 1.0).toFixed(2)}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0.2"
                        max="3.0"
                        step="0.05"
                        value={artwork.gamma ?? 1.0}
                        onChange={(e) => updateArtwork({ gamma: Number(e.target.value) })}
                        className="w-full accent-primary"
                    />
                </div>

                {/* Bit Reduction / Stepped Grayscale Levels */}
                <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">
                        Gradient Step Reduction (Bit Depth):
                    </label>
                    <div className="grid grid-cols-5 gap-1">
                        {[
                            { steps: 0, label: 'Full' },
                            { steps: 16, label: '16' },
                            { steps: 8, label: '8' },
                            { steps: 4, label: '4' },
                            { steps: 2, label: '2 (B&W)' },
                        ].map((b) => (
                            <button
                                key={b.steps}
                                type="button"
                                onClick={() => updateArtwork({ bitDepthSteps: b.steps })}
                                className={`py-1 rounded text-[10px] font-medium border text-center ${
                                    (artwork.bitDepthSteps ?? 0) === b.steps
                                        ? 'bg-primary/10 border-primary text-primary'
                                        : 'border-border text-muted-foreground hover:bg-secondary'
                                }`}
                            >
                                {b.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
