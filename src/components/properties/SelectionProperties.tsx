import React, { useState } from 'react';
import * as fabric from 'fabric';
import { ExtendedFabricObject, AdjustmentLayerSettings, AdjustmentLayerType } from '@/types';
import { TransformProperties } from './TransformProperties';
import { CropProperties } from './CropProperties';
import { readEdgeCrop } from '@/lib/imageCrop';
import { LayoutProperties } from './LayoutProperties';
import { LayerEffectsProperties } from './LayerEffectsProperties';
import { TextProperties } from './TextProperties';
import { TextEffectsProperties } from './TextEffectsProperties';
import { ImageFilterProperties, ImageFilterValues } from './ImageFilterProperties';
import { ShadowStrokeProperties, ShadowStrokeValues } from './ShadowStrokeProperties';
import { SkewTaperProperties } from './SkewTaperProperties';
import { AdjustmentControls } from './AdjustmentControls';
import { readMaskGradientSettings } from './maskGradientUtils';
import { Folder, Layers, Blend, ChevronDown, ChevronRight, Lock, Unlock, Box, Type, CornerLeftDown, Pencil, Check } from 'lucide-react';
import { ColorPicker } from './ColorPicker';
import { useI18n } from '@/providers/I18nProvider';

const ADJUSTMENT_ACTION_ITEMS: Array<{ type: AdjustmentLayerType; enabled: boolean }> = [
    { type: 'curves', enabled: true },
    { type: 'levels', enabled: true },
    { type: 'saturation-vibrance', enabled: true },
    { type: 'hue-saturation', enabled: true },
    { type: 'exposure', enabled: true },
    { type: 'black-white', enabled: true },
    { type: 'brightness-contrast', enabled: true },
    { type: 'color-balance', enabled: true },
    { type: 'light-and-color', enabled: false },
    { type: 'solid-color', enabled: false },
];

interface SelectionPropertiesProps {
    selectedObject: fabric.Object | null;
    selectedObjects: fabric.Object[]; // For multiple selection
    isGradient: boolean; // Just pass these down
    color: string;
    gradientState?: {
        type: 'linear' | 'radial';
        start: string;
        end: string;
        angle: number;
        coords?: { x1: number; y1: number; x2: number; y2: number };
    };
    
    // Callbacks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPropChange: (prop: string, value: any) => void; 
    onLayoutAction: (type: 'align' | 'distribute', value: string) => void;
    onGroup: () => void;
    onUngroup: () => void;
    onCreateMask: () => void;
    onTextOnPath?: () => void;
    onReleaseMask: () => void;
    onToggleMaskLock?: () => void;
    onEditMask?: () => void;
    onApplyEditedMask?: () => void;
    onClipToBelow?: () => void;
    onReleaseClipBelow?: () => void;
    textPathOptions?: Array<{ id: string; label: string }>;
    selectedTextPathId?: string | null;
    hasAttachedTextPath?: boolean;
    
    // Sub-component specific handlers (pass-through helpers from parent would be ideal, 
    // but for now we might need to assume parent handles the heavy lifting via onPropChange or specific props)
    // Actually, to make this clean, the Parent should provide specific handlers or we standardise 'onPropChange'.
    
    // We'll define specific ones for clarity where complex
    updateAdjustment: (settings: AdjustmentLayerSettings) => void;
    onAdjustmentTypeChange?: (type: AdjustmentLayerType) => void;
    onCreateAdjustmentLayer?: (type: AdjustmentLayerType) => void;
    onMake3D?: (imageUrl: string) => void;
    
    // Specific state overrides that might not be on object directly or need React state
    textState?: { text: string; font: string; weight: string; curve: number; center: number; span: number; spellcheck: boolean; bgEnabled: boolean; bgColor: string; bgPadding: number; bgCorners: number; bgStyle: 'rect' | 'pill' | 'speech' };
    activeTextEffects?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    textEffectConfigs?: Record<string, any>;
    effectState: { 
        stroke: { color: string; width: number; opacity: number; inside: boolean; blur?: number };
        shadow: { enabled: boolean; color: string; blur: number; offsetX: number; offsetY: number; opacity: number };
        skew: { x: number; y: number; z: number; dir: number; preset?: 'front' | 'back' };
        filters: ImageFilterValues;
    };
    shadowStrokeState?: ShadowStrokeValues; // Start loose for rapid refactor binding
    onAttachTextToPath?: (pathId: string) => void;
    onDetachTextPath?: () => void;

}

