import React, { useEffect, useMemo, useState } from 'react';
import { History, Undo2, Redo2, Compass, Info, Palette, Grid3x3, Blend, Brush } from 'lucide-react';
import { AdjustmentLayerType } from '@/types';
import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';
import { APP_THEME } from '@/lib/theme-tokens';
import { ColorWheelTool } from '../ColorWheelTool';


export interface NavigatorSceneRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface HistoryPanelViewProps {
    undoCount: number;
    redoCount: number;
    onUndo?: () => void;
    onRedo?: () => void;
}

interface NavigatorPanelViewProps {
    zoom: number;
    canvasWidth: number;
    canvasHeight: number;
    navigatorWorld?: NavigatorSceneRect;
    navigatorViewport?: NavigatorSceneRect;
    navigatorObjects?: NavigatorSceneRect[];
    navigatorBackground?: string;
    navigatorPreviewDataUrl?: string | null;
    onZoomStep?: (delta: number) => void;
    onResetView?: () => void;
    onNavigate?: (sceneX: number, sceneY: number) => void;
}

interface InfoPanelViewProps {
    activeTool: string;
    zoom: number;
    objectCount: number;
    selectedCount: number;
    canvasWidth: number;
    canvasHeight: number;
}

export type ColorPanelMode = 'RGB' | 'HSB' | 'CMYK' | 'Lab';
type ColorProfileMode = 'sRGB' | 'Adobe RGB' | 'CMYK (Print)';

interface ColorPanelViewProps {
    color: string;
    colorMode: ColorPanelMode;
    hasEditableTarget: boolean;
    onColorModeChange: (mode: ColorPanelMode) => void;
    onColorChange?: (color: string) => void;
}

interface SwatchesPanelViewProps {
    hasEditableTarget: boolean;
    currentColor?: string;
    onApplySwatch?: (color: string) => void;
}

type SwatchGroup = {
    id: string;
    name: string;
    colors: string[];
};

interface BrushesPanelViewProps {
    activeTool: string;
    brushOptions?: {
        brushPreset: RasterBrushPreset;
        size: number;
        hardness: number;
        opacity: number;
        flow: number;
        smoothing: number;
        blendMode: RasterBlendMode;
    };
    onBrushPresetChange?: (preset: RasterBrushPreset) => void;
    onBrushSizeChange?: (size: number) => void;
    onBrushHardnessChange?: (hardness: number) => void;
    onBrushOpacityChange?: (opacity: number) => void;
    onBrushFlowChange?: (flow: number) => void;
    onBrushSmoothingChange?: (smoothing: number) => void;
    onBrushBlendModeChange?: (mode: RasterBlendMode) => void;
    onActivatePaintTool?: () => void;
}

interface AdjustmentsPanelViewProps {
    selectedAdjustmentType?: AdjustmentLayerType | null;
    onCreateAdjustment?: (type: AdjustmentLayerType) => void;
    onSwitchAdjustmentType?: (type: AdjustmentLayerType) => void;
}

interface ComingSoonPanelViewProps {
    title: string;
    description: string;
}

type AdjustmentLauncherItem = {
    label: string;
    type?: AdjustmentLayerType;
    enabled: boolean;
};

const DEFAULT_SWATCHES = [...APP_THEME.utilitySwatches];

const ADJUSTMENT_LAUNCHER_GROUPS: Array<{ title: string; items: AdjustmentLauncherItem[] }> = [
    {
        title: 'Basic',
        items: [
            { label: 'Brightness/Contrast', type: 'brightness-contrast', enabled: true },
            { label: 'Hue/Saturation', type: 'hue-saturation', enabled: true },
            { label: 'Exposure', type: 'exposure', enabled: true },
            { label: 'Vibrance', type: 'saturation-vibrance', enabled: true },
        ]
    },
    {
        title: 'Tonal',
        items: [
            { label: 'Levels', type: 'levels', enabled: true },
            { label: 'Curves', type: 'curves', enabled: true },
            { label: 'Black & White', type: 'black-white', enabled: true },
        ]
    },
    {
        title: 'Color',
        items: [
            { label: 'Color Balance', type: 'color-balance', enabled: true },
            { label: 'Light and Color', type: 'light-and-color', enabled: true },
            { label: 'Solid Color', type: 'solid-color', enabled: true },
        ]
    },
];

const ADJUSTMENT_QUICK_TYPES: AdjustmentLayerType[] = [
    'curves',
    'levels',
    'hue-saturation',
    'exposure',
    'saturation-vibrance',
    'brightness-contrast',
    'color-balance',
    'black-white',
];

const getAdjustmentTypeLabel = (type: AdjustmentLayerType) => {
    if (type === 'curves') return 'Curves';
    if (type === 'levels') return 'Levels';
    if (type === 'saturation-vibrance') return 'Vibrance';
    if (type === 'hue-saturation') return 'Hue/Saturation';
    if (type === 'exposure') return 'Exposure';
    if (type === 'black-white') return 'Black & White';
    if (type === 'brightness-contrast') return 'Brightness/Contrast';
    if (type === 'color-balance') return 'Color Balance';
    if (type === 'light-and-color') return 'Light and Color';
    if (type === 'solid-color') return 'Solid Color';
    return 'Adjustment';
};

