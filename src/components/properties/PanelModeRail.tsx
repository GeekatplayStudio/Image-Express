import React from 'react';
import {
    Layers,
    SlidersHorizontal,
    History,
    Palette,
    Grid3x3,
    Brush,
    LayoutGrid,
    Blend,
    Compass,
    Info,
} from 'lucide-react';

export type PanelMode =
    | 'layers'
    | 'properties'
    | 'history'
    | 'color'
    | 'swatches'
    | 'brushes'
    | 'channels'
    | 'adjustments'
    | 'navigator'
    | 'info';

interface PanelModeRailProps {
    mode: PanelMode;
    onModeChange: (mode: PanelMode) => void;
}

export function PanelModeRail({ mode, onModeChange }: PanelModeRailProps) {
    const items: Array<{ mode: PanelMode; label: string; title: string; icon: React.ReactNode }> = [
        { mode: 'layers', label: 'layers', title: 'Show Layers', icon: <Layers size={16} /> },
        { mode: 'properties', label: 'properties', title: 'Show Properties', icon: <SlidersHorizontal size={16} /> },
        { mode: 'history', label: 'history', title: 'Show History', icon: <History size={16} /> },
        { mode: 'color', label: 'color', title: 'Show Color', icon: <Palette size={16} /> },
        { mode: 'swatches', label: 'swatches', title: 'Show Swatches', icon: <Grid3x3 size={16} /> },
        { mode: 'brushes', label: 'brushes', title: 'Show Brushes', icon: <Brush size={16} /> },
        { mode: 'channels', label: 'channels', title: 'Show Channels', icon: <LayoutGrid size={16} /> },
        { mode: 'adjustments', label: 'adjustments', title: 'Show Adjustments', icon: <Blend size={16} /> },
        { mode: 'navigator', label: 'navigator', title: 'Show Navigator', icon: <Compass size={16} /> },
        { mode: 'info', label: 'info', title: 'Show Info', icon: <Info size={16} /> },
    ];

    return (
        <div className="absolute right-2 top-2 z-20 max-h-[calc(100%-1rem)] overflow-y-auto flex flex-col gap-1 rounded-md border border-border/60 bg-card/90 p-1 backdrop-blur-sm scrollbar-thin">
            {items.map((item) => (
                <button
                    key={item.mode}
                    type="button"
                    aria-label={`Panel mode ${item.label}`}
                    aria-pressed={mode === item.mode}
                    onClick={() => onModeChange(item.mode)}
                    className={`h-8 w-8 rounded-sm flex items-center justify-center transition-colors ${mode === item.mode ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
                    title={item.title}
                >
                    {item.icon}
                </button>
            ))}
        </div>
    );
}
