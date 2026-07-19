import React from 'react';
import NextImage from 'next/image';
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Check,
    Eraser,
    Image as ImageIcon,
    Layers,
    Loader2,
    Maximize,
    Move,
    Scan,
    Sparkles,
    Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { StabilityGeneratorContentProps } from './types';
import { useI18n } from '@/providers/I18nProvider';

export default function StabilityGeneratorContent({
    activeTab,
    isProcessing,
    prompt,
    aspectRatio,
    strength,
    resultImage,
    selectedCanvasImage,
    sourceType,
    flattenSelection,
    maskCanvasRef,
    brushSize,
    isCanvasMasking,
    outpaintDirs,
    showInpaintQuickDock,
    providerLabel,
    onTabChange,
    onPromptChange,
    onAspectRatioChange,
    onStrengthChange,
    onSourceTypeChange,
    onFlattenSelectionChange,
    onSetIsDrawingMask,
    onPersistMaskDataUrl,
    onDrawMask,
    onBrushSizeChange,
    onToggleCanvasMasking,
    onClearCanvasMask,
    onOutpaintDirectionToggle,
    onGenerate,
    onImg2Img,
    onOutpaint,
    onInpaint,
    onUpscale,
    onRemoveBg,
    onAddToCanvas,
}: StabilityGeneratorContentProps) {
    const { t } = useI18n();
    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex-1 space-y-4">
                <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
                    <TabsList className="grid w-full grid-cols-6 h-auto p-1 bg-muted/50 mb-4">
                        <TabsTrigger value="generate" title={t('stab.tab.textToImage')}><ImageIcon size={16} /></TabsTrigger>
                        <TabsTrigger value="inpaint" title={t('stab.tab.inpaint')}><Eraser size={16} /></TabsTrigger>
                        <TabsTrigger value="img2img" title={t('stab.tab.img2img')}><Layers size={16} /></TabsTrigger>
                        <TabsTrigger value="outpaint" title={t('stab.tab.outpaint')}><Scan size={16} /></TabsTrigger>
                        <TabsTrigger value="upscale" title={t('stab.tab.upscale')}><Maximize size={16} /></TabsTrigger>
                        <TabsTrigger value="removebox" title={t('stab.tab.removeBg')}><Move size={16} /></TabsTrigger>
                    </TabsList>

                    <TabsContent value="generate" className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t('stab.prompt')}</Label>
                            <Input placeholder={t('stab.promptPlaceholder')} value={prompt} onChange={(event) => onPromptChange(event.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>{t('stab.aspectRatio')}</Label>
                            <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1:1">{t('stab.ratio.square')}</SelectItem>
                                    <SelectItem value="16:9">{t('stab.ratio.widescreen')}</SelectItem>
                                    <SelectItem value="9:16">{t('stab.ratio.portrait')}</SelectItem>
                                    <SelectItem value="21:9">{t('stab.ratio.cinema')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="w-full" onClick={onGenerate} disabled={isProcessing}>
                            {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Wand2 className="mr-2" />}
                            {t('stab.generate')}
                        </Button>
                    </TabsContent>

                    <TabsContent value="img2img" className="space-y-4">
                        <div className="flex items-center space-x-2 bg-muted/30 p-2 rounded-lg">
                            <Button variant={sourceType === 'selection' ? 'secondary' : 'ghost'} size="sm" className="flex-1 text-xs" onClick={() => onSourceTypeChange('selection')} disabled={!selectedCanvasImage}>{t('stab.selection')}</Button>
                            <Button variant={sourceType === 'canvas' ? 'secondary' : 'ghost'} size="sm" className="flex-1 text-xs" onClick={() => onSourceTypeChange('canvas')}>{t('stab.fullCanvas')}</Button>
                        </div>

                        {sourceType === 'selection' && (
                            <div className="flex items-center space-x-2 py-2">
                                <Switch id="flatten-mode" checked={flattenSelection} onCheckedChange={onFlattenSelectionChange} />
                                <Label htmlFor="flatten-mode" className="text-xs">{t('stab.flattenHint')}</Label>
                            </div>
                        )}

                        {sourceType === 'selection' && !selectedCanvasImage ? (
                            <div className="p-4 border border-dashed rounded text-center text-muted-foreground flex flex-col items-center gap-2">
                                <p>{t('stab.selectObjectToEdit')}</p>
                                <span className="text-xs opacity-50">{t('stab.orSeparator')}</span>
                                <Button variant="ghost" size="sm" onClick={() => onSourceTypeChange('canvas')} className="underline">{t('stab.useFullCanvas')}</Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {sourceType === 'selection' && selectedCanvasImage && (
                                    <div className="relative w-full h-32 bg-muted/50 rounded border border-border/50 overflow-hidden">
                                        <NextImage src={selectedCanvasImage} alt={t('stab.sourceAlt')} fill sizes="100vw" className="object-contain" unoptimized />
                                    </div>
                                )}
                                {sourceType === 'canvas' && (
                                    <div className="w-full h-24 bg-muted/50 rounded flex items-center justify-center text-xs text-muted-foreground border border-border/50">{t('stab.fullCanvasPreview')}</div>
                                )}
                                <div className="space-y-2">
                                    <Label>{t('stab.prompt')}</Label>
                                    <Input value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={t('stab.img2imgPlaceholder')} />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('stab.creativityStrength', { percent: Math.round(strength[0] * 100) })}</Label>
                                    <Slider value={strength} onValueChange={onStrengthChange} min={0} max={1} step={0.05} />
                                    <p className="text-[10px] text-muted-foreground flex justify-between">
                                        <span>{t('stab.strength0')}</span>
                                        <span>{t('stab.strength35')}</span>
                                        <span>{t('stab.strength100')}</span>
                                    </p>
                                </div>
                                <Button className="w-full" onClick={onImg2Img} disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Layers className="mr-2" />}
                                    {t('stab.reimagine', { target: sourceType === 'canvas' ? t('stab.fullCanvas') : t('stab.selection') })}
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="outpaint" className="space-y-4">
                        {!selectedCanvasImage ? (
                            <div className="p-4 border border-dashed rounded text-center text-muted-foreground">{t('stab.selectImageToExtend')}</div>
                        ) : (
                            <div className="space-y-4">
                                <div className="w-full h-32 bg-muted p-2">
                                    <div className="relative w-full h-full">
                                        <NextImage src={selectedCanvasImage} alt={t('stab.selectedCanvasPreview')} fill sizes="100vw" className="object-contain" unoptimized />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('stab.expansionDirections')}</Label>
                                    <div className="grid grid-cols-3 gap-2 w-32 mx-auto">
                                        <div />
                                        <Button variant={outpaintDirs.up ? 'default' : 'outline'} size="icon" onClick={() => onOutpaintDirectionToggle('up')}><ArrowUp size={16} /></Button>
                                        <div />
                                        <Button variant={outpaintDirs.left ? 'default' : 'outline'} size="icon" onClick={() => onOutpaintDirectionToggle('left')}><ArrowLeft size={16} /></Button>
                                        <div className="flex items-center justify-center text-xs text-muted-foreground">{t('stab.src')}</div>
                                        <Button variant={outpaintDirs.right ? 'default' : 'outline'} size="icon" onClick={() => onOutpaintDirectionToggle('right')}><ArrowRight size={16} /></Button>
                                        <div />
                                        <Button variant={outpaintDirs.down ? 'default' : 'outline'} size="icon" onClick={() => onOutpaintDirectionToggle('down')}><ArrowDown size={16} /></Button>
                                        <div />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('stab.prompt')}</Label>
                                    <Input value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={t('stab.outpaintPlaceholder')} />
                                </div>
                                <Button className="w-full" onClick={onOutpaint} disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Scan className="mr-2" />}
                                    {t('stab.outpaintExpand')}
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="inpaint" className="space-y-4">
                        <div className="space-y-4">
                            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                                <p className="text-xs font-semibold text-foreground">{t('stab.generativeFill')}</p>
                                <p className="text-[11px] text-muted-foreground">{t('stab.generativeFillHint')}</p>
                            </div>
                            {!isCanvasMasking ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-secondary/10 rounded-lg space-y-2 border border-border/50">
                                        <p className="text-sm font-medium">{t('stab.useMainCanvas')}</p>
                                        <p className="text-xs text-muted-foreground">{t('stab.paintDirectlyHint')}</p>
                                        <Button variant="outline" className="w-full justify-start gap-2" onClick={onToggleCanvasMasking}><Wand2 size={16} /> {t('stab.startCanvasMasking')}</Button>
                                    </div>

                                    {selectedCanvasImage && (
                                        <div className="pt-2 border-t mt-2">
                                            <Label className="text-xs text-muted-foreground mb-2 block">{t('stab.legacySelectionPreview')}</Label>
                                            <div
                                                className="relative border rounded overflow-hidden cursor-crosshair bg-black"
                                                onMouseDown={() => onSetIsDrawingMask(true)}
                                                onMouseUp={() => {
                                                    onSetIsDrawingMask(false);
                                                    onPersistMaskDataUrl();
                                                }}
                                                onMouseMove={onDrawMask}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element -- Selection preview uses simple img overlay for mask drawing. */}
                                                <img src={selectedCanvasImage} alt={t('stab.inpaintSourcePreview')} className="w-full h-auto opacity-50 pointer-events-none select-none" />
                                                <canvas ref={maskCanvasRef} className="absolute inset-0 w-full h-full mix-blend-screen" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4 p-4 bg-pink-500/10 border border-pink-500/25 rounded-lg animate-in fade-in">
                                    <h3 className="font-semibold text-sm flex items-center gap-2 text-pink-600 dark:text-pink-300"><Wand2 size={16} /> {t('stab.maskingActive')}</h3>
                                    <p className="text-xs text-muted-foreground">{t('stab.drawToHighlight')}</p>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-xs">
                                            <span>{t('stab.brushSize', { size: brushSize[0] })}</span>
                                            <Slider className="w-32" value={brushSize} onValueChange={onBrushSizeChange} min={5} max={100} step={5} />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="destructive" className="flex-1" onClick={onClearCanvasMask}>{t('stab.clearMask')}</Button>
                                        <Button size="sm" variant="outline" className="flex-1" onClick={onToggleCanvasMasking}>{t('stab.stop')}</Button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 mt-2">
                                <Label>{t('stab.prompt')}</Label>
                                <Input value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={t('stab.inpaintPlaceholder')} />
                            </div>

                            <Button className="w-full" onClick={onInpaint} disabled={isProcessing}>
                                {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Eraser className="mr-2" />}
                                {t('stab.generateInpaint')}
                            </Button>

                            {showInpaintQuickDock && (
                                <div className="rounded-xl border border-primary/30 bg-background/80 backdrop-blur px-2.5 py-2">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">{t('stab.quickFillDock')}</div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] px-2 py-1 rounded bg-secondary text-foreground whitespace-nowrap">{providerLabel}</span>
                                        <Input value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={t('stab.quickFillPlaceholder')} className="h-8 text-xs" />
                                        <Button size="sm" className="h-8 px-3" onClick={onInpaint} disabled={isProcessing}>
                                            {isProcessing ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : 'Fill'}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="upscale" className="space-y-4">
                        {!selectedCanvasImage ? (
                            <div className="p-4 border border-dashed rounded text-center text-muted-foreground">{t('stab.selectImageFirstPanel')}</div>
                        ) : (
                            <div className="space-y-4">
                                <div className="relative w-full h-32 bg-muted overflow-hidden">
                                    <NextImage src={selectedCanvasImage} alt={t('stab.selectedCanvasPreview')} fill sizes="100vw" className="object-contain" unoptimized />
                                </div>
                                <Button className="w-full" variant="secondary" onClick={() => onUpscale('conservative')} disabled={isProcessing}>{t('stab.upscaleConservative')}</Button>
                                <div className="space-y-2">
                                    <Label>{t('stab.creativeUpscalePrompt')}</Label>
                                    <Input value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={t('stab.addsDetailPlaceholder')} />
                                    <Button className="w-full" onClick={() => onUpscale('creative')} disabled={isProcessing}><Sparkles className="mr-2 h-4 w-4" /> {t('stab.upscaleCreative')}</Button>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="removebox" className="space-y-4">
                        {!selectedCanvasImage ? (
                            <div className="p-4 border border-dashed rounded text-center text-muted-foreground">{t('stab.selectImageFirstPanel')}</div>
                        ) : (
                            <div className="space-y-4">
                                <div className="relative w-full h-32 bg-muted overflow-hidden">
                                    <NextImage src={selectedCanvasImage} alt={t('stab.selectedCanvasPreview')} fill sizes="100vw" className="object-contain" unoptimized />
                                </div>
                                <p className="text-sm text-muted-foreground">{t('stab.removeBgHint')}</p>
                                <Button className="w-full" onClick={onRemoveBg} disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Move className="mr-2" />}
                                    {t('stab.removeBackground')}
                                </Button>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                {resultImage && (
                    <div className="mt-4 border-t pt-4 animate-in fade-in slide-in-from-bottom-2">
                        <Label>{t('stab.result')}</Label>
                        <div className="relative group rounded-md overflow-hidden border mt-2">
                            {/* eslint-disable-next-line @next/next/no-img-element -- Preserve natural sizing for generated output preview. */}
                            <img src={resultImage} alt={t('stab.generatedResult')} className="w-full h-auto bg-[url('/checker.png')] bg-repeat" />
                            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" onClick={onAddToCanvas}><Check className="mr-2 h-4 w-4" /> {t('assets.addToCanvas')}</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
