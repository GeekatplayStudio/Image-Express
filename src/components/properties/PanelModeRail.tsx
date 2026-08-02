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
import { useI18n } from '@/providers/I18nProvider';

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
    className?: string;
    expandDirection?: 'left' | 'right';
}

export function PanelModeRail({ mode, onModeChange, showHoverLabels = true, className, expandDirection = 'right' }: PanelModeRailProps) {
    const [isHovered, setIsHovered] = React.useState(false);
    const isExpanded = showHoverLabels && isHovered;
    const { t } = useI18n();
    const icons: Record<PanelMode, React.ReactNode> = {
        layers: <Layers size={16} />,
        properties: <SlidersHorizontal size={16} />,
        history: <History size={16} />,
        color: <Palette size={16} />,
        swatches: <Grid3x3 size={16} />,
        brushes: <Brush size={16} />,
        channels: <LayoutGrid size={16} />,
        adjustments: <Blend size={16} />,
        navigator: <Compass size={16} />,
        info: <Info size={16} />,
    };
    const modes: PanelMode[] = [
        'layers', 'properties', 'history', 'color', 'swatches',
        'brushes', 'channels', 'adjustments', 'navigator', 'info',
    ];
    const items = modes.map((m) => ({
        mode: m,
        text: t(`rail.${m}`),
        title: t(`rail.${m}.title`),
        icon: icons[m],
    }));

    return (
        <div
            className={cn(
                // overflow-x-hidden: a vertical scrollbar on this narrow rail must not
                // steal width and spawn a tiny horizontal scrollbar at the bottom.
                'min-h-0 max-h-[80vh] overflow-y-auto overflow-x-hidden flex flex-col gap-1 rounded-md border border-border/60 bg-card/90 p-1 backdrop-blur-sm scrollbar-thin transition-[width] duration-200 ease-out items-stretch',
                isExpanded ? 'w-44 shadow-xl' : 'w-10',
                expandDirection === 'left' ? 'origin-top-right' : 'origin-top-left',
                className
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            data-testid="panel-mode-rail"
        >
            {items.map((item) => (
                <button
                    key={item.mode}
                    type="button"
                    aria-label={item.title}
                    aria-pressed={mode === item.mode}
                    data-testid={`panel-mode-${item.mode}`}
                    onClick={() => onModeChange(item.mode)}
                    className={cn(
                        'rounded-sm flex w-full min-w-0 transition-colors',
                        isExpanded ? 'h-8 items-center justify-start gap-2 px-2' : 'h-8 items-center justify-center',
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
