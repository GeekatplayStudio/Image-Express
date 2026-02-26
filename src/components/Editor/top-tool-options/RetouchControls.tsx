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
    historyOptions?: {
        size: number;
        hardness: number;
        sampleAllLayers: boolean;
    };
    onHistorySizeChange?: (size: number) => void;
    onHistoryHardnessChange?: (hardness: number) => void;
    onHistorySampleAllLayersChange?: (enabled: boolean) => void;
    blurOptions?: {
        size: number;
        strength: number;
        sampleAllLayers: boolean;
    };
    onBlurSizeChange?: (size: number) => void;
    onBlurStrengthChange?: (strength: number) => void;
    onBlurSampleAllLayersChange?: (enabled: boolean) => void;
    sharpenOptions?: {
        size: number;
        strength: number;
        sampleAllLayers: boolean;
    };
    onSharpenSizeChange?: (size: number) => void;
    onSharpenStrengthChange?: (strength: number) => void;
    onSharpenSampleAllLayersChange?: (enabled: boolean) => void;
    dodgeOptions?: {
        size: number;
        exposure: number;
        protectTones: boolean;
    };
    onDodgeSizeChange?: (size: number) => void;
    onDodgeExposureChange?: (exposure: number) => void;
    onDodgeProtectTonesChange?: (enabled: boolean) => void;
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
    historyOptions,
    onHistorySizeChange,
    onHistoryHardnessChange,
    onHistorySampleAllLayersChange,
    blurOptions,
    onBlurSizeChange,
    onBlurStrengthChange,
    onBlurSampleAllLayersChange,
    sharpenOptions,
    onSharpenSizeChange,
    onSharpenStrengthChange,
    onSharpenSampleAllLayersChange,
    dodgeOptions,
    onDodgeSizeChange,
    onDodgeExposureChange,
    onDodgeProtectTonesChange,
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
                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <input
                        aria-label="Healing size"
                        type="range"
                        min={1}
                        max={200}
                        value={healingOptions.size}
                        onChange={(event) => onHealingSizeChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{healingOptions.size}</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Hardness</span>
                    <input
                        aria-label="Healing hardness"
                        type="range"
                        min={0}
                        max={100}
                        value={healingOptions.hardness}
                        onChange={(event) => onHealingHardnessChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{healingOptions.hardness}%</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={healingOptions.sampleAllLayers}
                        onChange={(event) => onHealingSampleAllLayersChange?.(event.target.checked)}
                        aria-label="Healing sample all layers"
                    />
                    <span>Sample All Layers</span>
                </label>

                <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/20 text-[11px] text-muted-foreground">
                    Bootstrap mode
                </span>
            </>
        );
    }

    if (activeTool === 'clone-stamp' && cloneOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <input
                        aria-label="Clone size"
                        type="range"
                        min={1}
                        max={200}
                        value={cloneOptions.size}
                        onChange={(event) => onCloneSizeChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{cloneOptions.size}</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Hardness</span>
                    <input
                        aria-label="Clone hardness"
                        type="range"
                        min={0}
                        max={100}
                        value={cloneOptions.hardness}
                        onChange={(event) => onCloneHardnessChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{cloneOptions.hardness}%</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={cloneOptions.aligned}
                        onChange={(event) => onCloneAlignedChange?.(event.target.checked)}
                        aria-label="Clone aligned"
                    />
                    <span>Aligned</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={cloneOptions.sampleAllLayers}
                        onChange={(event) => onCloneSampleAllLayersChange?.(event.target.checked)}
                        aria-label="Clone sample all layers"
                    />
                    <span>Sample All Layers</span>
                </label>

                <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/20 text-[11px] text-muted-foreground">
                    {cloneOptions.hasSource ? 'Source: Set' : 'Source: Option-click to set'}
                </span>

                <button
                    onClick={() => onCloneClearSource?.()}
                    disabled={!cloneOptions.hasSource}
                    className={`shrink-0 px-2 py-0.5 text-xs rounded-md border border-border/60 ${cloneOptions.hasSource ? 'text-foreground hover:bg-secondary/50' : 'text-muted-foreground/50 cursor-not-allowed'}`}
                    aria-label="Clone clear source"
                >
                    Clear Source
                </button>
            </>
        );
    }

    if (activeTool === 'history-brush' && historyOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <input
                        aria-label="History brush size"
                        type="range"
                        min={1}
                        max={200}
                        value={historyOptions.size}
                        onChange={(event) => onHistorySizeChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{historyOptions.size}</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Hardness</span>
                    <input
                        aria-label="History brush hardness"
                        type="range"
                        min={0}
                        max={100}
                        value={historyOptions.hardness}
                        onChange={(event) => onHistoryHardnessChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{historyOptions.hardness}%</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={historyOptions.sampleAllLayers}
                        onChange={(event) => onHistorySampleAllLayersChange?.(event.target.checked)}
                        aria-label="History brush sample all layers"
                    />
                    <span>Sample All Layers</span>
                </label>

                <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/20 text-[11px] text-muted-foreground">
                    Source: Latest history snapshot
                </span>
            </>
        );
    }

    if (activeTool === 'blur' && blurOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <input
                        aria-label="Blur size"
                        type="range"
                        min={1}
                        max={240}
                        value={blurOptions.size}
                        onChange={(event) => onBlurSizeChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{blurOptions.size}</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Strength</span>
                    <input
                        aria-label="Blur strength"
                        type="range"
                        min={1}
                        max={100}
                        value={blurOptions.strength}
                        onChange={(event) => onBlurStrengthChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{blurOptions.strength}%</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={blurOptions.sampleAllLayers}
                        onChange={(event) => onBlurSampleAllLayersChange?.(event.target.checked)}
                        aria-label="Blur sample all layers"
                    />
                    <span>Sample All Layers</span>
                </label>

                <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/20 text-[11px] text-muted-foreground">
                    Blur bootstrap mode
                </span>
            </>
        );
    }

    if (activeTool === 'dodge' && dodgeOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <input
                        aria-label="Dodge size"
                        type="range"
                        min={1}
                        max={240}
                        value={dodgeOptions.size}
                        onChange={(event) => onDodgeSizeChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{dodgeOptions.size}</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Exposure</span>
                    <input
                        aria-label="Dodge exposure"
                        type="range"
                        min={1}
                        max={100}
                        value={dodgeOptions.exposure}
                        onChange={(event) => onDodgeExposureChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{dodgeOptions.exposure}%</span>
                </label>

                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={dodgeOptions.protectTones}
                        onChange={(event) => onDodgeProtectTonesChange?.(event.target.checked)}
                        aria-label="Dodge protect tones"
                    />
                    <span>Protect Tones</span>
                </label>

                <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/20 text-[11px] text-muted-foreground">
                    Dodge bootstrap mode
                </span>
            </>
        );
    }

    if (activeTool === 'sharpen' && sharpenOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <input
                        aria-label="Sharpen size"
                        type="range"
                        min={1}
                        max={240}
                        value={sharpenOptions.size}
                        onChange={(event) => onSharpenSizeChange?.(Number(event.target.value))}
                        className="w-20"
                    />
                    <span>{sharpenOptions.size}</span>
                </label>

                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Strength</span>
                    <input
                        aria-label="Sharpen strength"
                        type="range"
                        min={1}
                        max={100}
                        value={sharpenOptions.strength}
                        onChange={(event) => onSharpenStrengthChange?.(Number(event.target.value))}
                        className="w-20"
                    />
                    <span>{sharpenOptions.strength}%</span>
                </label>

                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input
                        type="checkbox"
                        checked={sharpenOptions.sampleAllLayers}
                        onChange={(event) => onSharpenSampleAllLayersChange?.(event.target.checked)}
                        aria-label="Sharpen sample all layers"
                    />
                    <span>Sample All Layers</span>
                </label>

                <span className="shrink-0 px-2 py-1 rounded-md border border-border/60 bg-secondary/20 text-[11px] text-muted-foreground">
                    Sharpen bootstrap mode
                </span>
            </>
        );
    }

    return null;
}