export function SelectionProperties({
    selectedObject,
    selectedObjects,
    isGradient,
    color,
    gradientState,
    onPropChange,
    onLayoutAction,
    onGroup,
    onUngroup,
    onCreateMask,
    onTextOnPath,
    onReleaseMask,
    onToggleMaskLock,
    onEditMask,
    onApplyEditedMask,
    onClipToBelow,
    onReleaseClipBelow,
    textPathOptions,
    selectedTextPathId,
    hasAttachedTextPath,
    updateAdjustment,
    onAdjustmentTypeChange,
    onCreateAdjustmentLayer,
    onMake3D,
    textState,
    activeTextEffects,
    textEffectConfigs,
    effectState,
    shadowStrokeState,
    onAttachTextToPath,
    onDetachTextPath
}: SelectionPropertiesProps) {

    const { t } = useI18n();
    const getAdjustmentTypeLabel = (type: AdjustmentLayerType) => t(`adjust.${type}`);
    const [isTransformOpen, setIsTransformOpen] = useState(true);
    const [isCropOpen, setIsCropOpen] = useState(false);
    const [colorMode, setColorMode] = useState<'RGB' | 'HSB' | 'CMYK' | 'Lab'>('RGB');

    const isMultiple = selectedObjects.length > 1;
    const isGroup = selectedObject?.type === 'group';
    
    // Check for Text + Path combination
    const hasTextAndPath = selectedObjects.length === 2 && 
        selectedObjects.some(o => o.type === 'i-text' || o.type === 'text' || o.type === 'textbox') &&
        selectedObjects.some(o => o.type === 'path' || o.type === 'polyline' || o.type === 'polygon');

    const isClippedToBelow = !!(selectedObject as ExtendedFabricObject | null)?.isClippedToBelow;
    const isMaskEditingObject = !!(selectedObject as ExtendedFabricObject | null)?.isMaskEditing;
    // Clip-to-below layers also carry a clipPath, but they are managed by the
    // clipping-mask flow, not the shape-mask actions.
    const isMasked = !!selectedObject?.clipPath && !isClippedToBelow;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isMaskAbsolute = isMasked ? (selectedObject?.clipPath as any).absolutePositioned : false;
    const maskGradientSettings = isMasked
        ? readMaskGradientSettings(selectedObject?.clipPath as fabric.Object | null | undefined)
        : null;
    
    const isAdjustment = (selectedObject as ExtendedFabricObject)?.isAdjustmentLayer;
    const extended = selectedObject as ExtendedFabricObject;
    const isImage = selectedObject?.type === 'image';
    const isText = selectedObject?.type === 'text' || selectedObject?.type === 'i-text' || selectedObject?.type === 'textbox';
    const isPenGeometry = selectedObject?.type === 'path' || selectedObject?.type === 'polygon' || selectedObject?.type === 'polyline';
    const looksLikePenLayer = typeof extended?.name === 'string' && extended.name.toLowerCase().includes('vector');
    const isPenObject = !!isPenGeometry && (!!extended?.penMode || !!extended?.isPenPath || looksLikePenLayer);
    const penMode = extended?.penMode || (selectedObject?.type === 'path' ? 'smooth' : 'straight');
    const penClosed = typeof extended?.penClosed === 'boolean' ? extended.penClosed : selectedObject?.type !== 'polyline';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleTransform = (values: Record<string, any>) => {
        Object.entries(values).forEach(([k, v]) => onPropChange(k, v));
    };

    if (isMultiple) {
        return (
            <div className="h-full bg-card overflow-y-auto">
                 <div className="p-4 border-b border-border/50 bg-secondary/10">
                    <h2 className="font-semibold text-xs uppercase flex items-center gap-2">
                        <Layers size={14} /> {t('panel.multipleSelection')} ({selectedObjects.length})
                    </h2>
                </div>
                
                <div className="p-4 flex gap-2 justify-center border-b border-border/50">
                    <button onClick={onGroup} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded-md text-xs min-w-[60px]">
                        <Folder size={20} /> {t('common.group')}
                    </button>
                    {selectedObjects.length === 2 && (
                        <>
                            <div className="w-px bg-border mx-2" />
                            <button onClick={onCreateMask} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded-md text-xs min-w-[60px]" title={t('sel.maskImageWithShape')}>
                                <Blend size={20} /> {t('panel.mask')}
                            </button>
                            {hasTextAndPath && onTextOnPath && (
                                <>
                                    <div className="w-px bg-border mx-2" />
                                    <button onClick={onTextOnPath} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded-md text-xs min-w-[60px]" title={t('sel.putTextOnPath')}>
                                         <Type size={20} /> {t('panel.path')}
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>

                <LayoutProperties 
                    onAlign={(align) => onLayoutAction('align', align)}
                    onDistribute={(dist) => onLayoutAction('distribute', dist)}
                    canDistribute={selectedObjects.length > 2}
                />
            </div>
        );
    }

    if (!selectedObject) {
         return <div className="p-8 text-center text-muted-foreground text-sm">{t('panel.selectPrompt')}</div>;
    }

    return (
        <div className="h-full bg-card overflow-y-auto pb-20 scrollbar-thin">
            {/* Header */}
            <div className="p-4 border-b border-border/50 bg-secondary/10">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-xs uppercase truncate max-w-[150px]" title={extended?.name || selectedObject.type}>
                         {extended?.name || (isAdjustment ? t('panel.adjustmentLayer') : selectedObject.type)}
                    </h2>
                    <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
                        {selectedObject.type}
                    </span>
                </div>
            </div>

            {/* Quick Actions (Contextual) */}
            {isMaskEditingObject && onApplyEditedMask && (
                <div className="p-2 border-b border-border/50 bg-tool-accent/10 space-y-1.5">
                    <p className="text-[10px] text-muted-foreground text-center">
                        {t('panel.maskEditingHint')}
                    </p>
                    <button
                        onClick={onApplyEditedMask}
                        className="w-full px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                        <Check size={14} /> {t('panel.applyMask')}
                    </button>
                </div>
            )}
            {(isGroup || isMasked || isClippedToBelow || (!isAdjustment && !isMaskEditingObject && onClipToBelow)) && !isMaskEditingObject && (
                <div className="p-2 border-b border-border/50 flex flex-wrap gap-2 justify-center bg-secondary/10">
                    {isGroup && (
                        <button onClick={onUngroup} className="px-3 py-1.5 bg-secondary/50 hover:bg-secondary rounded text-xs flex items-center gap-2 border border-border/50 transition-colors">
                            <Layers size={14} /> {t('common.ungroup')}
                        </button>
                    )}
                    {!isAdjustment && (isClippedToBelow ? (
                        onReleaseClipBelow && (
                            <button
                                onClick={onReleaseClipBelow}
                                className="px-3 py-1.5 bg-tool-accent/20 text-tool-accent border-tool-accent/30 rounded text-xs flex items-center gap-2 border transition-colors"
                                title={t('sel.releaseClipTitle')}
                            >
                                <CornerLeftDown size={14} /> {t('panel.releaseClip')}
                            </button>
                        )
                    ) : (
                        !isMasked && onClipToBelow && (
                            <button
                                onClick={onClipToBelow}
                                className="px-3 py-1.5 bg-secondary/50 hover:bg-secondary rounded text-xs flex items-center gap-2 border border-border/50 transition-colors"
                                title={t('sel.clipToBelowTitle')}
                            >
                                <CornerLeftDown size={14} /> {t('panel.clipToBelow')}
                            </button>
                        )
                    ))}
                    {isMasked && (
                         <>
                            {onToggleMaskLock && (
                                <button
                                    onClick={onToggleMaskLock}
                                    className={`px-3 py-1.5 rounded text-xs flex items-center gap-2 border transition-colors ${!isMaskAbsolute ? 'bg-tool-accent/20 text-tool-accent border-tool-accent/30' : 'bg-secondary/50 hover:bg-secondary border-border/50'}`}
                                    title={!isMaskAbsolute ? t('sel.maskLockedTitle') : t('sel.maskFixedTitle')}
                                >
                                    {!isMaskAbsolute ? <Lock size={14} /> : <Unlock size={14} />}
                                    {!isMaskAbsolute ? t('panel.attached') : t('panel.detached')}
                                </button>
                            )}
                            {onEditMask && (
                                <button
                                    onClick={onEditMask}
                                    className="px-3 py-1.5 bg-secondary/50 hover:bg-secondary rounded text-xs flex items-center gap-2 border border-border/50 transition-colors"
                                    title={t('sel.detachMaskTitle')}
                                >
                                    <Pencil size={14} /> {t('panel.editMask')}
                                </button>
                            )}
                            <button onClick={onReleaseMask} className="px-3 py-1.5 bg-secondary/50 hover:bg-secondary rounded text-xs flex items-center gap-2 border border-border/50 transition-colors">
                                <Blend size={14} /> {t('panel.release')}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* PRIMARY SECTION — the main controls for the selected item
                always come first (adjustment settings, text, fill, filters).
                Generic transform/layout live further down. */}

            {isAdjustment && extended?.adjustmentType && (
                 <div className="p-4 border-b border-border/50 space-y-3 bg-secondary/5">
                    <h3 className="font-medium text-sm">{t('panel.adjustmentSettings')}</h3>
                    <AdjustmentControls
                        type={extended.adjustmentType}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        settings={extended.adjustmentSettings || ({} as any)}
                        onChange={updateAdjustment}
                    />
                    {onAdjustmentTypeChange && (
                        <div className="space-y-2 pt-2 border-t border-border/30">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('panel.switchAdjustmentType')}</div>
                            <div className="grid grid-cols-2 gap-2">
                                {ADJUSTMENT_ACTION_ITEMS.filter((item) => item.enabled).map((item) => (
                                    <button
                                        key={item.type}
                                        type="button"
                                        aria-label={`Adjustment action ${getAdjustmentTypeLabel(item.type)}`}
                                        onClick={() => onAdjustmentTypeChange(item.type)}
                                        className={`rounded border px-2 py-1.5 text-[11px] text-left transition-colors ${extended.adjustmentType === item.type ? 'border-tool-accent/40 bg-tool-accent/20 text-tool-accent' : 'border-border/60 bg-secondary/20 hover:bg-secondary/40 text-foreground'}`}
                                    >
                                        {getAdjustmentTypeLabel(item.type)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                 </div>
            )}

            {isText && textState && (
                <TextProperties
                    textContent={textState.text}
                    fontFamily={textState.font}
                    fontWeight={textState.weight}
                    curveStrength={textState.curve}
                    curveCenter={textState.center}
                    curveSpan={textState.span}
                    spellcheckEnabled={textState.spellcheck}
                    textBgEnabled={textState.bgEnabled}
                    textBgColor={textState.bgColor}
                    textBgPadding={textState.bgPadding}
                    textBgCorners={textState.bgCorners}
                    textBgStyle={textState.bgStyle}
                    pathOptions={textPathOptions}
                    selectedPathId={selectedTextPathId}
                    hasAttachedPath={!!hasAttachedTextPath}
                    onTextContentChange={(text) => onPropChange('textContent', text)}
                    onFontFamilyChange={(f) => onPropChange('fontFamily', f)}
                    onFontWeightChange={(w) => onPropChange('fontWeight', w)}
                    onCurveChange={(s, c, sp) => onPropChange('curve', { strength: s, center: c, span: sp })}
                    onSpellcheckChange={(enabled) => onPropChange('textSpellcheck', enabled)}
                    onTextBgEnabledChange={(enabled) => onPropChange('textBgEnabled', enabled)}
                    onTextBgColorChange={(color) => onPropChange('textBgColor', color)}
                    onTextBgPaddingChange={(padding) => onPropChange('textBgPadding', padding)}
                    onTextBgCornersChange={(corners) => onPropChange('textBgCorners', corners)}
                    onTextBgStyleChange={(style) => onPropChange('textBgStyle', style)}
                    onAttachPath={onAttachTextToPath}
                    onDetachPath={onDetachTextPath}
                />
            )}

            {isText && textState && (
                <TextEffectsProperties
                    activePresets={activeTextEffects || []}
                    effectConfigs={textEffectConfigs || {}}
                    onToggleEffect={(preset, enabled) => onPropChange('toggleTextEffect', { preset, enabled })}
                    onConfigChange={(preset, config) => onPropChange('updateTextEffectConfig', { preset, config })}
                />
            )}

            {/* Specific Editors (Styles) */}

            {isPenObject && (
                 <div className="p-4 border-b border-border/50 space-y-3">
                    <h3 className="font-medium text-sm">{t('panel.penPath')}</h3>
                    <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('panel.mode')}</div>
                        <div className="grid grid-cols-3 gap-1">
                            {(['straight', 'smooth', 'bezier'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => onPropChange('penPathUpdate', { mode })}
                                    className={`text-[10px] px-1.5 py-1 rounded border transition-colors capitalize ${penMode === mode ? 'bg-tool-accent/20 text-tool-accent border-tool-accent/30' : 'bg-secondary/20 text-muted-foreground border-border/50 hover:bg-secondary/50'}`}
                                >
                                    {t(`pen.mode.${mode}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('panel.path')}</div>
                        <div className="grid grid-cols-2 gap-1">
                            <button
                                onClick={() => onPropChange('penPathUpdate', { closed: false })}
                                className={`text-[10px] px-2 py-1 rounded border transition-colors ${!penClosed ? 'bg-tool-accent/20 text-tool-accent border-tool-accent/30' : 'bg-secondary/20 text-muted-foreground border-border/50 hover:bg-secondary/50'}`}
                            >
                                {t('panel.pathOpen')}
                            </button>
                            <button
                                onClick={() => onPropChange('penPathUpdate', { closed: true })}
                                className={`text-[10px] px-2 py-1 rounded border transition-colors ${penClosed ? 'bg-tool-accent/20 text-tool-accent border-tool-accent/30' : 'bg-secondary/20 text-muted-foreground border-border/50 hover:bg-secondary/50'}`}
                            >
                                {t('panel.pathClosed')}
                            </button>
                        </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        {t('panel.bezierHint')}
                    </div>
                 </div>
            )}
            
            {/* COLOR / FILL */}
            {!isImage && !isGroup && !isAdjustment && (
                 <div className="p-4 border-b border-border/50 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium text-sm">{t('panel.fill')}</h3>
                        <div className="flex bg-secondary rounded p-0.5">
                            <button 
                                className={`px-2 py-0.5 text-[10px] rounded ${!isGradient ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                onClick={() => onPropChange('fill', color)}
                            >{t('panel.solid')}</button>
                            <button 
                                className={`px-2 py-0.5 text-[10px] rounded ${isGradient ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                onClick={() => onPropChange('gradient', { 
                                    start: gradientState?.start || '#000000', 
                                    end: gradientState?.end || '#ffffff', 
                                    angle: gradientState?.angle || 0,
                                    type: gradientState?.type || 'linear'
                                })}
                            >{t('panel.gradient')}</button>
                        </div>
                    </div>
                    
                    {!isGradient ? (
                        <div className="space-y-2">
                            <div className="grid grid-cols-4 gap-1 rounded-md border border-border/50 bg-secondary/20 p-1">
                                {(['RGB', 'HSB', 'CMYK', 'Lab'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setColorMode(mode)}
                                        className={`text-[10px] px-1.5 py-1 rounded transition-colors ${colorMode === mode ? 'bg-background text-foreground shadow-sm border border-border/60' : 'text-muted-foreground hover:bg-secondary/50'}`}
                                        aria-label={`Color mode ${mode}`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>

                            {colorMode !== 'RGB' && (
                                <div className="text-[10px] text-muted-foreground px-1">
                                    {t('channels.numericEditorsNote', { mode: colorMode })}
                                </div>
                            )}

                            <ColorPicker 
                                color={color} 
                                onChange={(val) => onPropChange('fill', val)} 
                                label=""
                            />
                        </div>
                    ) : (
                        <div className="space-y-3 bg-secondary/20 p-2 rounded-md">
                             <div className="flex items-center justify-between text-xs">
                                 <label className="text-muted-foreground">{t('panel.gradientType')}</label>
                                 <select 
                                    className="bg-background border border-border rounded px-1 py-0.5 text-xs"
                                    value={gradientState?.type}
                                    onChange={(e) => onPropChange('gradient', { ...gradientState, type: e.target.value })}
                                 >
                                     <option value="linear">{t('panel.linear')}</option>
                                     <option value="radial">{t('panel.radial')}</option>
                                 </select>
                             </div>

                             <div className="flex items-center gap-2">
                                 <div className="space-y-1 flex-1">
                                     <span className="text-[10px] text-muted-foreground">{t('panel.start')}</span>
                                     <ColorPicker 
                                         color={gradientState?.start || '#000000'} 
                                         onChange={(val) => onPropChange('gradient', { ...gradientState, start: val })} 
                                     />
                                 </div>
                                 <div className="space-y-1 flex-1">
                                     <span className="text-[10px] text-muted-foreground">{t('panel.end')}</span>
                                     <ColorPicker 
                                         color={gradientState?.end || '#ffffff'} 
                                         onChange={(val) => onPropChange('gradient', { ...gradientState, end: val })} 
                                     />
                                 </div>
                             </div>
                             
                             {gradientState?.type === 'linear' && (
                                 <div className="space-y-1 pt-1">
                                     <div className="flex justify-between text-[10px] text-muted-foreground">
                                         <span>{t('panel.angle')}</span>
                                         <span>{gradientState.angle}°</span>
                                     </div>
                                     <input 
                                         type="range" min="0" max="360" 
                                         value={gradientState.angle}
                                         onChange={(e) => {
                                             if (gradientState) {
                                                 // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                                 const { coords: _coords, ...rest } = gradientState;
                                                 onPropChange('gradient', { ...rest, angle: parseInt(e.target.value) });
                                             }
                                         }}
                                         className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                     />
                                 </div>
                             )}

                             {gradientState?.type === 'linear' && gradientState.coords && (
                                 <div className="space-y-2 pt-2 border-t border-border/30 mt-2">
                                     <div className="flex items-center justify-between">
                                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('panel.controlPoints')}</div>
                                          <button 
                                            className="text-[10px] text-primary hover:text-primary/80"
                                            onClick={() => {
                                                 // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                                 const { coords: _coords, ...rest } = gradientState;
                                                 // Reset to angle-based by removing coords
                                                 onPropChange('gradient', { ...rest });  
                                            }}
                                            title={t('panel.resetToAngle')}
                                          >
                                            {t('panel.resetToAngle')}
                                          </button>
                                     </div>
                                     <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                                         <div className="space-y-1">
                                             <div className="flex justify-between text-[10px] text-muted-foreground">
                                                 <span>{t('sel.startX')}</span>
                                                 <span>{Math.round(gradientState.coords.x1 * 100)}%</span>
                                             </div>
                                             <input
                                                 type="range"
                                                 min="0"
                                                 max="100"
                                                 value={Math.round(gradientState.coords.x1 * 100)}
                                                 onChange={(e) => onPropChange('gradient', {
                                                     ...gradientState,
                                                     coords: { ...gradientState.coords, x1: parseInt(e.target.value) / 100 }
                                                 })}
                                                 className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                             />
                                         </div>
                                         <div className="space-y-1">
                                             <div className="flex justify-between text-[10px] text-muted-foreground">
                                                 <span>{t('sel.startY')}</span>
                                                 <span>{Math.round(gradientState.coords.y1 * 100)}%</span>
                                             </div>
                                             <input
                                                 type="range"
                                                 min="0"
                                                 max="100"
                                                 value={Math.round(gradientState.coords.y1 * 100)}
                                                 onChange={(e) => onPropChange('gradient', {
                                                     ...gradientState,
                                                     coords: { ...gradientState.coords, y1: parseInt(e.target.value) / 100 }
                                                 })}
                                                 className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                             />
                                         </div>
                                         <div className="space-y-1">
                                             <div className="flex justify-between text-[10px] text-muted-foreground">
                                                 <span>{t('sel.endX')}</span>
                                                 <span>{Math.round(gradientState.coords.x2 * 100)}%</span>
                                             </div>
                                             <input
                                                 type="range"
                                                 min="0"
                                                 max="100"
                                                 value={Math.round(gradientState.coords.x2 * 100)}
                                                 onChange={(e) => onPropChange('gradient', {
                                                     ...gradientState,
                                                     coords: { ...gradientState.coords, x2: parseInt(e.target.value) / 100 }
                                                 })}
                                                 className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                             />
                                         </div>
                                         <div className="space-y-1">
                                             <div className="flex justify-between text-[10px] text-muted-foreground">
                                                 <span>{t('sel.endY')}</span>
                                                 <span>{Math.round(gradientState.coords.y2 * 100)}%</span>
                                             </div>
                                             <input
                                                 type="range"
                                                 min="0"
                                                 max="100"
                                                 value={Math.round(gradientState.coords.y2 * 100)}
                                                 onChange={(e) => onPropChange('gradient', {
                                                     ...gradientState,
                                                     coords: { ...gradientState.coords, y2: parseInt(e.target.value) / 100 }
                                                 })}
                                                 className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                             />
                                         </div>
                                     </div>
                                 </div>
                             )}
                        </div>
                    )}
                 </div>
            )}
            
            {/* Image adjustments are the primary controls for image layers. */}
            {isImage && !isAdjustment && (
                <ImageFilterProperties
                    values={effectState.filters}
                    onChange={(type, value) => onPropChange('filter', { type, value })}
                />
            )}

            {/* Strokes & Shadows - Rendered lower in hierarchy now */}
            {!isGroup && !isAdjustment && (
                <ShadowStrokeProperties 
                    hideShadows={isText}
                    values={shadowStrokeState || {
                        strokeEnabled: effectState.stroke.width > 0 && effectState.stroke.inside,
                        strokeColor: effectState.stroke.color,
                        strokeWidth: effectState.stroke.width,
                        strokeOpacity: effectState.stroke.opacity,
                        strokeBlur: effectState.stroke.blur,
                        
                        borderEnabled: effectState.stroke.width > 0 && !effectState.stroke.inside,
                        borderColor: effectState.stroke.color,
                        borderWidth: effectState.stroke.width,
                        borderOpacity: effectState.stroke.opacity,
                        
                        shadowEnabled: effectState.shadow.enabled,
                        shadowColor: effectState.shadow.color,
                        shadowBlur: effectState.shadow.blur,
                        shadowOpacity: effectState.shadow.opacity,
                        shadowOffsetX: effectState.shadow.offsetX,
                        shadowOffsetY: effectState.shadow.offsetY
                    }}
                    onValuesChange={(vals) => onPropChange('shadowStrokeUpdate', vals)}
                />
            )}

            <LayerEffectsProperties 
                opacity={selectedObject.opacity || 1}
                blendMode={selectedObject.globalCompositeOperation || 'source-over'}
                visible={selectedObject.visible !== false}
                onChange={(vals) => handleTransform(vals)}
                maskGradient={maskGradientSettings}
                onMaskGradientChange={isMasked ? (vals) => onPropChange('maskGradient', vals) : undefined}
            />

            {/* Transform Group (Collapsible) — generic geometry controls live
                below the item-specific sections; adjustment layers are
                full-canvas overlays and don't need them. */}
            {!isAdjustment && (
            <div className="bg-background border-b border-border/30">
                <div className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors group">
                     <button
                         onClick={() => setIsTransformOpen(!isTransformOpen)}
                         className="flex items-center gap-2 flex-1"
                    >
                        {isTransformOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('panel.transform')}</span>
                    </button>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                        {Math.round(selectedObject.left || 0)}, {Math.round(selectedObject.top || 0)}
                    </div>
                </div>

                {isTransformOpen && (
                     <div className="p-3 bg-secondary/5 animate-in slide-in-from-top-1 duration-150 space-y-3">
                         <TransformProperties
                            x={selectedObject.left || 0}
                            y={selectedObject.top || 0}
                            width={selectedObject.width || 0}
                            height={selectedObject.height || 0}
                            rotation={selectedObject.angle || 0}
                            scaleX={selectedObject.scaleX || 1}
                            scaleY={selectedObject.scaleY || 1}
                            isLocked={!!selectedObject.lockMovementX}
                            pseudoBacksidePreset={effectState.skew.preset || 'front'}
                            onChange={handleTransform}
                            onPresetChange={(preset) => onPropChange('pseudoBacksidePreset', preset)}
                        />
                         <SkewTaperProperties
                            values={{
                                skewX: selectedObject.skewX || 0,
                                skewY: selectedObject.skewY || 0,
                                skewZ: effectState.skew.z || 0,
                                taperDirection: effectState.skew.dir || 0,
                                pseudoBacksidePreset: effectState.skew.preset || 'front'
                            }}
                            onChange={(k, v) => onPropChange(k, v)}
                        />
                     </div>
                )}
            </div>
            )}

            {/* Crop — image layers only. Non-destructive per-side trimming;
                distinct from the toolbar Adjust tool, which resizes the page. */}
            {isImage && !isMultiple && (
            <div className="bg-background border-b border-border/30">
                <div className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors group">
                    <button
                        onClick={() => setIsCropOpen(!isCropOpen)}
                        className="flex items-center gap-2 flex-1"
                    >
                        {isCropOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('panel.crop')}</span>
                    </button>
                </div>
                {isCropOpen && (
                    <div className="bg-secondary/5 animate-in slide-in-from-top-1 duration-150">
                        <CropProperties
                            edges={readEdgeCrop(selectedObject as fabric.Image)}
                            onChange={(edges) => onPropChange('crop', edges)}
                            onReset={() => onPropChange('crop', { left: 0, right: 0, top: 0, bottom: 0 })}
                        />
                    </div>
                )}
            </div>
            )}

            {!isAdjustment && (
                <LayoutProperties
                    onAlign={(align) => onLayoutAction('align', align)}
                    onDistribute={() => {}}
                    canDistribute={false}
                />
            )}

            {!isAdjustment && onCreateAdjustmentLayer && (
                <div className="p-4 border-b border-border/50 space-y-3">
                    <h3 className="font-medium text-sm">{t('panel.addAdjustment')}</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {ADJUSTMENT_ACTION_ITEMS.map((item) => (
                            <button
                                key={item.type}
                                type="button"
                                aria-label={`Adjustment action ${getAdjustmentTypeLabel(item.type)}`}
                                onClick={() => onCreateAdjustmentLayer(item.type)}
                                disabled={!item.enabled}
                                className={`rounded border px-2 py-1.5 text-[11px] text-left transition-colors ${item.enabled ? 'border-border/60 bg-secondary/20 hover:bg-secondary/40 text-foreground' : 'border-border/40 bg-secondary/10 text-muted-foreground cursor-not-allowed opacity-60'}`}
                            >
                                {getAdjustmentTypeLabel(item.type)}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* AI Action for Text/Image */}
            {(isText || isImage) && onMake3D && !isAdjustment && (
                 <div className="p-4 border-b border-border/50">
                     <h3 className="font-medium text-xs text-muted-foreground uppercase mb-3 flex items-center gap-2">
                         {t('panel.aiFeatures')}
                     </h3>
                     <button 
                        onClick={() => {
                            if (selectedObject) {
                                // Create temp canvas to capture clean image without controls
                                const dataUrl = selectedObject.toDataURL({ format: 'png', multiplier: 2 });
                                onMake3D(dataUrl);
                            }
                        }}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-tool-accent hover:from-primary/90 hover:to-tool-accent/90 text-white text-xs py-2 rounded shadow-sm transition-all"
                     >
                        <Box size={14} />
                        {t('panel.convertTo3D')}
                     </button>
                 </div>
            )}

        </div>
    );
}
