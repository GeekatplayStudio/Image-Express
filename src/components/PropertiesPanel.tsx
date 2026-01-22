'use client';
import { useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { StarPolygon } from '@/types';
import { ArrowUp, ArrowDown, Trash2, Layers, GripVertical, Settings, Smartphone, Monitor, Square, Image as ImageIcon } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PropertiesPanelProps {
    canvas: fabric.Canvas | null;
    activeTool?: string;
}

// Sortable Layer Item Component
function SortableLayerItem({ obj, index, selectedObject, selectLayer, deleteLayer, total }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: (obj as any).id || (obj as any).cacheKey || `obj-${index}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 999 : 'auto',
        position: 'relative' as const,
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            onClick={() => selectLayer(obj)}
            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all group mb-1 ${
                selectedObject === obj 
                ? 'bg-primary/10 border-primary/30 shadow-sm' 
                : 'bg-card border-border/50 hover:bg-secondary/50'
            } ${isDragging ? 'opacity-50 shadow-xl ring-2 ring-primary/20' : ''}`}
        >
            <div className="flex items-center gap-3 overflow-hidden">
                <div 
                    {...attributes} 
                    {...listeners} 
                    className="cursor-move text-muted-foreground/50 hover:text-foreground p-1 hover:bg-secondary rounded touch-none"
                >
                    <GripVertical size={14} />
                </div>
                
                <div className="w-8 h-8 rounded bg-background border flex items-center justify-center text-muted-foreground shrink-0 select-none">
                    {obj.type === 'rect' && <div className="w-4 h-4 bg-current rounded-sm" />}
                    {obj.type === 'circle' && <div className="w-4 h-4 bg-current rounded-full" />}
                    {obj.type === 'triangle' && <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-current" />}
                    {(obj.type === 'text' || obj.type === 'i-text') && <span className="text-xs font-serif font-bold">T</span>}
                    {obj.type === 'image' && <div className="text-[8px] font-mono">IMG</div>}
                    {'isStar' in obj && <div className="text-[8px]">★</div>}
                </div>
                <div className="flex flex-col min-w-0 select-none">
                    <span className="text-sm font-medium truncate w-24">
                        {obj.type === 'i-text' ? (obj as fabric.IText).text : (obj.type || 'Object')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Layer {total - index}</span>
                </div>
            </div>
            
            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={(e) => { e.stopPropagation(); deleteLayer(obj); }}
                    className="p-1.5 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive border border-transparent hover:border-destructive/20"
                    title="Delete"
                >
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
    );
}

export default function PropertiesPanel({ canvas, activeTool }: PropertiesPanelProps) {
    const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
    const [objects, setObjects] = useState<fabric.Object[]>([]);

    // Assign stable IDs to objects if they don't have one, needed for DnD
    useEffect(() => {
        if (!canvas) return;
        canvas.getObjects().forEach((obj, i) => {
            if (!(obj as any).id) {
                // simple ID generation
                (obj as any).id = `obj-${Date.now()}-${i}`;
            }
        });
    }, [canvas, objects]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const [color, setColor] = useState('#000000');
    const [opacity, setOpacity] = useState(1);
    const [fontFamily, setFontFamily] = useState('Arial');
    const [fontWeight, setFontWeight] = useState('normal');
    
    // Canvas Sizing
    const [canvasWidth, setCanvasWidth] = useState(1080);
    const [canvasHeight, setCanvasHeight] = useState(1080);
    const [canvasColor, setCanvasColor] = useState('#ffffff');

    // Star specific properties
    const [starPoints, setStarPoints] = useState(5);
    const [starInnerRadius, setStarInnerRadius] = useState(0.5);

    useEffect(() => {
        if (!canvas) return;

        const updateObjects = () => {
            setObjects([...canvas.getObjects().reverse()]); // Reverse to show top layer first
        };

        const handleSelection = (e: { selected?: fabric.Object[] }) => {
            const selection = e.selected ? e.selected[0] : null;
            setSelectedObject(selection || null);
            
            if (selection) {
                // ... existing logic ...
                setColor(selection.get('fill') as string || '#000000');
                setOpacity(selection.get('opacity') || 1);
                
                // Check if it is a text object
                if (selection.type === 'text' || selection.type === 'i-text') {
                    const textObject = selection as fabric.IText;
                    setFontFamily(textObject.get('fontFamily') || 'Arial');
                    setFontWeight((textObject.get('fontWeight') as string) || 'normal');
                }

                // Check for Star properties
                if ('isStar' in selection && (selection as StarPolygon).isStar) {
                     const starSelection = selection as StarPolygon;
                    setStarPoints(starSelection.starPoints || 5);
                    setStarInnerRadius(starSelection.starInnerRadius || 0.5);
                }
            }
        };

        const handleCleared = () => {
            setSelectedObject(null);
        };

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', handleCleared);
        
        canvas.on('object:added', updateObjects);
        canvas.on('object:removed', updateObjects);
        canvas.on('object:modified', updateObjects);
        
        // Initial load
        updateObjects();

        return () => {
            canvas.off('selection:created', handleSelection);
            canvas.off('selection:updated', handleSelection);
            canvas.off('selection:cleared', handleCleared);
            canvas.off('object:added', updateObjects);
            canvas.off('object:removed', updateObjects);
            canvas.off('object:modified', updateObjects);
        };
    }, [canvas]);

    const updateColor = (newColor: string) => {
        setColor(newColor);
        if (selectedObject && canvas) {
            selectedObject.set('fill', newColor);
            canvas.requestRenderAll();
        }
    };

    const updateOpacity = (newOpacity: number) => {
        setOpacity(newOpacity);
        if (selectedObject && canvas) {
            selectedObject.set('opacity', newOpacity);
            canvas.requestRenderAll();
        }
    };

    const updateFontFamily = (newFont: string) => {
        setFontFamily(newFont);
        if (selectedObject && canvas && 'fontFamily' in selectedObject) {
             selectedObject.set('fontFamily', newFont);
             canvas.requestRenderAll();
        }
    };

    const updateFontWeight = (newWeight: string) => {
        setFontWeight(newWeight);
         if (selectedObject && canvas && 'fontWeight' in selectedObject) {
             selectedObject.set('fontWeight', newWeight);
             canvas.requestRenderAll();
        }
    };

    // Helper to generate star points (Duplicate from Toolbar, ideally moved to utils)
    const getStarPoints = (numPoints: number, innerRadius: number, outerRadius: number) => {
        const points = [];
        const angleStep = Math.PI / numPoints;
        for (let i = 0; i < 2 * numPoints; i++) {
            const r = (i % 2 === 0) ? outerRadius : innerRadius;
            const a = i * angleStep - Math.PI / 2;
            points.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
        }
        return points;
    };

    const updateStarPoints = (newPoints: number) => {
        setStarPoints(newPoints);
        if (selectedObject && 'isStar' in selectedObject && (selectedObject as StarPolygon).isStar && canvas) {
            const starObject = selectedObject as StarPolygon;
            starObject.set({ starPoints: newPoints } as Partial<StarPolygon>);
            const points = getStarPoints(
                newPoints, 
                (starObject.width! / 2) * starInnerRadius, 
                starObject.width! / 2 
            );
            // Fabric polygon points update is tricky, simpler to replace or force update
            // Updating 'points' property directly doesn't usually trigger recalc of dimensions perfectly in v5/6
            // But let's try setting it.
            starObject.set({ points: points });
            canvas.requestRenderAll();
        }
    }

    const updateStarInnerRadius = (newRadiusRatio: number) => {
        setStarInnerRadius(newRadiusRatio);
        if (selectedObject && 'isStar' in selectedObject && (selectedObject as StarPolygon).isStar && canvas) {
            const starObject = selectedObject as StarPolygon;
            starObject.set({ starInnerRadius: newRadiusRatio } as Partial<StarPolygon>);
            const points = getStarPoints(
                starPoints, 
                (starObject.width! / 2) * newRadiusRatio, 
                starObject.width! / 2 
            );
             starObject.set({ points: points });
             canvas.requestRenderAll();
        }
    }

    const deleteLayer = (obj: fabric.Object) => {
        if (!canvas) return;
        canvas.remove(obj);
        canvas.requestRenderAll();
        // updates handled by event listener
    };

    const selectLayer = (obj: fabric.Object) => {
        if (!canvas) return;
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
    };

    // Layer Management
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id && canvas) {
            setObjects((items) => {
                 const oldIndex = items.findIndex((item) => (item as any).id === active.id);
                 const newIndex = items.findIndex((item) => (item as any).id === over?.id);
                 
                 // UI Array Logic (Reversed)
                 const newItems = arrayMove(items, oldIndex, newIndex);

                 // Fabric Logic (Standard order)
                 // items = [Top, ..., Bottom]
                 // oldIndex in Items -> Fabric Index = Length - 1 - oldIndex
                 
                 // Wait, simpler way:
                 // The item currently at oldIndex (Top-based) needs to go to newIndex (Top-based).
                 // In Fabric, this means moving object FROM (Len - 1 - oldIndex) TO (Len - 1 - newIndex).
                 
                 const obj = items[oldIndex];
                 const targetFabricIndex = items.length - 1 - newIndex;
                 
                 canvas.moveObjectTo(obj, targetFabricIndex);
                 canvas.requestRenderAll();

                 return newItems;
            });
        }
    };

    // If Layers tool is active
    if (activeTool === 'layers') {
        return (
            <div className="flex flex-col h-full bg-card">
                 <div className="p-4 border-b border-border/50 bg-secondary/10 flex justify-between items-center">
                    <h2 className="font-semibold text-sm tracking-tight text-foreground/90 uppercase flex items-center gap-2">
                        <Layers size={14} /> Layers
                    </h2>
                    <span className="text-xs text-muted-foreground">{objects.length} elements</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    <DndContext 
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                         <SortableContext 
                            items={objects.map(obj => (obj as any).id)}
                            strategy={verticalListSortingStrategy}
                         >
                            {objects.map((obj, index) => (
                                 <SortableLayerItem 
                                    key={(obj as any).id}
                                    obj={obj}
                                    index={index}
                                    total={objects.length}
                                    selectedObject={selectedObject}
                                    selectLayer={selectLayer}
                                    deleteLayer={deleteLayer}
                                 />
                            ))}
                         </SortableContext>
                    </DndContext>
                    
                    {objects.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                            <Layers size={32} className="mb-2 opacity-20" />
                            <p className="text-sm">No layers</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    useEffect(() => {
        if (canvas) {
            // Read Logical Width (Zoom-independent)
            const zoom = canvas.getZoom();
            setCanvasWidth((canvas.width || 1080) / zoom);
            setCanvasHeight((canvas.height || 1080) / zoom);
            setCanvasColor(canvas.backgroundColor as string || '#ffffff');
        }
    }, [canvas]);

    const updateCanvasSize = (w: number, h: number) => {
        if(canvas) {
            const zoom = canvas.getZoom();
            // Set Physical Dimensions = Logical w * Zoom
            canvas.setDimensions({ width: w * zoom, height: h * zoom });
            setCanvasWidth(w);
            setCanvasHeight(h);
            canvas.requestRenderAll();
        }
    };

    const updateCanvasColor = (c: string) => {
        if(canvas) {
            canvas.backgroundColor = c;
            setCanvasColor(c);
            canvas.requestRenderAll();
        }
    }

    const presetSizes = [
        { name: 'Square (IG)', w: 1080, h: 1080, icon: Square },
        { name: 'Story (IG)', w: 1080, h: 1920, icon: Smartphone },
        { name: 'Landscape', w: 1920, h: 1080, icon: Monitor },
        { name: 'Portrait', w: 1080, h: 1350, icon: ImageIcon },
        { name: 'Thumbnail', w: 1280, h: 720, icon: Monitor },
    ];

    if (!selectedObject) {
        // Show Canvas Settings
        return (
             <div className="flex flex-col h-full bg-card">
                 <div className="p-4 border-b border-border/50 bg-secondary/10">
                    <h2 className="font-semibold text-sm tracking-tight text-foreground/90 uppercase flex items-center gap-2">
                        <Settings size={14} /> Canvas Settings
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Size Presets */}
                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Presets</label>
                        <div className="grid grid-cols-2 gap-2">
                            {presetSizes.map(preset => (
                                <button
                                    key={preset.name}
                                    onClick={() => updateCanvasSize(preset.w, preset.h)}
                                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-lg border border-border/50 bg-secondary/20 hover:bg-secondary hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground"
                                >
                                    <preset.icon size={20} className="opacity-70" />
                                    <span className="text-xs font-medium">{preset.name}</span>
                                    <span className="text-[10px] opacity-50">{preset.w} x {preset.h}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Custom Size */}
                    <div className="space-y-3">
                         <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dimensions</label>
                         <div className="grid grid-cols-2 gap-3">
                             <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Width</label>
                                <input 
                                    type="number" 
                                    value={canvasWidth}
                                    onChange={(e) => updateCanvasSize(parseInt(e.target.value) || 0, canvasHeight)}
                                    className="w-full bg-secondary/50 border border-border rounded-md px-2 py-1.5 text-sm"
                                />
                             </div>
                             <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Height</label>
                                <input 
                                    type="number" 
                                    value={canvasHeight}
                                    onChange={(e) => updateCanvasSize(canvasWidth, parseInt(e.target.value) || 0)}
                                    className="w-full bg-secondary/50 border border-border rounded-md px-2 py-1.5 text-sm"
                                />
                             </div>
                         </div>
                    </div>

                    {/* Background Color */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                             <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Background</label>
                             <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{canvasColor}</span>
                        </div>
                        <div className="relative w-full flex items-center gap-3 bg-secondary/30 p-2 rounded-lg border border-border/50">
                             <div 
                                className="w-8 h-8 rounded-full shadow-sm ring-1 ring-border/20"
                                style={{ backgroundColor: canvasColor }}
                             ></div>
                             <input 
                                type="color" 
                                value={canvasColor} 
                                onChange={(e) => updateCanvasColor(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                             />
                             <span className="text-sm text-foreground font-medium flex-1">Pick a color</span>
                        </div>
                    </div>

                </div>
             </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-card">
            {/* Header */}
            <div className="p-4 border-b border-border/50 bg-secondary/10">
                <h2 className="font-semibold text-sm tracking-tight text-foreground/90 uppercase">
                    {selectedObject.type} Properties
                </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-8">
                {/* Color Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                         <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fill Color</label>
                         <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{color}</span>
                    </div>
                    <div className="flex items-center gap-3 bg-secondary/30 p-2 rounded-lg border border-border/50">
                        <div className="relative w-full flex items-center gap-3">
                             <div 
                                className="w-8 h-8 rounded-full shadow-sm ring-1 ring-border/20"
                                style={{ backgroundColor: color }}
                             ></div>
                             <input 
                                type="color" 
                                value={color} 
                                onChange={(e) => updateColor(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                             />
                             <span className="text-sm text-foreground font-medium flex-1">Pick a color</span>
                        </div>
                    </div>
                </div>

                {/* Opacity Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opacity</label>
                        <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{Math.round(opacity * 100)}%</span>
                    </div>
                    <div className="relative h-6 flex items-center">
                         <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.01" 
                            value={opacity} 
                            onChange={(e) => updateOpacity(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                </div>
                
                {(selectedObject.type === 'text' || selectedObject.type === 'i-text') && (
                     <div className="pt-6 border-t border-border/50 space-y-4">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Typography</label>
                        <div className="grid grid-cols-2 gap-2">
                             <select 
                                value={fontFamily}
                                onChange={(e) => updateFontFamily(e.target.value)}
                                className="w-full bg-secondary btn-ghost text-sm p-2 rounded-md border border-border/50 focus:border-primary outline-none"
                             >
                                <option value="Arial">Arial</option>
                                <option value="Helvetica">Helvetica</option>
                                <option value="Times New Roman">Times New Roman</option>
                                <option value="Courier New">Courier New</option>
                                <option value="Verdana">Verdana</option>
                                <option value="Georgia">Georgia</option>
                                <option value="Tahoma">Tahoma</option>
                                <option value="Trebuchet MS">Trebuchet MS</option>
                            </select>
                            <select 
                                value={fontWeight}
                                onChange={(e) => updateFontWeight(e.target.value)}
                                className="w-full bg-secondary btn-ghost text-sm p-2 rounded-md border border-border/50 focus:border-primary outline-none"
                            >
                                <option value="normal">Regular</option>
                                <option value="bold">Bold</option>
                                <option value="300">Light</option>
                                <option value="600">Semi Bold</option>
                                <option value="800">Extra Bold</option>
                            </select>
                        </div>
                     </div>
                )}

                {'isStar' in selectedObject && (selectedObject as StarPolygon).isStar && (
                    <div className="pt-6 border-t border-border/50 space-y-4">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Star Settings</label>
                        
                        <div className="space-y-3">
                             <div className="flex justify-between items-center">
                                <label className="text-xs font-medium text-foreground">Points</label>
                                <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{starPoints}</span>
                            </div>
                            <input 
                                type="range" 
                                min="3" 
                                max="20" 
                                step="1" 
                                value={starPoints} 
                                onChange={(e) => updateStarPoints(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        <div className="space-y-3">
                             <div className="flex justify-between items-center">
                                <label className="text-xs font-medium text-foreground">Depth</label>
                                <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{Math.round(starInnerRadius * 100)}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0.1" 
                                max="0.9" 
                                step="0.05" 
                                value={starInnerRadius} 
                                onChange={(e) => updateStarInnerRadius(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>
                )}
            </div>
            
            {/* Footer Actions */}
            <div className="p-4 border-t border-border/50 bg-secondary/5">
                <button className="w-full py-2 bg-destructive/10 text-destructive text-sm font-medium rounded-md hover:bg-destructive/20 transition-colors">
                    Delete Element
                </button>
            </div>
        </div>
    );
}
