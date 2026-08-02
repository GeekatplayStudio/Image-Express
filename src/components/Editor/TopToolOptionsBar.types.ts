import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';

export interface TopToolOptionsBarProps {
    activeTool: string;
    toolbarActions?: {
        isDirty: boolean;
        canUndo: boolean;
        canRedo: boolean;
    };
    onSave?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    selectOptions?: {
        autoSelectEnabled: boolean;
        selectionMode: 'layer' | 'group';
        showTransformControls: boolean;
        feather: number;
        antiAlias: boolean;
        modifyPixels?: number;
    };
    onAutoSelectChange?: (enabled: boolean) => void;
    onSelectionModeChange?: (mode: 'layer' | 'group') => void;
    onTransformControlsChange?: (enabled: boolean) => void;
    onSelectFeatherChange?: (feather: number) => void;
    onSelectAntiAliasChange?: (enabled: boolean) => void;
    onSelectionModifyPixelsChange?: (pixels: number) => void;
    onSelectionExpand?: () => void;
    onSelectionContract?: () => void;
    onSelectToolChange?: (tool: 'select' | 'marquee' | 'lasso' | 'wand' | 'quick-select' | 'selection-brush' | 'path-select') => void;
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
    wandOptions?: {
        threshold: number;
        sampleMode: 'contiguous' | 'color';
        sampleColor: string;
    };
    onWandThresholdChange?: (threshold: number) => void;
    onWandSampleModeChange?: (mode: 'contiguous' | 'color') => void;
    onWandSampleColorChange?: (hex: string) => void;
    onWandApplyColor?: () => void;
    paintOptions?: {
        brushPreset: RasterBrushPreset;
        size: number;
        hardness: number;
        opacity: number;
        flow: number;
        smoothing: number;
        blendMode: RasterBlendMode;
    };
    onPaintPresetChange?: (preset: RasterBrushPreset) => void;
    onPaintSizeChange?: (size: number) => void;
    onPaintHardnessChange?: (hardness: number) => void;
    onPaintOpacityChange?: (opacity: number) => void;
    onPaintFlowChange?: (flow: number) => void;
    onPaintSmoothingChange?: (smoothing: number) => void;
    onPaintBlendModeChange?: (mode: RasterBlendMode) => void;
    gradientOptions?: {
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
    penOptions?: {
        mode: 'path' | 'shape';
        pathOperation: 'add' | 'subtract' | 'intersect';
        autoAddDelete: boolean;
        rubberBand: boolean;
    };
    onPenModeChange?: (mode: 'path' | 'shape') => void;
    onPenPathOperationChange?: (operation: 'add' | 'subtract' | 'intersect') => void;
    onPenAutoAddDeleteChange?: (enabled: boolean) => void;
    onPenRubberBandChange?: (enabled: boolean) => void;
    textOptions?: {
        fontFamily: string;
        fontFamilies: string[];
        fontStyle: string;
        fontStyles: string[];
        fontSize: number;
        color: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
        align: 'left' | 'center' | 'right' | 'justify';
        spellcheck?: boolean;
    };
    onTextFontFamilyChange?: (fontFamily: string) => void;
    onTextFontStyleChange?: (fontStyle: string) => void;
    onTextFontSizeChange?: (fontSize: number) => void;
    onTextColorChange?: (color: string) => void;
    onTextBoldChange?: (enabled: boolean) => void;
    onTextItalicChange?: (enabled: boolean) => void;
    onTextUnderlineChange?: (enabled: boolean) => void;
    onTextAlignChange?: (align: 'left' | 'center' | 'right' | 'justify') => void;
    shapeOptions?: {
        mode: 'shape' | 'path' | 'pixels';
        fillColor: string;
        strokeColor: string;
        strokeWidth: number;
        cornerRadius: number;
        canSmoothAngles: boolean;
        fixedSize: boolean;
    };
    onShapeModeChange?: (mode: 'shape' | 'path' | 'pixels') => void;
    onShapeFillColorChange?: (color: string) => void;
    onShapeStrokeColorChange?: (color: string) => void;
    onShapeStrokeWidthChange?: (width: number) => void;
    onShapeCornerRadiusChange?: (radius: number) => void;
    onShapeFixedSizeChange?: (enabled: boolean) => void;
    cropOptions?: {
        ratioPreset: 'free' | '1:1' | '4:3' | '16:9';
        deleteOutside: boolean;
        useArtboardBounds: boolean;
    };
    onCropRatioPresetChange?: (preset: 'free' | '1:1' | '4:3' | '16:9') => void;
    onCropDeleteOutsideChange?: (enabled: boolean) => void;
    onCropUseArtboardBoundsChange?: (enabled: boolean) => void;
    onCropApply?: () => void;
    eyedropperOptions?: {
        sampleSize: 1 | 3 | 5 | 11;
        sampleSource: 'current-layer' | 'all-layers';
        sampledColor: string;
    };
    onEyedropperSampleSizeChange?: (size: 1 | 3 | 5 | 11) => void;
    onEyedropperSampleSourceChange?: (source: 'current-layer' | 'all-layers') => void;
    onEyedropperSample?: () => void;
    zoomOptions?: {
        mode: 'in' | 'out';
        step: 5 | 10 | 25 | 50;
        zoomPercent: number;
    };
    onZoomModeChange?: (mode: 'in' | 'out') => void;
    onZoomStepChange?: (step: 5 | 10 | 25 | 50) => void;
    onZoomApply?: () => void;
    onZoomFitToScreen?: () => void;
    onZoomReset?: () => void;
    handOptions?: {
        lockPan: boolean;
    };
    onHandLockPanChange?: (enabled: boolean) => void;
}
