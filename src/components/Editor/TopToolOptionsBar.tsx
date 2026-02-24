'use client';

import { Wand2, Layers, Palette, Type, PenTool, Shapes, Paintbrush, PaintBucket, MousePointer2 } from 'lucide-react';

type ToolOptionAction = {
    label: string;
    tool: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
};

interface TopToolOptionsBarProps {
    activeTool: string;
    onTriggerTool: (tool: string) => void;
    selectOptions?: {
        autoSelectEnabled: boolean;
        selectionMode: 'layer' | 'group';
        showTransformControls: boolean;
    };
    onAutoSelectChange?: (enabled: boolean) => void;
    onSelectionModeChange?: (mode: 'layer' | 'group') => void;
    onTransformControlsChange?: (enabled: boolean) => void;
    paintOptions?: {
        brushPreset: 'Pencil' | 'Spray' | 'Oil' | 'Watercolor';
        size: number;
        hardness: number;
        opacity: number;
        flow: number;
        smoothing: number;
        blendMode: 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
    };
    onPaintPresetChange?: (preset: 'Pencil' | 'Spray' | 'Oil' | 'Watercolor') => void;
    onPaintSizeChange?: (size: number) => void;
    onPaintHardnessChange?: (hardness: number) => void;
    onPaintOpacityChange?: (opacity: number) => void;
    onPaintFlowChange?: (flow: number) => void;
    onPaintSmoothingChange?: (smoothing: number) => void;
    onPaintBlendModeChange?: (mode: 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten') => void;
    penOptions?: {
        mode: 'path' | 'shape';
        pathOperation: 'add' | 'subtract' | 'intersect';
        autoAddDelete: boolean;
        rubberBand: boolean;
    };
    onPenModeChange?: (mode: 'path' | 'shape') => void;
    onPenPathOperationChange?: (operation: 'add' | 'subtract' | 'intersect') => void;
    onPenAutoAddDeleteChange?: (enabled: boolean) => void;
    onPenRubberBandChange?: (enabled: boolean) => void;
    textOptions?: {
        fontFamily: string;
        fontFamilies: string[];
        fontStyle: string;
        fontStyles: string[];
    };
    onTextFontFamilyChange?: (fontFamily: string) => void;
    onTextFontStyleChange?: (fontStyle: string) => void;
}

const TOOL_ACTIONS: Record<string, ToolOptionAction[]> = {
    select: [
        { label: 'Open Layers', tool: 'layers', icon: Layers },
        { label: 'Adjustments', tool: 'adjustments', icon: Wand2 },
        { label: 'Color Wheel', tool: 'color-wheel', icon: Palette },
    ],
    text: [
        { label: 'Text Tool', tool: 'text', icon: Type },
        { label: 'Pen Tool', tool: 'pen', icon: PenTool },
        { label: 'Shapes Tool', tool: 'shapes', icon: Shapes },
    ],
    paint: [
        { label: 'Paint Tool', tool: 'paint', icon: Paintbrush },
        { label: 'Gradient Tool', tool: 'gradient', icon: PaintBucket },
        { label: 'Color Wheel', tool: 'color-wheel', icon: Palette },
    ],
    pen: [
        { label: 'Pen Tool', tool: 'pen', icon: PenTool },
        { label: 'Select Tool', tool: 'select', icon: MousePointer2 },
        { label: 'Shapes Tool', tool: 'shapes', icon: Shapes },
    ],
    gradient: [
        { label: 'Gradient Tool', tool: 'gradient', icon: PaintBucket },
        { label: 'Paint Tool', tool: 'paint', icon: Paintbrush },
        { label: 'Color Wheel', tool: 'color-wheel', icon: Palette },
    ],
    shapes: [
        { label: 'Shapes Tool', tool: 'shapes', icon: Shapes },
        { label: 'Text Tool', tool: 'text', icon: Type },
        { label: 'Gradient Tool', tool: 'gradient', icon: PaintBucket },
    ],
};

const FALLBACK_ACTIONS: ToolOptionAction[] = [
    { label: 'Select Tool', tool: 'select', icon: MousePointer2 },
    { label: 'Open Layers', tool: 'layers', icon: Layers },
    { label: 'Color Wheel', tool: 'color-wheel', icon: Palette },
];

export default function TopToolOptionsBar({
    activeTool,
    onTriggerTool,
    selectOptions,
    onAutoSelectChange,
    onSelectionModeChange,
    onTransformControlsChange,
    paintOptions,
    onPaintPresetChange,
    onPaintSizeChange,
    onPaintHardnessChange,
    onPaintOpacityChange,
    onPaintFlowChange,
    onPaintSmoothingChange,
    onPaintBlendModeChange,
    penOptions,
    onPenModeChange,
    onPenPathOperationChange,
    onPenAutoAddDeleteChange,
    onPenRubberBandChange,
    textOptions,
    onTextFontFamilyChange,
    onTextFontStyleChange,
}: TopToolOptionsBarProps) {
    const actions = TOOL_ACTIONS[activeTool] || FALLBACK_ACTIONS;

    return (
        <div
            data-testid="top-tool-options-bar"
            className="h-12 border-b border-border/50 bg-card/60 backdrop-blur-sm px-4 flex items-center justify-between gap-4"
        >
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
                    Tool Options
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-secondary text-foreground border border-border/60 truncate">
                    {activeTool || 'select'}
                </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {activeTool === 'select' && selectOptions && (
                    <>
                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={selectOptions.autoSelectEnabled}
                                onChange={(event) => onAutoSelectChange?.(event.target.checked)}
                                aria-label="Auto-Select"
                            />
                            <span>Auto-Select</span>
                        </label>

                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onSelectionModeChange?.('layer')}
                                className={`px-2.5 py-1 text-xs ${selectOptions.selectionMode === 'layer' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Selection mode layer"
                            >
                                Layer
                            </button>
                            <button
                                onClick={() => onSelectionModeChange?.('group')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${selectOptions.selectionMode === 'group' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Selection mode group"
                            >
                                Group
                            </button>
                        </div>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={selectOptions.showTransformControls}
                                onChange={(event) => onTransformControlsChange?.(event.target.checked)}
                                aria-label="Show Transform Controls"
                            />
                            <span>Show Transform Controls</span>
                        </label>
                    </>
                )}

                {activeTool === 'paint' && paintOptions && (
                    <>
                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Preset</span>
                            <select
                                aria-label="Paint preset"
                                value={paintOptions.brushPreset}
                                onChange={(event) => onPaintPresetChange?.(event.target.value as 'Pencil' | 'Spray' | 'Oil' | 'Watercolor')}
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
                )}

                {activeTool === 'pen' && penOptions && (
                    <>
                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onPenModeChange?.('path')}
                                className={`px-2.5 py-1 text-xs ${penOptions.mode === 'path' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen mode path"
                            >
                                Path
                            </button>
                            <button
                                onClick={() => onPenModeChange?.('shape')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.mode === 'shape' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen mode shape"
                            >
                                Shape
                            </button>
                        </div>

                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onPenPathOperationChange?.('add')}
                                className={`px-2.5 py-1 text-xs ${penOptions.pathOperation === 'add' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen operation add"
                            >
                                Add
                            </button>
                            <button
                                onClick={() => onPenPathOperationChange?.('subtract')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.pathOperation === 'subtract' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen operation subtract"
                            >
                                Subtract
                            </button>
                            <button
                                onClick={() => onPenPathOperationChange?.('intersect')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.pathOperation === 'intersect' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen operation intersect"
                            >
                                Intersect
                            </button>
                        </div>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={penOptions.autoAddDelete}
                                onChange={(event) => onPenAutoAddDeleteChange?.(event.target.checked)}
                                aria-label="Pen auto add delete"
                            />
                            <span>Auto Add/Delete</span>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={penOptions.rubberBand}
                                onChange={(event) => onPenRubberBandChange?.(event.target.checked)}
                                aria-label="Pen rubber band"
                            />
                            <span>Rubber Band</span>
                        </label>
                    </>
                )}

                {activeTool === 'text' && textOptions && (
                    <>
                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Font</span>
                            <select
                                aria-label="Text font family"
                                value={textOptions.fontFamily}
                                onChange={(event) => onTextFontFamilyChange?.(event.target.value)}
                                className="bg-transparent outline-none"
                            >
                                {textOptions.fontFamilies.map((font) => (
                                    <option key={font} value={font}>{font}</option>
                                ))}
                            </select>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Style</span>
                            <select
                                aria-label="Text font style"
                                value={textOptions.fontStyle}
                                onChange={(event) => onTextFontStyleChange?.(event.target.value)}
                                className="bg-transparent outline-none"
                            >
                                {textOptions.fontStyles.map((style) => (
                                    <option key={style} value={style}>{style}</option>
                                ))}
                            </select>
                        </label>
                    </>
                )}

                {actions.map((action) => {
                    const Icon = action.icon;
                    return (
                        <button
                            key={`${activeTool}-${action.tool}-${action.label}`}
                            onClick={() => onTriggerTool(action.tool)}
                            className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border border-border/60 bg-secondary/40 hover:bg-secondary transition-colors"
                            aria-label={`Top option: ${action.label}`}
                            title={`Top option: ${action.label}`}
                        >
                            <Icon size={14} className="text-muted-foreground" />
                            <span>{action.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