const toHexColor = (value: unknown) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (!/^[0-9a-fA-F]{3}$/.test(normalized) && !/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    if (normalized.length === 3) {
        const expanded = normalized.split('').map((char) => `${char}${char}`).join('');
        return `#${expanded}`.toLowerCase();
    }
    return `#${normalized}`.toLowerCase();
};

export function HistoryPanelView({ undoCount, redoCount, onUndo, onRedo }: HistoryPanelViewProps) {
    const canUndo = undoCount >= 2;
    const canRedo = redoCount >= 1;

    return (
        <div className="h-full bg-card overflow-y-auto overflow-x-hidden pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                <History size={14} />
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">History</h2>
            </div>

            <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border/50 bg-secondary/20 p-2">
                        <div className="text-[10px] text-muted-foreground uppercase">Undo Depth</div>
                        <div className="text-sm font-semibold">{Math.max(0, undoCount - 1)}</div>
                    </div>
                    <div className="rounded-md border border-border/50 bg-secondary/20 p-2">
                        <div className="text-[10px] text-muted-foreground uppercase">Redo Depth</div>
                        <div className="text-sm font-semibold">{redoCount}</div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!canUndo || !onUndo}
                        className="flex-1 h-8 rounded-md border border-border/60 bg-background text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/40 transition-colors flex items-center justify-center gap-1"
                        aria-label="History undo"
                    >
                        <Undo2 size={12} />
                        Undo
                    </button>
                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!canRedo || !onRedo}
                        className="flex-1 h-8 rounded-md border border-border/60 bg-background text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/40 transition-colors flex items-center justify-center gap-1"
                        aria-label="History redo"
                    >
                        <Redo2 size={12} />
                        Redo
                    </button>
                </div>

                <div className="text-[11px] text-muted-foreground">
                    Values are bound to the live editor undo/redo stacks.
                </div>
            </div>
        </div>
    );
}

