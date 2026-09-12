/**
 * 3D Stamp Tool - Artwork Tab
 * Text generator, graphic uploader, borders, and horizontal flip controls.
 */

import React from 'react';
import {
    Sparkles,
    Image as ImageIcon,
    FlipHorizontal,
    Wand2,
    Eye,
    Layers,
} from 'lucide-react';
import {
    StampArtworkConfig,
    StampConfig,
    TextArcMode,
} from '../domain/stampTypes';
import { STAMP_PRESETS } from './StampPresets';
import { StampArtworkLevelsControls } from './StampArtworkLevelsControls';

interface StampArtworkTabProps {
    config: StampConfig;
    updateArtwork: (patch: Partial<StampArtworkConfig>) => void;
    onApplyPreset: (presetId: string) => void;
    onUseCanvasSelection?: () => void;
    handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    imprintDataUrl?: string;
}

const FONT_OPTIONS = [
    'Inter',
    'Montserrat',
    'Playfair Display',
    'Oswald',
    'Pacifico',
];

export default function StampArtworkTab({
    config,
    updateArtwork,
    onApplyPreset,
    onUseCanvasSelection,
    handleFileUpload,
    imprintDataUrl,
}: StampArtworkTabProps) {
    return (
        <div className="space-y-4">
            {/* Preset Quick Select */}
            <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Sparkles size={12} className="text-amber-500" />
                    Starters & Presets
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                    {STAMP_PRESETS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => onApplyPreset(p.id)}
                            className="text-left p-2 rounded-md border border-border/70 hover:bg-secondary/60 hover:border-border transition-colors text-[11px]"
                        >
                            <div className="font-semibold text-foreground truncate">
                                {p.id === 'approved-classic' && 'Approved Stamp'}
                                {p.id === 'confidential-red' && 'Confidential'}
                                {p.id === 'wax-seal-monogram' && 'Ex Libris Wax'}
                                {p.id === 'official-notary-seal' && 'Official Notary'}
                            </div>
                            <div className="text-[10px] text-muted-foreground capitalize">
                                {p.category.replace('-', ' ')}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Mode Selector */}
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-secondary/40 border border-border">
                <button
                    type="button"
                    onClick={() => updateArtwork({ mode: 'text' })}
                    className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                        config.artwork.mode === 'text'
                            ? 'bg-background shadow-xs text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Text Generator
                </button>
                <button
                    type="button"
                    onClick={() => updateArtwork({ mode: 'image' })}
                    className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                        config.artwork.mode === 'image'
                            ? 'bg-background shadow-xs text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    Image / Logo
                </button>
            </div>

            {/* Text Controls */}
            {config.artwork.mode === 'text' && (
                <div className="space-y-3">
                    <div>
                        <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                            Primary Text
                        </label>
                        <input
                            type="text"
                            value={config.artwork.text.primaryText}
                            onChange={(e) =>
                                updateArtwork({
                                    text: { ...config.artwork.text, primaryText: e.target.value },
                                })
                            }
                            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                            placeholder="e.g. APPROVED"
                        />
                    </div>

                    <div>
                        <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                            Secondary Subtext / Bottom Arc
                        </label>
                        <input
                            type="text"
                            value={config.artwork.text.secondaryText}
                            onChange={(e) =>
                                updateArtwork({
                                    text: { ...config.artwork.text, secondaryText: e.target.value },
                                })
                            }
                            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                            placeholder="e.g. OFFICIAL SEAL"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                                Font Family
                            </label>
                            <select
                                value={config.artwork.text.fontFamily}
                                onChange={(e) =>
                                    updateArtwork({
                                        text: { ...config.artwork.text, fontFamily: e.target.value },
                                    })
                                }
                                className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-xs"
                            >
                                {FONT_OPTIONS.map((f) => (
                                    <option key={f} value={f}>
                                        {f}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                                Text Layout
                            </label>
                            <select
                                value={config.artwork.text.arcMode}
                                onChange={(e) =>
                                    updateArtwork({
                                        text: {
                                            ...config.artwork.text,
                                            arcMode: e.target.value as TextArcMode,
                                        },
                                    })
                                }
                                className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-xs"
                            >
                                <option value="straight">Straight</option>
                                <option value="circular-arc">Circular Arc</option>
                                <option value="top-bottom-arc">Top & Bottom Arc</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                            <span>Font Size</span>
                            <span>{config.artwork.text.fontSize}pt</span>
                        </div>
                        <input
                            type="range"
                            min="16"
                            max="64"
                            value={config.artwork.text.fontSize}
                            onChange={(e) =>
                                updateArtwork({
                                    text: {
                                        ...config.artwork.text,
                                        fontSize: Number(e.target.value),
                                    },
                                })
                            }
                            className="w-full accent-primary"
                        />
                    </div>
                </div>
            )}

            {/* Image Controls */}
            {config.artwork.mode === 'image' && (
                <div className="space-y-3">
                    <div>
                        <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                            Upload Stamp Graphic / Logo
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="w-full text-xs text-muted-foreground file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                        />
                    </div>
                    {onUseCanvasSelection && (
                        <button
                            type="button"
                            onClick={onUseCanvasSelection}
                            className="w-full py-1.5 px-3 rounded-md border border-border hover:bg-secondary transition-colors text-xs font-medium flex items-center justify-center gap-1.5 bg-secondary/20"
                            title="Import all visible shapes, text, drawings, and graphics from the active canvas"
                        >
                            <Layers size={13} />
                            Grab All Visible Canvas Layers
                        </button>
                    )}

                    {/* Side-by-Side Real-Time Preview: Uploaded Image vs Processed Stencil */}
                    {config.artwork.imageUrl && (
                        <div className="p-2.5 rounded-lg border border-border/80 bg-secondary/25 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground text-[11px]">
                                    Graphic Previews (Real-Time)
                                </span>
                                <span className="text-[9px] text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                    Live Sync
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {/* 1. Original Upload Thumbnail */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                                        <ImageIcon size={11} />
                                        1. Uploaded
                                    </span>
                                    <div
                                        className="h-28 rounded-lg overflow-hidden border border-border/60 bg-zinc-950 flex items-center justify-center p-1 relative shadow-inner"
                                        style={{
                                            backgroundImage:
                                                'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
                                            backgroundSize: '12px 12px',
                                            backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
                                        }}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={config.artwork.imageUrl}
                                            alt="Original uploaded graphic"
                                            className="max-h-full max-w-full object-contain pointer-events-none"
                                        />
                                    </div>
                                </div>

                                {/* 2. Processed Stamp Stencil Thumbnail */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-medium text-primary flex items-center gap-1">
                                        <Eye size={11} />
                                        2. Stencil Die
                                    </span>
                                    <div
                                        className="h-28 rounded-lg overflow-hidden border border-primary/40 bg-white flex items-center justify-center p-1 relative shadow-inner"
                                        style={{
                                            backgroundImage:
                                                'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                                            backgroundSize: '12px 12px',
                                            backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
                                        }}
                                    >
                                        {imprintDataUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                                src={imprintDataUrl}
                                                alt="Processed stamp stencil"
                                                className="max-h-full max-w-full object-contain pointer-events-none filter drop-shadow-xs"
                                            />
                                        ) : (
                                            <span className="text-[10px] text-zinc-400">Processing...</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Ink Polarity & Detection */}
                            <div className="pt-1.5 border-t border-border/50 space-y-1.5">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-muted-foreground font-medium">Ink Contrast Mode:</span>
                                    <span className="font-mono text-foreground font-semibold">
                                        {(config.artwork.imageInversion ?? 'auto') === 'auto'
                                            ? 'Auto-Detect'
                                            : config.artwork.imageInversion === 'dark-ink'
                                            ? 'Dark Ink'
                                            : 'Light Ink'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                    {(
                                        [
                                            { id: 'auto', label: 'Auto Detect' },
                                            { id: 'dark-ink', label: 'Dark on Light' },
                                            { id: 'light-ink', label: 'Light on Dark' },
                                        ] as const
                                    ).map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => updateArtwork({ imageInversion: opt.id })}
                                            className={`py-1 px-1 rounded text-[10px] font-medium border text-center transition-colors ${
                                                (config.artwork.imageInversion ?? 'auto') === opt.id
                                                    ? 'bg-primary/10 border-primary text-primary font-semibold'
                                                    : 'border-border text-muted-foreground hover:bg-secondary'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Vector Smoothing & Contour Refinement */}
                            <div className="p-2 rounded-md bg-secondary/40 border border-border/60 space-y-2">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-1.5">
                                        <Wand2 size={12} className="text-amber-400" />
                                        <span className="text-[10px] font-semibold text-foreground">
                                            Vector Smoothing & Contour Refinement
                                        </span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={config.artwork.vectorSmoothing ?? true}
                                        onChange={(e) => updateArtwork({ vectorSmoothing: e.target.checked })}
                                        className="rounded accent-primary"
                                    />
                                </label>

                                {(config.artwork.vectorSmoothing ?? true) && (
                                    <div className="space-y-1.5 pt-1 border-t border-border/40">
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>Anti-Step Smoothness (Diagonals & Circles):</span>
                                            <span className="font-mono text-primary font-bold">
                                                {(config.artwork.smoothRadius ?? 1.6).toFixed(1)} px
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.8"
                                            max="3.5"
                                            step="0.1"
                                            value={config.artwork.smoothRadius ?? 1.6}
                                            onChange={(e) =>
                                                updateArtwork({ smoothRadius: Number(e.target.value) })
                                            }
                                            className="w-full accent-primary"
                                        />
                                        <div className="grid grid-cols-3 gap-1">
                                            {[
                                                { label: 'Crisp (1.0px)', val: 1.0 },
                                                { label: 'Smooth (1.6px)', val: 1.6 },
                                                { label: 'Ultra (2.5px)', val: 2.5 },
                                            ].map((p) => (
                                                <button
                                                    key={p.label}
                                                    type="button"
                                                    onClick={() => updateArtwork({ smoothRadius: p.val })}
                                                    className={`py-0.5 rounded text-[9px] font-medium border text-center transition-colors ${
                                                        Math.abs((config.artwork.smoothRadius ?? 1.6) - p.val) < 0.15
                                                            ? 'bg-primary/15 border-primary text-primary font-semibold'
                                                            : 'border-border text-muted-foreground hover:bg-secondary'
                                                    }`}
                                                >
                                                    {p.label}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-[9px] text-muted-foreground leading-tight">
                                            Calculates mathematical distance-field curves to eliminate staircase steps on diagonal strokes and circular arcs.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <StampArtworkLevelsControls
                        artwork={config.artwork}
                        updateArtwork={updateArtwork}
                        showImageThreshold={true}
                    />
                </div>
            )}

            {config.artwork.mode !== 'image' && (
                <StampArtworkLevelsControls
                    artwork={config.artwork}
                    updateArtwork={updateArtwork}
                    showImageThreshold={false}
                />
            )}

            {/* Border Styling */}
            <div className="space-y-2 pt-2 border-t border-border/60">
                <label className="text-[11px] font-medium text-muted-foreground block">
                    Border Rim
                </label>
                <div className="grid grid-cols-4 gap-1">
                    {(['none', 'single', 'double', 'coin-beaded'] as const).map((style) => (
                        <button
                            key={style}
                            type="button"
                            onClick={() => updateArtwork({ borderStyle: style })}
                            className={`py-1 rounded text-[11px] font-medium border capitalize ${
                                config.artwork.borderStyle === style
                                    ? 'bg-primary/10 border-primary text-primary'
                                    : 'border-border text-muted-foreground hover:bg-secondary'
                            }`}
                        >
                            {style.replace('-', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Physical Orientation & Mechanics */}
            <div className="space-y-2.5 pt-2 border-t border-border/60">
                <label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                    <FlipHorizontal size={13} className="text-primary" />
                    Physical Stamp Optics
                </label>

                <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md bg-secondary/30 border border-border/60">
                    <input
                        type="checkbox"
                        checked={config.artwork.flipHorizontal}
                        onChange={(e) => updateArtwork({ flipHorizontal: e.target.checked })}
                        className="mt-0.5 rounded accent-primary"
                    />
                    <div>
                        <div className="font-semibold text-foreground text-[11px]">
                            Flip Horizontally (Mirror for Stamping)
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-tight">
                            Enabled by default. Physical stamp dies must be mirrored so the imprint reads correctly from left to right.
                        </div>
                    </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md bg-secondary/30 border border-border/60">
                    <input
                        type="checkbox"
                        checked={config.artwork.invertRelief}
                        onChange={(e) => updateArtwork({ invertRelief: e.target.checked })}
                        className="mt-0.5 rounded accent-primary"
                    />
                    <div>
                        <div className="font-semibold text-foreground text-[11px]">
                            Invert Relief (Deboss / Wax Seal Engraving)
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-tight">
                            Normal raises text (emboss for ink stamps); Inverted engraves text (deboss for wax seals).
                        </div>
                    </div>
                </label>
            </div>
        </div>
    );
}
