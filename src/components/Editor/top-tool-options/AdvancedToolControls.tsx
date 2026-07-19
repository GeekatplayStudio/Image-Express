import { useI18n } from '@/providers/I18nProvider';
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
    const { t } = useI18n();
    if (activeTool === 'pen' && penOptions) {
        return (
            <>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onPenModeChange?.('path')} className={`px-2.5 py-1 text-xs ${penOptions.mode === 'path' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.pen.modePath')}>{t('panel.path')}</button>
                    <button onClick={() => onPenModeChange?.('shape')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.mode === 'shape' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.pen.modeShape')}>{t('adv.pen.shape')}</button>
                </div>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onPenPathOperationChange?.('add')} className={`px-2.5 py-1 text-xs ${penOptions.pathOperation === 'add' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.pen.opAdd')}>{t('toolbar.add')}</button>
                    <button onClick={() => onPenPathOperationChange?.('subtract')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.pathOperation === 'subtract' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.pen.opSubtract')}>{t('adv.pen.subtract')}</button>
                    <button onClick={() => onPenPathOperationChange?.('intersect')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${penOptions.pathOperation === 'intersect' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.pen.opIntersect')}>{t('adv.pen.intersect')}</button>
                </div>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={penOptions.autoAddDelete} onChange={(event) => onPenAutoAddDeleteChange?.(event.target.checked)} aria-label={t('adv.pen.autoAddDeleteAria')} />
                    <span>{t('adv.pen.autoAddDelete')}</span>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={penOptions.rubberBand} onChange={(event) => onPenRubberBandChange?.(event.target.checked)} aria-label={t('adv.pen.rubberBandAria')} />
                    <span>{t('adv.pen.rubberBand')}</span>
                </label>
            </>
        );
    }

    if (activeTool === 'text' && textOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('adv.text.font')}</span>
                    <select
                        aria-label={t('adv.text.fontFamilyAria')}
                        value={textOptions.fontFamily}
                        onChange={(event) => onTextFontFamilyChange?.(event.target.value)}
                        className="h-7 min-w-[150px] bg-transparent outline-none text-xs"
                        style={{ fontFamily: textOptions.fontFamily }}
                    >
                        {textOptions.fontFamilies.map((font) => (<option key={font} value={font}>{font}</option>))}
                    </select>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('text.styleLabel')}</span>
                    <select aria-label={t('adv.text.styleAria')} value={textOptions.fontStyle} onChange={(event) => onTextFontStyleChange?.(event.target.value)} className="bg-transparent outline-none">
                        {textOptions.fontStyles.map((style) => (<option key={style} value={style}>{style}</option>))}
                    </select>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('adv.text.size')}</span>
                    <input aria-label={t('adv.text.sizeAria')} type="range" min={8} max={240} value={textOptions.fontSize} onChange={(event) => onTextFontSizeChange?.(Number(event.target.value))} className="w-20" />
                    <span>{textOptions.fontSize}px</span>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('ctrl.color')}</span>
                    <input aria-label={t('adv.text.colorAria')} type="color" value={textOptions.color} onChange={(event) => onTextColorChange?.(event.target.value)} className="h-6 w-8 rounded border border-border/60 bg-transparent p-0" />
                </label>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onTextBoldChange?.(!textOptions.bold)} className={`px-2.5 py-1 text-xs font-bold ${textOptions.bold ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.text.boldAria')}>B</button>
                    <button onClick={() => onTextItalicChange?.(!textOptions.italic)} className={`px-2.5 py-1 text-xs italic border-l border-border/50 ${textOptions.italic ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.text.italicAria')}>I</button>
                    <button onClick={() => onTextUnderlineChange?.(!textOptions.underline)} className={`px-2.5 py-1 text-xs underline border-l border-border/50 ${textOptions.underline ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.text.underlineAria')}>U</button>
                </div>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onTextAlignChange?.('left')} className={`px-2.5 py-1 text-xs ${textOptions.align === 'left' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.text.alignLeftAria')}>L</button>
                    <button onClick={() => onTextAlignChange?.('center')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${textOptions.align === 'center' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.text.alignCenterAria')}>C</button>
                    <button onClick={() => onTextAlignChange?.('right')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${textOptions.align === 'right' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.text.alignRightAria')}>R</button>
                    <button onClick={() => onTextAlignChange?.('justify')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${textOptions.align === 'justify' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.text.alignJustifyAria')}>J</button>
                </div>
            </>
        );
    }

    if (activeTool === 'shapes' && shapeOptions) {
        return (
            <>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onShapeModeChange?.('shape')} className={`px-2.5 py-1 text-xs ${shapeOptions.mode === 'shape' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.shape.modeShapeAria')}>{t('adv.pen.shape')}</button>
                    <button onClick={() => onShapeModeChange?.('path')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${shapeOptions.mode === 'path' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.shape.modePathAria')}>{t('panel.path')}</button>
                    <button onClick={() => onShapeModeChange?.('pixels')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${shapeOptions.mode === 'pixels' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.shape.modePixelsAria')}>{t('adv.shape.pixels')}</button>
                </div>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('panel.fill')}</span>
                    <input aria-label={t('adv.shape.fillAria')} type="color" value={shapeOptions.fillColor} onChange={(event) => onShapeFillColorChange?.(event.target.value)} className="h-6 w-8 rounded border border-border/60 bg-transparent p-0" />
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('stroke.stroke')}</span>
                    <input aria-label={t('adv.shape.strokeAria')} type="color" value={shapeOptions.strokeColor} onChange={(event) => onShapeStrokeColorChange?.(event.target.value)} className="h-6 w-8 rounded border border-border/60 bg-transparent p-0" />
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('adv.shape.strokeWidth')}</span>
                    <input aria-label={t('adv.shape.strokeWidthAria')} type="range" min={0} max={40} value={shapeOptions.strokeWidth} onChange={(event) => onShapeStrokeWidthChange?.(Number(event.target.value))} className="w-20" />
                    <span>{shapeOptions.strokeWidth}px</span>
                </label>
                {shapeOptions.canSmoothAngles && (
                    <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                        <span className="text-muted-foreground">{t('adv.shape.smoothAngles')}</span>
                        <input aria-label={t('adv.shape.smoothAnglesAria')} type="range" min={0} max={100} value={shapeOptions.cornerRadius} onChange={(event) => onShapeCornerRadiusChange?.(Number(event.target.value))} className="w-20" />
                        <span>{shapeOptions.cornerRadius}px</span>
                    </label>
                )}
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={shapeOptions.fixedSize} onChange={(event) => onShapeFixedSizeChange?.(event.target.checked)} aria-label={t('adv.shape.fixedSizeAria')} />
                    <span>{t('adv.shape.fixedSize')}</span>
                </label>
            </>
        );
    }

    if (activeTool === 'crop' && cropOptions) {
        return (
            <>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onCropRatioPresetChange?.('free')} className={`px-2.5 py-1 text-xs ${cropOptions.ratioPreset === 'free' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.crop.freeAria')}>{t('adv.crop.free')}</button>
                    <button onClick={() => onCropRatioPresetChange?.('1:1')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${cropOptions.ratioPreset === '1:1' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.crop.ratio11Aria')}>1:1</button>
                    <button onClick={() => onCropRatioPresetChange?.('4:3')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${cropOptions.ratioPreset === '4:3' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.crop.ratio43Aria')}>4:3</button>
                    <button onClick={() => onCropRatioPresetChange?.('16:9')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${cropOptions.ratioPreset === '16:9' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.crop.ratio169Aria')}>16:9</button>
                </div>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={cropOptions.deleteOutside} onChange={(event) => onCropDeleteOutsideChange?.(event.target.checked)} aria-label={t('adv.crop.deleteOutsideAria')} />
                    <span>{t('adv.crop.deleteOutside')}</span>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={cropOptions.useArtboardBounds} onChange={(event) => onCropUseArtboardBoundsChange?.(event.target.checked)} aria-label={t('adv.crop.artboardBoundsAria')} />
                    <span>{t('adv.crop.artboardBounds')}</span>
                </label>
                <button onClick={() => onCropApply?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label={t('adv.crop.applyAria')}>{t('adv.crop.apply')}</button>
            </>
        );
    }

    if (activeTool === 'eyedropper' && eyedropperOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('adv.eyedropper.sampleSize')}</span>
                    <select aria-label={t('adv.eyedropper.sampleSizeAria')} value={eyedropperOptions.sampleSize} onChange={(event) => onEyedropperSampleSizeChange?.(Number(event.target.value) as 1 | 3 | 5 | 11)} className="bg-transparent outline-none">
                        <option value={1}>{t('adv.eyedropper.point')}</option>
                        <option value={3}>3x3</option>
                        <option value={5}>5x5</option>
                        <option value={11}>11x11</option>
                    </select>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('adv.eyedropper.source')}</span>
                    <select aria-label={t('adv.eyedropper.sourceAria')} value={eyedropperOptions.sampleSource} onChange={(event) => onEyedropperSampleSourceChange?.(event.target.value as 'current-layer' | 'all-layers')} className="bg-transparent outline-none">
                        <option value="current-layer">{t('adv.eyedropper.currentLayer')}</option>
                        <option value="all-layers">{t('adv.eyedropper.allLayers')}</option>
                    </select>
                </label>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('ctrl.color')}</span>
                    <input aria-label={t('adv.eyedropper.colorAria')} type="color" value={eyedropperOptions.sampledColor} readOnly className="h-6 w-8 rounded border border-border/60 bg-transparent p-0" />
                </label>
                <button onClick={() => onEyedropperSample?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label={t('adv.eyedropper.sampleAria')}>{t('ctrl.sample')}</button>
            </>
        );
    }

    if (activeTool === 'zoom' && zoomOptions) {
        return (
            <>
                <div className="shrink-0 flex items-center rounded-md border border-border/60 overflow-hidden bg-secondary/30">
                    <button onClick={() => onZoomModeChange?.('in')} className={`px-2.5 py-1 text-xs ${zoomOptions.mode === 'in' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.zoom.inAria')}>In</button>
                    <button onClick={() => onZoomModeChange?.('out')} className={`px-2.5 py-1 text-xs border-l border-border/50 ${zoomOptions.mode === 'out' ? 'bg-tool-accent text-tool-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`} aria-label={t('adv.zoom.outAria')}>{t('adv.zoom.out')}</button>
                </div>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <span className="text-muted-foreground">{t('adv.zoom.step')}</span>
                    <select aria-label={t('adv.zoom.stepAria')} value={zoomOptions.step} onChange={(event) => onZoomStepChange?.(Number(event.target.value) as 5 | 10 | 25 | 50)} className="bg-transparent outline-none">
                        <option value={5}>5%</option>
                        <option value={10}>10%</option>
                        <option value={25}>25%</option>
                        <option value={50}>50%</option>
                    </select>
                </label>
                <span className="shrink-0 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">{zoomOptions.zoomPercent}%</span>
                <button onClick={() => onZoomApply?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label={t('adv.zoom.applyAria')}>{t('adv.zoom.apply')}</button>
                <button onClick={() => onZoomFitToScreen?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label={t('adv.zoom.fitAria')}>{t('adv.zoom.fit')}</button>
                <button onClick={() => onZoomReset?.()} className="shrink-0 px-3 py-1 text-xs rounded-md border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors" aria-label={t('adv.zoom.resetAria')}>100%</button>
            </>
        );
    }

    if (activeTool === 'hand' && handOptions) {
        return (
            <>
                <label className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/30 text-xs">
                    <input type="checkbox" checked={handOptions.lockPan} onChange={(event) => onHandLockPanChange?.(event.target.checked)} aria-label={t('adv.hand.lockPanAria')} />
                    <span>{t('adv.hand.panWithoutSpace')}</span>
                </label>
                <span className="shrink-0 text-xs text-muted-foreground px-2 py-1 rounded-md border border-border/60 bg-secondary/30">{t('adv.hand.spaceDragHint')}</span>
            </>
        );
    }

    return null;
}
