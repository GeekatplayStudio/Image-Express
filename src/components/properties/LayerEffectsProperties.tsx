import React from 'react';

interface LayerEffectsPropertiesProps {
    opacity: number;
    blendMode: string;
    visible: boolean;
    onChange: (values: Partial<{ opacity: number; globalCompositeOperation: string; visible: boolean }>) => void;
}

const BLEND_MODES = [
    { value: 'source-over', label: 'Normal' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'screen', label: 'Screen' },
    { value: 'overlay', label: 'Overlay' },
    { value: 'darken', label: 'Darken' },
    { value: 'lighten', label: 'Lighten' },
    { value: 'color-dodge', label: 'Color Dodge' },
    { value: 'color-burn', label: 'Color Burn' },
    { value: 'hard-light', label: 'Hard Light' },
    { value: 'soft-light', label: 'Soft Light' },
    { value: 'difference', label: 'Difference' },
    { value: 'exclusion', label: 'Exclusion' },
    { value: 'hue', label: 'Hue' },
    { value: 'saturation', label: 'Saturation' },
    { value: 'color', label: 'Color' },
    { value: 'luminosity', label: 'Luminosity' },
];

export function LayerEffectsProperties({ opacity, blendMode, visible, onChange }: LayerEffectsPropertiesProps) {
    return (
        <div className="p-4 space-y-4 border-b border-border/50">
            <h3 className="font-medium text-sm">Appearance</h3>
            
            <div className="space-y-3">
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Opacity</span>
                        <span>{Math.round(opacity * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={opacity}
                        onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Blend Mode</label>
                    <select
                        value={blendMode}
                        onChange={(e) => onChange({ globalCompositeOperation: e.target.value })}
                        className="w-full text-xs bg-transparent border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                    >
                        {BLEND_MODES.map((mode) => (
                            <option key={mode.value} value={mode.value}>
                                {mode.label}
                            </option>
                        ))}
                    </select>
                </div>
                
                <div className="flex items-center gap-2 pt-1">
                    <label className="text-xs flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={visible}
                            onChange={(e) => onChange({ visible: e.target.checked })}
                            className="rounded border-border"
                        />
                        <span>Visible</span>
                    </label>
                </div>
            </div>
        </div>
    );
}
