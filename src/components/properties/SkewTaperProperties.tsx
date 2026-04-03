import React from 'react';

interface SkewTaperValues {
    skewX: number;
    skewY: number;
    skewZ: number; // Taper Intensity
    taperDirection: number; // -100 to 100
    pseudoBacksidePreset?: 'front' | 'back';
}

interface SkewTaperPropertiesProps {
    values: SkewTaperValues;
    onChange: (key: string, value: number) => void;
    onPresetChange?: (preset: 'front' | 'back') => void;
    onStartDirDrag?: () => void;
    onStopDirDrag?: () => void;
}

export function SkewTaperProperties({ values, onChange, onPresetChange, onStartDirDrag, onStopDirDrag }: SkewTaperPropertiesProps) {
    return (
        <div className="p-4 space-y-4 border-b border-border/50">
             <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Perspective / Skew</h3>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Back Side Preset</span>
                    <span>{values.pseudoBacksidePreset === 'back' ? 'Back' : 'Front'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { label: 'Front', value: 'front' as const },
                        { label: 'Back', value: 'back' as const },
                    ].map((preset) => (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => onPresetChange?.(preset.value)}
                            className={`rounded-md border px-2 py-1.5 text-[10px] transition-colors ${((values.pseudoBacksidePreset || 'front') === preset.value)
                                ? 'bg-tool-accent/20 text-tool-accent border-tool-accent/30'
                                : 'bg-secondary/20 text-muted-foreground border-border/50 hover:bg-secondary/50'}`}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
                <p className="text-[9px] text-muted-foreground">
                    Shows the reverse side by mirroring the layer without adding perspective skew.
                </p>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Skew X</span>
                        <span>{Math.round(values.skewX)}°</span>
                    </div>
                    <input
                        type="range"
                        min="-80"
                        max="80"
                        value={values.skewX}
                        onChange={(e) => onChange('skewX', parseInt(e.target.value))}
                        onDoubleClick={() => onChange('skewX', 0)}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Skew Y</span>
                        <span>{Math.round(values.skewY)}°</span>
                    </div>
                    <input
                        type="range"
                        min="-80"
                        max="80"
                        value={values.skewY}
                        onChange={(e) => onChange('skewY', parseInt(e.target.value))}
                        onDoubleClick={() => onChange('skewY', 0)}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>

             <div className="space-y-3 pt-2">
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Fake 3D Depth (Taper)</span>
                        <span>{values.skewZ}</span>
                    </div>
                    <input
                        type="range"
                        min="-100"
                        max="100"
                        value={values.skewZ}
                        onChange={(e) => onChange('skewZ', parseInt(e.target.value))}
                        onDoubleClick={() => onChange('skewZ', 0)}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                    <p className="text-[9px] text-muted-foreground">Simulates 3D perspective by tapering side</p>
                </div>

                {values.skewZ !== 0 && (
                     <div className="space-y-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Taper Direction</span>
                            <span>{values.taperDirection}</span>
                        </div>
                        <input
                            type="range"
                            min="-100"
                            max="100"
                            value={values.taperDirection}
                            onPointerDown={onStartDirDrag}
                            onPointerUp={onStopDirDrag}
                            onChange={(e) => onChange('taperDirection', parseInt(e.target.value))}
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                )}
             </div>
        </div>
    );
}
