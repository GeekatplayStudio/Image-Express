import React, { useState } from 'react';
import * as fabric from 'fabric';
import { ExtendedFabricObject, AdjustmentLayerSettings } from '@/types';
import { TransformProperties } from './TransformProperties';
import { LayoutProperties } from './LayoutProperties';
import { LayerEffectsProperties } from './LayerEffectsProperties';
import { TextProperties } from './TextProperties';
import { TextEffectsProperties } from './TextEffectsProperties';
import { ImageFilterProperties, ImageFilterValues } from './ImageFilterProperties';
import { ShadowStrokeProperties, ShadowStrokeValues } from './ShadowStrokeProperties';
import { SkewTaperProperties } from './SkewTaperProperties';
import { AdjustmentControls } from './AdjustmentControls';
import { Folder, Layers, Blend, ChevronDown, ChevronRight, Scissors, Lock, Unlock, Box } from 'lucide-react';

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
    onCreateClip: () => void;
    onReleaseMask: () => void;
    onToggleMaskLock?: () => void;
    
    // Sub-component specific handlers (pass-through helpers from parent would be ideal, 
    // but for now we might need to assume parent handles the heavy lifting via onPropChange or specific props)
    // Actually, to make this clean, the Parent should provide specific handlers or we standardise 'onPropChange'.
    
    // We'll define specific ones for clarity where complex
    updateAdjustment: (settings: AdjustmentLayerSettings) => void;
    onMake3D?: (imageUrl: string) => void;
    
    // Specific state overrides that might not be on object directly or need React state
    textState?: { font: string; weight: string; curve: number; center: number };
    activeTextEffects?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    textEffectConfigs?: Record<string, any>;
    effectState: { 
        stroke: { color: string; width: number; opacity: number; inside: boolean; blur?: number };
        shadow: { enabled: boolean; color: string; blur: number; offsetX: number; offsetY: number; opacity: number };
        skew: { x: number; y: number; z: number; dir: number };
        filters: ImageFilterValues;
    };
    shadowStrokeState?: ShadowStrokeValues; // Start loose for rapid refactor binding

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
    onCreateClip,
    onReleaseMask,
    onToggleMaskLock,
    updateAdjustment,
    onMake3D,
    textState,
    activeTextEffects,
    textEffectConfigs,
    effectState,
    shadowStrokeState
}: SelectionPropertiesProps) {

    const [isTransformOpen, setIsTransformOpen] = useState(false); // Collapsed by default

    const isMultiple = selectedObjects.length > 1;
    const isGroup = selectedObject?.type === 'group';
    const isMasked = !!selectedObject?.clipPath;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isMaskAbsolute = isMasked ? (selectedObject?.clipPath as any).absolutePositioned : false;
    
    const isAdjustment = (selectedObject as ExtendedFabricObject)?.isAdjustmentLayer;
    const extended = selectedObject as ExtendedFabricObject;
    const isImage = selectedObject?.type === 'image';
    const isText = selectedObject?.type === 'text' || selectedObject?.type === 'i-text';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleTransform = (values: Record<string, any>) => {
        Object.entries(values).forEach(([k, v]) => onPropChange(k, v));
    };

    if (isMultiple) {
        return (
            <div className="h-full bg-card overflow-y-auto">
                 <div className="p-4 border-b border-border/50 bg-secondary/10">
                    <h2 className="font-semibold text-xs uppercase flex items-center gap-2">
                        <Layers size={14} /> Multiple Selection ({selectedObjects.length})
                    </h2>
                </div>
                
                <div className="p-4 flex gap-2 justify-center border-b border-border/50">
                    <button onClick={onGroup} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded-md text-xs min-w-[60px]">
                        <Folder size={20} /> Group
                    </button>
                    {selectedObjects.length === 2 && (
                        <>
                            <div className="w-px bg-border mx-2" />
                            <button onClick={onCreateMask} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded-md text-xs min-w-[60px]" title="Top object masks bottom object">
                                <Blend size={20} /> Mask
                            </button>
                            <button onClick={onCreateClip} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded-md text-xs min-w-[60px]" title="Bottom object clips top object">
                                <Scissors size={20} /> Clip
                            </button>
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
         return <div className="p-8 text-center text-muted-foreground text-sm">Select an object to edit properties</div>;
    }

    return (
        <div className="h-full bg-card overflow-y-auto pb-20 scrollbar-thin">
            {/* Header */}
            <div className="p-4 border-b border-border/50 bg-secondary/10">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-xs uppercase truncate max-w-[150px]" title={extended?.name || selectedObject.type}>
                         {extended?.name || (isAdjustment ? 'Adjustment Layer' : selectedObject.type)}
                    </h2>
                    <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
                        {selectedObject.type}
                    </span>
                </div>
            </div>

            {/* Global Properties: Appearance & Layout (Top Priority) */}
            <LayerEffectsProperties 
                opacity={selectedObject.opacity || 1}
                blendMode={selectedObject.globalCompositeOperation || 'source-over'}
                visible={selectedObject.visible !== false}
                onChange={(vals) => handleTransform(vals)}
            />

            <LayoutProperties 
                onAlign={(align) => onLayoutAction('align', align)}
                onDistribute={() => {}} 
                canDistribute={false}
            />
            
            {/* Quick Actions (Contextual) */}
            {(isGroup || isMasked) && (
                <div className="p-2 border-b border-border/50 flex gap-2 justify-center bg-secondary/10">
                    {isGroup && (
                        <button onClick={onUngroup} className="px-3 py-1.5 bg-secondary/50 hover:bg-secondary rounded text-xs flex items-center gap-2 border border-border/50 transition-colors">
                            <Layers size={14} /> Ungroup
                        </button>
                    )}
                    {isMasked && (
                         <>
                            {onToggleMaskLock && (
                                <button 
                                    onClick={onToggleMaskLock} 
                                    className={`px-3 py-1.5 rounded text-xs flex items-center gap-2 border transition-colors ${!isMaskAbsolute ? 'bg-primary/20 text-primary border-primary/30' : 'bg-secondary/50 hover:bg-secondary border-border/50'}`}
                                    title={!isMaskAbsolute ? "Mask is locked to layer (Attached)" : "Mask is fixed on canvas (Detached/Window)"}
                                >
                                    {!isMaskAbsolute ? <Lock size={14} /> : <Unlock size={14} />}
                                    {!isMaskAbsolute ? 'Attached' : 'Detached'}
                                </button>
                            )}
                            <button onClick={onReleaseMask} className="px-3 py-1.5 bg-secondary/50 hover:bg-secondary rounded text-xs flex items-center gap-2 border border-border/50 transition-colors">
                                <Blend size={14} /> Release
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Transform Group (Collapsible) */}
            <div className="bg-background border-b border-border/30">
                <div className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors group">
                     <button 
                         onClick={() => setIsTransformOpen(!isTransformOpen)}
                         className="flex items-center gap-2 flex-1"
                    >
                        {isTransformOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transform</span>
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
                            onChange={handleTransform}
                        />
                         <SkewTaperProperties 
                            values={{
                                skewX: selectedObject.skewX || 0,
                                skewY: selectedObject.skewY || 0,
                                skewZ: effectState.skew.z || 0,
                                taperDirection: effectState.skew.dir || 0
                            }}
                            onChange={(k, v) => onPropChange(k, v)}
                        />
                     </div>
                )}
            </div>

            {/* Specific Editors (Styles) */}
            
            {/* COLOR / FILL */}
            {!isImage && !isGroup && !isAdjustment && (
                 <div className="p-4 border-b border-border/50 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium text-sm">Fill</h3>
                        <div className="flex bg-secondary rounded p-0.5">
                            <button 
                                className={`px-2 py-0.5 text-[10px] rounded ${!isGradient ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                onClick={() => onPropChange('fill', color)}
                            >Solid</button>
                            <button 
                                className={`px-2 py-0.5 text-[10px] rounded ${isGradient ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                onClick={() => onPropChange('gradient', { 
                                    start: gradientState?.start || '#000000', 
                                    end: gradientState?.end || '#ffffff', 
                                    angle: gradientState?.angle || 0,
                                    type: gradientState?.type || 'linear'
                                })}
                            >Gradient</button>
                        </div>
                    </div>
                    
                    {!isGradient ? (
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 h-8 rounded border border-border shadow-sm overflow-hidden group cursor-pointer">
                                <div className="absolute inset-0 z-0 bg-image-checkered opacity-20" />
                                <div className="absolute inset-0 z-10" style={{ backgroundColor: color }} />
                                <input 
                                    type="color" 
                                    value={color}
                                    onChange={(e) => onPropChange('fill', e.target.value)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                />
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">{color.toUpperCase()}</div>
                        </div>
                    ) : (
                        <div className="space-y-3 bg-secondary/20 p-2 rounded-md">
                             <div className="flex items-center justify-between text-xs">
                                 <label className="text-muted-foreground">Type</label>
                                 <select 
                                    className="bg-background border border-border rounded px-1 py-0.5 text-xs"
                                    value={gradientState?.type}
                                    onChange={(e) => onPropChange('gradient', { ...gradientState, type: e.target.value })}
                                 >
                                     <option value="linear">Linear</option>
                                     <option value="radial">Radial</option>
                                 </select>
                             </div>

                             <div className="flex items-center gap-2">
                                 <div className="space-y-1 flex-1">
                                     <span className="text-[10px] text-muted-foreground">Start</span>
                                        <div className="relative h-6 rounded border border-border overflow-hidden">
                                            <div className="absolute inset-0" style={{ backgroundColor: gradientState?.start }}></div>
                                            <input 
                                                type="color" 
                                                value={gradientState?.start}
                                                onChange={(e) => onPropChange('gradient', { ...gradientState, start: e.target.value })}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                        </div>
                                 </div>
                                 <div className="space-y-1 flex-1">
                                     <span className="text-[10px] text-muted-foreground">End</span>
                                        <div className="relative h-6 rounded border border-border overflow-hidden">
                                            <div className="absolute inset-0" style={{ backgroundColor: gradientState?.end }}></div>
                                            <input 
                                                type="color" 
                                                value={gradientState?.end}
                                                onChange={(e) => onPropChange('gradient', { ...gradientState, end: e.target.value })}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                        </div>
                                 </div>
                             </div>
                             
                             {gradientState?.type === 'linear' && (
                                 <div className="space-y-1 pt-1">
                                     <div className="flex justify-between text-[10px] text-muted-foreground">
                                         <span>Angle</span>
                                         <span>{gradientState.angle}°</span>
                                     </div>
                                     <input 
                                         type="range" min="0" max="360" 
                                         value={gradientState.angle}
                                         onChange={(e) => onPropChange('gradient', { ...gradientState, angle: parseInt(e.target.value) })}
                                         className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                     />
                                 </div>
                             )}

                             {gradientState?.type === 'linear' && gradientState.coords && (
                                 <div className="space-y-2 pt-2">
                                     <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Gradient Points</div>
                                     <div className="grid grid-cols-2 gap-2">
                                         <div className="space-y-1">
                                             <div className="flex justify-between text-[10px] text-muted-foreground">
                                                 <span>Start X</span>
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
                                                 <span>Start Y</span>
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
                                                 <span>End X</span>
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
                                                 <span>End Y</span>
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


            {isText && textState && (
                <TextEffectsProperties
                    activePresets={activeTextEffects || []}
                    effectConfigs={textEffectConfigs || {}}
                    onToggleEffect={(preset, enabled) => onPropChange('toggleTextEffect', { preset, enabled })}
                    onConfigChange={(preset, config) => onPropChange('updateTextEffectConfig', { preset, config })}
                />
            )}

            {isText && textState && (
                <TextProperties 
                    fontFamily={textState.font}
                    fontWeight={textState.weight}
                    curveStrength={textState.curve}
                    curveCenter={textState.center}
                    onFontFamilyChange={(f) => onPropChange('fontFamily', f)}
                    onFontWeightChange={(w) => onPropChange('fontWeight', w)}
                    onCurveChange={(s, c) => onPropChange('curve', { strength: s, center: c })}
                />
            )}

            {isImage && !isAdjustment && (
                <ImageFilterProperties 
                    values={effectState.filters}
                    onChange={(type, value) => onPropChange('filter', { type, value })}
                />
            )}

            {isAdjustment && extended?.adjustmentType && (
                 <div className="p-4 border-b border-border/50 space-y-3">
                    <h3 className="font-medium text-sm">Adjustment Settings</h3>
                    <AdjustmentControls 
                        type={extended.adjustmentType}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        settings={extended.adjustmentSettings || ({} as any)}
                        onChange={updateAdjustment}
                    />
                 </div>
            )}

            {/* AI Action for Text/Image */}
            {(isText || isImage) && onMake3D && !isAdjustment && (
                 <div className="p-4 border-b border-border/50">
                     <h3 className="font-medium text-xs text-muted-foreground uppercase mb-3 flex items-center gap-2">
                         AI Features
                     </h3>
                     <button 
                        onClick={() => {
                            if (selectedObject) {
                                // Create temp canvas to capture clean image without controls
                                const dataUrl = selectedObject.toDataURL({ format: 'png', multiplier: 2 });
                                onMake3D(dataUrl);
                            }
                        }}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs py-2 rounded shadow-sm transition-all"
                     >
                        <Box size={14} />
                        Convert to 3D
                     </button>
                 </div>
            )}

        </div>
    );
}
