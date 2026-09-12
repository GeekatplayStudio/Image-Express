/**
 * 3D Stamp Tool - Structure & Relief Tabs
 * Customizes Podium backing, handle ergonomics, and relief extrusion parameters.
 */

import React from 'react';
import {
    HandleStyle,
    StampArtworkConfig,
    StampConfig,
    StampDimensions,
} from '../domain/stampTypes';

interface StampStructureTabProps {
    config: StampConfig;
    onChange: (updated: StampConfig) => void;
    updateDimensions: (patch: Partial<StampDimensions>) => void;
    mode: 'structure' | 'relief';
    updateArtwork?: (patch: Partial<StampArtworkConfig>) => void;
}

export default function StampStructureTab({
    config,
    onChange,
    updateDimensions,
    mode,
    updateArtwork,
}: StampStructureTabProps) {
    if (mode === 'relief') {
        return (
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span className="font-semibold text-foreground">Relief Extrusion Depth</span>
                        <span className="font-mono text-primary font-bold">
                            {config.dimensions.reliefDepthMm} mm
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0.8"
                        max="4.5"
                        step="0.1"
                        value={config.dimensions.reliefDepthMm}
                        onChange={(e) => updateDimensions({ reliefDepthMm: Number(e.target.value) })}
                        className="w-full accent-primary"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Rubber stamps: ~2.0mm. Wax seals: ~1.5mm.
                    </p>
                </div>

                <div>
                    <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Baseplate Thickness</span>
                        <span>{config.dimensions.basePlateThicknessMm} mm</span>
                    </div>
                    <input
                        type="range"
                        min="1.0"
                        max="4.0"
                        step="0.2"
                        value={config.dimensions.basePlateThicknessMm}
                        onChange={(e) =>
                            updateDimensions({ basePlateThicknessMm: Number(e.target.value) })
                        }
                        className="w-full accent-primary"
                    />
                </div>

                <div>
                    <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Draft Angle (Tapered Sidewalls)</span>
                        <span>{config.dimensions.draftAngleDeg}°</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="15"
                        value={config.dimensions.draftAngleDeg}
                        onChange={(e) => updateDimensions({ draftAngleDeg: Number(e.target.value) })}
                        className="w-full accent-primary"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Taper strengthens fine text lines and ensures clean release from rubber molds and hot wax.
                    </p>
                </div>

                {updateArtwork && (
                    <div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                            <span>Edge Smoothing (Anti-Aliasing)</span>
                            <span>{config.artwork.smoothRadius} px</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="3.5"
                            step="0.2"
                            value={config.artwork.smoothRadius}
                            onChange={(e) => updateArtwork({ smoothRadius: Number(e.target.value) })}
                            className="w-full accent-primary"
                        />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Stamp Type
                </label>
                <div className="grid grid-cols-3 gap-1">
                    {(
                        [
                            { id: 'rubber-stamp', label: 'Rubber Stamp' },
                            { id: 'wax-seal', label: 'Wax Seal' },
                            { id: 'die-only', label: 'Die Plate Only' },
                        ] as const
                    ).map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                                onChange({
                                    ...config,
                                    stampType: t.id,
                                    podiumShape: config.podiumShape,
                                    handleStyle:
                                        t.id === 'die-only'
                                            ? 'none'
                                            : t.id === 'wax-seal'
                                            ? 'wax-seal-turned'
                                            : 'classic-wood',
                                });
                            }}
                            className={`py-1.5 px-2 rounded-md text-[11px] font-medium border text-center ${
                                config.stampType === t.id
                                    ? 'bg-primary/10 border-primary text-primary'
                                    : 'border-border text-muted-foreground hover:bg-secondary'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Podium Shape
                </label>
                <div className="grid grid-cols-3 gap-1">
                    {(
                        [
                            { id: 'rectangular', label: 'Rectangular' },
                            { id: 'circular', label: 'Circular' },
                            { id: 'oval', label: 'Oval' },
                        ] as const
                    ).map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                                if (s.id === 'circular') {
                                    const dia = Math.round((config.dimensions.widthMm + config.dimensions.depthMm) / 2);
                                    onChange({
                                        ...config,
                                        podiumShape: 'circular',
                                        dimensions: {
                                            ...config.dimensions,
                                            widthMm: dia,
                                            depthMm: dia,
                                        },
                                    });
                                } else if (s.id === 'oval') {
                                    const d = config.dimensions.depthMm;
                                    let w = config.dimensions.widthMm;
                                    if (w === d) {
                                        w = Math.round(d * 1.35);
                                    }
                                    onChange({
                                        ...config,
                                        podiumShape: 'oval',
                                        dimensions: {
                                            ...config.dimensions,
                                            widthMm: w,
                                            depthMm: d,
                                        },
                                    });
                                } else {
                                    onChange({
                                        ...config,
                                        podiumShape: 'rectangular',
                                    });
                                }
                            }}
                            className={`py-1.5 px-2 rounded-md text-[11px] font-medium border text-center ${
                                config.podiumShape === s.id
                                    ? 'bg-primary/10 border-primary text-primary'
                                    : 'border-border text-muted-foreground hover:bg-secondary'
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Dimensions */}
            {config.podiumShape === 'circular' ? (
                <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                        Diameter (mm)
                    </label>
                    <input
                        type="number"
                        min="20"
                        max="120"
                        value={config.dimensions.widthMm}
                        onChange={(e) => {
                            const val = Number(e.target.value);
                            updateDimensions({ widthMm: val, depthMm: val });
                        }}
                        className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-xs font-mono"
                    />
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">
                            Width (mm)
                        </label>
                        <input
                            type="number"
                            min="20"
                            max="120"
                            value={config.dimensions.widthMm}
                            onChange={(e) => updateDimensions({ widthMm: Number(e.target.value) })}
                            className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-xs font-mono"
                        />
                    </div>
                    <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">
                            Depth / Length (mm)
                        </label>
                        <input
                            type="number"
                            min="20"
                            max="120"
                            value={config.dimensions.depthMm}
                            onChange={(e) => updateDimensions({ depthMm: Number(e.target.value) })}
                            className="w-full px-2 py-1 rounded-md border border-border bg-background text-foreground text-xs font-mono"
                        />
                    </div>
                </div>
            )}

            <div>
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                    <span>Podium Backing Thickness</span>
                    <span>{config.dimensions.podiumThicknessMm} mm</span>
                </div>
                <input
                    type="range"
                    min="3"
                    max="14"
                    step="0.5"
                    value={config.dimensions.podiumThicknessMm}
                    onChange={(e) => updateDimensions({ podiumThicknessMm: Number(e.target.value) })}
                    className="w-full accent-primary"
                />
            </div>

            {/* Handle Style */}
            {config.stampType !== 'die-only' && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-foreground block">
                            Handle Design
                        </label>
                        {config.handleStyle === 'none' && (
                            <span className="text-[10px] text-emerald-500 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Maximum Filament Savings
                            </span>
                        )}
                        {config.handleStyle === 'finger-grip' && (
                            <span className="text-[10px] text-emerald-500 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                ~85% Filament Savings
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {(
                            [
                                { id: 'none', label: 'No Handle (Flat)', badge: 'Save Filament' },
                                { id: 'finger-grip', label: 'Low-Profile Pinch', badge: 'Save Filament' },
                                { id: 'ribbed-peg', label: 'Ribbed Tactile Peg' },
                                { id: 'desk-knob', label: 'Modern Desk Knob' },
                                { id: 'classic-wood', label: 'Classic Turned Wood' },
                                { id: 'wax-seal-turned', label: 'Wax Seal Baluster' },
                                { id: 't-bar', label: 'T-Bar Rocker Handle' },
                            ] as const
                        ).map((h) => (
                            <button
                                key={h.id}
                                type="button"
                                onClick={() => onChange({ ...config, handleStyle: h.id as HandleStyle })}
                                className={`p-2 rounded-md text-[11px] font-medium border text-left flex flex-col justify-between transition-colors ${
                                    config.handleStyle === h.id
                                        ? 'bg-primary/10 border-primary text-primary'
                                        : 'border-border text-muted-foreground hover:bg-secondary'
                                }`}
                            >
                                <span className="font-semibold text-foreground">{h.label}</span>
                                {'badge' in h && h.badge && (
                                    <span className="text-[9px] text-emerald-500 mt-0.5">
                                        ★ {h.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {config.handleStyle !== 'none' && config.handleStyle !== 'finger-grip' && (
                        <div className="pt-1">
                            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                                <span>Handle Height</span>
                                <span>{config.dimensions.handleHeightMm} mm</span>
                            </div>
                            <input
                                type="range"
                                min="25"
                                max="85"
                                value={config.dimensions.handleHeightMm}
                                onChange={(e) =>
                                    updateDimensions({ handleHeightMm: Number(e.target.value) })
                                }
                                className="w-full accent-primary"
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
