import type { MutableRefObject } from 'react';
import * as fabric from 'fabric';

import TopToolOptionsBar from '@/components/Editor/TopToolOptionsBar';
import type { TopToolOptionsBarProps } from '@/components/Editor/TopToolOptionsBar.types';
import type { ToolbarHandle } from '@/components/Toolbar';
import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';

type SelectOptions = NonNullable<TopToolOptionsBarProps['selectOptions']>;
type WandOptions = NonNullable<TopToolOptionsBarProps['wandOptions']>;
type HealingOptions = NonNullable<TopToolOptionsBarProps['healingOptions']>;
type HistoryOptions = NonNullable<TopToolOptionsBarProps['historyOptions']>;
type BlurOptions = NonNullable<TopToolOptionsBarProps['blurOptions']>;
type SharpenOptions = NonNullable<TopToolOptionsBarProps['sharpenOptions']>;
type DodgeOptions = NonNullable<TopToolOptionsBarProps['dodgeOptions']>;
type CloneOptions = NonNullable<TopToolOptionsBarProps['cloneOptions']>;
type PaintOptions = NonNullable<TopToolOptionsBarProps['paintOptions']>;
type GradientOptions = NonNullable<TopToolOptionsBarProps['gradientOptions']>;
type PenOptions = NonNullable<TopToolOptionsBarProps['penOptions']>;
type TextOptions = NonNullable<TopToolOptionsBarProps['textOptions']>;
type ShapeOptions = NonNullable<TopToolOptionsBarProps['shapeOptions']>;
type CropOptions = NonNullable<TopToolOptionsBarProps['cropOptions']>;
type EyedropperOptions = NonNullable<TopToolOptionsBarProps['eyedropperOptions']>;
type ZoomOptions = NonNullable<TopToolOptionsBarProps['zoomOptions']>;
type HandOptions = NonNullable<TopToolOptionsBarProps['handOptions']>;

type ToolbarState = {
    isDirty: boolean;
    historyState: { undo: number; redo: number };
    handleSave: () => Promise<void>;
    handleUndo: () => void;
    handleRedo: () => void;
};

type SelectionControlsState = {
    autoSelectEnabled: SelectOptions['autoSelectEnabled'];
    setAutoSelectEnabled: (enabled: SelectOptions['autoSelectEnabled']) => void;
    selectionMode: SelectOptions['selectionMode'];
    setSelectionMode: (mode: SelectOptions['selectionMode']) => void;
    showTransformControls: SelectOptions['showTransformControls'];
    setShowTransformControls: (enabled: SelectOptions['showTransformControls']) => void;
    selectFeather: SelectOptions['feather'];
    setSelectFeather: (feather: SelectOptions['feather']) => void;
    selectAntiAlias: SelectOptions['antiAlias'];
    setSelectAntiAlias: (enabled: SelectOptions['antiAlias']) => void;
    selectionModifyPixels: NonNullable<SelectOptions['modifyPixels']>;
    setSelectionModifyPixels: (pixels: number) => void;
    handleSelectionModify: (direction: 'expand' | 'contract') => void;
};

