'use client';

import SelectionControls from '@/components/Editor/top-tool-options/SelectionControls';
import PaintControls from '@/components/Editor/top-tool-options/PaintControls';
import RetouchControls from '@/components/Editor/top-tool-options/RetouchControls';
import GradientControls from '@/components/Editor/top-tool-options/GradientControls';
import AdvancedToolControls from '@/components/Editor/top-tool-options/AdvancedToolControls';
import { Redo2, Save, Undo2 } from 'lucide-react';
import type { TopToolOptionsBarProps } from '@/components/Editor/TopToolOptionsBar.types';

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
    const normalizedActiveTool = activeTool || 'select';
    const displayToolName = normalizedActiveTool === 'select'
        ? 'move'
            : normalizedActiveTool === 'path-select'
                ? 'path select'
            : normalizedActiveTool === 'clone-stamp'
                ? 'clone stamp'
                : normalizedActiveTool === 'blur'
                    ? 'blur tool'
                : normalizedActiveTool === 'sharpen'
                    ? 'sharpen tool'
                : normalizedActiveTool === 'dodge'
                    ? 'dodge tool'
                : normalizedActiveTool === 'history-brush'
                    ? 'history brush'
                : normalizedActiveTool === 'healing'
                    ? 'healing brush'
                : normalizedActiveTool === 'quick-select'
                    ? 'quick selection'
                : normalizedActiveTool === 'selection-brush'
                    ? 'selection brush'
            : normalizedActiveTool;

    const hasQuickControls = Boolean(
        (activeTool === 'select' && selectOptions)
        || (activeTool === 'marquee' && selectOptions)
        || (activeTool === 'lasso' && selectOptions)
        || (activeTool === 'wand' && selectOptions)
        || (activeTool === 'quick-select' && selectOptions)
        || (activeTool === 'selection-brush' && selectOptions)
        || (activeTool === 'healing' && healingOptions)
        || (activeTool === 'history-brush' && historyOptions)
        || (activeTool === 'blur' && blurOptions)
        || (activeTool === 'sharpen' && sharpenOptions)
        || (activeTool === 'dodge' && dodgeOptions)
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
            className="h-11 border-b border-border/50 bg-card/60 backdrop-blur-sm px-3 flex items-center justify-between gap-3"
        >
            <div className="flex items-center gap-2.5 min-w-0">
                {showToolbarActions && (
                    <>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                onClick={() => onSave?.()}
                                disabled={!onSave}
                                className={`h-8 w-8 rounded-full border border-border/60 flex items-center justify-center transition-colors ${onSave ? (isDirty ? 'text-primary hover:bg-secondary/60' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60') : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                title="Save Design"
                                aria-label="Save design"
                            >
                                <Save size={14} />
                            </button>
                            <button
                                onClick={() => onUndo?.()}
                                disabled={!onUndo || !canUndo}
                                className={`h-8 w-8 rounded-full border border-border/60 flex items-center justify-center transition-colors ${onUndo && canUndo ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/60' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                title="Undo"
                                aria-label="Undo"
                            >
                                <Undo2 size={14} />
                            </button>
                            <button
                                onClick={() => onRedo?.()}
                                disabled={!onRedo || !canRedo}
                                className={`h-8 w-8 rounded-full border border-border/60 flex items-center justify-center transition-colors ${onRedo && canRedo ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/60' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                title="Redo"
                                aria-label="Redo"
                            >
                                <Redo2 size={14} />
                            </button>
                        </div>
                        <div className="h-5 w-px bg-border/60 shrink-0" />
                    </>
                )}
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
                        Tool Options
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-tool-accent text-tool-accent-foreground border border-border/60 truncate">
                        {displayToolName}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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

                {(activeTool === 'healing' || activeTool === 'history-brush' || activeTool === 'clone-stamp' || activeTool === 'blur' || activeTool === 'sharpen' || activeTool === 'dodge') && (
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
                        No quick properties for this tool.
                    </span>
                )}
            </div>
        </div>
    );
}
