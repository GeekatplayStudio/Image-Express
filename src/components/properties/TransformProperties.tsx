import React, { useEffect, useState } from 'react';

interface TransformPropertiesProps {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    isLocked: boolean;
    onChange: (values: Partial<{ left: number; top: number; width: number; height: number; angle: number; scaleX: number; scaleY: number; lockMovementX: boolean; lockMovementY: boolean; lockRotation: boolean; lockScalingX: boolean; lockScalingY: boolean }>) => void;
}

export function TransformProperties({
    x, y, width, height, rotation, scaleX, scaleY, isLocked, onChange
}: TransformPropertiesProps) {
    
    // Local state to handle input changes smoothly before commit if needed, 
    // but here we just pass through.
    
    // Width/Height logic in Fabric is tricky because of scale.
    // Usually users want to edit "visual width", which is width * scaleX.
    
    const displayWidth = Math.round(width * scaleX);
    const displayHeight = Math.round(height * scaleY);

    const handleDimensionChange = (dim: 'w' | 'h', value: number) => {
        if (dim === 'w') {
            const newScaleX = value / width;
            onChange({ scaleX: newScaleX });
        } else {
            const newScaleY = value / height;
            onChange({ scaleY: newScaleY });
        }
    };

    return (
        <div className="p-4 space-y-4 border-b border-border/50">
            <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Transform</h3>
                <button 
                    onClick={() => {
                        const lock = !isLocked;
                        onChange({ 
                            lockMovementX: lock, lockMovementY: lock, 
                            lockRotation: lock, 
                            lockScalingX: lock, lockScalingY: lock 
                        });
                    }}
                    title={isLocked ? "Unlock" : "Lock"}
                    className={`p-1 rounded ${isLocked ? 'bg-primary/20 text-primary' : 'hover:bg-secondary text-muted-foreground'}`}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">X</label>
                    <input
                        type="number"
                        value={Math.round(x)}
                        onChange={(e) => onChange({ left: parseFloat(e.target.value) })}
                        disabled={isLocked}
                        className="w-full text-xs bg-transparent border border-border rounded px-2 py-1"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Y</label>
                    <input
                        type="number"
                        value={Math.round(y)}
                        onChange={(e) => onChange({ top: parseFloat(e.target.value) })}
                        disabled={isLocked}
                        className="w-full text-xs bg-transparent border border-border rounded px-2 py-1"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">W</label>
                    <input
                        type="number"
                        value={displayWidth}
                        onChange={(e) => handleDimensionChange('w', parseFloat(e.target.value))}
                        disabled={isLocked}
                        className="w-full text-xs bg-transparent border border-border rounded px-2 py-1"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">H</label>
                    <input
                        type="number"
                        value={displayHeight}
                        onChange={(e) => handleDimensionChange('h', parseFloat(e.target.value))}
                        disabled={isLocked}
                        className="w-full text-xs bg-transparent border border-border rounded px-2 py-1"
                    />
                </div>
                <div className="col-span-2 space-y-1">
                    <label className="text-[10px] text-muted-foreground">Rotation (°)</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min="0"
                            max="360"
                            value={Math.round(rotation) % 360}
                            onChange={(e) => onChange({ angle: parseFloat(e.target.value) })}
                            disabled={isLocked}
                            className="flex-1 h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                        <input
                            type="number"
                            value={Math.round(rotation) % 360}
                            onChange={(e) => onChange({ angle: parseFloat(e.target.value) })}
                            disabled={isLocked}
                            className="w-12 text-xs bg-transparent border border-border rounded px-2 py-1 text-right"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