type RetouchControlsState = {
    wandTopThreshold: WandOptions['threshold'];
    setWandTopThreshold: (threshold: number) => void;
    healingTopSize: HealingOptions['size'];
    setHealingTopSize: (size: number) => void;
    healingTopHardness: HealingOptions['hardness'];
    setHealingTopHardness: (hardness: number) => void;
    healingTopSampleAllLayers: HealingOptions['sampleAllLayers'];
    setHealingTopSampleAllLayers: (enabled: HealingOptions['sampleAllLayers']) => void;
    historyBrushTopSize: HistoryOptions['size'];
    setHistoryBrushTopSize: (size: number) => void;
    historyBrushTopHardness: HistoryOptions['hardness'];
    setHistoryBrushTopHardness: (hardness: number) => void;
    historyBrushTopSampleAllLayers: HistoryOptions['sampleAllLayers'];
    setHistoryBrushTopSampleAllLayers: (enabled: HistoryOptions['sampleAllLayers']) => void;
    blurTopSize: BlurOptions['size'];
    setBlurTopSize: (size: number) => void;
    blurTopStrength: BlurOptions['strength'];
    setBlurTopStrength: (strength: number) => void;
    blurTopSampleAllLayers: BlurOptions['sampleAllLayers'];
    setBlurTopSampleAllLayers: (enabled: BlurOptions['sampleAllLayers']) => void;
    sharpenTopSize: SharpenOptions['size'];
    setSharpenTopSize: (size: number) => void;
    sharpenTopStrength: SharpenOptions['strength'];
    setSharpenTopStrength: (strength: number) => void;
    sharpenTopSampleAllLayers: SharpenOptions['sampleAllLayers'];
    setSharpenTopSampleAllLayers: (enabled: SharpenOptions['sampleAllLayers']) => void;
    dodgeTopSize: DodgeOptions['size'];
    setDodgeTopSize: (size: number) => void;
    dodgeTopExposure: DodgeOptions['exposure'];
    setDodgeTopExposure: (exposure: number) => void;
    dodgeTopProtectTones: DodgeOptions['protectTones'];
    setDodgeTopProtectTones: (enabled: DodgeOptions['protectTones']) => void;
    cloneTopSize: CloneOptions['size'];
    setCloneTopSize: (size: number) => void;
    cloneTopHardness: CloneOptions['hardness'];
    setCloneTopHardness: (hardness: number) => void;
    cloneTopAligned: CloneOptions['aligned'];
    setCloneTopAligned: (enabled: CloneOptions['aligned']) => void;
    cloneTopSampleAllLayers: CloneOptions['sampleAllLayers'];
    setCloneTopSampleAllLayers: (enabled: CloneOptions['sampleAllLayers']) => void;
    cloneSourcePoint: fabric.Point | null;
    setCloneSourcePoint: (point: fabric.Point | null) => void;
};

type PaintControlsState = {
    paintBrushPreset: PaintOptions['brushPreset'];
    setPaintBrushPreset: (preset: RasterBrushPreset) => void;
    paintBrushSize: PaintOptions['size'];
    setPaintBrushSize: (size: PaintOptions['size']) => void;
    paintBrushHardness: PaintOptions['hardness'];
    setPaintBrushHardness: (hardness: PaintOptions['hardness']) => void;
    paintBrushOpacity: PaintOptions['opacity'];
    setPaintBrushOpacity: (opacity: PaintOptions['opacity']) => void;
    paintBrushFlow: PaintOptions['flow'];
    setPaintBrushFlow: (flow: PaintOptions['flow']) => void;
    paintBrushSmoothing: PaintOptions['smoothing'];
    setPaintBrushSmoothing: (smoothing: PaintOptions['smoothing']) => void;
    paintBlendMode: PaintOptions['blendMode'];
    setPaintBlendMode: (mode: RasterBlendMode) => void;
};

type GradientControlsState = {
    gradientTopType: GradientOptions['type'];
    gradientTopBlendMode: GradientOptions['blendMode'];
    gradientTopOpacity: GradientOptions['opacity'];
    gradientTopReverse: GradientOptions['reverse'];
    gradientTopDither: GradientOptions['dither'];
    handleGradientTypeChange: (type: GradientOptions['type']) => void;
    handleGradientBlendModeChange: (mode: GradientOptions['blendMode']) => void;
    handleGradientOpacityChange: (opacity: GradientOptions['opacity']) => void;
    handleGradientReverseChange: (enabled: GradientOptions['reverse']) => void;
    handleGradientDitherChange: (enabled: GradientOptions['dither']) => void;
};

type PenControlsState = {
    penTopMode: PenOptions['mode'];
    setPenTopMode: (mode: PenOptions['mode']) => void;
    penTopPathOperation: PenOptions['pathOperation'];
    setPenTopPathOperation: (operation: PenOptions['pathOperation']) => void;
    penTopAutoAddDelete: PenOptions['autoAddDelete'];
    setPenTopAutoAddDelete: (enabled: PenOptions['autoAddDelete']) => void;
    penTopRubberBand: PenOptions['rubberBand'];
    setPenTopRubberBand: (enabled: PenOptions['rubberBand']) => void;
};

