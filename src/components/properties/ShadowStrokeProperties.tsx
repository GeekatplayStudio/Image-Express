import React, { useState } from 'react';

interface ShadowStrokeValues {
    strokeColor: string;
    strokeWidth: number;
    strokeOpacity: number;
    strokeInside: boolean; 
    shadowEnabled: boolean;
    shadowColor: string;
    shadowBlur: number;
    shadowOpacity: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
}

interface ShadowStrokePropertiesProps {
    values: ShadowStrokeValues;
    onStrokeChange: (key: string, value: string | number | boolean) => void;
    onShadowChange: (key: string, value: string | number | boolean) => void;
}

export function ShadowStrokeProperties({ values, onStrokeChange, onShadowChange }: ShadowStrokePropertiesProps) {
    const handleStrokeColor = (val: string) => onStrokeChange('color', val);
    const handleShadowColor = (val: string) => onShadowChange('color', val);

    return (
        <div className="p-4 space-y-6 border-b border-border/50">
            {/* Stroke Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Stroke (Border)</h3>
                </div>
                
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                     <div className="relative w-full h-8 rounded border border-border shadow-sm overflow-hidden group cursor-pointer">
                        <div className="absolute inset-0 z-0 bg-image-checkered opacity-20" />
                        <div className="absolute inset-0 z-10" style={{ backgroundColor: values.strokeColor }} />
                        <input 
                            type="color" 
                            value={values.strokeColor}
                            onChange={(e) => handleStrokeColor(e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        />
                    </div>
                    <div className="flex bg-secondary rounded-lg p-0.5">
                        <button 
                             onClick={() => onStrokeChange('inside', false)}
                             className={`px-2 py-1 text-[10px] rounded-md ${!values.strokeInside ? 'bg-background shadow-sm' : 'hover:bg-background/50 text-muted-foreground'}`}
                             title="Center / Outside"
                        >
                            <div className="w-3 h-3 border border-current rounded-sm" />
                        </button>
                        <button 
                             onClick={() => onStrokeChange('inside', true)}
                             className={`px-2 py-1 text-[10px] rounded-md ${values.strokeInside ? 'bg-background shadow-sm' : 'hover:bg-background/50 text-muted-foreground'}`}
                             title="Inside (Fill First)"
                        >
                             <div className="w-3 h-3 bg-current rounded-sm border border-current" />
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Width</span>
                        <span>{values.strokeWidth}px</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={values.strokeWidth}
                        onChange={(e) => onStrokeChange('width', parseInt(e.target.value))}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Opacity</span>
                        <span>{Math.round(values.strokeOpacity * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={values.strokeOpacity}
                        onChange={(e) => onStrokeChange('opacity', parseFloat(e.target.value))}
                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>

            {/* Shadow Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Drop Shadow</h3>
                    <input
                        type="checkbox"
                        checked={values.shadowEnabled}
                        onChange={(e) => onShadowChange('enabled', e.target.checked)}
                        className="rounded border-border"
                    />
                </div>
                
                {values.shadowEnabled && (
                    <div className="space-y-3 pl-2 border-l-2 border-border/30">
                         <div className="relative w-full h-8 rounded border border-border shadow-sm overflow-hidden group cursor-pointer">
                            <div className="absolute inset-0 z-0 bg-image-checkered opacity-20" />
                            <div className="absolute inset-0 z-10" style={{ backgroundColor: values.shadowColor, opacity: values.shadowOpacity }} />
                            <input 
                                type="color" 
                                value={values.shadowColor}
                                onChange={(e) => handleShadowColor(e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Blur</span>
                                <span>{values.shadowBlur}px</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={values.shadowBlur}
                                onChange={(e) => onShadowChange('blur', parseInt(e.target.value))}
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                             <div className="space-y-2">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>X</span>
                                    <span>{values.shadowOffsetX}</span>
                                </div>
                                <input
                                    type="range"
                                    min="-50"
                                    max="50"
                                    value={values.shadowOffsetX}
                                    onChange={(e) => onShadowChange('offsetX', parseInt(e.target.value))}
                                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>Y</span>
                                    <span>{values.shadowOffsetY}</span>
                                </div>
                                <input
                                    type="range"
                                    min="-50"
                                    max="50"
                                    value={values.shadowOffsetY}
                                    onChange={(e) => onShadowChange('offsetY', parseInt(e.target.value))}
                                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Opacity</span>
                                <span>{Math.round(values.shadowOpacity * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={values.shadowOpacity}
                                onChange={(e) => onShadowChange('opacity', parseFloat(e.target.value))}
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
