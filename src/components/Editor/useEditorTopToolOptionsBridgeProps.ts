import type * as fabric from 'fabric';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { ToolbarHandle } from '@/components/Toolbar';
import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';
import type { TopCropRatioPreset, TopEyedropperSampleSize, TopZoomStep } from '@/components/Editor/editorViewConfig';
import type { TopToolOptionsBarProps } from '@/components/Editor/TopToolOptionsBar.types';

type GradientOptions = NonNullable<TopToolOptionsBarProps['gradientOptions']>;
type ShapeOptions = NonNullable<TopToolOptionsBarProps['shapeOptions']>;

type UseEditorTopToolOptionsBridgePropsArgs = {
    canvas: fabric.Canvas | null;
    toolbarRef: MutableRefObject<ToolbarHandle | null>;
    isDirty: boolean;
    historyState: { undo: number; redo: number };
    handleSave: () => Promise<void>;
    handleUndo: () => void;
    handleRedo: () => void;
    autoSelectEnabled: boolean;
    setAutoSelectEnabled: (enabled: boolean) => void;
    selectionMode: 'layer' | 'group';
    setSelectionMode: (mode: 'layer' | 'group') => void;
    showTransformControls: boolean;
    setShowTransformControls: (enabled: boolean) => void;
    selectFeather: number;
    setSelectFeather: (value: number) => void;
    selectAntiAlias: boolean;
    setSelectAntiAlias: (enabled: boolean) => void;
    selectionModifyPixels: number;
    setSelectionModifyPixels: (value: number) => void;
    handleSelectionModify: (direction: 'expand' | 'contract') => void;
    wandTopThreshold: number;
    setWandTopThreshold: (value: number) => void;
    wandSampleMode: 'contiguous' | 'color';
    setWandSampleMode: (mode: 'contiguous' | 'color') => void;
    wandSampleColor: string;
    setWandSampleColor: (hex: string) => void;
    onWandApplyColor: () => void;
    healingTopSize: number;
    setHealingTopSize: (value: number) => void;
    healingTopHardness: number;
    setHealingTopHardness: (value: number) => void;
    healingTopSampleAllLayers: boolean;
    setHealingTopSampleAllLayers: (enabled: boolean) => void;
    historyBrushTopSize: number;
    setHistoryBrushTopSize: (value: number) => void;
    historyBrushTopHardness: number;
    setHistoryBrushTopHardness: (value: number) => void;
    historyBrushTopSampleAllLayers: boolean;
    setHistoryBrushTopSampleAllLayers: (enabled: boolean) => void;
    blurTopSize: number;
    setBlurTopSize: (value: number) => void;
    blurTopStrength: number;
    setBlurTopStrength: (value: number) => void;
    blurTopSampleAllLayers: boolean;
    setBlurTopSampleAllLayers: (enabled: boolean) => void;
    sharpenTopSize: number;
    setSharpenTopSize: (value: number) => void;
    sharpenTopStrength: number;
    setSharpenTopStrength: (value: number) => void;
    sharpenTopSampleAllLayers: boolean;
    setSharpenTopSampleAllLayers: (enabled: boolean) => void;
    dodgeTopSize: number;
    setDodgeTopSize: (value: number) => void;
    dodgeTopExposure: number;
    setDodgeTopExposure: (value: number) => void;
    dodgeTopProtectTones: boolean;
    setDodgeTopProtectTones: (enabled: boolean) => void;
    cloneTopSize: number;
    setCloneTopSize: (value: number) => void;
    cloneTopHardness: number;
    setCloneTopHardness: (value: number) => void;
    cloneTopAligned: boolean;
    setCloneTopAligned: (enabled: boolean) => void;
    cloneTopSampleAllLayers: boolean;
    setCloneTopSampleAllLayers: (enabled: boolean) => void;
    cloneSourcePoint: fabric.Point | null;
    setCloneSourcePoint: (point: fabric.Point | null) => void;
    paintBrushPreset: RasterBrushPreset;
    setPaintBrushPreset: Dispatch<SetStateAction<RasterBrushPreset>>;
    paintBrushSize: number;
    setPaintBrushSize: (value: number) => void;
    paintBrushHardness: number;
    setPaintBrushHardness: (value: number) => void;
    paintBrushOpacity: number;
    setPaintBrushOpacity: (value: number) => void;
    paintBrushFlow: number;
    setPaintBrushFlow: (value: number) => void;
    paintBrushSmoothing: number;
    setPaintBrushSmoothing: (value: number) => void;
    paintBlendMode: RasterBlendMode;
    setPaintBlendMode: Dispatch<SetStateAction<RasterBlendMode>>;
    gradientTopType: GradientOptions['type'];
    gradientTopBlendMode: GradientOptions['blendMode'];
    gradientTopOpacity: GradientOptions['opacity'];
    gradientTopReverse: GradientOptions['reverse'];
    gradientTopDither: GradientOptions['dither'];
    handleGradientTypeChange: (value: GradientOptions['type']) => void;
    handleGradientBlendModeChange: (value: GradientOptions['blendMode']) => void;
    handleGradientOpacityChange: (value: number) => void;
    handleGradientReverseChange: (value: boolean) => void;
    handleGradientDitherChange: (value: boolean) => void;
    penTopMode: 'path' | 'shape';
    setPenTopMode: (mode: 'path' | 'shape') => void;
    penTopPathOperation: 'add' | 'subtract' | 'intersect';
    setPenTopPathOperation: (mode: 'add' | 'subtract' | 'intersect') => void;
    penTopAutoAddDelete: boolean;
    setPenTopAutoAddDelete: (enabled: boolean) => void;
    penTopRubberBand: boolean;
    setPenTopRubberBand: (enabled: boolean) => void;
    textOptions: {
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
        spellcheck: boolean;
    };
    handleTextFontFamilyChange: (fontFamily: string) => void;
    handleTextFontStyleChange: (fontStyle: string) => void;
    handleTextFontSizeChange: (fontSize: number) => void;
    handleTextColorChange: (color: string) => void;
    handleTextBoldChange: (enabled: boolean) => void;
    handleTextItalicChange: (enabled: boolean) => void;
    handleTextUnderlineChange: (enabled: boolean) => void;
    handleTextAlignChange: (align: 'left' | 'center' | 'right' | 'justify') => void;
    shapeTopMode: ShapeOptions['mode'];
    shapeTopFillColor: string;
    shapeTopStrokeColor: string;
    shapeTopStrokeWidth: number;
    shapeTopCornerRadius: number;
    shapeTopCanSmoothAngles: boolean;
    shapeTopFixedSize: boolean;
    handleShapeModeChange: (mode: ShapeOptions['mode']) => void;
    handleShapeFillColorChange: (color: string) => void;
    handleShapeStrokeColorChange: (color: string) => void;
    handleShapeStrokeWidthChange: (width: number) => void;
    handleShapeCornerRadiusChange: (radius: number) => void;
    handleShapeFixedSizeChange: (enabled: boolean) => void;
    cropTopRatioPreset: TopCropRatioPreset;
    handleCropRatioPresetChange: (preset: TopCropRatioPreset) => void;
    cropTopDeleteOutside: boolean;
    setCropTopDeleteOutside: (enabled: boolean) => void;
    cropTopUseArtboardBounds: boolean;
    setCropTopUseArtboardBounds: (enabled: boolean) => void;
    applyTopCropSettings: () => void;
    eyedropperTopSampleSize: TopEyedropperSampleSize;
    handleEyedropperSampleSizeChange: (size: TopEyedropperSampleSize) => void;
    eyedropperTopSampleSource: 'current-layer' | 'all-layers';
    setEyedropperTopSampleSource: (source: 'current-layer' | 'all-layers') => void;
    eyedropperTopSampledColor: string;
    handleEyedropperSample: () => void;
    zoomTopMode: 'in' | 'out';
    setZoomTopMode: (mode: 'in' | 'out') => void;
    zoomTopStep: TopZoomStep;
    handleZoomStepChange: (step: TopZoomStep) => void;
    handleZoomApply: () => void;
    handleFitToScreen: () => void;
    handleZoomReset: () => void;
    zoom: number;
    handTopLockPan: boolean;
    setHandTopLockPan: (enabled: boolean) => void;
};