type TextControlsState = {
    textOptions: TextOptions;
    handleTextFontFamilyChange: (fontFamily: string) => void;
    handleTextFontStyleChange: (fontStyle: string) => void;
    handleTextFontSizeChange: (fontSize: number) => void;
    handleTextColorChange: (color: string) => void;
    handleTextBoldChange: (enabled: boolean) => void;
    handleTextItalicChange: (enabled: boolean) => void;
    handleTextUnderlineChange: (enabled: boolean) => void;
    handleTextAlignChange: (align: TextOptions['align']) => void;
};

type ShapeControlsState = {
    shapeTopMode: ShapeOptions['mode'];
    shapeTopFillColor: ShapeOptions['fillColor'];
    shapeTopStrokeColor: ShapeOptions['strokeColor'];
    shapeTopStrokeWidth: ShapeOptions['strokeWidth'];
    shapeTopCornerRadius: ShapeOptions['cornerRadius'];
    shapeTopCanSmoothAngles: ShapeOptions['canSmoothAngles'];
    shapeTopFixedSize: ShapeOptions['fixedSize'];
    handleShapeModeChange: (mode: ShapeOptions['mode']) => void;
    handleShapeFillColorChange: (color: string) => void;
    handleShapeStrokeColorChange: (color: string) => void;
    handleShapeStrokeWidthChange: (width: number) => void;
    handleShapeCornerRadiusChange: (radius: number) => void;
    handleShapeFixedSizeChange: (enabled: boolean) => void;
};

type UtilityControlsState = {
    cropTopRatioPreset: CropOptions['ratioPreset'];
    handleCropRatioPresetChange: (preset: CropOptions['ratioPreset']) => void;
    cropTopDeleteOutside: CropOptions['deleteOutside'];
    setCropTopDeleteOutside: (enabled: CropOptions['deleteOutside']) => void;
    cropTopUseArtboardBounds: CropOptions['useArtboardBounds'];
    setCropTopUseArtboardBounds: (enabled: CropOptions['useArtboardBounds']) => void;
    applyTopCropSettings: () => void;
    eyedropperTopSampleSize: EyedropperOptions['sampleSize'];
    handleEyedropperSampleSizeChange: (size: EyedropperOptions['sampleSize']) => void;
    eyedropperTopSampleSource: EyedropperOptions['sampleSource'];
    setEyedropperTopSampleSource: (source: EyedropperOptions['sampleSource']) => void;
    eyedropperTopSampledColor: EyedropperOptions['sampledColor'];
    handleEyedropperSample: () => void;
    zoomTopMode: ZoomOptions['mode'];
    setZoomTopMode: (mode: ZoomOptions['mode']) => void;
    zoomTopStep: ZoomOptions['step'];
    handleZoomStepChange: (step: ZoomOptions['step']) => void;
    handleZoomApply: () => void;
    handleFitToScreen: () => void;
    handleZoomReset: () => void;
    zoom: number;
    handTopLockPan: HandOptions['lockPan'];
    setHandTopLockPan: (enabled: HandOptions['lockPan']) => void;
};

type EditorTopToolOptionsBridgeProps = {
    activeTool: string;
    canvas: fabric.Canvas | null;
    toolbarRef: MutableRefObject<ToolbarHandle | null>;
    onTriggerTool: (tool: string) => void;
    toolbarState: ToolbarState;
    selectionControls: SelectionControlsState;
    retouchControls: RetouchControlsState;
    paintControls: PaintControlsState;
    gradientControls: GradientControlsState;
    penControls: PenControlsState;
    textControls: TextControlsState;
    shapeControls: ShapeControlsState;
    utilityControls: UtilityControlsState;
};

