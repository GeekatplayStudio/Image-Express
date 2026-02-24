import React, { useMemo } from 'react';
import { History, Undo2, Redo2, Compass, Info, Palette, Grid3x3, Blend, Brush } from 'lucide-react';
import { AdjustmentLayerType } from '@/types';
import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';
import { ColorPicker } from './ColorPicker';

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

interface ColorPanelViewProps {
    color: string;
    colorMode: ColorPanelMode;
    hasEditableTarget: boolean;
    onColorModeChange: (mode: ColorPanelMode) => void;
    onColorChange?: (color: string) => void;
}

interface SwatchesPanelViewProps {
    hasEditableTarget: boolean;
    onApplySwatch?: (color: string) => void;
}

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

const DEFAULT_SWATCHES = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff',
    '#f97316', '#f43f5e', '#8b5cf6', '#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308',
];

const ADJUSTMENT_LAUNCHER_GROUPS: Array<{ title: string; items: AdjustmentLauncherItem[] }> = [
    {
        title: 'Basic',
        items: [
            { label: 'Brightness/Contrast', type: 'brightness-contrast', enabled: false },
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
            { label: 'Color Balance', type: 'color-balance', enabled: false },
            { label: 'Light and Color', enabled: false },
            { label: 'Solid Color', enabled: false },
        ]
    },
];

const ADJUSTMENT_QUICK_TYPES: AdjustmentLayerType[] = [
    'curves',
    'levels',
    'hue-saturation',
    'exposure',
    'saturation-vibrance',
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
        <div className="h-full bg-card overflow-y-auto pr-12">
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

                {colorMode !== 'RGB' && (
                    <div className="text-[10px] text-muted-foreground px-1">
                        {colorMode} mode is routed through the existing fill mutation pipeline.
                    </div>
                )}

                {!hasEditableTarget && (
                    <div className="text-[11px] text-muted-foreground rounded-md border border-border/40 bg-secondary/10 p-2">
                        Select a non-image layer to apply fill color from this panel.
                    </div>
                )}

                <ColorPicker
                    color={color}
                    onChange={(nextColor) => {
                        if (!hasEditableTarget) return;
                        onColorChange?.(nextColor);
                    }}
                    label="Fill color"
                />
            </div>
        </div>
    );
}

export function SwatchesPanelView({ hasEditableTarget, onApplySwatch }: SwatchesPanelViewProps) {
    const displaySwatches = useMemo(() => {
        if (typeof window === 'undefined') return DEFAULT_SWATCHES;
        const raw = window.localStorage.getItem('userParams.palettes');
        if (!raw) return DEFAULT_SWATCHES;
        try {
            const parsed = JSON.parse(raw) as Array<{ colors?: unknown }>;
            const extracted = parsed.flatMap((palette) => Array.isArray(palette.colors) ? palette.colors : []);
            const normalized = extracted
                .map((color) => toHexColor(color))
                .filter((color): color is string => !!color);
            const unique = Array.from(new Set(normalized)).slice(0, 48);
            if (unique.length > 0) {
                return unique;
            }
        } catch {
            // Keep defaults when local palette parsing fails.
        }
        return DEFAULT_SWATCHES;
    }, []);

    return (
        <div className="h-full bg-card overflow-y-auto pr-12">
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex items-center gap-2">
                <Grid3x3 size={14} />
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase">Swatches</h2>
            </div>

            <div className="p-4 space-y-3">
                {!hasEditableTarget && (
                    <div className="text-[11px] text-muted-foreground rounded-md border border-border/40 bg-secondary/10 p-2">
                        Select a non-image layer to apply swatches.
                    </div>
                )}

                <div className="grid grid-cols-6 gap-2">
                    {displaySwatches.map((swatch, index) => (
                        <button
                            key={`${swatch}-${index}`}
                            type="button"
                            disabled={!hasEditableTarget || !onApplySwatch}
                            className="h-7 rounded border border-border/50 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 transition-transform"
                            style={{ backgroundColor: swatch }}
                            aria-label={`Swatch ${swatch.toUpperCase()}`}
                            title={swatch.toUpperCase()}
                            onClick={() => onApplySwatch?.(swatch)}
                        />
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
                        <div className="flex flex-wrap gap-1">
                            {group.items.map((item) => {
                                const isInteractive = item.enabled && !!item.type && !!onCreateAdjustment;
                                return (
                                    <button
                                        key={`${group.title}-${item.label}`}
                                        type="button"
                                        disabled={!isInteractive}
                                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${isInteractive ? 'border-border/50 bg-background/80 text-foreground hover:bg-background' : 'border-border/30 bg-background/40 text-muted-foreground/70 cursor-not-allowed'}`}
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
                            Selected layer quick switch
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {ADJUSTMENT_QUICK_TYPES.map((type) => {
                                const active = type === selectedAdjustmentType;
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => onSwitchAdjustmentType(type)}
                                        className={`text-[10px] px-2 py-1 rounded border transition-colors ${active ? 'bg-primary/20 text-primary border-primary/40' : 'border-border/50 bg-background/80 text-foreground hover:bg-background'}`}
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
                            {previewObjects.map((rect, index) => (
                                <div
                                    key={`${rect.left}-${rect.top}-${index}`}
                                    className="absolute rounded-[2px] border border-foreground/30 bg-foreground/15"
                                    style={toMinimapRect(rect)}
                                />
                            ))}
                            <div
                                className="absolute rounded-[2px] border-2 border-primary/80 bg-primary/20 pointer-events-none"
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
