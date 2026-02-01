import React, { useEffect, useState, useRef } from 'react';
import * as fabric from 'fabric';
import { Wand2 } from 'lucide-react';
import { ExtendedFabricObject } from '@/types';
import { getNextIndexedName, getGroupNames, moveObjectToGroup, applyAlphaToColor } from '@/lib/fabric-utils';

interface PaintPropertiesProps {
    canvas: fabric.Canvas | null;
    activeTool: string;
    // Callback to update expanded folders in parent if needed (optional but good for UX)
    onExpandFolder?: (id: string) => void;
    // Callback to notify parent of object updates (usually redundant if parent listens to canvas events)
    onObjectsUpdate?: () => void;
}

export function PaintProperties({ canvas, activeTool, onExpandFolder, onObjectsUpdate }: PaintPropertiesProps) {
    const [paintColor, setPaintColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(10);
    const [brushType, setBrushType] = useState('Pencil');
    const [paintOpacity, setPaintOpacity] = useState(1);
    const [brushBlur, setBrushBlur] = useState(0); // Softness
    const [sprayDensity, setSprayDensity] = useState(20);
    const [paintBlendMode, setPaintBlendMode] = useState('source-over');
    
    // Check if we have an active "Folder" (Group) for current session
    const currentPaintGroupRef = useRef<fabric.Group | null>(null);

    // Reset Paint Group when activeTool changes or unmounts is handled by effect cleanup implicitly if component unmounts
    // But since this component is likely conditionally rendered, we should use mount effect.
    useEffect(() => {
        currentPaintGroupRef.current = null;
    }, []);

    useEffect(() => {
        if (!canvas) return;

        const handlePathCreated = (e: { path: fabric.Object }) => {
            // "path:created" is fired by Fabric's free drawing brush.
            // We double check activeTool just in case, but component should be unmounted if not painting.
            // However, this logic is core to "Paint Mode".
            
            const path = e.path;
            if (!path) return;
            
            path.set({ globalCompositeOperation: paintBlendMode });
            
            // Should we add to a group?
            let group = currentPaintGroupRef.current;
            
            // Check if group is still valid (on canvas)
            if (group && !canvas.getObjects().includes(group)) {
                 group = null;
            }

            if (!group) {
                // Create new Group
                group = new fabric.Group([], { 
                    selectable: true,
                    evented: true,
                });
                const paintFolderName = getNextIndexedName('Paint Folder', getGroupNames(canvas));
                group.set('name', paintFolderName);
                
                // Ensure ID
                const extGroup = group as ExtendedFabricObject;
                if (!extGroup.id) extGroup.id = `group-${Date.now()}`;

                // Add group to canvas
                canvas.add(group);
                currentPaintGroupRef.current = group;
                
                // Auto Expand
                if (extGroup.id && onExpandFolder) {
                    onExpandFolder(extGroup.id);
                }
            }
            
            // Move path from canvas to group with preserved coordinates
            moveObjectToGroup(path, group, canvas);
            
            canvas.requestRenderAll();
            if (onObjectsUpdate) onObjectsUpdate();
        };

        canvas.on('path:created', handlePathCreated);
        return () => { canvas.off('path:created', handlePathCreated); };
    }, [canvas, paintBlendMode, onExpandFolder, onObjectsUpdate]);

    useEffect(() => {
        if (!canvas) return;
        const drawingCanvas = canvas as fabric.Canvas & {
            isDrawingMode: boolean;
            freeDrawingBrush?: fabric.BaseBrush;
            set: (key: string, value: unknown) => void;
        };

        // If this component is mounted, we assume we are in paint mode effectively.
        // But let's check activeTool prop for safety.
        if (activeTool === 'paint') {
            drawingCanvas.set('isDrawingMode', true);
            let brush: fabric.BaseBrush;

            if (brushType === 'Spray') {
                const sprayBrush = new fabric.SprayBrush(canvas);
                sprayBrush.density = sprayDensity;
                brush = sprayBrush;
            } else if (brushType === 'Oil') {
                const oilBrush = new fabric.SprayBrush(canvas);
                const oilDensity = Math.max(20, sprayDensity); 
                oilBrush.density = oilDensity;
                oilBrush.width = brushSize;
                oilBrush.dotWidth = Math.max(1, brushSize / 8); 
                oilBrush.dotWidthVariance = Math.max(1, brushSize / 10);
                oilBrush.randomOpacity = false; 
                oilBrush.optimizeOverlapping = false;
                brush = oilBrush;
            } else if (brushType === 'Watercolor') {
                brush = new fabric.PencilBrush(canvas);
            } else {
                brush = new fabric.PencilBrush(canvas);
            }

            brush.color = applyAlphaToColor(paintColor, paintOpacity);
            brush.width = brushSize;
            
            if (brushType !== 'Spray' && brushType !== 'Oil') {
                if (brushBlur > 0) {
                     brush.shadow = new fabric.Shadow({
                        blur: brushBlur,
                        offsetX: 0,
                        offsetY: 0,
                        color: paintColor
                    });
                } else {
                    brush.shadow = null;
                }
            }
            
            drawingCanvas.set('freeDrawingBrush', brush);
        } else {
            // Ideally should not happen if component conditionally rendered
            drawingCanvas.set('isDrawingMode', false);
        }

        return () => {
             // Cleanup: Exit drawing mode when unmounting
             if (canvas) {
                 (canvas as fabric.Canvas & { set: (k:string, v:unknown)=>void }).set('isDrawingMode', false);
             }
        }
    }, [activeTool, paintColor, brushSize, brushType, paintOpacity, canvas, brushBlur, sprayDensity]);


    return (
        <div className="w-80 border-l border-border bg-card overflow-y-auto h-full animate-in slide-in-from-right-5 duration-300 transform-gpu relative scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
            <div className="p-5 border-b border-border/50 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Wand2 size={16} className="text-primary" />
                    Paint Properties
                </h3>
            </div>

            <div className="p-5 space-y-6">
                <div className="space-y-3">
                        <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brush Type</label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                            {['Pencil', 'Spray', 'Oil', 'Watercolor'].map(b => (
                                <button
                                key={b}
                                onClick={() => {
                                    setBrushType(b);
                                    if (b === 'Watercolor') {
                                        setPaintOpacity(0.5);
                                        setBrushBlur(10);
                                        setPaintBlendMode('multiply'); 
                                    } else if (b === 'Oil') {
                                        setPaintOpacity(1); 
                                        setBrushBlur(0);
                                        setPaintBlendMode('source-over');
                                    } else {
                                        setPaintBlendMode('source-over');
                                    }
                                }}
                                className={`px-3 py-2 text-xs rounded-md border transition-all ${brushType === b ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary hover:bg-secondary/80 border-transparent'}`}
                                >
                                    {b}
                                </button>
                            ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color</label>
                        <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{paintColor.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                            <div className="relative w-10 h-10 rounded-full border border-border shadow-sm overflow-hidden shrink-0 group cursor-pointer transition-transform active:scale-95">
                            <div className="absolute inset-0 z-0 bg-image-checkered opacity-20" />
                            <div className="absolute inset-0 z-10" style={{ backgroundColor: paintColor }} />
                            <input 
                                type="color" 
                                value={paintColor}
                                onChange={(e) => setPaintColor(e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                            />
                        </div>
                        <div className="flex-1 space-y-2">
                                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                                    {['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'].map(c => (
                                    <button 
                                        key={c}
                                        onClick={() => setPaintColor(c)}
                                        className="w-6 h-6 rounded-full border border-border/50 shrink-0 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: c }}
                                        title={c}
                                    />
                                    ))}
                                </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                        <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opacity</label>
                        <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{Math.round(paintOpacity * 100)}%</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.1" 
                        max="1" 
                        step="0.05" 
                        value={paintOpacity}
                        onChange={(e) => setPaintOpacity(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>

                <div className="space-y-3">
                        <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brush Size</label>
                        <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{brushSize}px</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max="100" 
                        step="1" 
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                
                {/* Extra Settings based on Type */}
                {(brushType === 'Pencil' || brushType === 'Watercolor' || brushType === 'Oil') && (
                        <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Softness</label>
                            <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{brushBlur}</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max="50" 
                            step="1" 
                            value={brushBlur}
                            onChange={(e) => setBrushBlur(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                )}

                <div className="space-y-3">
                        <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Blending Mode</label>
                    </div>
                    <select 
                        value={paintBlendMode}
                        onChange={(e) => setPaintBlendMode(e.target.value)}
                        className="w-full bg-secondary btn-ghost text-xs p-2 rounded-md border border-border/50 outline-none"
                    >
                        <option className="bg-zinc-950 text-white" value="source-over">Normal</option>
                        <option className="bg-zinc-950 text-white" value="multiply">Multiply (Watercolor)</option>
                        <option className="bg-zinc-950 text-white" value="screen">Screen</option>
                        <option className="bg-zinc-950 text-white" value="overlay">Overlay</option>
                        <option className="bg-zinc-950 text-white" value="darken">Darken</option>
                        <option className="bg-zinc-950 text-white" value="lighten">Lighten</option>
                    </select>
                </div>

                {(brushType === 'Spray' || brushType === 'Oil') && (
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{brushType === 'Oil' ? 'Bristle Density' : 'Spray Density'}</label>
                            <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{sprayDensity}</span>
                        </div>
                        <input 
                            type="range" 
                            min="5" 
                            max="100" 
                            step="1" 
                            value={sprayDensity}
                            onChange={(e) => setSprayDensity(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
