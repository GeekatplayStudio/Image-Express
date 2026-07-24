'use client';

import { useI18n } from '@/providers/I18nProvider';

type SelectOptions = {
    autoSelectEnabled: boolean;
    selectionMode: 'layer' | 'group';
    showTransformControls: boolean;
    feather: number;
    antiAlias: boolean;
    modifyPixels?: number;
};

type WandOptions = {
    threshold: number;
};

type SelectionFamilyTool = 'select' | 'marquee' | 'lasso' | 'wand' | 'quick-select' | 'selection-brush' | 'path-select';

interface SelectionControlsProps {
    activeTool: string;
    selectOptions: SelectOptions;
    wandOptions?: WandOptions;
    onSelectToolChange?: (tool: SelectionFamilyTool) => void;
    onAutoSelectChange?: (enabled: boolean) => void;
    onSelectionModeChange?: (mode: 'layer' | 'group') => void;
    onTransformControlsChange?: (enabled: boolean) => void;
    onSelectFeatherChange?: (feather: number) => void;
    onSelectAntiAliasChange?: (enabled: boolean) => void;
    onSelectionModifyPixelsChange?: (pixels: number) => void;
    onSelectionExpand?: () => void;
    onSelectionContract?: () => void;
    onWandThresholdChange?: (threshold: number) => void;
}

export default function SelectionControls({
    activeTool,
    selectOptions,
    wandOptions,
    onSelectToolChange,
    onAutoSelectChange,
    onSelectionModeChange,
    onTransformControlsChange,
    onSelectFeatherChange,
    onSelectAntiAliasChange,
    onSelectionModifyPixelsChange,
    onSelectionExpand,
    onSelectionContract,
    onWandThresholdChange,
}: SelectionControlsProps) {
    const { t } = useI18n();
    const isMoveLikeTool = activeTool === 'select' || activeTool === 'path-select';
    const isSelectionFamilyTool = isMoveLikeTool || activeTool === 'marquee' || activeTool === 'lasso' || activeTool === 'wand' || activeTool === 'quick-select' || activeTool === 'selection-brush';
    const supportsThreshold = activeTool === 'wand' || activeTool === 'quick-select';

    const tools: Array<{ key: SelectionFamilyTool; labelKey: string }> = [
        { key: 'select', labelKey: 'toolbar.move' },
        { key: 'marquee', labelKey: 'toolbar.marquee' },
        { key: 'lasso', labelKey: 'toolbar.lasso' },
        { key: 'wand', labelKey: 'toolbar.short.wand' },
        { key: 'quick-select', labelKey: 'toolbar.short.quick' },
        { key: 'selection-brush', labelKey: 'toolbar.short.selBrush' },
        { key: 'path-select', labelKey: 'toolbar.short.path' },
    ];

    return (
        <>
            <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/20">
                {tools.map((tool, index) => (
                    <button
                        key={tool.key}
                        onClick={() => onSelectToolChange?.(tool.key)}
                        className={`px-2 py-1 text-xs whitespace-nowrap ${index > 0 ? 'border-l border-border/50' : ''} ${activeTool === tool.key ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                        aria-label={t('sel.toolAria', { tool: tool.key })}
                    >
                        {t(tool.labelKey)}
                    </button>
                ))}
            </div>

            {isSelectionFamilyTool && (
                <>
                    {isMoveLikeTool && (
                        <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={selectOptions.autoSelectEnabled}
                                onChange={(event) => onAutoSelectChange?.(event.target.checked)}
                                aria-label={t('sel.autoSelect')}
                            />
                            <span>{t('sel.autoSelect')}</span>
                        </label>
                    )}

                    <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                        <button
                            onClick={() => onSelectionModeChange?.('layer')}
                            className={`px-2 py-1 text-xs ${selectOptions.selectionMode === 'layer' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                            aria-label={t('sel.modeLayerAria')}
                        >
                            {t('sel.modeLayer')}
                        </button>
                        <button
                            onClick={() => onSelectionModeChange?.('group')}
                            className={`px-2 py-1 text-xs border-l border-border/50 ${selectOptions.selectionMode === 'group' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                            aria-label={t('sel.modeGroupAria')}
                        >
                            {t('sel.modeGroup')}
                        </button>
                    </div>

                    {isMoveLikeTool && (
                        <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={selectOptions.showTransformControls}
                                onChange={(event) => onTransformControlsChange?.(event.target.checked)}
                                aria-label={t('sel.showTransformControls')}
                            />
                            <span>{t('sel.showTransformControls')}</span>
                        </label>
                    )}
                </>
            )}

            {isSelectionFamilyTool && (
                <>
                    <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                        <span className="text-muted-foreground">{t('sel.feather')}</span>
                        <input
                            aria-label={t('sel.featherAria')}
                            type="range"
                            min={0}
                            max={100}
                            value={selectOptions.feather}
                            onChange={(event) => onSelectFeatherChange?.(Number(event.target.value))}
                            className="w-16"
                        />
                        <span>{t('common.pxValue', { value: selectOptions.feather })}</span>
                    </label>

                    <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                        <input
                            type="checkbox"
                            checked={selectOptions.antiAlias}
                            onChange={(event) => onSelectAntiAliasChange?.(event.target.checked)}
                            aria-label={t('sel.antiAliasAria')}
                        />
                        <span>{t('sel.antiAlias')}</span>
                    </label>

                    <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                        <span className="text-muted-foreground">{t('sel.modify')}</span>
                        <input
                            aria-label={t('sel.modifyAria')}
                            type="range"
                            min={1}
                            max={120}
                            value={selectOptions.modifyPixels ?? 12}
                            onChange={(event) => onSelectionModifyPixelsChange?.(Number(event.target.value))}
                            className="w-16"
                        />
                        <span>{t('common.pxValue', { value: selectOptions.modifyPixels ?? 12 })}</span>
                    </label>

                    <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                        <button
                            onClick={() => onSelectionExpand?.()}
                            className="px-2 py-1 text-xs text-muted-foreground hover:bg-secondary/50"
                            aria-label={t('sel.expandAria')}
                        >
                            {t('sel.expand')}
                        </button>
                        <button
                            onClick={() => onSelectionContract?.()}
                            className="px-2 py-1 text-xs border-l border-border/50 text-muted-foreground hover:bg-secondary/50"
                            aria-label={t('sel.contractAria')}
                        >
                            {t('sel.contract')}
                        </button>
                    </div>
                </>
            )}

            {supportsThreshold && wandOptions && (
                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('sel.threshold')}</span>
                    <input
                        aria-label={t('sel.thresholdAria')}
                        type="range"
                        min={0}
                        max={180}
                        value={wandOptions.threshold}
                        onChange={(event) => onWandThresholdChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{wandOptions.threshold}</span>
                </label>
            )}
        </>
    );
}