export function ColorPanelView({
    color,
    colorMode,
    hasEditableTarget,
    onColorModeChange,
    onColorChange,
}: ColorPanelViewProps) {
    const [profileMode, setProfileMode] = useState<ColorProfileMode>('sRGB');
    const [previewColor, setPreviewColor] = useState(color);
    const [hasPreviewDraft, setHasPreviewDraft] = useState(false);
    const effectivePreviewColor = hasPreviewDraft ? previewColor : color;

    const normalizeHex = (value: string) => {
        const cleaned = value.replace('#', '').trim();
        if (cleaned.length === 3) {
            const expanded = cleaned.split('').map((token) => `${token}${token}`).join('');
            return `#${expanded}`;
        }
        if (cleaned.length !== 6) return '#000000';
        return `#${cleaned.toLowerCase()}`;
    };

    const hexToRgb = (value: string) => {
        const safe = normalizeHex(value);
        return {
            r: parseInt(safe.slice(1, 3), 16),
            g: parseInt(safe.slice(3, 5), 16),
            b: parseInt(safe.slice(5, 7), 16),
        };
    };

    const rgbToHsv = (r: number, g: number, b: number) => {
        const rn = r / 255;
        const gn = g / 255;
        const bn = b / 255;
        const max = Math.max(rn, gn, bn);
        const min = Math.min(rn, gn, bn);
        const delta = max - min;

        let hue = 0;
        if (delta !== 0) {
            if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
            else if (max === gn) hue = 60 * (((bn - rn) / delta) + 2);
            else hue = 60 * (((rn - gn) / delta) + 4);
        }
        if (hue < 0) hue += 360;

        return {
            h: hue,
            s: max === 0 ? 0 : delta / max,
            b: max,
        };
    };

    const rgbToCmyk = (r: number, g: number, b: number) => {
        const rn = r / 255;
        const gn = g / 255;
        const bn = b / 255;
        const k = 1 - Math.max(rn, gn, bn);
        if (k >= 0.999) return { c: 0, m: 0, y: 0, k: 1 };
        return {
            c: (1 - rn - k) / (1 - k),
            m: (1 - gn - k) / (1 - k),
            y: (1 - bn - k) / (1 - k),
            k,
        };
    };

    const rgbToLab = (r: number, g: number, b: number) => {
        const srgbToLinear = (value: number) => {
            const normalized = value / 255;
            return normalized <= 0.04045
                ? normalized / 12.92
                : Math.pow((normalized + 0.055) / 1.055, 2.4);
        };

        const lr = srgbToLinear(r);
        const lg = srgbToLinear(g);
        const lb = srgbToLinear(b);

        const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
        const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) / 1;
        const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;

        const f = (value: number) => value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + (16 / 116);
        const fx = f(x);
        const fy = f(y);
        const fz = f(z);

        return {
            l: (116 * fy) - 16,
            a: 500 * (fx - fy),
            b: 200 * (fy - fz),
        };
    };

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    const rgbToHex = (r: number, g: number, b: number) => {
        const toHex = (channel: number) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    const hsvToRgb = (h: number, s: number, v: number) => {
        const hh = ((h % 360) + 360) % 360;
        const ss = clamp(s, 0, 1);
        const vv = clamp(v, 0, 1);
        const c = vv * ss;
        const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
        const m = vv - c;

        let rp = 0;
        let gp = 0;
        let bp = 0;

        if (hh < 60) {
            rp = c;
            gp = x;
        } else if (hh < 120) {
            rp = x;
            gp = c;
        } else if (hh < 180) {
            gp = c;
            bp = x;
        } else if (hh < 240) {
            gp = x;
            bp = c;
        } else if (hh < 300) {
            rp = x;
            bp = c;
        } else {
            rp = c;
            bp = x;
        }

        return {
            r: Math.round((rp + m) * 255),
            g: Math.round((gp + m) * 255),
            b: Math.round((bp + m) * 255),
        };
    };

    const cmykToRgb = (c: number, m: number, y: number, k: number) => {
        const cc = clamp(c, 0, 1);
        const mm = clamp(m, 0, 1);
        const yy = clamp(y, 0, 1);
        const kk = clamp(k, 0, 1);
        return {
            r: Math.round(255 * (1 - cc) * (1 - kk)),
            g: Math.round(255 * (1 - mm) * (1 - kk)),
            b: Math.round(255 * (1 - yy) * (1 - kk)),
        };
    };

    const labToRgb = (l: number, a: number, b: number) => {
        const fy = (l + 16) / 116;
        const fx = (a / 500) + fy;
        const fz = fy - (b / 200);

        const fInv = (value: number) => {
            const cube = value ** 3;
            return cube > 0.008856 ? cube : (value - 16 / 116) / 7.787;
        };

        const x = 0.95047 * fInv(fx);
        const y = 1.0 * fInv(fy);
        const z = 1.08883 * fInv(fz);

        const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
        const gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
        const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

        const linearToSrgb = (value: number) => {
            const clamped = clamp(value, 0, 1);
            return clamped <= 0.0031308
                ? clamped * 12.92
                : (1.055 * (clamped ** (1 / 2.4))) - 0.055;
        };

        return {
            r: Math.round(linearToSrgb(rl) * 255),
            g: Math.round(linearToSrgb(gl) * 255),
            b: Math.round(linearToSrgb(bl) * 255),
        };
    };

    const baseRgb = hexToRgb(effectivePreviewColor || '#000000');
    const rgb = (() => {
        if (profileMode === 'sRGB') {
            return baseRgb;
        }

        if (profileMode === 'Adobe RGB') {
            const boosted = rgbToHsv(baseRgb.r, baseRgb.g, baseRgb.b);
            return hsvToRgb(boosted.h, clamp(boosted.s * 1.1, 0, 1), clamp(boosted.b * 0.98, 0, 1));
        }

        const printCmyk = rgbToCmyk(baseRgb.r, baseRgb.g, baseRgb.b);
        return cmykToRgb(
            Math.round(printCmyk.c * 100) / 100,
            Math.round(printCmyk.m * 100) / 100,
            Math.round(printCmyk.y * 100) / 100,
            Math.round(printCmyk.k * 100) / 100,
        );
    })();
    const hsb = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
    const lab = rgbToLab(rgb.r, rgb.g, rgb.b);

    const profileHint = profileMode === 'sRGB'
        ? 'Web standard profile for display work'
        : profileMode === 'Adobe RGB'
            ? 'Wider-gamut display profile preview'
            : 'Print-oriented CMYK preview values';

    const applyColorHex = (nextHex: string) => {
        const normalized = normalizeHex(nextHex);
        setPreviewColor(normalized);
        if (hasEditableTarget) {
            onColorChange?.(normalized);
            setHasPreviewDraft(false);
            return;
        }
        setHasPreviewDraft(true);
    };

    const applyRgbColor = (nextR: number, nextG: number, nextB: number) => {
        applyColorHex(rgbToHex(nextR, nextG, nextB));
    };

    const editableFields = colorMode === 'RGB'
        ? [
            {
                label: 'R', value: rgb.r, min: 0, max: 255, step: 1, onChange: (next: number) => applyRgbColor(next, rgb.g, rgb.b)
            },
            {
                label: 'G', value: rgb.g, min: 0, max: 255, step: 1, onChange: (next: number) => applyRgbColor(rgb.r, next, rgb.b)
            },
            {
                label: 'B', value: rgb.b, min: 0, max: 255, step: 1, onChange: (next: number) => applyRgbColor(rgb.r, rgb.g, next)
            },
        ]
        : colorMode === 'HSB'
            ? [
                {
                    label: 'H', value: Math.round(hsb.h), min: 0, max: 360, step: 1, onChange: (next: number) => {
                        const nextRgb = hsvToRgb(next, hsb.s, hsb.b);
                        applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                    }
                },
                {
                    label: 'S', value: Math.round(hsb.s * 100), min: 0, max: 100, step: 1, onChange: (next: number) => {
                        const nextRgb = hsvToRgb(hsb.h, next / 100, hsb.b);
                        applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                    }
                },
                {
                    label: 'B', value: Math.round(hsb.b * 100), min: 0, max: 100, step: 1, onChange: (next: number) => {
                        const nextRgb = hsvToRgb(hsb.h, hsb.s, next / 100);
                        applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                    }
                },
            ]
            : colorMode === 'CMYK'
                ? [
                    {
                        label: 'C', value: Math.round(cmyk.c * 100), min: 0, max: 100, step: 1, onChange: (next: number) => {
                            const nextRgb = cmykToRgb(next / 100, cmyk.m, cmyk.y, cmyk.k);
                            applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                        }
                    },
                    {
                        label: 'M', value: Math.round(cmyk.m * 100), min: 0, max: 100, step: 1, onChange: (next: number) => {
                            const nextRgb = cmykToRgb(cmyk.c, next / 100, cmyk.y, cmyk.k);
                            applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                        }
                    },
                    {
                        label: 'Y', value: Math.round(cmyk.y * 100), min: 0, max: 100, step: 1, onChange: (next: number) => {
                            const nextRgb = cmykToRgb(cmyk.c, cmyk.m, next / 100, cmyk.k);
                            applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                        }
                    },
                    {
                        label: 'K', value: Math.round(cmyk.k * 100), min: 0, max: 100, step: 1, onChange: (next: number) => {
                            const nextRgb = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, next / 100);
                            applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                        }
                    },
                ]
                : [
                    {
                        label: 'L*', value: Number(lab.l.toFixed(1)), min: 0, max: 100, step: 0.1, onChange: (next: number) => {
                            const nextRgb = labToRgb(next, lab.a, lab.b);
                            applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                        }
                    },
                    {
                        label: 'a*', value: Number(lab.a.toFixed(1)), min: -128, max: 127, step: 0.1, onChange: (next: number) => {
                            const nextRgb = labToRgb(lab.l, next, lab.b);
                            applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                        }
                    },
                    {
                        label: 'b*', value: Number(lab.b.toFixed(1)), min: -128, max: 127, step: 0.1, onChange: (next: number) => {
                            const nextRgb = labToRgb(lab.l, lab.a, next);
                            applyRgbColor(nextRgb.r, nextRgb.g, nextRgb.b);
                        }
                    },
                ];

    return (
        <div className="h-full bg-card overflow-y-auto pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                <Palette size={14} />
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">Color</h2>
            </div>

            <div className="p-4 space-y-3">
                <div className="grid grid-cols-4 gap-1 rounded-md border border-border/50 bg-secondary/20 p-1">
                    {(['RGB', 'HSB', 'CMYK', 'Lab'] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => onColorModeChange(mode)}
                            className={`text-[10px] px-1.5 py-1 rounded transition-colors ${colorMode === mode ? 'bg-background text-foreground shadow-sm border border-border/60' : 'text-muted-foreground hover:bg-secondary/50'}`}
                            aria-label={`Color mode ${mode}`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>

                <div className="rounded-md border border-border/50 bg-secondary/20 p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Color Profile</div>
                        <select
                            value={profileMode}
                            onChange={(event) => setProfileMode(event.target.value as ColorProfileMode)}
                            className="bg-background border border-border rounded px-2 py-1 text-[10px]"
                            aria-label="Color profile"
                        >
                            <option value="sRGB">sRGB</option>
                            <option value="Adobe RGB">Adobe RGB</option>
                            <option value="CMYK (Print)">CMYK (Print)</option>
                        </select>
                    </div>
                    <div className="text-[10px] text-muted-foreground">{profileHint}</div>
                    <div className={`grid gap-1 ${editableFields.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                        {editableFields.map((entry) => (
                            <label key={entry.label} className="rounded border border-border/50 bg-background px-2 py-1 text-center">
                                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{entry.label}</div>
                                <input
                                    type="number"
                                    min={entry.min}
                                    max={entry.max}
                                    step={entry.step}
                                    value={entry.value}
                                    onChange={(event) => {
                                        const next = Number(event.target.value);
                                        if (Number.isNaN(next)) return;
                                        entry.onChange(clamp(next, entry.min, entry.max));
                                    }}
                                    className="mt-0.5 w-full bg-transparent text-center text-[11px] font-medium outline-none"
                                    aria-label={`${colorMode} ${entry.label}`}
                                />
                            </label>
                        ))}
                    </div>
                </div>

                {colorMode !== 'RGB' && (
                    <div className="text-[10px] text-muted-foreground px-1">
                        {colorMode} values reflect the active color profile and can be edited directly.
                    </div>
                )}

                {!hasEditableTarget && (
                    <div className="text-[11px] text-muted-foreground rounded-md border border-border/40 bg-secondary/10 p-2">
                        No editable layer selected: wheel and values update preview only.
                    </div>
                )}

                {hasEditableTarget && hasPreviewDraft && effectivePreviewColor !== color && (
                    <div className="flex gap-2 rounded-md border border-border/40 bg-secondary/10 p-2">
                        <button
                            type="button"
                            onClick={() => {
                                onColorChange?.(effectivePreviewColor);
                                setHasPreviewDraft(false);
                            }}
                            className="h-8 rounded-md border border-border/60 bg-background px-3 text-xs hover:bg-secondary/40"
                        >
                            Apply preview to selected layer
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setPreviewColor(color);
                                setHasPreviewDraft(false);
                            }}
                            className="h-8 rounded-md border border-border/60 bg-background px-3 text-xs hover:bg-secondary/40"
                        >
                            Reset preview
                        </button>
                    </div>
                )}

                <ColorWheelTool
                    variant="panel"
                    selectedColor={effectivePreviewColor}
                    currentPalette={null}
                    onPaletteSelect={() => { }}
                    onColorSelect={(nextColor) => {
                        applyColorHex(nextColor);
                    }}
                />
            </div>
        </div>
    );
}

export function SwatchesPanelView({ hasEditableTarget, currentColor, onApplySwatch }: SwatchesPanelViewProps) {
    const [newGroupName, setNewGroupName] = useState('');
    const [newSwatchHex, setNewSwatchHex] = useState('');
    const [swatchGroups, setSwatchGroups] = useState<SwatchGroup[]>(() => {
        if (typeof window === 'undefined') {
            return [{ id: 'default', name: 'Default', colors: [...DEFAULT_SWATCHES] }];
        }

        const normalizeColors = (colors: unknown[]) => Array.from(new Set(
            colors
                .map((entry) => toHexColor(entry))
                .filter((entry): entry is string => !!entry)
        )).slice(0, 96);

        try {
            const rawGroups = window.localStorage.getItem('swatch-groups-v1');
            if (rawGroups) {
                const parsed = JSON.parse(rawGroups) as Array<{ id?: unknown; name?: unknown; colors?: unknown }>;
                if (Array.isArray(parsed)) {
                    const groups = parsed
                        .filter((entry) => entry && typeof entry.name === 'string' && Array.isArray(entry.colors))
                        .map((entry, index) => ({
                            id: typeof entry.id === 'string' ? entry.id : `group-${Date.now()}-${index}`,
                            name: (entry.name as string).trim() || `Group ${index + 1}`,
                            colors: normalizeColors(entry.colors as unknown[]),
                        }))
                        .filter((group) => group.colors.length > 0);
                    if (groups.length > 0) {
                        return groups;
                    }
                }
            }
        } catch {
            // fallback below
        }

        try {
            const legacyRaw = window.localStorage.getItem('userParams.palettes');
            if (legacyRaw) {
                const parsedLegacy = JSON.parse(legacyRaw) as Array<{ name?: unknown; colors?: unknown }>;
                if (Array.isArray(parsedLegacy)) {
                    const groups = parsedLegacy
                        .filter((entry) => Array.isArray(entry.colors))
                        .map((entry, index) => ({
                            id: `legacy-${index}`,
                            name: typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name : `Palette ${index + 1}`,
                            colors: normalizeColors(entry.colors as unknown[]),
                        }))
                        .filter((group) => group.colors.length > 0);
                    if (groups.length > 0) {
                        return groups;
                    }
                }
            }
        } catch {
            // fallback to default below
        }

        return [{ id: 'default', name: 'Default', colors: [...DEFAULT_SWATCHES] }];
    });

    const [activeGroupId, setActiveGroupId] = useState<string>(() => swatchGroups[0]?.id || 'default');

    const activeGroup = useMemo(
        () => swatchGroups.find((group) => group.id === activeGroupId) || swatchGroups[0],
        [activeGroupId, swatchGroups]
    );

    useEffect(() => {
        if (!activeGroup && swatchGroups.length > 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setActiveGroupId(swatchGroups[0].id);
        }
    }, [activeGroup, swatchGroups]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem('swatch-groups-v1', JSON.stringify(swatchGroups));
        window.localStorage.setItem('userParams.palettes', JSON.stringify(
            swatchGroups.map((group) => ({ name: group.name, colors: group.colors }))
        ));
    }, [swatchGroups]);

    const addGroup = () => {
        const name = newGroupName.trim();
        if (!name) return;
        const next: SwatchGroup = {
            id: `group-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            name,
            colors: [],
        };
        setSwatchGroups((prev) => [next, ...prev]);
        setActiveGroupId(next.id);
        setNewGroupName('');
    };

    const removeGroup = () => {
        if (!activeGroup) return;
        if (swatchGroups.length <= 1) return;
        const remaining = swatchGroups.filter((group) => group.id !== activeGroup.id);
        setSwatchGroups(remaining);
        if (remaining.length > 0) {
            setActiveGroupId(remaining[0].id);
        }
    };

    const addSwatchToActiveGroup = (colorValue?: string) => {
        if (!activeGroup) return;
        const candidate = toHexColor(colorValue ?? newSwatchHex);
        if (!candidate) return;
        setSwatchGroups((prev) => prev.map((group) => {
            if (group.id !== activeGroup.id) return group;
            if (group.colors.includes(candidate)) return group;
            return { ...group, colors: [candidate, ...group.colors].slice(0, 96) };
        }));
        if (!colorValue) setNewSwatchHex('');
    };

    const removeSwatchFromActiveGroup = (colorValue: string) => {
        if (!activeGroup) return;
        setSwatchGroups((prev) => prev.map((group) => {
            if (group.id !== activeGroup.id) return group;
            return { ...group, colors: group.colors.filter((color) => color !== colorValue) };
        }));
    };

    return (
        <div className="h-full bg-card overflow-y-auto pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                <Grid3x3 size={14} />
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">Swatches</h2>
            </div>

            <div className="p-4 space-y-3">
                <div className="rounded-md border border-border/50 bg-secondary/20 p-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Swatch Groups</div>
                    <div className="flex gap-2">
                        <select
                            value={activeGroup?.id ?? ''}
                            onChange={(event) => setActiveGroupId(event.target.value)}
                            className="h-8 flex-1 rounded border border-border/60 bg-background px-2 text-[11px]"
                            aria-label="Active swatch group"
                        >
                            {swatchGroups.map((group) => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={removeGroup}
                            disabled={swatchGroups.length <= 1}
                            className="h-8 rounded border border-border/60 bg-background px-2 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/40"
                        >
                            Remove Group
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newGroupName}
                            onChange={(event) => setNewGroupName(event.target.value)}
                            placeholder="New group name"
                            className="h-8 flex-1 rounded border border-border/60 bg-background px-2 text-[11px]"
                            aria-label="New swatch group name"
                        />
                        <button
                            type="button"
                            onClick={addGroup}
                            className="h-8 rounded border border-border/60 bg-background px-2 text-[10px] hover:bg-secondary/40"
                        >
                            Add Group
                        </button>
                    </div>
                </div>

                {!hasEditableTarget && (
                    <div className="text-[11px] text-muted-foreground rounded-md border border-border/40 bg-secondary/10 p-2">
                        Select a non-image layer to apply swatches.
                    </div>
                )}

                <div className="rounded-md border border-border/50 bg-secondary/20 p-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Manage Swatches</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newSwatchHex}
                            onChange={(event) => setNewSwatchHex(event.target.value)}
                            placeholder="#ff8800"
                            className="h-8 flex-1 rounded border border-border/60 bg-background px-2 text-[11px]"
                            aria-label="Add swatch hex value"
                        />
                        <button
                            type="button"
                            onClick={() => addSwatchToActiveGroup()}
                            className="h-8 rounded border border-border/60 bg-background px-2 text-[10px] hover:bg-secondary/40"
                        >
                            Add Hex
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (currentColor) addSwatchToActiveGroup(currentColor);
                            }}
                            disabled={!currentColor}
                            className="h-8 rounded border border-border/60 bg-background px-2 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/40"
                        >
                            Add Current
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-6 gap-2">
                    {(activeGroup?.colors || []).map((swatch, index) => (
                        <button
                            key={`${swatch}-${index}`}
                            type="button"
                            disabled={!hasEditableTarget || !onApplySwatch}
                            className="group relative h-7 rounded border border-border/50 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 transition-transform"
                            style={{ backgroundColor: swatch }}
                            aria-label={`Swatch ${swatch.toUpperCase()}`}
                            title={swatch.toUpperCase()}
                            onClick={() => onApplySwatch?.(swatch)}
                        >
                            <span
                                role="button"
                                tabIndex={-1}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    removeSwatchFromActiveGroup(swatch);
                                }}
                                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-card text-muted-foreground shadow group-hover:flex"
                                title="Remove swatch"
                            >
                                ×
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function BrushesPanelView({
    activeTool,
    brushOptions,
    onBrushPresetChange,
    onBrushSizeChange,
    onBrushHardnessChange,
    onBrushOpacityChange,
    onBrushFlowChange,
    onBrushSmoothingChange,
    onBrushBlendModeChange,
    onActivatePaintTool,
}: BrushesPanelViewProps) {
    const isPaintToolActive = activeTool === 'paint' || activeTool === 'pen';

    return (
        <div className="h-full bg-card overflow-y-auto pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                <Brush size={14} />
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">Brushes</h2>
                <span className={`ml-auto text-[10px] rounded border px-1.5 py-0.5 ${isPaintToolActive ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600' : 'border-border/50 bg-background text-muted-foreground'}`}>
                    {isPaintToolActive ? 'Live' : 'Idle'}
                </span>
            </div>

            <div className="p-4 space-y-3">
                {!isPaintToolActive && (
                    <div className="rounded-md border border-border/40 bg-secondary/10 p-2 space-y-2">
                        <div className="text-[11px] text-muted-foreground">
                            Brush settings are configured here and fully applied while Paint tool is active.
                        </div>
                        <button
                            type="button"
                            onClick={onActivatePaintTool}
                            disabled={!onActivatePaintTool}
                            className="h-8 px-3 rounded-md border border-border/60 bg-background text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary/40 transition-colors"
                            aria-label="Activate paint tool"
                        >
                            Activate Paint Tool
                        </button>
                    </div>
                )}

                {!brushOptions && (
                    <div className="text-[11px] text-muted-foreground rounded-md border border-border/40 bg-secondary/10 p-2">
                        Brush controls are unavailable in this context.
                    </div>
                )}

                {brushOptions && (
                    <>
                        <label className="block rounded-md border border-border/60 bg-secondary/20 px-2 py-2 text-xs">
                            <span className="text-muted-foreground">Preset</span>
                            <select
                                aria-label="Brushes preset"
                                value={brushOptions.brushPreset}
                                onChange={(event) => onBrushPresetChange?.(event.target.value as RasterBrushPreset)}
                                className="mt-1 w-full bg-transparent outline-none"
                            >
                                <option value="Pencil">Pencil</option>
                                <option value="Spray">Spray</option>
                                <option value="Oil">Oil</option>
                                <option value="Watercolor">Watercolor</option>
                            </select>
                        </label>

                        <label className="block rounded-md border border-border/60 bg-secondary/20 px-2 py-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Size</span>
                                <span>{brushOptions.size}</span>
                            </div>
                            <input
                                aria-label="Brushes size"
                                type="range"
                                min={1}
                                max={100}
                                value={brushOptions.size}
                                onChange={(event) => onBrushSizeChange?.(Number(event.target.value))}
                                className="mt-1 w-full"
                            />
                        </label>

                        <label className="block rounded-md border border-border/60 bg-secondary/20 px-2 py-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Hardness</span>
                                <span>{brushOptions.hardness}%</span>
                            </div>
                            <input
                                aria-label="Brushes hardness"
                                type="range"
                                min={0}
                                max={100}
                                value={brushOptions.hardness}
                                onChange={(event) => onBrushHardnessChange?.(Number(event.target.value))}
                                className="mt-1 w-full"
                            />
                        </label>

                        <label className="block rounded-md border border-border/60 bg-secondary/20 px-2 py-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Opacity</span>
                                <span>{brushOptions.opacity}%</span>
                            </div>
                            <input
                                aria-label="Brushes opacity"
                                type="range"
                                min={1}
                                max={100}
                                value={brushOptions.opacity}
                                onChange={(event) => onBrushOpacityChange?.(Number(event.target.value))}
                                className="mt-1 w-full"
                            />
                        </label>

                        <label className="block rounded-md border border-border/60 bg-secondary/20 px-2 py-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Flow</span>
                                <span>{brushOptions.flow}%</span>
                            </div>
                            <input
                                aria-label="Brushes flow"
                                type="range"
                                min={1}
                                max={100}
                                value={brushOptions.flow}
                                onChange={(event) => onBrushFlowChange?.(Number(event.target.value))}
                                className="mt-1 w-full"
                            />
                        </label>

                        <label className="block rounded-md border border-border/60 bg-secondary/20 px-2 py-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Smoothing</span>
                                <span>{brushOptions.smoothing}%</span>
                            </div>
                            <input
                                aria-label="Brushes smoothing"
                                type="range"
                                min={0}
                                max={100}
                                value={brushOptions.smoothing}
                                onChange={(event) => onBrushSmoothingChange?.(Number(event.target.value))}
                                className="mt-1 w-full"
                            />
                        </label>

                        <label className="block rounded-md border border-border/60 bg-secondary/20 px-2 py-2 text-xs">
                            <span className="text-muted-foreground">Blend</span>
                            <select
                                aria-label="Brushes blend mode"
                                value={brushOptions.blendMode}
                                onChange={(event) => onBrushBlendModeChange?.(event.target.value as 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten')}
                                className="mt-1 w-full bg-transparent outline-none"
                            >
                                <option value="source-over">Normal</option>
                                <option value="multiply">Multiply</option>
                                <option value="screen">Screen</option>
                                <option value="overlay">Overlay</option>
                                <option value="darken">Darken</option>
                                <option value="lighten">Lighten</option>
                            </select>
                        </label>
                    </>
                )}
            </div>
        </div>
    );
}

export function AdjustmentsPanelView({
    selectedAdjustmentType,
    onCreateAdjustment,
    onSwitchAdjustmentType,
}: AdjustmentsPanelViewProps) {
    return (
        <div className="h-full bg-card overflow-y-auto pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                <Blend size={14} />
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">Adjustments</h2>
            </div>

            <div className="p-4 space-y-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Create layer</div>
                {ADJUSTMENT_LAUNCHER_GROUPS.map((group) => (
                    <div key={group.title} className="space-y-1">
                        <div className="text-[10px] text-muted-foreground">{group.title}</div>
                        <div className="space-y-1">
                            {group.items.map((item) => {
                                const isInteractive = item.enabled && !!item.type && !!onCreateAdjustment;
                                return (
                                    <button
                                        key={`${group.title}-${item.label}`}
                                        type="button"
                                        disabled={!isInteractive}
                                        className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded border transition-colors ${isInteractive ? 'border-border/50 bg-background/80 text-foreground hover:bg-background' : 'border-border/30 bg-background/40 text-muted-foreground/70 cursor-not-allowed'}`}
                                        onClick={() => {
                                            if (!isInteractive || !item.type) return;
                                            onCreateAdjustment?.(item.type);
                                        }}
                                        aria-label={`Create adjustment ${item.label}`}
                                    >
                                        {item.label}
                                        {!item.enabled ? ' (Soon)' : ''}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {selectedAdjustmentType && onSwitchAdjustmentType && (
                    <div className="space-y-2 pt-2 border-t border-border/40">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                            Change selected layer type
                        </div>
                        <div className="space-y-1">
                            {ADJUSTMENT_QUICK_TYPES.map((type) => {
                                const active = type === selectedAdjustmentType;
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => onSwitchAdjustmentType(type)}
                                        className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded border transition-colors ${active ? 'bg-tool-accent/20 text-tool-accent border-tool-accent/40' : 'border-border/50 bg-background/80 text-foreground hover:bg-background'}`}
                                        aria-label={`Quick adjustment ${getAdjustmentTypeLabel(type)}`}
                                    >
                                        {getAdjustmentTypeLabel(type)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export function ComingSoonPanelView({ title, description }: ComingSoonPanelViewProps) {
    return (
        <div className="h-full bg-card overflow-y-auto pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center justify-between gap-2">
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">{title}</h2>
                <span className="text-[10px] rounded border border-border/50 bg-background px-1.5 py-0.5 text-muted-foreground">Soon</span>
            </div>

            <div className="p-4">
                <div className="text-[11px] text-muted-foreground rounded-md border border-border/40 bg-secondary/10 p-2">
                    {description}
                </div>
            </div>
        </div>
    );
}

export function NavigatorPanelView({
    zoom,
    canvasWidth,
    canvasHeight,
    navigatorWorld,
    navigatorViewport,
    navigatorObjects,
    navigatorBackground = '#ffffff',
    navigatorPreviewDataUrl,
    onZoomStep,
    onResetView,
    onNavigate,
}: NavigatorPanelViewProps) {
    const world = navigatorWorld && navigatorWorld.width > 0 && navigatorWorld.height > 0
        ? navigatorWorld
        : { left: 0, top: 0, width: Math.max(1, canvasWidth), height: Math.max(1, canvasHeight) };
    const minimapMaxSize = 180;
    const minimapAspect = world.width / world.height;
    const minimapWidth = minimapAspect >= 1
        ? minimapMaxSize
        : Math.max(56, Math.round(minimapMaxSize * minimapAspect));
    const minimapHeight = minimapAspect >= 1
        ? Math.max(56, Math.round(minimapMaxSize / minimapAspect))
        : minimapMaxSize;

    const clampToPercent = (value: number) => Math.max(0, Math.min(100, value));
    const toMinimapRect = (rect: NavigatorSceneRect) => {
        const x = ((rect.left - world.left) / world.width) * 100;
        const y = ((rect.top - world.top) / world.height) * 100;
        const width = (rect.width / world.width) * 100;
        const height = (rect.height / world.height) * 100;
        return {
            left: `${clampToPercent(x)}%`,
            top: `${clampToPercent(y)}%`,
            width: `${clampToPercent(width)}%`,
            height: `${clampToPercent(height)}%`,
        };
    };

    const viewportRect = navigatorViewport && navigatorViewport.width > 0 && navigatorViewport.height > 0
        ? toMinimapRect(navigatorViewport)
        : {
            left: '0%',
            top: '0%',
            width: '100%',
            height: '100%',
        };

    const previewObjects = (navigatorObjects ?? [])
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .slice(0, 120);

    const handleNavigate = (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!onNavigate) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const relativeX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        const relativeY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
        const sceneX = world.left + (relativeX * world.width);
        const sceneY = world.top + (relativeY * world.height);
        onNavigate(sceneX, sceneY);
    };

    return (
        <div className="h-full bg-card overflow-y-auto pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                <Compass size={14} />
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">Navigator</h2>
            </div>

            <div className="p-4 space-y-3">
                <div className="rounded-md border border-border/50 bg-secondary/20 p-2">
                    <div className="text-[10px] text-muted-foreground uppercase">Zoom</div>
                    <div className="text-sm font-semibold">{Math.round(zoom * 100)}%</div>
                </div>

                <div className="rounded-md border border-border/50 bg-secondary/20 p-2 space-y-2">
                    <div className="text-[10px] text-muted-foreground uppercase">Canvas Preview</div>
                    <div className="w-full flex justify-center">
                        <button
                            type="button"
                            onClick={handleNavigate}
                            className="relative rounded border border-border/60 overflow-hidden bg-background cursor-crosshair"
                            style={{
                                width: `${minimapWidth}px`,
                                height: `${minimapHeight}px`,
                            }}
                            aria-label="Navigator minimap"
                        >
                            <div
                                className="absolute inset-0"
                                style={{ backgroundColor: navigatorBackground }}
                            />
                            {navigatorPreviewDataUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- Navigator uses a generated data URL snapshot.
                                <img
                                    src={navigatorPreviewDataUrl}
                                    alt="Navigator preview"
                                    className="absolute inset-0 h-full w-full object-fill pointer-events-none select-none"
                                    draggable={false}
                                />
                            ) : previewObjects.map((rect, index) => (
                                <div
                                    key={`${rect.left}-${rect.top}-${index}`}
                                    className="absolute rounded-[2px] border border-foreground/30 bg-foreground/15"
                                    style={toMinimapRect(rect)}
                                />
                            ))}
                            <div
                                className="absolute rounded-[2px] border-2 border-tool-accent/80 bg-tool-accent/20 pointer-events-none"
                                style={viewportRect}
                            />
                        </button>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        Click preview to center the viewport.
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => onZoomStep?.(-0.1)}
                        className="flex-1 h-8 rounded-md border border-border/60 bg-background text-xs hover:bg-secondary/40 transition-colors"
                        aria-label="Navigator zoom out"
                    >
                        -10%
                    </button>
                    <button
                        type="button"
                        onClick={() => onZoomStep?.(0.1)}
                        className="flex-1 h-8 rounded-md border border-border/60 bg-background text-xs hover:bg-secondary/40 transition-colors"
                        aria-label="Navigator zoom in"
                    >
                        +10%
                    </button>
                </div>

                <button
                    type="button"
                    onClick={onResetView}
                    className="w-full h-8 rounded-md border border-border/60 bg-background text-xs hover:bg-secondary/40 transition-colors"
                    aria-label="Navigator reset view"
                >
                    Reset View
                </button>

                <div className="text-[11px] text-muted-foreground">
                    Canvas: {Math.round(canvasWidth)} × {Math.round(canvasHeight)}
                </div>
            </div>
        </div>
    );
}

export function InfoPanelView({ activeTool, zoom, objectCount, selectedCount, canvasWidth, canvasHeight }: InfoPanelViewProps) {
    const rows = [
        { label: 'Active Tool', value: activeTool || 'select' },
        { label: 'Zoom', value: `${Math.round(zoom * 100)}%` },
        { label: 'Objects', value: String(objectCount) },
        { label: 'Selected', value: String(selectedCount) },
        { label: 'Canvas W', value: String(Math.round(canvasWidth)) },
        { label: 'Canvas H', value: String(Math.round(canvasHeight)) },
    ];

    return (
        <div className="h-full bg-card overflow-y-auto pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                <Info size={14} />
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">Info</h2>
            </div>

            <div className="p-4 space-y-2">
                {rows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-md border border-border/40 bg-secondary/10 px-2 py-1.5">
                        <span className="text-[10px] uppercase text-muted-foreground">{row.label}</span>
                        <span className="text-xs font-medium">{row.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
