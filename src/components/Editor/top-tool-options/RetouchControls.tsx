'use client';

interface RetouchControlsProps {
    activeTool: string;
    healingOptions?: {
        size: number;
        hardness: number;
        sampleAllLayers: boolean;
    };
    onHealingSizeChange?: (size: number) => void;
    onHealingHardnessChange?: (hardness: number) => void;
    onHealingSampleAllLayersChange?: (enabled: boolean) => void;
    cloneOptions?: {
        size: number;
        hardness: number;
        aligned: boolean;
        sampleAllLayers: boolean;
        hasSource: boolean;
    };
    onCloneSizeChange?: (size: number) => void;
    onCloneHardnessChange?: (hardness: number) => void;
    onCloneAlignedChange?: (enabled: boolean) => void;
    onCloneSampleAllLayersChange?: (enabled: boolean) => void;
    onCloneClearSource?: () => void;
}

export default function RetouchControls({
    activeTool,
    healingOptions,
    onHealingSizeChange,
    onHealingHardnessChange,
    onHealingSampleAllLayersChange,
    cloneOptions,
    onCloneSizeChange,
    onCloneHardnessChange,
    onCloneAlignedChange,
    onCloneSampleAllLayersChange,
    onCloneClearSource,
}: RetouchControlsProps) {
    if (activeTool === 'healing' && healingOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <input
                        aria-label="Healing size"
                        type="range"
                        min={1}
                        max={200}
                        value={healingOptions.size}
                        onChange={(event) => onHealingSizeChange?.(Number(event.target.value))}
                        className="w-20"
                    />
                    <span>{healingOptions.size}</span>
                </label>

                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Hardness</span>
                    <input
                        aria-label="Healing hardness"
                        type="range"
                        min={0}
                        max={100}
                        value={healingOptions.hardness}
                        onChange={(event) => onHealingHardnessChange?.(Number(event.target.value))}
                        className="w-20"
                    />
                    <span>{healingOptions.hardness}%</span>
                </label>

                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={healingOptions.sampleAllLayers}
                        onChange={(event) => onHealingSampleAllLayersChange?.(event.target.checked)}
                        aria-label="Healing sample all layers"
                    />
                    <span>Sample All Layers</span>
                </label>

                <span className="shrink-0 px-2 py-1 rounded-md border border-border/60 bg-secondary/20 text-[11px] text-muted-foreground">
                    Bootstrap mode
                </span>
            </>
        );
    }

    if (activeTool === 'clone-stamp' && cloneOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <input
                        aria-label="Clone size"
                        type="range"
                        min={1}
                        max={200}
                        value={cloneOptions.size}
                        onChange={(event) => onCloneSizeChange?.(Number(event.target.value))}
                        className="w-20"
                    />
                    <span>{cloneOptions.size}</span>
                </label>

                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Hardness</span>
                    <input
                        aria-label="Clone hardness"
                        type="range"
                        min={0}
                        max={100}
                        value={cloneOptions.hardness}
                        onChange={(event) => onCloneHardnessChange?.(Number(event.target.value))}
                        className="w-20"
                    />
                    <span>{cloneOptions.hardness}%</span>
                </label>

                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={cloneOptions.aligned}
                        onChange={(event) => onCloneAlignedChange?.(event.target.checked)}
                        aria-label="Clone aligned"
                    />
                    <span>Aligned</span>
                </label>

                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={cloneOptions.sampleAllLayers}
                        onChange={(event) => onCloneSampleAllLayersChange?.(event.target.checked)}
                        aria-label="Clone sample all layers"
                    />
                    <span>Sample All Layers</span>
                </label>

                <span className="shrink-0 px-2 py-1 rounded-md border border-border/60 bg-secondary/20 text-[11px] text-muted-foreground">
                    {cloneOptions.hasSource ? 'Source: Set' : 'Source: Option-click to set'}
                </span>

                <button
                    onClick={() => onCloneClearSource?.()}
                    disabled={!cloneOptions.hasSource}
                    className={`shrink-0 px-2.5 py-1 text-xs rounded-md border border-border/60 ${cloneOptions.hasSource ? 'text-foreground hover:bg-secondary/50' : 'text-muted-foreground/50 cursor-not-allowed'}`}
                    aria-label="Clone clear source"
                >
                    Clear Source
                </button>
            </>
        );
    }

    return null;
}
