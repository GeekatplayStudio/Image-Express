import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { ColorPicker } from './ColorPicker';

export interface ShadowStrokeValues {
    // Stroke (Inside)
    strokeEnabled: boolean;
    strokeColor: string;
    strokeWidth: number;
    strokeOpacity: number;
    strokeBlur?: number;
    strokeBlend?: string;
    
    // Border (Outside) aka PaintFirst=stroke
    borderEnabled: boolean;
    borderColor: string;
    borderWidth: number;
    borderOpacity: number;
    borderBlur?: number;
    borderBlend?: string;

    // Drop Shadow
    shadowEnabled: boolean;
    shadowColor: string;
    shadowBlur: number;
    shadowOpacity: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    shadowBlend?: string;
}

interface ShadowStrokePropertiesProps {
    values: ShadowStrokeValues;
    onValuesChange: (newValues: Partial<ShadowStrokeValues>) => void;
    hideShadows?: boolean;
}

const BLEND_MODES = [
    { label: 'Normal', value: 'normal' },
    { label: 'Multiply', value: 'multiply' },
    { label: 'Screen', value: 'screen' },
    { label: 'Overlay', value: 'overlay' },
    { label: 'Darken', value: 'darken' },
    { label: 'Lighten', value: 'lighten' },
    { label: 'Color Dodge', value: 'color-dodge' },
    { label: 'Color Burn', value: 'color-burn' },
    { label: 'Hard Light', value: 'hard-light' },
    { label: 'Soft Light', value: 'soft-light' },
    { label: 'Difference', value: 'difference' },
    { label: 'Exclusion', value: 'exclusion' },
    { label: 'Hue', value: 'hue' },
    { label: 'Saturation', value: 'saturation' },
    { label: 'Color', value: 'color' },
    { label: 'Luminosity', value: 'luminosity' },
];

const CompactColorPicker = ({ color, onChange }: { color: string, onChange: (val: string) => void, opacity?: number }) => (
    <div className="w-8 shrink-0">
        <ColorPicker color={color} onChange={onChange} label="" />
    </div>
);

const PropertySlider = ({ label, value, min, max, onChange, step = 1, unit = "" }: { label: string, value: number, min: number, max: number, onChange: (val: number) => void, step?: number, unit?: string }) => (
    <div 
        className="flex items-center gap-3 text-xs w-full"
        onClick={(e) => e.stopPropagation()} // Stop propagation here
    >
        <span className="w-12 text-muted-foreground shrink-0 truncate" title={label}>{label}</span>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            onClick={(e) => e.stopPropagation()} // And here, just in case
            className="flex-1 h-1.5 bg-secondary rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="w-8 text-right tabular-nums shrink-0 text-[10px] text-muted-foreground">{Math.round(value)}{unit}</span>
    </div>
);

const BlendModeSelect = ({ value, onChange }: { value?: string, onChange: (val: string) => void }) => (
    <div className="flex items-center gap-3 text-xs w-full">
        <span className="w-12 text-muted-foreground shrink-0">Blend</span>
        <select
            value={value || 'normal'}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 h-6 bg-secondary rounded-md text-[10px] px-2 border-none focus:ring-1 focus:ring-ring"
        >
            {BLEND_MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
            ))}
        </select>
    </div>
);