export function useEditorTopToolOptionsBridgeProps(args: UseEditorTopToolOptionsBridgePropsArgs) {
    const {
        canvas,
        toolbarRef,
        isDirty,
        historyState,
        handleSave,
        handleUndo,
        handleRedo,
        autoSelectEnabled,
        setAutoSelectEnabled,
        selectionMode,
        setSelectionMode,
        showTransformControls,
        setShowTransformControls,
        selectFeather,
        setSelectFeather,
        selectAntiAlias,
        setSelectAntiAlias,
        selectionModifyPixels,
        setSelectionModifyPixels,
        handleSelectionModify,
        wandTopThreshold,
        setWandTopThreshold,
        wandSampleMode,
        setWandSampleMode,
        wandSampleColor,
        setWandSampleColor,
        onWandApplyColor,
        healingTopSize,
        setHealingTopSize,
        healingTopHardness,
        setHealingTopHardness,
        healingTopSampleAllLayers,
        setHealingTopSampleAllLayers,
        historyBrushTopSize,
        setHistoryBrushTopSize,
        historyBrushTopHardness,
        setHistoryBrushTopHardness,
        historyBrushTopSampleAllLayers,
        setHistoryBrushTopSampleAllLayers,
        blurTopSize,
        setBlurTopSize,
        blurTopStrength,
        setBlurTopStrength,
        blurTopSampleAllLayers,
        setBlurTopSampleAllLayers,
        sharpenTopSize,
        setSharpenTopSize,
        sharpenTopStrength,
        setSharpenTopStrength,
        sharpenTopSampleAllLayers,
        setSharpenTopSampleAllLayers,
        dodgeTopSize,
        setDodgeTopSize,
        dodgeTopExposure,
        setDodgeTopExposure,
        dodgeTopProtectTones,
        setDodgeTopProtectTones,
        cloneTopSize,
        setCloneTopSize,
        cloneTopHardness,
        setCloneTopHardness,
        cloneTopAligned,
        setCloneTopAligned,
        cloneTopSampleAllLayers,
        setCloneTopSampleAllLayers,
        cloneSourcePoint,
        setCloneSourcePoint,
        paintBrushPreset,
        setPaintBrushPreset,
        paintBrushSize,
        setPaintBrushSize,
        paintBrushHardness,
        setPaintBrushHardness,
        paintBrushOpacity,
        setPaintBrushOpacity,
        paintBrushFlow,
        setPaintBrushFlow,
        paintBrushSmoothing,
        setPaintBrushSmoothing,
        paintBlendMode,
        setPaintBlendMode,
        gradientTopType,
        gradientTopBlendMode,
        gradientTopOpacity,
        gradientTopReverse,
        gradientTopDither,
        handleGradientTypeChange,
        handleGradientBlendModeChange,
        handleGradientOpacityChange,
        handleGradientReverseChange,
        handleGradientDitherChange,
        penTopMode,
        setPenTopMode,
        penTopPathOperation,
        setPenTopPathOperation,
        penTopAutoAddDelete,
        setPenTopAutoAddDelete,
        penTopRubberBand,
        setPenTopRubberBand,
        textOptions,
        handleTextFontFamilyChange,
        handleTextFontStyleChange,
        handleTextFontSizeChange,
        handleTextColorChange,
        handleTextBoldChange,
        handleTextItalicChange,
        handleTextUnderlineChange,
        handleTextAlignChange,
        shapeTopMode,
        shapeTopFillColor,
        shapeTopStrokeColor,
        shapeTopStrokeWidth,
        shapeTopCornerRadius,
        shapeTopCanSmoothAngles,
        shapeTopFixedSize,
        handleShapeModeChange,
        handleShapeFillColorChange,
        handleShapeStrokeColorChange,
        handleShapeStrokeWidthChange,
        handleShapeCornerRadiusChange,
        handleShapeFixedSizeChange,
        cropTopRatioPreset,
        handleCropRatioPresetChange,
        cropTopDeleteOutside,
        setCropTopDeleteOutside,
        cropTopUseArtboardBounds,
        setCropTopUseArtboardBounds,
        applyTopCropSettings,
        eyedropperTopSampleSize,
        handleEyedropperSampleSizeChange,
        eyedropperTopSampleSource,
        setEyedropperTopSampleSource,
        eyedropperTopSampledColor,
        handleEyedropperSample,
        zoomTopMode,
        setZoomTopMode,
        zoomTopStep,
        handleZoomStepChange,
        handleZoomApply,
        handleFitToScreen,
        handleZoomReset,
        zoom,
        handTopLockPan,
        setHandTopLockPan,
    } = args;

    return {
        canvas,
        toolbarRef,
        toolbarState: { isDirty, historyState, handleSave, handleUndo, handleRedo },
        selectionControls: {
            autoSelectEnabled, setAutoSelectEnabled, selectionMode, setSelectionMode,
            showTransformControls, setShowTransformControls, selectFeather, setSelectFeather,
            selectAntiAlias, setSelectAntiAlias, selectionModifyPixels, setSelectionModifyPixels, handleSelectionModify,
        },
        retouchControls: {
            wandTopThreshold, setWandTopThreshold,
            wandSampleMode, setWandSampleMode, wandSampleColor, setWandSampleColor, onWandApplyColor,
            healingTopSize, setHealingTopSize, healingTopHardness, setHealingTopHardness,
            healingTopSampleAllLayers, setHealingTopSampleAllLayers, historyBrushTopSize, setHistoryBrushTopSize,
            historyBrushTopHardness, setHistoryBrushTopHardness, historyBrushTopSampleAllLayers, setHistoryBrushTopSampleAllLayers,
            blurTopSize, setBlurTopSize, blurTopStrength, setBlurTopStrength, blurTopSampleAllLayers, setBlurTopSampleAllLayers,
            sharpenTopSize, setSharpenTopSize, sharpenTopStrength, setSharpenTopStrength, sharpenTopSampleAllLayers, setSharpenTopSampleAllLayers,
            dodgeTopSize, setDodgeTopSize, dodgeTopExposure, setDodgeTopExposure, dodgeTopProtectTones, setDodgeTopProtectTones,
            cloneTopSize, setCloneTopSize, cloneTopHardness, setCloneTopHardness, cloneTopAligned, setCloneTopAligned,
            cloneTopSampleAllLayers, setCloneTopSampleAllLayers, cloneSourcePoint, setCloneSourcePoint,
        },
        paintControls: {
            paintBrushPreset, setPaintBrushPreset, paintBrushSize, setPaintBrushSize, paintBrushHardness, setPaintBrushHardness,
            paintBrushOpacity, setPaintBrushOpacity, paintBrushFlow, setPaintBrushFlow, paintBrushSmoothing, setPaintBrushSmoothing,
            paintBlendMode, setPaintBlendMode,
        },
        gradientControls: {
            gradientTopType, gradientTopBlendMode, gradientTopOpacity, gradientTopReverse, gradientTopDither,
            handleGradientTypeChange, handleGradientBlendModeChange, handleGradientOpacityChange,
            handleGradientReverseChange, handleGradientDitherChange,
        },
        penControls: {
            penTopMode, setPenTopMode, penTopPathOperation, setPenTopPathOperation,
            penTopAutoAddDelete, setPenTopAutoAddDelete, penTopRubberBand, setPenTopRubberBand,
        },
        textControls: {
            textOptions, handleTextFontFamilyChange, handleTextFontStyleChange, handleTextFontSizeChange,
            handleTextColorChange, handleTextBoldChange, handleTextItalicChange, handleTextUnderlineChange, handleTextAlignChange,
        },
        shapeControls: {
            shapeTopMode, shapeTopFillColor, shapeTopStrokeColor, shapeTopStrokeWidth, shapeTopCornerRadius,
            shapeTopCanSmoothAngles, shapeTopFixedSize, handleShapeModeChange, handleShapeFillColorChange,
            handleShapeStrokeColorChange, handleShapeStrokeWidthChange, handleShapeCornerRadiusChange, handleShapeFixedSizeChange,
        },
        utilityControls: {
            cropTopRatioPreset, handleCropRatioPresetChange, cropTopDeleteOutside, setCropTopDeleteOutside,
            cropTopUseArtboardBounds, setCropTopUseArtboardBounds, applyTopCropSettings,
            eyedropperTopSampleSize, handleEyedropperSampleSizeChange, eyedropperTopSampleSource,
            setEyedropperTopSampleSource, eyedropperTopSampledColor, handleEyedropperSample,
            zoomTopMode, setZoomTopMode, zoomTopStep, handleZoomStepChange, handleZoomApply,
            handleFitToScreen, handleZoomReset, zoom, handTopLockPan, setHandTopLockPan,
        },
    };
}