export default function EditorTopToolOptionsBridge({
    activeTool,
    canvas,
    onTriggerTool,
    toolbarState,
    selectionControls,
    retouchControls,
    paintControls,
    gradientControls,
    penControls,
    textControls,
    shapeControls,
    utilityControls,
}: EditorTopToolOptionsBridgeProps) {
    return (
        <TopToolOptionsBar
            activeTool={activeTool}
            toolbarActions={{
                isDirty: toolbarState.isDirty,
                canUndo: toolbarState.historyState.undo >= 2,
                canRedo: toolbarState.historyState.redo >= 1,
            }}
            onSave={() => {
                void toolbarState.handleSave();
            }}
            onUndo={toolbarState.handleUndo}
            onRedo={toolbarState.handleRedo}
            selectOptions={{
                autoSelectEnabled: selectionControls.autoSelectEnabled,
                selectionMode: selectionControls.selectionMode,
                showTransformControls: selectionControls.showTransformControls,
                feather: selectionControls.selectFeather,
                antiAlias: selectionControls.selectAntiAlias,
                modifyPixels: selectionControls.selectionModifyPixels,
            }}
            onAutoSelectChange={selectionControls.setAutoSelectEnabled}
            onSelectionModeChange={selectionControls.setSelectionMode}
            onTransformControlsChange={selectionControls.setShowTransformControls}
            onSelectFeatherChange={(feather) => {
                const normalizedFeather = Math.max(0, Math.min(100, Math.round(feather)));
                selectionControls.setSelectFeather(normalizedFeather);
                if (!canvas) return;
                const active = canvas.getActiveObject() as (fabric.Object & { set: (props: unknown) => void }) | null;
                if (!active) return;
                active.set({
                    shadow: normalizedFeather > 0
                        ? new fabric.Shadow({
                            color: 'rgba(0, 0, 0, 0.35)',
                            blur: normalizedFeather,
                            offsetX: 0,
                            offsetY: 0,
                        })
                        : null,
                });
                canvas.requestRenderAll();
            }}
            onSelectAntiAliasChange={selectionControls.setSelectAntiAlias}
            onSelectionModifyPixelsChange={(pixels) => {
                selectionControls.setSelectionModifyPixels(Math.max(1, Math.min(120, Math.round(pixels))));
            }}
            onSelectionExpand={() => selectionControls.handleSelectionModify('expand')}
            onSelectionContract={() => selectionControls.handleSelectionModify('contract')}
            onSelectToolChange={(tool) => {
                onTriggerTool(tool);
            }}
            wandOptions={{
                threshold: retouchControls.wandTopThreshold,
            }}
            onWandThresholdChange={(threshold) => {
                retouchControls.setWandTopThreshold(Math.max(0, Math.min(180, Math.round(threshold))));
            }}
            healingOptions={{
                size: retouchControls.healingTopSize,
                hardness: retouchControls.healingTopHardness,
                sampleAllLayers: retouchControls.healingTopSampleAllLayers,
            }}
            onHealingSizeChange={(size) => {
                retouchControls.setHealingTopSize(Math.max(1, Math.min(200, Math.round(size))));
            }}
            onHealingHardnessChange={(hardness) => {
                retouchControls.setHealingTopHardness(Math.max(0, Math.min(100, Math.round(hardness))));
            }}
            onHealingSampleAllLayersChange={retouchControls.setHealingTopSampleAllLayers}
            historyOptions={{
                size: retouchControls.historyBrushTopSize,
                hardness: retouchControls.historyBrushTopHardness,
                sampleAllLayers: retouchControls.historyBrushTopSampleAllLayers,
            }}
            onHistorySizeChange={(size) => {
                retouchControls.setHistoryBrushTopSize(Math.max(1, Math.min(200, Math.round(size))));
            }}
            onHistoryHardnessChange={(hardness) => {
                retouchControls.setHistoryBrushTopHardness(Math.max(0, Math.min(100, Math.round(hardness))));
            }}
            onHistorySampleAllLayersChange={retouchControls.setHistoryBrushTopSampleAllLayers}
            blurOptions={{
                size: retouchControls.blurTopSize,
                strength: retouchControls.blurTopStrength,
                sampleAllLayers: retouchControls.blurTopSampleAllLayers,
            }}
            onBlurSizeChange={(size) => {
                retouchControls.setBlurTopSize(Math.max(1, Math.min(240, Math.round(size))));
            }}
            onBlurStrengthChange={(strength) => {
                retouchControls.setBlurTopStrength(Math.max(1, Math.min(100, Math.round(strength))));
            }}
            onBlurSampleAllLayersChange={retouchControls.setBlurTopSampleAllLayers}
            sharpenOptions={{
                size: retouchControls.sharpenTopSize,
                strength: retouchControls.sharpenTopStrength,
                sampleAllLayers: retouchControls.sharpenTopSampleAllLayers,
            }}
            onSharpenSizeChange={(size) => {
                retouchControls.setSharpenTopSize(Math.max(1, Math.min(240, Math.round(size))));
            }}
            onSharpenStrengthChange={(strength) => {
                retouchControls.setSharpenTopStrength(Math.max(1, Math.min(100, Math.round(strength))));
            }}
            onSharpenSampleAllLayersChange={retouchControls.setSharpenTopSampleAllLayers}
            dodgeOptions={{
                size: retouchControls.dodgeTopSize,
                exposure: retouchControls.dodgeTopExposure,
                protectTones: retouchControls.dodgeTopProtectTones,
            }}
            onDodgeSizeChange={(size) => {
                retouchControls.setDodgeTopSize(Math.max(1, Math.min(240, Math.round(size))));
            }}
            onDodgeExposureChange={(exposure) => {
                retouchControls.setDodgeTopExposure(Math.max(1, Math.min(100, Math.round(exposure))));
            }}
            onDodgeProtectTonesChange={retouchControls.setDodgeTopProtectTones}
            cloneOptions={{
                size: retouchControls.cloneTopSize,
                hardness: retouchControls.cloneTopHardness,
                aligned: retouchControls.cloneTopAligned,
                sampleAllLayers: retouchControls.cloneTopSampleAllLayers,
                hasSource: Boolean(retouchControls.cloneSourcePoint),
            }}
            onCloneSizeChange={(size) => {
                retouchControls.setCloneTopSize(Math.max(1, Math.min(200, Math.round(size))));
            }}
            onCloneHardnessChange={(hardness) => {
                retouchControls.setCloneTopHardness(Math.max(0, Math.min(100, Math.round(hardness))));
            }}
            onCloneAlignedChange={retouchControls.setCloneTopAligned}
            onCloneSampleAllLayersChange={retouchControls.setCloneTopSampleAllLayers}
            onCloneClearSource={() => retouchControls.setCloneSourcePoint(null)}
            paintOptions={{
                brushPreset: paintControls.paintBrushPreset,
                size: paintControls.paintBrushSize,
                hardness: paintControls.paintBrushHardness,
                opacity: paintControls.paintBrushOpacity,
                flow: paintControls.paintBrushFlow,
                smoothing: paintControls.paintBrushSmoothing,
                blendMode: paintControls.paintBlendMode,
            }}
            onPaintPresetChange={paintControls.setPaintBrushPreset}
            onPaintSizeChange={paintControls.setPaintBrushSize}
            onPaintHardnessChange={paintControls.setPaintBrushHardness}
            onPaintOpacityChange={paintControls.setPaintBrushOpacity}
            onPaintFlowChange={paintControls.setPaintBrushFlow}
            onPaintSmoothingChange={paintControls.setPaintBrushSmoothing}
            onPaintBlendModeChange={paintControls.setPaintBlendMode}
            gradientOptions={{
                type: gradientControls.gradientTopType,
                blendMode: gradientControls.gradientTopBlendMode,
                opacity: gradientControls.gradientTopOpacity,
                reverse: gradientControls.gradientTopReverse,
                dither: gradientControls.gradientTopDither,
            }}
            onGradientTypeChange={gradientControls.handleGradientTypeChange}
            onGradientBlendModeChange={gradientControls.handleGradientBlendModeChange}
            onGradientOpacityChange={gradientControls.handleGradientOpacityChange}
            onGradientReverseChange={gradientControls.handleGradientReverseChange}
            onGradientDitherChange={gradientControls.handleGradientDitherChange}
            penOptions={{
                mode: penControls.penTopMode,
                pathOperation: penControls.penTopPathOperation,
                autoAddDelete: penControls.penTopAutoAddDelete,
                rubberBand: penControls.penTopRubberBand,
            }}
            onPenModeChange={(mode) => {
                penControls.setPenTopMode(mode);
                if (!canvas) return;
                (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('pen:config:set', {
                    closure: mode === 'shape' ? 'closed' : 'open',
                });
            }}
            onPenPathOperationChange={(operation) => {
                penControls.setPenTopPathOperation(operation);
                if (!canvas) return;
                (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('pen:config:set', {
                    pathOperation: operation,
                });
            }}
            onPenAutoAddDeleteChange={(enabled) => {
                penControls.setPenTopAutoAddDelete(enabled);
                if (!canvas) return;
                (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('pen:config:set', {
                    autoAddDelete: enabled,
                });
            }}
            onPenRubberBandChange={(enabled) => {
                penControls.setPenTopRubberBand(enabled);
                if (!canvas) return;
                (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('pen:config:set', {
                    rubberBand: enabled,
                });
            }}
            textOptions={textControls.textOptions}
            onTextFontFamilyChange={textControls.handleTextFontFamilyChange}
            onTextFontStyleChange={textControls.handleTextFontStyleChange}
            onTextFontSizeChange={textControls.handleTextFontSizeChange}
            onTextColorChange={textControls.handleTextColorChange}
            onTextBoldChange={textControls.handleTextBoldChange}
            onTextItalicChange={textControls.handleTextItalicChange}
            onTextUnderlineChange={textControls.handleTextUnderlineChange}
            onTextAlignChange={textControls.handleTextAlignChange}
            shapeOptions={{
                mode: shapeControls.shapeTopMode,
                fillColor: shapeControls.shapeTopFillColor,
                strokeColor: shapeControls.shapeTopStrokeColor,
                strokeWidth: shapeControls.shapeTopStrokeWidth,
                cornerRadius: shapeControls.shapeTopCornerRadius,
                canSmoothAngles: shapeControls.shapeTopCanSmoothAngles,
                fixedSize: shapeControls.shapeTopFixedSize,
            }}
            onShapeModeChange={shapeControls.handleShapeModeChange}
            onShapeFillColorChange={shapeControls.handleShapeFillColorChange}
            onShapeStrokeColorChange={shapeControls.handleShapeStrokeColorChange}
            onShapeStrokeWidthChange={shapeControls.handleShapeStrokeWidthChange}
            onShapeCornerRadiusChange={shapeControls.handleShapeCornerRadiusChange}
            onShapeFixedSizeChange={shapeControls.handleShapeFixedSizeChange}
            cropOptions={{
                ratioPreset: utilityControls.cropTopRatioPreset,
                deleteOutside: utilityControls.cropTopDeleteOutside,
                useArtboardBounds: utilityControls.cropTopUseArtboardBounds,
            }}
            onCropRatioPresetChange={utilityControls.handleCropRatioPresetChange}
            onCropDeleteOutsideChange={utilityControls.setCropTopDeleteOutside}
            onCropUseArtboardBoundsChange={utilityControls.setCropTopUseArtboardBounds}
            onCropApply={utilityControls.applyTopCropSettings}
            eyedropperOptions={{
                sampleSize: utilityControls.eyedropperTopSampleSize,
                sampleSource: utilityControls.eyedropperTopSampleSource,
                sampledColor: utilityControls.eyedropperTopSampledColor,
            }}
            onEyedropperSampleSizeChange={utilityControls.handleEyedropperSampleSizeChange}
            onEyedropperSampleSourceChange={utilityControls.setEyedropperTopSampleSource}
            onEyedropperSample={utilityControls.handleEyedropperSample}
            zoomOptions={{
                mode: utilityControls.zoomTopMode,
                step: utilityControls.zoomTopStep,
                zoomPercent: Math.round(utilityControls.zoom * 100),
            }}
            onZoomModeChange={utilityControls.setZoomTopMode}
            onZoomStepChange={utilityControls.handleZoomStepChange}
            onZoomApply={utilityControls.handleZoomApply}
            onZoomFitToScreen={utilityControls.handleFitToScreen}
            onZoomReset={utilityControls.handleZoomReset}
            handOptions={{
                lockPan: utilityControls.handTopLockPan,
            }}
            onHandLockPanChange={utilityControls.setHandTopLockPan}
        />
    );
}
