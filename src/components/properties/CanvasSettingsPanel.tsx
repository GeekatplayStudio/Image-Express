import React from 'react';

interface CanvasSettingsPanelProps {
    width: number;
    height: number;
    backgroundColor: string;
    onResize: (width: number, height: number) => void;
    onColorChange: (color: string) => void;
}

export function CanvasSettingsPanel({
    width,
    height,
    backgroundColor,
    onResize,
    onColorChange
}: CanvasSettingsPanelProps) {
    return (
        <div className="p-4 space-y-6">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Canvas Size</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase text-muted-foreground font-medium">Width</label>
                        <input
                            type="number"
                            value={width || ''}
                            onChange={(e) => onResize(parseInt(e.target.value) || 0, height)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase text-muted-foreground font-medium">Height</label>
                        <input
                            type="number"
                            value={height || ''}
                            onChange={(e) => onResize(width, parseInt(e.target.value) || 0)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                </div>
                <div className="flex gap-2">
                    {[
                        { w: 1080, h: 1080, label: 'Square' },
                        { w: 1920, h: 1080, label: 'Landscape' },
                        { w: 1080, h: 1920, label: 'Portrait' }
                    ].map((preset) => (
                        <button
                            key={preset.label}
                            onClick={() => onResize(preset.w, preset.h)}
                            className="px-2 py-1 text-[10px] border border-border rounded-md hover:bg-secondary"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Background</h3>
                </div>
                <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                        <input
                            type="color"
                            value={backgroundColor.startsWith('#') ? backgroundColor : '#ffffff'}
                            onChange={(e) => onColorChange(e.target.value)}
                            className="h-8 w-8 rounded overflow-hidden border border-border cursor-pointer p-0 bg-transparent"
                        />
                        <input
                            type="text"
                            value={backgroundColor}
                            onChange={(e) => onColorChange(e.target.value)}
                            className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {['#ffffff', '#000000', '#f3f4f6', '#fee2e2', '#dbeafe', '#d1fae5'].map((c) => (
                            <button
                                key={c}
                                className="w-6 h-6 rounded-full border border-border shadow-sm"
                                style={{ backgroundColor: c }}
                                onClick={() => onColorChange(c)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
