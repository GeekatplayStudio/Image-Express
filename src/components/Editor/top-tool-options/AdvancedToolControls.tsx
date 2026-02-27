import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { TopToolOptionsBarProps } from '@/components/Editor/TopToolOptionsBar.types';

type AdvancedToolControlsProps = Pick<
    TopToolOptionsBarProps,
    | 'activeTool'
    | 'penOptions'
    | 'onPenModeChange'
    | 'onPenPathOperationChange'
    | 'onPenAutoAddDeleteChange'
    | 'onPenRubberBandChange'
    | 'textOptions'
    | 'onTextFontFamilyChange'
    | 'onTextFontStyleChange'
    | 'onTextFontSizeChange'
    | 'onTextColorChange'
    | 'onTextBoldChange'
    | 'onTextItalicChange'
    | 'onTextUnderlineChange'
    | 'onTextAlignChange'
    | 'shapeOptions'
    | 'onShapeModeChange'
    | 'onShapeFillColorChange'
    | 'onShapeStrokeColorChange'
    | 'onShapeStrokeWidthChange'
    | 'onShapeCornerRadiusChange'
    | 'onShapeFixedSizeChange'
    | 'cropOptions'
    | 'onCropRatioPresetChange'
    | 'onCropDeleteOutsideChange'
    | 'onCropUseArtboardBoundsChange'
    | 'onCropApply'
    | 'eyedropperOptions'
    | 'onEyedropperSampleSizeChange'
    | 'onEyedropperSampleSourceChange'
    | 'onEyedropperSample'
    | 'zoomOptions'
    | 'onZoomModeChange'
    | 'onZoomStepChange'
    | 'onZoomApply'
    | 'onZoomFitToScreen'
    | 'onZoomReset'
    | 'handOptions'
    | 'onHandLockPanChange'
>;

