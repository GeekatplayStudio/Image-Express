import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { Wand2 } from 'lucide-react';
import { ExtendedFabricObject } from '@/types';
import { moveObjectToGroup, moveObjectToCanvas, applyAlphaToColor } from '@/lib/fabric-utils';
import { APP_THEME } from '@/lib/theme-tokens';
import { ColorPicker } from './ColorPicker';

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
    
    // Single "Paint Layer" shared across sessions
    const currentPaintGroupRef = useRef<fabric.Group | null>(null);

    const findPaintGroups = useCallback((objects: fabric.Object[]) => {
        const results: fabric.Group[] = [];
        const walk = (list: fabric.Object[]) => {
            list.forEach((obj) => {
                if (obj.type === 'group') {
                    const group = obj as fabric.Group;
                    const name = (group as ExtendedFabricObject).name || '';
                    if (name.startsWith('Paint Layer')) results.push(group);
                    const children = group.getObjects();
                    if (children.length > 0) walk(children);
                }
            });
        };
        walk(objects);
        return results;
    }, []);

    const ensureSinglePaintLayer = useCallback(() => {
        if (!canvas) return null;

        const paintGroups = findPaintGroups(canvas.getObjects());
        let primary = paintGroups[0] || null;

        if (primary && primary.group) {
            moveObjectToCanvas(primary, primary.group, canvas);
        }

        const artboard = (canvas as unknown as { artboard?: { width: number; height: number; left: number; top: number } }).artboard;

        if (!primary) {
            const group = new fabric.Group([], {
                selectable: true,
                evented: true,
                originX: 'left',
                originY: 'top',
                left: artboard?.left ?? 0,
                top: artboard?.top ?? 0,
                width: artboard?.width ?? canvas.getWidth(),
                height: artboard?.height ?? canvas.getHeight(),
                layoutManager: new fabric.LayoutManager(new fabric.FixedLayout())
            });
            group.set('name', 'Paint Layer');

            const extGroup = group as ExtendedFabricObject;
            if (!extGroup.id) extGroup.id = `group-${Date.now()}`;

            canvas.add(group);
            primary = group;
            if (extGroup.id && onExpandFolder) onExpandFolder(extGroup.id);
        }

        if (primary) {
            // Force reset to Artboard Top-Left if it was previously centered
            const targetLeft = artboard?.left ?? 0;
            const targetTop = artboard?.top ?? 0;
            const targetWidth = artboard?.width ?? canvas.getWidth();
            const targetHeight = artboard?.height ?? canvas.getHeight();

            primary.set({
                originX: 'left',
                originY: 'top',
                left: targetLeft,
                top: targetTop,
                width: targetWidth,
                height: targetHeight
            });

            if (typeof (primary as unknown as { layoutManager?: unknown }).layoutManager === 'undefined') {
                (primary as unknown as { layoutManager?: unknown }).layoutManager = new fabric.LayoutManager(new fabric.FixedLayout());
            }
            primary.setCoords();
        }

        if (paintGroups.length > 1 && primary) {
            paintGroups.slice(1).forEach((group) => {
                if (group === primary) return;
                if (group.group) {
                    moveObjectToCanvas(group, group.group, canvas);
                }
                const children = [...group.getObjects()];
                children.forEach((child) => {
                    moveObjectToGroup(child, primary!, canvas);
                });
                if (group.group) group.group.remove(group);
                else canvas.remove(group);
            });
            canvas.requestRenderAll();
        }

        currentPaintGroupRef.current = primary;
        if (primary) canvas.setActiveObject(primary);
        return primary;
    }, [canvas, onExpandFolder, findPaintGroups]);

    // Reset Paint Group when activeTool changes or unmounts is handled by effect cleanup implicitly if component unmounts
    // But since this component is likely conditionally rendered, we should use mount effect.
    useEffect(() => {
        currentPaintGroupRef.current = null;
    }, []);

    useEffect(() => {
        if (!canvas) return;

        if (activeTool === 'paint') {
            ensureSinglePaintLayer();
        }
    }, [canvas, activeTool, ensureSinglePaintLayer]);

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
              if (group && group.canvas !== canvas) {
                 group = null;
            }

              // If still missing, create a paint layer
              if (!group) {
                  group = ensureSinglePaintLayer();
              }

              if (!group) return; // Safety check for TypeScript

            // group is ensured above
            
            // [FIX] New coordinate system: Group origin is Top/Left (matches Canvas/Artboard origin).
            
            // 1. Get path absolute position (Top Left of the bounding box)
            const pathLeft = path.left;
            const pathTop = path.top;
            
            // 2. Remove from canvas
            canvas.remove(path);
            
            // 3. Calculate local coordinates relative to group Top-Left
            // Since group origin is left/top, (0,0) is group.left/group.top (which matches artboard.left/top)
            const localX = pathLeft - group.left;
            const localY = pathTop - group.top;
            
            // 4. Update path to use default origin (assumed left/top from freeDrawing) but set correct local pos
            // We usually want paths to keep their own origin, but standardizing avoids confusion.
            // FREE DRAWING BRUSH usually creates paths with originX/Y: 'left', 'top' by default in v6.
             path.set({
                 left: localX,
                 top: localY
             });
            
            // 5. Add to group
            group.add(path);
            
            // 6. Update coordinates
            path.setCoords();
            group.setCoords();
            
            canvas.requestRenderAll();
            if (onObjectsUpdate) onObjectsUpdate();
        };

        canvas.on('path:created', handlePathCreated);
        return () => { canvas.off('path:created', handlePathCreated); };
    }, [canvas, paintBlendMode, onObjectsUpdate, ensureSinglePaintLayer]);

    useEffect(() => {
        if (!canvas) return;
        const syncSelection = () => {
            const active = canvas.getActiveObject();
            if (active && active.type === 'group') {
                const name = (active as ExtendedFabricObject).name || '';
                if (name.startsWith('Paint Layer')) {
                    currentPaintGroupRef.current = active as fabric.Group;
                }
            }
        };
        canvas.on('selection:created', syncSelection);
        canvas.on('selection:updated', syncSelection);
        return () => {
            canvas.off('selection:created', syncSelection);
            canvas.off('selection:updated', syncSelection);
        };
    }, [canvas]);

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
                                className={`px-3 py-2 text-xs rounded-md border transition-all ${brushType === b ? 'bg-tool-accent text-tool-accent-foreground border-tool-accent' : 'bg-secondary hover:bg-secondary/80 border-transparent'}`}
                                >
                                    {b}
                                </button>
                            ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <ColorPicker 
                        color={paintColor} 
                        onChange={setPaintColor} 
                        label="Paint Color" 
                    />
                    
                    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide pt-1">
                        {APP_THEME.paintSwatches.map(c => (
                        <button 
                            key={c}
                            onClick={() => setPaintColor(c)}
                            className="w-6 h-6 rounded-md border border-border/50 shrink-0 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                            title={c}
                        />
                        ))}
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
