/**
 * 3D Stamp Tool - Controls Sidebar
 * Tabbed controls for customizing Artwork, Podium, Handle, Extrusion, and 3D Export.
 */

import React, { useState } from 'react';
import {
    Type,
    Image as ImageIcon,
    Box,
    Layers,
    Sliders,
    Download,
    Sparkles,
    FlipHorizontal,
    ArrowDownUp,
    Shield,
} from 'lucide-react';
import {
    ArtworkInputMode,
    HandleStyle,
    PodiumShape,
    StampArtworkConfig,
    StampConfig,
    StampExportFormat,
    StampExportTarget,
    TextArcMode,
} from '../domain/stampTypes';
import { STAMP_PRESETS } from './StampPresets';

interface StampControlsProps {
    config: StampConfig;
    onChange: (updated: StampConfig) => void;
    onExport: (format: StampExportFormat, target: StampExportTarget) => void;
    onApplyPreset: (presetId: string) => void;
    onUseCanvasSelection?: () => void;
    isExporting: boolean;
}

type TabKey = 'artwork' | 'structure' | 'relief' | 'export';

const FONT_OPTIONS = [
    'Inter',
    'Montserrat',
    'Playfair Display',
    'Oswald',
    'Pacifico',
];

export default function StampControls({
    config,
    onChange,
    onExport,
    onApplyPreset,
    onUseCanvasSelection,
    isExporting,
}: StampControlsProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('artwork');
    const [exportFormat, setExportFormat] = useState<StampExportFormat>('stl-binary');
    const [exportTarget, setExportTarget] = useState<StampExportTarget>('complete');

    const updateArtwork = (patch: Partial<StampArtworkConfig>) => {
        onChange({
            ...config,
            artwork: { ...config.artwork, ...patch },
        });
    };

    const updateDimensions = (patch: Partial<StampConfig['dimensions']>) => {
        onChange({
            ...config,
            dimensions: { ...config.dimensions, ...patch },
        });
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            updateArtwork({ mode: 'image', imageUrl: dataUrl });
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col h-full bg-card border-l border-border text-xs select-none">
            {/* Tab Headers */}
            <div className="grid grid-cols-4 border-b border-border text-center font-medium">
                <button
                    type="button"
                    onClick={() => setActiveTab('artwork')}
                    className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        activeTab === 'artwork'
                            ? 'border-primary text-foreground font-semibold bg-secondary/30'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Type size={13} />
                    Artwork
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('structure')}
                    className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        activeTab === 'structure'
                            ? 'border-primary text-foreground font-semibold bg-secondary/30'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Box size={13} />
                    Podium
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('relief')}
                    className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        activeTab === 'relief'
                            ? 'border-primary text-foreground font-semibold bg-secondary/30'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Layers size={13} />
                    Relief
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('export')}
                    className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        activeTab === 'export'
                            ? 'border-primary text-foreground font-semibold bg-secondary/30'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Download size={13} />
                    Export
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 1. ARTWORK TAB */}
                {activeTab === 'artwork' && (
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
                                        Upload Stamp Graphic
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
                                        className="w-full py-1.5 px-3 rounded-md border border-border hover:bg-secondary transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
                                    >
                                        <ImageIcon size={13} />
                                        Grab From Active Canvas Selection
                                    </button>
                                )}
                            </div>
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
                )}

                {/* 2. STRUCTURE TAB */}
                {activeTab === 'structure' && (
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
                                                podiumShape: t.id === 'wax-seal' ? 'circular' : config.podiumShape,
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
                                        onClick={() => onChange({ ...config, podiumShape: s.id })}
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
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] text-muted-foreground block mb-1">
                                    Width / Diameter (mm)
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
                                <label className="text-[11px] font-medium text-muted-foreground block">
                                    Handle Style
                                </label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {(
                                        [
                                            { id: 'classic-wood', label: 'Classic Turned Wood' },
                                            { id: 'wax-seal-turned', label: 'Wax Seal Turned' },
                                            { id: 'desk-knob', label: 'Modern Desk Knob' },
                                            { id: 'none', label: 'No Handle' },
                                        ] as const
                                    ).map((h) => (
                                        <button
                                            key={h.id}
                                            type="button"
                                            onClick={() => onChange({ ...config, handleStyle: h.id })}
                                            className={`p-2 rounded-md text-[11px] font-medium border text-left ${
                                                config.handleStyle === h.id
                                                    ? 'bg-primary/10 border-primary text-primary'
                                                    : 'border-border text-muted-foreground hover:bg-secondary'
                                            }`}
                                        >
                                            {h.label}
                                        </button>
                                    ))}
                                </div>

                                {config.handleStyle !== 'none' && (
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
                )}

                {/* 3. RELIEF & EXTRUSION TAB */}
                {activeTab === 'relief' && (
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
                    </div>
                )}

                {/* 4. EXPORT TAB */}
                {activeTab === 'export' && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                                Export Target
                            </label>
                            <div className="space-y-1.5">
                                {(
                                    [
                                        {
                                            id: 'complete',
                                            label: 'Complete Stamp Assembly',
                                            desc: 'Handle + Backing Podium + Extruded Die',
                                        },
                                        {
                                            id: 'die-plate',
                                            label: 'Die Plate Only (No Handle)',
                                            desc: 'Ideal for mounting on existing handles or dual-material prints',
                                        },
                                        {
                                            id: 'handle',
                                            label: 'Handle Only',
                                            desc: 'Print the turned handle separately',
                                        },
                                    ] as const
                                ).map((t) => (
                                    <label
                                        key={t.id}
                                        className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer ${
                                            exportTarget === t.id
                                                ? 'bg-primary/10 border-primary'
                                                : 'border-border hover:bg-secondary/40'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="exportTarget"
                                            value={t.id}
                                            checked={exportTarget === t.id}
                                            onChange={() => setExportTarget(t.id)}
                                            className="mt-0.5 accent-primary"
                                        />
                                        <div>
                                            <div className="font-semibold text-foreground text-[11px]">
                                                {t.label}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                                3D File Format
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {(
                                    [
                                        {
                                            id: 'stl-binary',
                                            label: 'STL (Binary)',
                                            badge: 'Recommended for 3D Slicers',
                                        },
                                        { id: 'stl-ascii', label: 'STL (ASCII)', badge: 'Standard CAD' },
                                        { id: 'obj', label: 'Wavefront OBJ', badge: 'Mesh + Normals' },
                                        { id: 'glb', label: 'GLTF / GLB', badge: 'PBR Colors & Materials' },
                                    ] as const
                                ).map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => setExportFormat(f.id)}
                                        className={`p-2 rounded-md border text-left ${
                                            exportFormat === f.id
                                                ? 'bg-primary/10 border-primary text-primary'
                                                : 'border-border text-muted-foreground hover:bg-secondary'
                                        }`}
                                    >
                                        <div className="font-semibold text-foreground text-[11px]">
                                            {f.label}
                                        </div>
                                        <div className="text-[9px] text-muted-foreground">{f.badge}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => onExport(exportFormat, exportTarget)}
                            disabled={isExporting}
                            className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Download size={14} />
                            {isExporting ? 'Generating 3D File...' : `Download ${exportFormat.toUpperCase()}`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
