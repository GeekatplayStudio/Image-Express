'use client';

import SelectionControls from '@/components/Editor/top-tool-options/SelectionControls';
import PaintControls from '@/components/Editor/top-tool-options/PaintControls';
import RetouchControls from '@/components/Editor/top-tool-options/RetouchControls';
import GradientControls from '@/components/Editor/top-tool-options/GradientControls';
import AdvancedToolControls from '@/components/Editor/top-tool-options/AdvancedToolControls';
import { Redo2, Save, Undo2 } from 'lucide-react';
import type { TopToolOptionsBarProps } from '@/components/Editor/TopToolOptionsBar.types';
import { useI18n } from '@/providers/I18nProvider';

/** Tools with a translated display name in the pill; others show their raw id. */
const TOOL_LABEL_KEYS = new Set([
    'select', 'path-select', 'clone-stamp', 'spot-healing', 'remove', 'blur',
    'sharpen', 'dodge', 'burn', 'sponge', 'history-brush', 'healing',
    'quick-select', 'selection-brush', 'marquee', 'lasso', 'wand', 'paint',
    'gradient', 'pen', 'text', 'shapes', 'crop', 'eyedropper', 'zoom', 'hand',
]);

export default function TopToolOptionsBar({
    activeTool,
    toolbarActions,
    onSave,
    onUndo,
    onRedo,
    selectOptions,
    onAutoSelectChange,
    onSelectionModeChange,
    onTransformControlsChange,
    onSelectFeatherChange,
    onSelectAntiAliasChange,
    onSelectionModifyPixelsChange,
    onSelectionExpand,
    onSelectionContract,
    onSelectToolChange,
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
    wandOptions,
    onWandThresholdChange,
    paintOptions,
    onPaintPresetChange,
    onPaintSizeChange,
    onPaintHardnessChange,
    onPaintOpacityChange,
    onPaintFlowChange,
    onPaintSmoothingChange,
    onPaintBlendModeChange,
    gradientOptions,
    onGradientTypeChange,
    onGradientBlendModeChange,
    onGradientOpacityChange,
    onGradientReverseChange,
    onGradientDitherChange,
    penOptions,
    onPenModeChange,
    onPenPathOperationChange,
    onPenAutoAddDeleteChange,
    onPenRubberBandChange,
    textOptions,
    onTextFontFamilyChange,
    onTextFontStyleChange,
    onTextFontSizeChange,
    onTextColorChange,
    onTextBoldChange,
    onTextItalicChange,
    onTextUnderlineChange,
    onTextAlignChange,
    shapeOptions,
    onShapeModeChange,
    onShapeFillColorChange,
    onShapeStrokeColorChange,
    onShapeStrokeWidthChange,
    onShapeCornerRadiusChange,
    onShapeFixedSizeChange,
    cropOptions,
    onCropRatioPresetChange,
    onCropDeleteOutsideChange,
    onCropUseArtboardBoundsChange,
    onCropApply,
    eyedropperOptions,
    onEyedropperSampleSizeChange,
    onEyedropperSampleSourceChange,
    onEyedropperSample,
    zoomOptions,
    onZoomModeChange,
    onZoomStepChange,
    onZoomApply,
    onZoomFitToScreen,
    onZoomReset,
    handOptions,
    onHandLockPanChange,
}: TopToolOptionsBarProps) {
    const { t } = useI18n();
    const normalizedActiveTool = activeTool || 'select';
    const displayToolName = TOOL_LABEL_KEYS.has(normalizedActiveTool)
        ? t(`tool.${normalizedActiveTool}`)
        : normalizedActiveTool;

    const hasQuickControls = Boolean(
        (activeTool === 'select' && selectOptions)
        || (activeTool === 'marquee' && selectOptions)
        || (activeTool === 'lasso' && selectOptions)
        || (activeTool === 'wand' && selectOptions)
        || (activeTool === 'quick-select' && selectOptions)
        || (activeTool === 'selection-brush' && selectOptions)
        || (activeTool === 'healing' && healingOptions)
        || (activeTool === 'spot-healing' && healingOptions)
        || (activeTool === 'remove' && healingOptions)
        || (activeTool === 'history-brush' && historyOptions)
        || (activeTool === 'blur' && blurOptions)
        || (activeTool === 'sharpen' && sharpenOptions)
        || (activeTool === 'dodge' && dodgeOptions)
        || (activeTool === 'burn' && dodgeOptions)
        || (activeTool === 'sponge' && dodgeOptions)
        || (activeTool === 'clone-stamp' && cloneOptions)
        || (activeTool === 'paint' && paintOptions)
        || (activeTool === 'gradient' && gradientOptions)
        || (activeTool === 'pen' && penOptions)
        || (activeTool === 'text' && textOptions)
        || (activeTool === 'shapes' && shapeOptions)
        || (activeTool === 'crop' && cropOptions)
        || (activeTool === 'eyedropper' && eyedropperOptions)
        || (activeTool === 'zoom' && zoomOptions)
        || (activeTool === 'hand' && handOptions)
    );
    const showToolbarActions = Boolean(onSave || onUndo || onRedo);
    const canUndo = toolbarActions?.canUndo ?? false;
    const canRedo = toolbarActions?.canRedo ?? false;
    const isDirty = toolbarActions?.isDirty ?? false;

    return (
        <div
            data-testid="top-tool-options-bar"
            className="min-h-11 border-b border-border/50 bg-card/60 px-3 py-1.5 backdrop-blur-sm flex items-center gap-3 overflow-hidden"
        >
            <div className="flex shrink-0 items-center gap-2.5 min-w-0">
                {showToolbarActions && (
                    <>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                onClick={() => onSave?.()}
                                disabled={!onSave}
                                className={`h-8 w-8 rounded-full border border-border/60 flex items-center justify-center transition-colors ${onSave ? (isDirty ? 'text-primary hover:bg-secondary/60' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60') : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                title={t('topbar.saveDesign')}
                                aria-label={t('topbar.saveDesign')}
                            >
                                <Save size={14} />
                            </button>
                            <button
                                onClick={() => onUndo?.()}
                                disabled={!onUndo || !canUndo}
                                className={`h-8 w-8 rounded-full border border-border/60 flex items-center justify-center transition-colors ${onUndo && canUndo ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/60' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                title={t('common.undo')}
                                aria-label={t('common.undo')}
                            >
                                <Undo2 size={14} />
                            </button>
                            <button
                                onClick={() => onRedo?.()}
                                disabled={!onRedo || !canRedo}
                                className={`h-8 w-8 rounded-full border border-border/60 flex items-center justify-center transition-colors ${onRedo && canRedo ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/60' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                title={t('common.redo')}
                                aria-label={t('common.redo')}
                            >
                                <Redo2 size={14} />
                            </button>
                        </div>
                        <div className="h-5 w-px bg-border/60 shrink-0" />
                    </>
                )}
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
                        {t('topbar.toolOptions')}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-tool-accent text-tool-accent-foreground border border-border/60 truncate">
                        {displayToolName}
                    </span>
                </div>
            </div>

            <div className="flex flex-1 min-w-0 items-center justify-start gap-1.5 overflow-x-auto scrollbar-thin whitespace-nowrap pb-1 -mb-1 pr-1">
                {(activeTool === 'select' || activeTool === 'marquee' || activeTool === 'lasso' || activeTool === 'wand' || activeTool === 'quick-select' || activeTool === 'selection-brush') && selectOptions && (
                    <SelectionControls
                        activeTool={activeTool}
                        selectOptions={selectOptions}
                        wandOptions={wandOptions}
                        onAutoSelectChange={onAutoSelectChange}
                        onSelectionModeChange={onSelectionModeChange}
                        onTransformControlsChange={onTransformControlsChange}
                        onSelectFeatherChange={onSelectFeatherChange}
                        onSelectAntiAliasChange={onSelectAntiAliasChange}
                        onSelectionModifyPixelsChange={onSelectionModifyPixelsChange}
                        onSelectionExpand={onSelectionExpand}
                        onSelectionContract={onSelectionContract}
                        onSelectToolChange={onSelectToolChange}
                        onWandThresholdChange={onWandThresholdChange}
                    />
                )}

                {activeTool === 'paint' && paintOptions && (
                    <PaintControls
                        paintOptions={paintOptions}
                        onPaintPresetChange={onPaintPresetChange}
                        onPaintSizeChange={onPaintSizeChange}
                        onPaintHardnessChange={onPaintHardnessChange}
                        onPaintOpacityChange={onPaintOpacityChange}
                        onPaintFlowChange={onPaintFlowChange}
                        onPaintSmoothingChange={onPaintSmoothingChange}
                        onPaintBlendModeChange={onPaintBlendModeChange}
                    />
                )}

                {(activeTool === 'healing' || activeTool === 'spot-healing' || activeTool === 'remove' || activeTool === 'history-brush' || activeTool === 'clone-stamp' || activeTool === 'blur' || activeTool === 'sharpen' || activeTool === 'dodge' || activeTool === 'burn' || activeTool === 'sponge') && (
                    <RetouchControls
                        activeTool={activeTool}
                        healingOptions={healingOptions}
                        onHealingSizeChange={onHealingSizeChange}
                        onHealingHardnessChange={onHealingHardnessChange}
                        onHealingSampleAllLayersChange={onHealingSampleAllLayersChange}
                        historyOptions={historyOptions}
                        onHistorySizeChange={onHistorySizeChange}
                        onHistoryHardnessChange={onHistoryHardnessChange}
                        onHistorySampleAllLayersChange={onHistorySampleAllLayersChange}
                        blurOptions={blurOptions}
                        onBlurSizeChange={onBlurSizeChange}
                        onBlurStrengthChange={onBlurStrengthChange}
                        onBlurSampleAllLayersChange={onBlurSampleAllLayersChange}
                        sharpenOptions={sharpenOptions}
                        onSharpenSizeChange={onSharpenSizeChange}
                        onSharpenStrengthChange={onSharpenStrengthChange}
                        onSharpenSampleAllLayersChange={onSharpenSampleAllLayersChange}
                        dodgeOptions={dodgeOptions}
                        onDodgeSizeChange={onDodgeSizeChange}
                        onDodgeExposureChange={onDodgeExposureChange}
                        onDodgeProtectTonesChange={onDodgeProtectTonesChange}
                        cloneOptions={cloneOptions}
                        onCloneSizeChange={onCloneSizeChange}
                        onCloneHardnessChange={onCloneHardnessChange}
                        onCloneAlignedChange={onCloneAlignedChange}
                        onCloneSampleAllLayersChange={onCloneSampleAllLayersChange}
                        onCloneClearSource={onCloneClearSource}
                    />
                )}

                {activeTool === 'gradient' && gradientOptions && (
                    <GradientControls
                        gradientOptions={gradientOptions}
                        onGradientTypeChange={onGradientTypeChange}
                        onGradientBlendModeChange={onGradientBlendModeChange}
                        onGradientOpacityChange={onGradientOpacityChange}
                        onGradientReverseChange={onGradientReverseChange}
                        onGradientDitherChange={onGradientDitherChange}
                    />
                )}

                <AdvancedToolControls
                    activeTool={activeTool}
                    penOptions={penOptions}
                    onPenModeChange={onPenModeChange}
                    onPenPathOperationChange={onPenPathOperationChange}
                    onPenAutoAddDeleteChange={onPenAutoAddDeleteChange}
                    onPenRubberBandChange={onPenRubberBandChange}
                    textOptions={textOptions}
                    onTextFontFamilyChange={onTextFontFamilyChange}
                    onTextFontStyleChange={onTextFontStyleChange}
                    onTextFontSizeChange={onTextFontSizeChange}
                    onTextColorChange={onTextColorChange}
                    onTextBoldChange={onTextBoldChange}
                    onTextItalicChange={onTextItalicChange}
                    onTextUnderlineChange={onTextUnderlineChange}
                    onTextAlignChange={onTextAlignChange}
                    shapeOptions={shapeOptions}
                    onShapeModeChange={onShapeModeChange}
                    onShapeFillColorChange={onShapeFillColorChange}
                    onShapeStrokeColorChange={onShapeStrokeColorChange}
                    onShapeStrokeWidthChange={onShapeStrokeWidthChange}
                    onShapeCornerRadiusChange={onShapeCornerRadiusChange}
                    onShapeFixedSizeChange={onShapeFixedSizeChange}
                    cropOptions={cropOptions}
                    onCropRatioPresetChange={onCropRatioPresetChange}
                    onCropDeleteOutsideChange={onCropDeleteOutsideChange}
                    onCropUseArtboardBoundsChange={onCropUseArtboardBoundsChange}
                    onCropApply={onCropApply}
                    eyedropperOptions={eyedropperOptions}
                    onEyedropperSampleSizeChange={onEyedropperSampleSizeChange}
                    onEyedropperSampleSourceChange={onEyedropperSampleSourceChange}
                    onEyedropperSample={onEyedropperSample}
                    zoomOptions={zoomOptions}
                    onZoomModeChange={onZoomModeChange}
                    onZoomStepChange={onZoomStepChange}
                    onZoomApply={onZoomApply}
                    onZoomFitToScreen={onZoomFitToScreen}
                    onZoomReset={onZoomReset}
                    handOptions={handOptions}
                    onHandLockPanChange={onHandLockPanChange}
                />
                {!hasQuickControls && (
                    <span className="shrink-0 text-xs text-muted-foreground px-2">
                        {t('topbar.noQuickProps')}
                    </span>
                )}
            </div>
        </div>
    );
}
