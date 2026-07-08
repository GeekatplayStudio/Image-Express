import React from 'react';
import { ColorPicker } from './ColorPicker';
import { Switch } from '@/components/ui/switch';

interface CanvasSettingsPanelProps {
    width: number;
    height: number;
    backgroundColor: string;
    backgroundEnabled: boolean;
    onResize: (width: number, height: number) => void;
    onColorChange: (color: string) => void;
    onBackgroundToggle: (enabled: boolean) => void;
}

export function CanvasSettingsPanel({
    width,
    height,
    backgroundColor,
    backgroundEnabled,
    onResize,
    onColorChange,
    onBackgroundToggle
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
                <div className="flex gap-2 flex-wrap">
                    {[
                        { w: 1080, h: 1080, label: '1:1 (Square)' },
                        { w: 1920, h: 1080, label: '16:9 (Landscape)' },
                        { w: 1080, h: 1920, label: '9:16 (Portrait)' },
                        { w: 1200, h: 1800, label: '2:3 (Poster)' },
                        { w: 1800, h: 1200, label: '3:2 (Photo)' },
                        { w: 1440, h: 1080, label: '4:3 (Monitor)' },
                        { w: 1080, h: 1440, label: '3:4 (Tablet)' },
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
                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/20 px-3 py-2">
                        <div className="space-y-0.5">
                            <div className="text-xs font-medium">Canvas background</div>
                            <div className="text-[10px] text-muted-foreground">Turn off for transparent PNG exports</div>
                        </div>
                        <Switch
                            checked={backgroundEnabled}
                            onCheckedChange={onBackgroundToggle}
                            aria-label="Canvas background"
                        />
                    </div>
                    <ColorPicker
                         color={backgroundColor.startsWith('#') ? backgroundColor : '#ffffff'}
                         onChange={onColorChange}
                         label="Color"
                    />
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