export default function AdvancedToolControls({
    activeTool,
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
}: AdvancedToolControlsProps) {
    if (activeTool === 'pen' && penOptions) {
        return (
            <>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onPenModeChange?.('path')} className={`px-2.5 py-1 text-xs ${penOptions.mode === 'path' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Pen mode path">Path</button>
                    <button onClick={() => onPenModeChange?.('shape')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.mode === 'shape' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Pen mode shape">Shape</button>
                </div>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onPenPathOperationChange?.('add')} className={`px-2.5 py-1 text-xs ${penOptions.pathOperation === 'add' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Pen operation add">Add</button>
                    <button onClick={() => onPenPathOperationChange?.('subtract')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.pathOperation === 'subtract' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Pen operation subtract">Subtract</button>
                    <button onClick={() => onPenPathOperationChange?.('intersect')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.pathOperation === 'intersect' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Pen operation intersect">Intersect</button>
                </div>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={penOptions.autoAddDelete} onChange={(event) => onPenAutoAddDeleteChange?.(event.target.checked)} aria-label="Pen auto add delete" />
                    <span>Auto Add/Delete</span>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={penOptions.rubberBand} onChange={(event) => onPenRubberBandChange?.(event.target.checked)} aria-label="Pen rubber band" />
                    <span>Rubber Band</span>
                </label>
            </>
        );
    }

    if (activeTool === 'text' && textOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Font</span>
                    <Select value={textOptions.fontFamily} onValueChange={(value) => onTextFontFamilyChange?.(value)}>
                        <SelectTrigger aria-label="Text font family" className="h-7 min-w-[150px] border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0" style={{ fontFamily: textOptions.fontFamily }}>
                            <SelectValue placeholder="Font" />
                        </SelectTrigger>
                        <SelectContent>{textOptions.fontFamilies.map((font) => (<SelectItem key={font} value={font}>{font}</SelectItem>))}</SelectContent>
                    </Select>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Style</span>
                    <select aria-label="Text font style" value={textOptions.fontStyle} onChange={(event) => onTextFontStyleChange?.(event.target.value)} className="bg-transparent outline-none">
                        {textOptions.fontStyles.map((style) => (<option key={style} value={style}>{style}</option>))}
                    </select>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Size</span>
                    <input aria-label="Text font size" type="range" min={8} max={240} value={textOptions.fontSize} onChange={(event) => onTextFontSizeChange?.(Number(event.target.value))} className="w-20" />
                    <span>{textOptions.fontSize}px</span>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Color</span>
                    <input aria-label="Text color" type="color" value={textOptions.color} onChange={(event) => onTextColorChange?.(event.target.value)} className="h-6 w-8 rounded border border-border/60 bg-transparent p-0" />
                </label>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onTextBoldChange?.(!textOptions.bold)} className={`px-2.5 py-1 text-xs font-bold ${textOptions.bold ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Text toggle bold">B</button>
                    <button onClick={() => onTextItalicChange?.(!textOptions.italic)} className={`px-2.5 py-1 text-xs italic border-l border-border/50 ${textOptions.italic ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Text toggle italic">I</button>
                    <button onClick={() => onTextUnderlineChange?.(!textOptions.underline)} className={`px-2.5 py-1 text-xs underline border-l border-border/50 ${textOptions.underline ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Text toggle underline">U</button>
                </div>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onTextAlignChange?.('left')} className={`px-2.5 py-1 text-xs ${textOptions.align === 'left' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Text align left">L</button>
                    <button onClick={() => onTextAlignChange?.('center')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${textOptions.align === 'center' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Text align center">C</button>
                    <button onClick={() => onTextAlignChange?.('right')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${textOptions.align === 'right' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Text align right">R</button>
                    <button onClick={() => onTextAlignChange?.('justify')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${textOptions.align === 'justify' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Text align justify">J</button>
                </div>
            </>
        );
    }

    if (activeTool === 'shapes' && shapeOptions) {
        return (
            <>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onShapeModeChange?.('shape')} className={`px-2.5 py-1 text-xs ${shapeOptions.mode === 'shape' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Shape mode shape">Shape</button>
                    <button onClick={() => onShapeModeChange?.('path')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${shapeOptions.mode === 'path' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Shape mode path">Path</button>
                    <button onClick={() => onShapeModeChange?.('pixels')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${shapeOptions.mode === 'pixels' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Shape mode pixels">Pixels</button>
                </div>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Fill</span>
                    <input aria-label="Shape fill color" type="color" value={shapeOptions.fillColor} onChange={(event) => onShapeFillColorChange?.(event.target.value)} className="h-6 w-8 rounded border border-border/60 bg-transparent p-0" />
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Stroke</span>
                    <input aria-label="Shape stroke color" type="color" value={shapeOptions.strokeColor} onChange={(event) => onShapeStrokeColorChange?.(event.target.value)} className="h-6 w-8 rounded border border-border/60 bg-transparent p-0" />
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Stroke Width</span>
                    <input aria-label="Shape stroke width" type="range" min={0} max={40} value={shapeOptions.strokeWidth} onChange={(event) => onShapeStrokeWidthChange?.(Number(event.target.value))} className="w-20" />
                    <span>{shapeOptions.strokeWidth}px</span>
                </label>
                {shapeOptions.canSmoothAngles && (
                    <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                        <span className="text-muted-foreground">Smooth Angles</span>
                        <input aria-label="Shape smooth angles" type="range" min={0} max={100} value={shapeOptions.cornerRadius} onChange={(event) => onShapeCornerRadiusChange?.(Number(event.target.value))} className="w-20" />
                        <span>{shapeOptions.cornerRadius}px</span>
                    </label>
                )}
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={shapeOptions.fixedSize} onChange={(event) => onShapeFixedSizeChange?.(event.target.checked)} aria-label="Shape fixed size" />
                    <span>Fixed Size</span>
                </label>
            </>
        );
    }

    if (activeTool === 'crop' && cropOptions) {
        return (
            <>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onCropRatioPresetChange?.('free')} className={`px-2.5 py-1 text-xs ${cropOptions.ratioPreset === 'free' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Crop ratio free">Free</button>
                    <button onClick={() => onCropRatioPresetChange?.('1:1')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${cropOptions.ratioPreset === '1:1' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Crop ratio 1:1">1:1</button>
                    <button onClick={() => onCropRatioPresetChange?.('4:3')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${cropOptions.ratioPreset === '4:3' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Crop ratio 4:3">4:3</button>
                    <button onClick={() => onCropRatioPresetChange?.('16:9')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${cropOptions.ratioPreset === '16:9' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Crop ratio 16:9">16:9</button>
                </div>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={cropOptions.deleteOutside} onChange={(event) => onCropDeleteOutsideChange?.(event.target.checked)} aria-label="Crop delete outside" />
                    <span>Delete Outside</span>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={cropOptions.useArtboardBounds} onChange={(event) => onCropUseArtboardBoundsChange?.(event.target.checked)} aria-label="Crop use artboard bounds" />
                    <span>Use Artboard Bounds</span>
                </label>
                <button onClick={() => onCropApply?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label="Apply crop">Apply Crop</button>
            </>
        );
    }

    if (activeTool === 'eyedropper' && eyedropperOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Sample Size</span>
                    <select aria-label="Eyedropper sample size" value={eyedropperOptions.sampleSize} onChange={(event) => onEyedropperSampleSizeChange?.(Number(event.target.value) as 1 | 3 | 5 | 11)} className="bg-transparent outline-none">
                        <option value={1}>Point</option>
                        <option value={3}>3x3</option>
                        <option value={5}>5x5</option>
                        <option value={11}>11x11</option>
                    </select>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Source</span>
                    <select aria-label="Eyedropper sample source" value={eyedropperOptions.sampleSource} onChange={(event) => onEyedropperSampleSourceChange?.(event.target.value as 'current-layer' | 'all-layers')} className="bg-transparent outline-none">
                        <option value="current-layer">Current Layer</option>
                        <option value="all-layers">All Layers</option>
                    </select>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Color</span>
                    <input aria-label="Eyedropper sampled color" type="color" value={eyedropperOptions.sampledColor} readOnly className="h-6 w-8 rounded border border-border/60 bg-transparent p-0" />
                </label>
                <button onClick={() => onEyedropperSample?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label="Eyedropper sample">Sample</button>
            </>
        );
    }

    if (activeTool === 'zoom' && zoomOptions) {
        return (
            <>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onZoomModeChange?.('in')} className={`px-2.5 py-1 text-xs ${zoomOptions.mode === 'in' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Zoom mode in">In</button>
                    <button onClick={() => onZoomModeChange?.('out')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${zoomOptions.mode === 'out' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label="Zoom mode out">Out</button>
                </div>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">Step</span>
                    <select aria-label="Zoom step" value={zoomOptions.step} onChange={(event) => onZoomStepChange?.(Number(event.target.value) as 5 | 10 | 25 | 50)} className="bg-transparent outline-none">
                        <option value={5}>5%</option>
                        <option value={10}>10%</option>
                        <option value={25}>25%</option>
                        <option value={50}>50%</option>
                    </select>
                </label>
                <span className="shrink-0 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">{zoomOptions.zoomPercent}%</span>
                <button onClick={() => onZoomApply?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label="Zoom apply">Apply</button>
                <button onClick={() => onZoomFitToScreen?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label="Zoom fit to screen">Fit</button>
                <button onClick={() => onZoomReset?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label="Zoom reset">100%</button>
            </>
        );
    }

    if (activeTool === 'hand' && handOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={handOptions.lockPan} onChange={(event) => onHandLockPanChange?.(event.target.checked)} aria-label="Hand lock pan" />
                    <span>Pan Without Space</span>
                </label>
                <span className="shrink-0 text-xs text-muted-foreground px-2 py-1 rounded-md border border-border/60 bg-secondary/30">Space + Drag remains available.</span>
            </>
        );
    }

    return null;
}
