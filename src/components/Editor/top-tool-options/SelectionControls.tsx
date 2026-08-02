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
    sampleMode: 'contiguous' | 'color';
    sampleColor: string;
};

/** Path Select is a Move alias — omit from chips so highlight stays honest. */
type SelectionFamilyTool = 'select' | 'marquee' | 'lasso' | 'wand' | 'quick-select' | 'selection-brush';

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
    onWandSampleModeChange?: (mode: 'contiguous' | 'color') => void;
    onWandSampleColorChange?: (hex: string) => void;
    onWandApplyColor?: () => void;
}

const SELECTION_BRUSH_DISPLAY_SIZE = 36;
const CONTENT_TOOLS = new Set(['marquee', 'lasso', 'wand']);
const BRUSH_SELECTION_TOOLS = new Set(['quick-select', 'selection-brush']);

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
    onWandSampleModeChange,
    onWandSampleColorChange,
    onWandApplyColor,
}: SelectionControlsProps) {
    const { t } = useI18n();
    const isMoveLikeTool = activeTool === 'select' || activeTool === 'path-select';
    const normalizedTool = activeTool === 'path-select' ? 'select' : activeTool;
    const isContentTool = CONTENT_TOOLS.has(activeTool);
    const isSelectionFamilyTool = isMoveLikeTool
        || activeTool === 'marquee'
        || activeTool === 'lasso'
        || activeTool === 'wand'
        || activeTool === 'quick-select'
        || activeTool === 'selection-brush';
    const supportsThreshold = activeTool === 'wand';
    const showBrushSize = BRUSH_SELECTION_TOOLS.has(activeTool);
    const isBrushTool = BRUSH_SELECTION_TOOLS.has(activeTool);

    const tools: Array<{ key: SelectionFamilyTool; labelKey: string }> = [
        { key: 'select', labelKey: 'toolbar.move' },
        { key: 'marquee', labelKey: 'toolbar.marquee' },
        { key: 'lasso', labelKey: 'toolbar.lasso' },
        { key: 'wand', labelKey: 'toolbar.short.wand' },
        { key: 'quick-select', labelKey: 'toolbar.short.quick' },
        { key: 'selection-brush', labelKey: 'toolbar.short.selBrush' },
    ];

    return (
        <>
            <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/20">
                {tools.map((tool, index) => (
                    <button
                        key={tool.key}
                        onClick={() => onSelectToolChange?.(tool.key)}
                        className={`px-2 py-1 text-xs whitespace-nowrap ${index > 0 ? 'border-l border-border/50' : ''} ${normalizedTool === tool.key ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                        aria-label={t('sel.toolAria', { tool: tool.key })}
                    >
                        {t(tool.labelKey)}
                    </button>
                ))}
            </div>

            {isMoveLikeTool && (
                <>
                    <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                        <input
                            type="checkbox"
                            checked={selectOptions.autoSelectEnabled}
                            onChange={(event) => onAutoSelectChange?.(event.target.checked)}
                            aria-label={t('sel.autoSelect')}
                        />
                        <span>{t('sel.autoSelect')}</span>
                    </label>

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

                    <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                        <input
                            type="checkbox"
                            checked={selectOptions.showTransformControls}
                            onChange={(event) => onTransformControlsChange?.(event.target.checked)}
                            aria-label={t('sel.showTransformControls')}
                        />
                        <span>{t('sel.showTransformControls')}</span>
                    </label>
                </>
            )}

            {supportsThreshold && wandOptions && (
                <>
                    <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                        <button
                            type="button"
                            onClick={() => onWandSampleModeChange?.('contiguous')}
                            className={`px-2 py-1 text-xs ${wandOptions.sampleMode === 'contiguous' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                            aria-label={t('sel.wandModeContiguousAria')}
                        >
                            {t('sel.wandModeContiguous')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onWandSampleModeChange?.('color')}
                            className={`px-2 py-1 text-xs border-l border-border/50 ${wandOptions.sampleMode === 'color' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                            aria-label={t('sel.wandModeColorAria')}
                        >
                            {t('sel.wandModeColor')}
                        </button>
                    </div>

                    <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                        <span className="text-muted-foreground">{t('sel.wandColor')}</span>
                        <input
                            aria-label={t('sel.wandColorAria')}
                            type="color"
                            value={wandOptions.sampleColor}
                            onChange={(event) => onWandSampleColorChange?.(event.target.value)}
                            className="h-5 w-7 cursor-pointer rounded border border-border/50 bg-transparent p-0"
                        />
                    </label>

                    <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                        <span className="text-muted-foreground">{t('sel.colorRange')}</span>
                        <input
                            aria-label={t('sel.colorRangeAria')}
                            type="range"
                            min={0}
                            max={180}
                            value={wandOptions.threshold}
                            onChange={(event) => onWandThresholdChange?.(Number(event.target.value))}
                            className="w-16"
                        />
                        <span>{wandOptions.threshold}</span>
                    </label>

                    {wandOptions.sampleMode === 'color' && (
                        <button
                            type="button"
                            onClick={() => onWandApplyColor?.()}
                            className="shrink-0 px-2 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
                            aria-label={t('sel.wandApplyColorAria')}
                        >
                            {t('sel.wandApplyColor')}
                        </button>
                    )}

                    <span className="shrink-0 text-[10px] text-muted-foreground/80 px-1 whitespace-nowrap">
                        {t('sel.wandShiftAddHint')}
                    </span>
                </>
            )}

            {showBrushSize && (
                <>
                    <span
                        className="shrink-0 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs text-muted-foreground"
                        aria-label={t('sel.brushSizeAria')}
                    >
                        {t('sel.brushSize', {
                            value: activeTool === 'quick-select' ? 10 : SELECTION_BRUSH_DISPLAY_SIZE,
                        })}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/80 px-1 whitespace-nowrap">
                        {activeTool === 'quick-select'
                            ? t('sel.quickSelectHint')
                            : t('sel.selectionBrushHint')}
                    </span>
                </>
            )}

            {(isContentTool || isBrushTool) && (
                <label className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('sel.feather')}</span>
                    <input
                        aria-label={t('sel.featherAria')}
                        type="range"
                        min={0}
                        max={64}
                        value={selectOptions.feather}
                        onChange={(event) => onSelectFeatherChange?.(Number(event.target.value))}
                        className="w-16"
                    />
                    <span>{t('common.pxValue', { value: selectOptions.feather })}</span>
                </label>
            )}

            {isSelectionFamilyTool && (
                <>
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
        </>
    );
}
