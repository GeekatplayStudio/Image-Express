import React from 'react';
import type { MaskGradientSettings, MaskGradientType } from './maskGradientUtils';

interface LayerEffectsPropertiesProps {
    opacity: number;
    blendMode: string;
    visible: boolean;
    onChange: (values: Partial<{ opacity: number; globalCompositeOperation: string; visible: boolean }>) => void;
    maskGradient?: MaskGradientSettings | null;
    onMaskGradientChange?: (values: Partial<MaskGradientSettings>) => void;
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

export function LayerEffectsProperties({
    opacity,
    blendMode,
    visible,
    onChange,
    maskGradient,
    onMaskGradientChange,
}: LayerEffectsPropertiesProps) {
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
                        className="w-full text-xs bg-background text-foreground border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
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

                {maskGradient && onMaskGradientChange && (
                    <div className="space-y-3 rounded-md border border-border/60 bg-secondary/15 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-medium">Mask Fade</div>
                                <div className="text-[10px] text-muted-foreground">
                                    Add a soft gradient to the attached layer mask.
                                </div>
                            </div>
                            <label className="text-xs flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={maskGradient.enabled}
                                    onChange={(event) => onMaskGradientChange({ enabled: event.target.checked })}
                                    aria-label="Enable gradient mask"
                                    className="rounded border-border"
                                />
                                <span>Gradient</span>
                            </label>
                        </div>

                        {maskGradient.enabled && (
                            <>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Fade Type</label>
                                    <select
                                        value={maskGradient.type}
                                        onChange={(event) => onMaskGradientChange({ type: event.target.value as MaskGradientType })}
                                        aria-label="Mask gradient type"
                                        className="w-full text-xs bg-background text-foreground border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="linear">Linear</option>
                                        <option value="radial">Radial</option>
                                    </select>
                                </div>

                                {maskGradient.type === 'linear' && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>Angle</span>
                                            <span>{Math.round(maskGradient.angle)}°</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="360"
                                            value={maskGradient.angle}
                                            onChange={(event) => onMaskGradientChange({ angle: Number.parseInt(event.target.value, 10) })}
                                            aria-label="Mask gradient angle"
                                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>Start Opacity</span>
                                        <span>{Math.round(maskGradient.startOpacity * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={Math.round(maskGradient.startOpacity * 100)}
                                        onChange={(event) => onMaskGradientChange({ startOpacity: Number.parseInt(event.target.value, 10) / 100 })}
                                        aria-label="Mask gradient start opacity"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>End Opacity</span>
                                        <span>{Math.round(maskGradient.endOpacity * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={Math.round(maskGradient.endOpacity * 100)}
                                        onChange={(event) => onMaskGradientChange({ endOpacity: Number.parseInt(event.target.value, 10) / 100 })}
                                        aria-label="Mask gradient end opacity"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