export function ShadowStrokeProperties({ values, onValuesChange, hideShadows = false }: ShadowStrokePropertiesProps) {
    const [strokeOpen, setStrokeOpen] = useState(false);
    const [borderOpen, setBorderOpen] = useState(false);
    const [shadowOpen, setShadowOpen] = useState(false);

    // Mutual exclusivity handler
    // Updated: Now allows both to be enabled simultaneously in UI state (logic determines rendering)
    const toggleStroke = (enabled: boolean) => {
        onValuesChange({ strokeEnabled: enabled });
        if (enabled) {
            setStrokeOpen(true);
        }
    };

    const toggleBorder = (enabled: boolean) => {
        onValuesChange({ borderEnabled: enabled });
        if (enabled) {
            setBorderOpen(true);
        }
    };

    return (
        <div className="flex flex-col gap-px bg-background text-foreground select-none divide-y divide-border/30">
            
            {/* STROKE SECTION (Inside) */}
            <div className="bg-background">
                <div className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors group">
                    <button 
                         onClick={() => setStrokeOpen(!strokeOpen)}
                         className="flex items-center gap-2 flex-1"
                    >
                        {strokeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stroke</span>
                    </button>
                    <div className="pl-4 pb-1">
                        <Switch
                            checked={values.strokeEnabled}
                            onCheckedChange={toggleStroke}
                        />
                    </div>
                </div>

                {strokeOpen && values.strokeEnabled && (
                    <div className="p-3 pt-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
                        <div className="flex items-start gap-4">
                            <CompactColorPicker 
                                color={values.strokeColor} 
                                onChange={(c) => onValuesChange({ strokeColor: c })} 
                                opacity={values.strokeOpacity}
                            />
                            <div className="flex-1 space-y-2 pt-1">
                                <PropertySlider 
                                    label="Width" 
                                    value={values.strokeWidth} 
                                    min={0} max={100} 
                                    onChange={(v) => onValuesChange({ strokeWidth: v })} 
                                    unit="px"
                                />
                                <PropertySlider 
                                    label="Opacity" 
                                    value={values.strokeOpacity * 100} 
                                    min={0} max={100} 
                                    onChange={(v) => onValuesChange({ strokeOpacity: v / 100 })} 
                                    unit="%"
                                />
                                {/* Stroke Blur Removed as requested */}
                                {/* Stroke Blend Removed as per engine limitations */}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* BORDER SECTION (Outside) */}
            <div className="bg-background">
                <div className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors group">
                    <button 
                        onClick={() => setBorderOpen(!borderOpen)}
                        className="flex items-center gap-2 flex-1"
                    >
                        {borderOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Border</span>
                    </button>
                    <div className="pl-4 pb-1">
                        <Switch
                            checked={values.borderEnabled}
                            onCheckedChange={toggleBorder}
                        />
                    </div>
                </div>

                {borderOpen && values.borderEnabled && (
                     <div className="p-3 pt-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
                        <div className="flex items-start gap-4">
                            <CompactColorPicker 
                                color={values.borderColor} 
                                onChange={(c) => onValuesChange({ borderColor: c })} 
                                opacity={values.borderOpacity}
                            />
                            <div className="flex-1 space-y-2 pt-1">
                                <PropertySlider 
                                    label="Width" 
                                    value={values.borderWidth} 
                                    min={0} max={100} 
                                    onChange={(v) => onValuesChange({ borderWidth: v })} 
                                    unit="px"
                                />
                                <PropertySlider 
                                    label="Opacity" 
                                    value={values.borderOpacity * 100} 
                                    min={0} max={100} 
                                    onChange={(v) => onValuesChange({ borderOpacity: v / 100 })} 
                                    unit="%"
                                />
                                {/* Border Blur Removed as requested */}
                                {/* Border Blend Removed as per engine limitations */}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* DROP SHADOW SECTION */}
            {!hideShadows && (
            <div className="bg-background">
                <div className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors group">
                    <button 
                        onClick={() => setShadowOpen(!shadowOpen)}
                        className="flex items-center gap-2 flex-1"
                    >
                        {shadowOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Drop Shadow</span>
                    </button>
                    <div className="pl-4 pb-1">
                        <Switch
                            checked={values.shadowEnabled}
                            onCheckedChange={(c) => onValuesChange({ shadowEnabled: c })} 
                        />
                    </div>
                </div>

                {shadowOpen && values.shadowEnabled && (
                     <div className="p-3 pt-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
                        <div className="flex items-start gap-4">
                            <CompactColorPicker 
                                color={values.shadowColor} 
                                onChange={(c) => onValuesChange({ shadowColor: c })} 
                                opacity={values.shadowOpacity}
                            />
                            <div className="flex-1 space-y-2 pt-1">
                                <PropertySlider 
                                    label="Blur" 
                                    value={values.shadowBlur} 
                                    min={0} max={150} 
                                    onChange={(v) => onValuesChange({ shadowBlur: v })} 
                                    unit="px"
                                />
                                <PropertySlider 
                                    label="Opacity" 
                                    value={values.shadowOpacity * 100} 
                                    min={0} max={100} 
                                    onChange={(v) => onValuesChange({ shadowOpacity: v / 100 })} 
                                    unit="%"
                                />
                                <BlendModeSelect 
                                    value={values.shadowBlend} 
                                    onChange={(v) => onValuesChange({ shadowBlend: v })} 
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-1 border-t border-border/30 mt-3 pt-3">
                             <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <PropertySlider 
                                        label="Offset X" 
                                        value={values.shadowOffsetX} 
                                        min={-200} max={200} 
                                        onChange={(v) => onValuesChange({ shadowOffsetX: v })} 
                                    />
                                </div>
                             </div>
                             <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <PropertySlider 
                                        label="Offset Y" 
                                        value={values.shadowOffsetY} 
                                        min={-200} max={200} 
                                        onChange={(v) => onValuesChange({ shadowOffsetY: v })} 
                                    />
                                </div>
                             </div>
                        </div>
                    </div>
                )}
            </div>
            )}
        </div>
    );
}
