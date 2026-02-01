import React from 'react';

export interface ImageFilterValues {
    blur: number;
    brightness: number;
    contrast: number;
    noise: number;
    saturation: number;
    vibrance: number;
    pixelate: number;
}

interface ImageFilterPropertiesProps {
    values: ImageFilterValues;
    onChange: (type: 'Blur' | 'Brightness' | 'Contrast' | 'Noise' | 'Saturation' | 'Vibrance' | 'Pixelate', value: number) => void;
}

export function ImageFilterProperties({ values, onChange }: ImageFilterPropertiesProps) {
    const filters = [
        { label: 'Blur', type: 'Blur', min: 0, max: 1, step: 0.01, value: values.blur },
        { label: 'Brightness', type: 'Brightness', min: -1, max: 1, step: 0.01, value: values.brightness },
        { label: 'Contrast', type: 'Contrast', min: -1, max: 1, step: 0.01, value: values.contrast },
        { label: 'Saturation', type: 'Saturation', min: -1, max: 1, step: 0.01, value: values.saturation },
        { label: 'Vibrance', type: 'Vibrance', min: -1, max: 1, step: 0.01, value: values.vibrance },
        { label: 'Noise', type: 'Noise', min: 0, max: 1000, step: 10, value: values.noise },
        { label: 'Pixelate', type: 'Pixelate', min: 0, max: 20, step: 1, value: values.pixelate },
    ] as const;

    return (
        <div className="p-4 space-y-4 border-b border-border/50">
            <h3 className="font-medium text-sm">Image Filters</h3>
            <div className="space-y-4">
                {filters.map((f) => (
                     <div key={f.type} className="space-y-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{f.label}</span>
                            <span>{f.value.toFixed(2)}</span>
                        </div>
                        <input
                            type="range"
                            min={f.min}
                            max={f.max}
                            step={f.step}
                            value={f.value}
                            onChange={(e) => onChange(f.type, parseFloat(e.target.value))}
                            onDoubleClick={() => onChange(f.type, 0)}
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
