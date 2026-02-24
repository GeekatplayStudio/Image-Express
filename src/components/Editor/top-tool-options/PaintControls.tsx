'use client';

import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';

interface PaintControlsProps {
    paintOptions: {
        brushPreset: RasterBrushPreset;
        size: number;
        hardness: number;
        opacity: number;
        flow: number;
        smoothing: number;
        blendMode: RasterBlendMode;
    };
    onPaintPresetChange?: (preset: RasterBrushPreset) => void;
    onPaintSizeChange?: (size: number) => void;
    onPaintHardnessChange?: (hardness: number) => void;
    onPaintOpacityChange?: (opacity: number) => void;
    onPaintFlowChange?: (flow: number) => void;
    onPaintSmoothingChange?: (smoothing: number) => void;
    onPaintBlendModeChange?: (mode: RasterBlendMode) => void;
}

export default function PaintControls({
    paintOptions,
    onPaintPresetChange,
    onPaintSizeChange,
    onPaintHardnessChange,
    onPaintOpacityChange,
    onPaintFlowChange,
    onPaintSmoothingChange,
    onPaintBlendModeChange,
}: PaintControlsProps) {
    return (
        <>
            <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">Preset</span>
                <select
                    aria-label="Paint preset"
                    value={paintOptions.brushPreset}
                    onChange={(event) => onPaintPresetChange?.(event.target.value as RasterBrushPreset)}
                    className="bg-transparent outline-none"
                >
                    <option value="Pencil">Pencil</option>
                    <option value="Spray">Spray</option>
                    <option value="Oil">Oil</option>
                    <option value="Watercolor">Watercolor</option>
                </select>
            </label>

            <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">Size</span>
                <input
                    aria-label="Paint size"
                    type="range"
                    min={1}
                    max={100}
                    value={paintOptions.size}
                    onChange={(event) => onPaintSizeChange?.(Number(event.target.value))}
                    className="w-20"
                />
                <span>{paintOptions.size}</span>
            </label>

            <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">Hardness</span>
                <input
                    aria-label="Paint hardness"
                    type="range"
                    min={0}
                    max={100}
                    value={paintOptions.hardness}
                    onChange={(event) => onPaintHardnessChange?.(Number(event.target.value))}
                    className="w-20"
                />
                <span>{paintOptions.hardness}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">Opacity</span>
                <input
                    aria-label="Paint opacity"
                    type="range"
                    min={1}
                    max={100}
                    value={paintOptions.opacity}
                    onChange={(event) => onPaintOpacityChange?.(Number(event.target.value))}
                    className="w-20"
                />
                <span>{paintOptions.opacity}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">Flow</span>
                <input
                    aria-label="Paint flow"
                    type="range"
                    min={1}
                    max={100}
                    value={paintOptions.flow}
                    onChange={(event) => onPaintFlowChange?.(Number(event.target.value))}
                    className="w-20"
                />
                <span>{paintOptions.flow}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">Smoothing</span>
                <input
                    aria-label="Paint smoothing"
                    type="range"
                    min={0}
                    max={100}
                    value={paintOptions.smoothing}
                    onChange={(event) => onPaintSmoothingChange?.(Number(event.target.value))}
                    className="w-20"
                />
                <span>{paintOptions.smoothing}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">Blend</span>
                <select
                    aria-label="Paint blend mode"
                    value={paintOptions.blendMode}
                    onChange={(event) => onPaintBlendModeChange?.(event.target.value as 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten')}
                    className="bg-transparent outline-none"
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
    );
}
