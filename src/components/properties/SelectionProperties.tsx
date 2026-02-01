import React, { useMemo } from 'react';
import * as fabric from 'fabric';
import { ExtendedFabricObject, AdjustmentLayerType, AdjustmentLayerSettings } from '@/types';
import { TransformProperties } from './TransformProperties';
import { LayoutProperties } from './LayoutProperties';
import { LayerEffectsProperties } from './LayerEffectsProperties';
import { TextProperties } from './TextProperties';
import { ImageFilterProperties, ImageFilterValues } from './ImageFilterProperties';
import { ShadowStrokeProperties } from './ShadowStrokeProperties';
import { SkewTaperProperties } from './SkewTaperProperties';
import { AdjustmentControls } from './AdjustmentControls';
import { GripVertical, Folder, FolderPlus, Layers, Blend } from 'lucide-react';

interface SelectionPropertiesProps {
    canvas: fabric.Canvas | null;
    selectedObject: fabric.Object | null;
    selectedObjects: fabric.Object[]; // For multiple selection
    isGradient: boolean; // Just pass these down
    color: string;
    gradientState?: {
        type: 'linear' | 'radial';
        start: string;
        end: string;
        angle: number;
    };
    
    // Callbacks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPropChange: (prop: string, value: any) => void; 
    onLayoutAction: (type: 'align' | 'distribute', value: string) => void;
    onGroup: () => void;
    onUngroup: () => void;
    onCreateMask: () => void;
    onReleaseMask: () => void;
    
    // Sub-component specific handlers (pass-through helpers from parent would be ideal, 
    // but for now we might need to assume parent handles the heavy lifting via onPropChange or specific props)
    // Actually, to make this clean, the Parent should provide specific handlers or we standardise 'onPropChange'.
    
    // We'll define specific ones for clarity where complex
    updateAdjustment: (settings: AdjustmentLayerSettings) => void;
    
    // Specific state overrides that might not be on object directly or need React state
    textState?: { font: string; weight: string; curve: number; center: number };
    effectState: { 
        stroke: { color: string; width: number; opacity: number; inside: boolean };
        shadow: { enabled: boolean; color: string; blur: number; offsetX: number; offsetY: number; opacity: number };
        skew: { x: number; y: number; z: number; dir: number };
        filters: ImageFilterValues;
    };
}

export function SelectionProperties({
    canvas,
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
    onReleaseMask,
    updateAdjustment,
    textState,
    effectState
}: SelectionPropertiesProps) {

    const isMultiple = selectedObjects.length > 1;
    const isGroup = selectedObject?.type === 'group';
    const isText = selectedObject?.type === 'text' || selectedObject?.type === 'i-text';
    const isImage = selectedObject?.type === 'image';
    const isRect = selectedObject?.type === 'rect'; // Could be adjustment layer
    
    const extended = selectedObject as ExtendedFabricObject | null;
    const isAdjustment = extended?.isAdjustmentLayer;

    // Helper wrapper
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleTransform = (vals: any) => {
        Object.entries(vals).forEach(([k, v]) => onPropChange(k, v));
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
                    <button onClick={onGroup} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded-md text-xs">
                        <Folder size={20} /> Group
                    </button>
                    {selectedObjects.length === 2 && (
                         <button onClick={onCreateMask} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded-md text-xs">
                            <Blend size={20} /> Mask
                        </button>
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
            
            {/* Quick Actions */}
            <div className="p-2 border-b border-border/50 flex gap-1 justify-around">
                 {isGroup && (
                     <button onClick={onUngroup} className="p-1.5 hover:bg-secondary rounded text-xs flex items-center gap-1">
                         <Layers size={14} /> Ungroup
                     </button>
                 )}
                 {selectedObject.clipPath && (
                      <button onClick={onReleaseMask} className="p-1.5 hover:bg-secondary rounded text-xs flex items-center gap-1">
                         <Blend size={14} /> Release Mask
                     </button>
                 )}
            </div>

            {/* Layout (Align) */}
            <LayoutProperties 
                onAlign={(align) => onLayoutAction('align', align)}
                onDistribute={() => {}} // Single obj cannot distribute
                canDistribute={false}
            />

            {/* Transform */}
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

            {/* Skew & Taper */}
            <SkewTaperProperties 
                 values={{
                     skewX: selectedObject.skewX || 0,
                     skewY: selectedObject.skewY || 0,
                     skewZ: effectState.skew.z || 0,
                     taperDirection: effectState.skew.dir || 0
                 }}
                 onChange={(k, v) => onPropChange(k, v)}
            />

            {/* Specific Editors */}
            
            {/* COLOR / FILL (Not for Images/Groups usually, unless SVG) */}
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
                             {/* Type Selector */}
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

                             {/* Stops */}
                             <div className="flex items-center gap-2">
                                 <div className="space-y-1 flex-1">
                                     <span className="text-[10px] text-muted-foreground">Start Color</span>
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
                                     <span className="text-[10px] text-muted-foreground">End Color</span>
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
                             
                             {/* Angle (Linear Only) */}
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
                        </div>
                    )}
                 </div>
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

            {/* Appearance (Opacity, Blend) */}
            <LayerEffectsProperties 
                opacity={selectedObject.opacity || 1}
                blendMode={selectedObject.globalCompositeOperation || 'source-over'}
                visible={selectedObject.visible !== false}
                onChange={(vals) => handleTransform(vals)}
            />
            
            {/* Strokes & Shadows */}
            {!isGroup && !isAdjustment && (
                <ShadowStrokeProperties 
                    values={{
                        strokeColor: effectState.stroke.color,
                        strokeWidth: effectState.stroke.width,
                        strokeOpacity: effectState.stroke.opacity,
                        strokeInside: effectState.stroke.inside,
                        shadowEnabled: effectState.shadow.enabled,
                        shadowColor: effectState.shadow.color,
                        shadowBlur: effectState.shadow.blur,
                        shadowOpacity: effectState.shadow.opacity,
                        shadowOffsetX: effectState.shadow.offsetX,
                        shadowOffsetY: effectState.shadow.offsetY
                    }}
                    onStrokeChange={(k, v) => onPropChange('stroke', { key: k, value: v })}
                    onShadowChange={(k, v) => onPropChange('shadow', { key: k, value: v })}
                />
            )}

        </div>
    );
}
