'use client';

import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';
import SelectionControls from '@/components/Editor/top-tool-options/SelectionControls';
import PaintControls from '@/components/Editor/top-tool-options/PaintControls';
import RetouchControls from '@/components/Editor/top-tool-options/RetouchControls';
import GradientControls from '@/components/Editor/top-tool-options/GradientControls';

interface TopToolOptionsBarProps {
    activeTool: string;
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
    wandOptions?: {
        threshold: number;
    };
    onWandThresholdChange?: (threshold: number) => void;
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
        fixedSize: boolean;
    };
    onShapeModeChange?: (mode: 'shape' | 'path' | 'pixels') => void;
    onShapeFillColorChange?: (color: string) => void;
    onShapeStrokeColorChange?: (color: string) => void;
    onShapeStrokeWidthChange?: (width: number) => void;
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

export default function TopToolOptionsBar({
    activeTool,
    selectOptions,
    onAutoSelectChange,
    onSelectionModeChange,
    onTransformControlsChange,
    onSelectFeatherChange,
    onSelectAntiAliasChange,
    onSelectionModifyPixelsChange,
    onSelectionExpand,
    onSelectionContract,
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
                : normalizedActiveTool === 'healing'
                    ? 'healing brush'
            : normalizedActiveTool;

    const hasQuickControls = Boolean(
        (activeTool === 'select' && selectOptions)
        || (activeTool === 'marquee' && selectOptions)
        || (activeTool === 'lasso' && selectOptions)
        || (activeTool === 'wand' && selectOptions)
        || (activeTool === 'healing' && healingOptions)
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

    return (
        <div
            data-testid="top-tool-options-bar"
            className="h-12 border-b border-border/50 bg-card/60 backdrop-blur-sm px-4 flex items-center justify-between gap-4"
        >
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
                    Tool Options
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-secondary text-foreground border border-border/60 truncate">
                    {displayToolName}
                </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {(activeTool === 'select' || activeTool === 'marquee' || activeTool === 'lasso' || activeTool === 'wand') && selectOptions && (
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

                {(activeTool === 'healing' || activeTool === 'clone-stamp') && (
                    <RetouchControls
                        activeTool={activeTool}
                        healingOptions={healingOptions}
                        onHealingSizeChange={onHealingSizeChange}
                        onHealingHardnessChange={onHealingHardnessChange}
                        onHealingSampleAllLayersChange={onHealingSampleAllLayersChange}
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

                {activeTool === 'pen' && penOptions && (
                    <>
                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onPenModeChange?.('path')}
                                className={`px-2.5 py-1 text-xs ${penOptions.mode === 'path' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen mode path"
                            >
                                Path
                            </button>
                            <button
                                onClick={() => onPenModeChange?.('shape')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.mode === 'shape' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen mode shape"
                            >
                                Shape
                            </button>
                        </div>

                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onPenPathOperationChange?.('add')}
                                className={`px-2.5 py-1 text-xs ${penOptions.pathOperation === 'add' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen operation add"
                            >
                                Add
                            </button>
                            <button
                                onClick={() => onPenPathOperationChange?.('subtract')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.pathOperation === 'subtract' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen operation subtract"
                            >
                                Subtract
                            </button>
                            <button
                                onClick={() => onPenPathOperationChange?.('intersect')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.pathOperation === 'intersect' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Pen operation intersect"
                            >
                                Intersect
                            </button>
                        </div>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={penOptions.autoAddDelete}
                                onChange={(event) => onPenAutoAddDeleteChange?.(event.target.checked)}
                                aria-label="Pen auto add delete"
                            />
                            <span>Auto Add/Delete</span>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={penOptions.rubberBand}
                                onChange={(event) => onPenRubberBandChange?.(event.target.checked)}
                                aria-label="Pen rubber band"
                            />
                            <span>Rubber Band</span>
                        </label>
                    </>
                )}

                {activeTool === 'text' && textOptions && (
                    <>
                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Font</span>
                            <select
                                aria-label="Text font family"
                                value={textOptions.fontFamily}
                                onChange={(event) => onTextFontFamilyChange?.(event.target.value)}
                                className="bg-transparent outline-none"
                            >
                                {textOptions.fontFamilies.map((font) => (
                                    <option key={font} value={font}>{font}</option>
                                ))}
                            </select>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Style</span>
                            <select
                                aria-label="Text font style"
                                value={textOptions.fontStyle}
                                onChange={(event) => onTextFontStyleChange?.(event.target.value)}
                                className="bg-transparent outline-none"
                            >
                                {textOptions.fontStyles.map((style) => (
                                    <option key={style} value={style}>{style}</option>
                                ))}
                            </select>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Size</span>
                            <input
                                aria-label="Text font size"
                                type="range"
                                min={8}
                                max={240}
                                value={textOptions.fontSize}
                                onChange={(event) => onTextFontSizeChange?.(Number(event.target.value))}
                                className="w-20"
                            />
                            <span>{textOptions.fontSize}px</span>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Color</span>
                            <input
                                aria-label="Text color"
                                type="color"
                                value={textOptions.color}
                                onChange={(event) => onTextColorChange?.(event.target.value)}
                                className="h-6 w-8 rounded border border-border/60 bg-transparent p-0"
                            />
                        </label>

                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onTextBoldChange?.(!textOptions.bold)}
                                className={`px-2.5 py-1 text-xs font-bold ${textOptions.bold ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Text toggle bold"
                            >
                                B
                            </button>
                            <button
                                onClick={() => onTextItalicChange?.(!textOptions.italic)}
                                className={`px-2.5 py-1 text-xs italic border-l border-border/50 ${textOptions.italic ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Text toggle italic"
                            >
                                I
                            </button>
                            <button
                                onClick={() => onTextUnderlineChange?.(!textOptions.underline)}
                                className={`px-2.5 py-1 text-xs underline border-l border-border/50 ${textOptions.underline ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Text toggle underline"
                            >
                                U
                            </button>
                        </div>

                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onTextAlignChange?.('left')}
                                className={`px-2.5 py-1 text-xs ${textOptions.align === 'left' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Text align left"
                            >
                                L
                            </button>
                            <button
                                onClick={() => onTextAlignChange?.('center')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${textOptions.align === 'center' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Text align center"
                            >
                                C
                            </button>
                            <button
                                onClick={() => onTextAlignChange?.('right')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${textOptions.align === 'right' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Text align right"
                            >
                                R
                            </button>
                            <button
                                onClick={() => onTextAlignChange?.('justify')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${textOptions.align === 'justify' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Text align justify"
                            >
                                J
                            </button>
                        </div>
                    </>
                )}

                {activeTool === 'shapes' && shapeOptions && (
                    <>
                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onShapeModeChange?.('shape')}
                                className={`px-2.5 py-1 text-xs ${shapeOptions.mode === 'shape' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Shape mode shape"
                            >
                                Shape
                            </button>
                            <button
                                onClick={() => onShapeModeChange?.('path')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${shapeOptions.mode === 'path' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Shape mode path"
                            >
                                Path
                            </button>
                            <button
                                onClick={() => onShapeModeChange?.('pixels')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${shapeOptions.mode === 'pixels' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Shape mode pixels"
                            >
                                Pixels
                            </button>
                        </div>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Fill</span>
                            <input
                                aria-label="Shape fill color"
                                type="color"
                                value={shapeOptions.fillColor}
                                onChange={(event) => onShapeFillColorChange?.(event.target.value)}
                                className="h-6 w-8 rounded border border-border/60 bg-transparent p-0"
                            />
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Stroke</span>
                            <input
                                aria-label="Shape stroke color"
                                type="color"
                                value={shapeOptions.strokeColor}
                                onChange={(event) => onShapeStrokeColorChange?.(event.target.value)}
                                className="h-6 w-8 rounded border border-border/60 bg-transparent p-0"
                            />
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Stroke Width</span>
                            <input
                                aria-label="Shape stroke width"
                                type="range"
                                min={0}
                                max={40}
                                value={shapeOptions.strokeWidth}
                                onChange={(event) => onShapeStrokeWidthChange?.(Number(event.target.value))}
                                className="w-20"
                            />
                            <span>{shapeOptions.strokeWidth}px</span>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={shapeOptions.fixedSize}
                                onChange={(event) => onShapeFixedSizeChange?.(event.target.checked)}
                                aria-label="Shape fixed size"
                            />
                            <span>Fixed Size</span>
                        </label>
                    </>
                )}

                {activeTool === 'crop' && cropOptions && (
                    <>
                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onCropRatioPresetChange?.('free')}
                                className={`px-2.5 py-1 text-xs ${cropOptions.ratioPreset === 'free' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Crop ratio free"
                            >
                                Free
                            </button>
                            <button
                                onClick={() => onCropRatioPresetChange?.('1:1')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${cropOptions.ratioPreset === '1:1' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Crop ratio 1:1"
                            >
                                1:1
                            </button>
                            <button
                                onClick={() => onCropRatioPresetChange?.('4:3')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${cropOptions.ratioPreset === '4:3' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Crop ratio 4:3"
                            >
                                4:3
                            </button>
                            <button
                                onClick={() => onCropRatioPresetChange?.('16:9')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${cropOptions.ratioPreset === '16:9' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Crop ratio 16:9"
                            >
                                16:9
                            </button>
                        </div>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={cropOptions.deleteOutside}
                                onChange={(event) => onCropDeleteOutsideChange?.(event.target.checked)}
                                aria-label="Crop delete outside"
                            />
                            <span>Delete Outside</span>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={cropOptions.useArtboardBounds}
                                onChange={(event) => onCropUseArtboardBoundsChange?.(event.target.checked)}
                                aria-label="Crop use artboard bounds"
                            />
                            <span>Use Artboard Bounds</span>
                        </label>

                        <button
                            onClick={() => onCropApply?.()}
                            className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                            aria-label="Apply crop"
                        >
                            Apply Crop
                        </button>
                    </>
                )}

                {activeTool === 'eyedropper' && eyedropperOptions && (
                    <>
                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Sample Size</span>
                            <select
                                aria-label="Eyedropper sample size"
                                value={eyedropperOptions.sampleSize}
                                onChange={(event) => onEyedropperSampleSizeChange?.(Number(event.target.value) as 1 | 3 | 5 | 11)}
                                className="bg-transparent outline-none"
                            >
                                <option value={1}>Point</option>
                                <option value={3}>3x3</option>
                                <option value={5}>5x5</option>
                                <option value={11}>11x11</option>
                            </select>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Source</span>
                            <select
                                aria-label="Eyedropper sample source"
                                value={eyedropperOptions.sampleSource}
                                onChange={(event) => onEyedropperSampleSourceChange?.(event.target.value as 'current-layer' | 'all-layers')}
                                className="bg-transparent outline-none"
                            >
                                <option value="current-layer">Current Layer</option>
                                <option value="all-layers">All Layers</option>
                            </select>
                        </label>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Color</span>
                            <input
                                aria-label="Eyedropper sampled color"
                                type="color"
                                value={eyedropperOptions.sampledColor}
                                readOnly
                                className="h-6 w-8 rounded border border-border/60 bg-transparent p-0"
                            />
                        </label>

                        <button
                            onClick={() => onEyedropperSample?.()}
                            className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                            aria-label="Eyedropper sample"
                        >
                            Sample
                        </button>
                    </>
                )}

                {activeTool === 'zoom' && zoomOptions && (
                    <>
                        <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                            <button
                                onClick={() => onZoomModeChange?.('in')}
                                className={`px-2.5 py-1 text-xs ${zoomOptions.mode === 'in' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Zoom mode in"
                            >
                                In
                            </button>
                            <button
                                onClick={() => onZoomModeChange?.('out')}
                                className={`px-2.5 py-1 text-xs border-l border-border/50 ${zoomOptions.mode === 'out' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                aria-label="Zoom mode out"
                            >
                                Out
                            </button>
                        </div>

                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <span className="text-muted-foreground">Step</span>
                            <select
                                aria-label="Zoom step"
                                value={zoomOptions.step}
                                onChange={(event) => onZoomStepChange?.(Number(event.target.value) as 5 | 10 | 25 | 50)}
                                className="bg-transparent outline-none"
                            >
                                <option value={5}>5%</option>
                                <option value={10}>10%</option>
                                <option value={25}>25%</option>
                                <option value={50}>50%</option>
                            </select>
                        </label>

                        <span className="shrink-0 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            {zoomOptions.zoomPercent}%
                        </span>

                        <button
                            onClick={() => onZoomApply?.()}
                            className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                            aria-label="Zoom apply"
                        >
                            Apply
                        </button>

                        <button
                            onClick={() => onZoomFitToScreen?.()}
                            className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                            aria-label="Zoom fit to screen"
                        >
                            Fit
                        </button>

                        <button
                            onClick={() => onZoomReset?.()}
                            className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                            aria-label="Zoom reset"
                        >
                            100%
                        </button>
                    </>
                )}

                {activeTool === 'hand' && handOptions && (
                    <>
                        <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                            <input
                                type="checkbox"
                                checked={handOptions.lockPan}
                                onChange={(event) => onHandLockPanChange?.(event.target.checked)}
                                aria-label="Hand lock pan"
                            />
                            <span>Pan Without Space</span>
                        </label>
                        <span className="shrink-0 text-xs text-muted-foreground px-2 py-1 rounded-md border border-border/60 bg-secondary/30">
                            Space + Drag remains available.
                        </span>
                    </>
                )}
                {!hasQuickControls && (
                    <span className="shrink-0 text-xs text-muted-foreground px-2">
                        No quick properties for this tool.
                    </span>
                )}
            </div>
        </div>
    );
}
