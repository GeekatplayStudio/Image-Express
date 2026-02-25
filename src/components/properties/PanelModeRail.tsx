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
import { cn } from '@/lib/utils';

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
    showHoverLabels?: boolean;
}

export function PanelModeRail({ mode, onModeChange, showHoverLabels = true }: PanelModeRailProps) {
    const [isHovered, setIsHovered] = React.useState(false);
    const isExpanded = showHoverLabels && isHovered;
    const items: Array<{ mode: PanelMode; label: string; text: string; title: string; icon: React.ReactNode }> = [
        { mode: 'layers', label: 'layers', text: 'Layers', title: 'Show Layers', icon: <Layers size={16} /> },
        { mode: 'properties', label: 'properties', text: 'Props', title: 'Show Properties', icon: <SlidersHorizontal size={16} /> },
        { mode: 'history', label: 'history', text: 'History', title: 'Show History', icon: <History size={16} /> },
        { mode: 'color', label: 'color', text: 'Color', title: 'Show Color', icon: <Palette size={16} /> },
        { mode: 'swatches', label: 'swatches', text: 'Swatch', title: 'Show Swatches', icon: <Grid3x3 size={16} /> },
        { mode: 'brushes', label: 'brushes', text: 'Brushes', title: 'Show Brushes', icon: <Brush size={16} /> },
        { mode: 'channels', label: 'channels', text: 'Channels', title: 'Show Channels', icon: <LayoutGrid size={16} /> },
        { mode: 'adjustments', label: 'adjustments', text: 'Adjust', title: 'Show Adjustments', icon: <Blend size={16} /> },
        { mode: 'navigator', label: 'navigator', text: 'Nav', title: 'Show Navigator', icon: <Compass size={16} /> },
        { mode: 'info', label: 'info', text: 'Info', title: 'Show Info', icon: <Info size={16} /> },
    ];

    return (
        <div
            className={cn(
                'absolute right-2 top-2 z-20 origin-right max-h-[calc(100%-1rem)] overflow-y-auto flex flex-col gap-1 rounded-md border border-border/60 bg-card/90 p-1 backdrop-blur-sm scrollbar-thin transition-[width] duration-200 ease-out',
                isExpanded ? 'w-44 items-stretch shadow-xl' : 'w-10 items-center'
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            data-testid="panel-mode-rail"
        >
            {items.map((item) => (
                <button
                    key={item.mode}
                    type="button"
                    aria-label={`Panel mode ${item.label}`}
                    aria-pressed={mode === item.mode}
                    onClick={() => onModeChange(item.mode)}
                    className={cn(
                        'rounded-sm flex transition-colors',
                        isExpanded ? 'h-8 w-full items-center justify-start gap-2 px-2' : 'h-8 w-8 items-center justify-center',
                        mode === item.mode ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    )}
                    title={item.title}
                >
                    <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
                        {item.icon}
                    </span>
                    {isExpanded && (
                        <span className="truncate text-[11px] font-medium">
                            {item.text}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}
