'use client';

interface GradientControlsProps {
    gradientOptions: {
        type: 'linear' | 'radial' | 'angle';
        blendMode: 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
        opacity: number;
        reverse: boolean;
        dither: boolean;
    };
    onGradientTypeChange?: (type: 'linear' | 'radial' | 'angle') => void;
    onGradientBlendModeChange?: (mode: 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten') => void;
    onGradientOpacityChange?: (opacity: number) => void;
    onGradientReverseChange?: (enabled: boolean) => void;
    onGradientDitherChange?: (enabled: boolean) => void;
}

export default function GradientControls({
    gradientOptions,
    onGradientTypeChange,
    onGradientBlendModeChange,
    onGradientOpacityChange,
    onGradientReverseChange,
    onGradientDitherChange,
}: GradientControlsProps) {
    return (
        <>
            <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                <button
                    onClick={() => onGradientTypeChange?.('linear')}
                    className={`px-2 py-1 text-xs ${gradientOptions.type === 'linear' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                    aria-label="Gradient type linear"
                >
                    Linear
                </button>
                <button
                    onClick={() => onGradientTypeChange?.('radial')}
                    className={`px-2 py-1 text-xs border-l border-border/50 ${gradientOptions.type === 'radial' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                    aria-label="Gradient type radial"
                >
                    Radial
                </button>
                <button
                    onClick={() => onGradientTypeChange?.('angle')}
                    className={`px-2 py-1 text-xs border-l border-border/50 ${gradientOptions.type === 'angle' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                    aria-label="Gradient type angle"
                >
                    Angle
                </button>
            </div>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">Blend</span>
                <select
                    aria-label="Gradient blend mode"
                    value={gradientOptions.blendMode}
                    onChange={(event) => onGradientBlendModeChange?.(event.target.value as 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten')}
                    className="bg-transparent outline-none"
                >
                    <option value="source-over">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="darken">Darken</option>
                    <option value="lighten">Lighten</option>
                </select>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <span className="text-muted-foreground">Opacity</span>
                <input
                    aria-label="Gradient opacity"
                    type="range"
                    min={1}
                    max={100}
                    value={gradientOptions.opacity}
                    onChange={(event) => onGradientOpacityChange?.(Number(event.target.value))}
                    className="w-16"
                />
                <span>{gradientOptions.opacity}%</span>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <input
                    type="checkbox"
                    checked={gradientOptions.reverse}
                    onChange={(event) => onGradientReverseChange?.(event.target.checked)}
                    aria-label="Gradient reverse"
                />
                <span>Reverse</span>
            </label>

            <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                <input
                    type="checkbox"
                    checked={gradientOptions.dither}
                    onChange={(event) => onGradientDitherChange?.(event.target.checked)}
                    aria-label="Gradient dither"
                />
                <span>Dither</span>
            </label>
        </>
    );
}
