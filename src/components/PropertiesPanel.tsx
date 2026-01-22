'use client';
import { useEffect, useState, useRef } from 'react';
import * as fabric from 'fabric';
import { StarPolygon } from '@/types';
import { ArrowUp, ArrowDown, Trash2, Layers, GripVertical, Settings, Smartphone, Monitor, Square, Image as ImageIcon, Box, Eye, EyeOff, ArrowLeftRight } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * PropertiesPanel
 * Right sidebar for managing object properties, layers, and canvas settings.
 * Includes Layer Tagging (Double-click grip) and Gradient/Solid Fill controls.
 */
interface PropertiesPanelProps {
    canvas: fabric.Canvas | null;
    activeTool?: string;
    onMake3D?: (imageUrl: string) => void;
}

// Sortable Layer Item Component
function SortableLayerItem({ obj, index, selectedObject, selectLayer, toggleVisibility, deleteLayer, total }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: (obj as any).id || (obj as any).cacheKey || `obj-${index}` });

    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(obj.name || (obj.type === 'i-text' ? (obj as fabric.IText).text : (obj.type || 'Object')));
    // Use fill as color, defaulting to transparent or black if complex
    const [layerColor, setLayerColor] = useState(() => {
         if (typeof obj.fill === 'string') return obj.fill;
         return '#000000';
    });
    // Layer Tag Color (Grab Area)
    const [tagColor, setTagColor] = useState(obj.layerTagColor || 'transparent');
    const tagColorInputRef = useRef<HTMLInputElement>(null);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 999 : 'auto',
        position: 'relative' as const,
    };
    
    // Check internal visible state
    const isVisible = obj.visible !== false; 

    const handleNameSave = () => {
        setIsEditing(false);
        obj.set('name', name);
    };

    const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        setLayerColor(newColor);
        obj.set('fill', newColor);
        obj.canvas?.requestRenderAll();
    };

    const handleTagColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        setTagColor(newColor);
        obj.set('layerTagColor', newColor);
        // We don't need re-render canvas for this usually, but to be safe if we serialize later
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            onClick={() => selectLayer(obj)}
            className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all group mb-1 ${
                selectedObject === obj 
                ? 'bg-primary/10 border-primary/30 shadow-sm' 
                : 'bg-card border-border/50 hover:bg-secondary/50'
            } ${isDragging ? 'opacity-50 shadow-xl ring-2 ring-primary/20' : ''}`}
        >
            <div className="flex items-center gap-3 overflow-hidden flex-1">
                <div 
                    {...attributes} 
                    {...listeners} 
                    className="cursor-move text-muted-foreground/50 hover:text-foreground p-1 hover:bg-secondary rounded touch-none relative"
                    style={{ backgroundColor: tagColor !== 'transparent' ? tagColor : undefined, color: tagColor !== 'transparent' ? '#fff' : undefined }}
                    onMouseDown={(e) => isEditing && e.stopPropagation()}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        tagColorInputRef.current?.click();
                    }}
                    title="Double-click to set layer tag color"
                >
                    <GripVertical size={14} style={{ mixBlendMode: tagColor !== 'transparent' ? 'difference' : 'normal' }} />
                    <input 
                        ref={tagColorInputRef}
                        type="color"
                        className="sr-only"
                        value={tagColor === 'transparent' ? '#808080' : tagColor}
                        onChange={handleTagColorChange}
                    />
                </div>
                
                <div className="relative w-8 h-8 rounded bg-background border flex items-center justify-center text-muted-foreground shrink-0 select-none overflow-hidden group/color">
                    {/* Background Color Indicator */}
                    <div 
                        className="absolute inset-0 opacity-20" 
                        style={{ backgroundColor: typeof obj.fill === 'string' ? obj.fill : undefined }} 
                    />
                    
                    {/* Icon */}
                    {obj.type === 'rect' && <div className="w-4 h-4 bg-foreground rounded-sm opacity-50" />}
                    {obj.type === 'circle' && <div className="w-4 h-4 bg-foreground rounded-full opacity-50" />}
                    {obj.type === 'triangle' && <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-foreground opacity-50" />}
                    {(obj.type === 'text' || obj.type === 'i-text') && <span className="text-xs font-serif font-bold">T</span>}
                    {obj.type === 'image' && <ImageIcon size={14} />}
                    {'isStar' in obj && <div className="text-[8px]">★</div>}

                     {/* Color Input Overlay (Not for images) */}
                     {obj.type !== 'image' && (
                        <input 
                            type="color" 
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            value={layerColor}
                            onChange={handleColorChange}
                            onClick={(e) => e.stopPropagation()}
                            title="Change Color"
                        />
                    )}
                </div>

                <div className="flex flex-col min-w-0 select-none flex-1">
                    {isEditing ? (
                        <input 
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={handleNameSave}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleNameSave();
                                if (e.key === 'Escape') {
                                    setIsEditing(false);
                                    setName(obj.name || (obj.type === 'i-text' ? (obj as fabric.IText).text : (obj.type || 'Object')));
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm font-medium bg-background border rounded px-1 h-5 min-w-0 outline-none focus:ring-1 focus:ring-primary"
                        />
                    ) : (
                        <span 
                            className="text-sm font-medium truncate"
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setIsEditing(true);
                            }}
                            title="Double click to rename"
                        >
                            {obj.name || (obj.type === 'i-text' ? (obj as fabric.IText).text : (obj.type || 'Object'))}
                        </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">Layer {total - index}</span>
                </div>
            </div>
            
            <div className={`flex items-center gap-1 ${selectedObject === obj ? 'opacity-100' : 'opacity-0 sm:group-hover:opacity-100'} transition-opacity ml-2`}>
                <button
                    onClick={(e) => { e.stopPropagation(); toggleVisibility(obj); }}
                    className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground"
                    title={isVisible ? "Hide" : "Show"}
                >
                    {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
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

export default function PropertiesPanel({ canvas, activeTool, onMake3D }: PropertiesPanelProps) {
    const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
    const [objects, setObjects] = useState<fabric.Object[]>([]);
    
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const [color, setColor] = useState('#000000');
    // Gradient State
    const [isGradient, setIsGradient] = useState(false);
    const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
    const [gradientStart, setGradientStart] = useState('#000000');
    const [gradientEnd, setGradientEnd] = useState('#ffffff');
    const [gradientAngle, setGradientAngle] = useState(0);
    const [gradientTransition, setGradientTransition] = useState(1); // Default 1 (full spread)

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

    // Advanced Effects State
    const [curveStrength, setCurveStrength] = useState(0);
    const [skewX, setSkewX] = useState(0);
    const [skewY, setSkewY] = useState(0);
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [strokeWidth, setStrokeWidth] = useState(0);
    const [shadowEnabled, setShadowEnabled] = useState(false);
    const [shadowColor, setShadowColor] = useState('#000000');
    const [shadowBlur, setShadowBlur] = useState(10);
    const [shadowOffsetX, setShadowOffsetX] = useState(5);
    const [shadowOffsetY, setShadowOffsetY] = useState(5);

    useEffect(() => {
        if (canvas) {
            // Read Logical Width (Zoom-independent)
            const zoom = canvas.getZoom();
            setCanvasWidth((canvas.width || 1080) / zoom);
            setCanvasHeight((canvas.height || 1080) / zoom);
            setCanvasColor(canvas.backgroundColor as string || '#ffffff');
        }
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;

        const updateObjects = () => {
            const objs = canvas.getObjects();
            objs.forEach((obj, i) => {
                if (!(obj as any).id) {
                    (obj as any).id = `obj-${Date.now()}-${i}`;
                }
            });
            setObjects([...objs.reverse()]); // Reverse to show top layer first
        };
        
        // Initial load
        updateObjects();

        const handleSelection = (e: { selected?: fabric.Object[] }) => {
            const selection = e.selected ? e.selected[0] : null;
            setSelectedObject(selection || null);
            
            if (selection) {
                // Check Fill Type
                const fill = selection.get('fill');
                
                if (typeof fill === 'string') {
                    setIsGradient(false);
                    setColor(fill);
                } else if (fill && typeof fill === 'object' && (fill as any).type === 'linear') {
                    setIsGradient(true);
                    // Extract colors (approximate for UI)
                    const stops = (fill as any).colorStops || [];
                    if (stops.length >= 2) {
                        setGradientStart(stops[0].color);
                        setGradientEnd(stops[stops.length - 1].color);
                    }
                    
                    // Estimate Angle from coords
                    const c = (fill as any).coords || { x1: 0, y1: 0, x2: 1, y2: 0 };
                    const dx = c.x2 - c.x1;
                    const dy = c.y2 - c.y1;
                    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    if (angle < 0) angle += 360;
                    setGradientAngle(Math.round(angle));

                    setColor('#000000'); // Dummy for picker
                } else {
                     setIsGradient(false);
                     setColor('#000000');
                }

                setOpacity(selection.get('opacity') || 1);
                
                // Read Effects
                // Check if path exists (Curved Text)
                // Fabric stores 'path' object on text
                const path = selection.get('path') as fabric.Path;
                if (path && (selection as any).curveStrength !== undefined) {
                     setCurveStrength((selection as any).curveStrength);
                } else {
                     setCurveStrength(0);
                }

                setSkewX(selection.get('skewX') || 0);
                setSkewY(selection.get('skewY') || 0);
                setStrokeColor(selection.get('stroke') || '#000000');
                setStrokeWidth(selection.get('strokeWidth') || 0);
                
                const shadow = selection.get('shadow') as fabric.Shadow;
                if (shadow) {
                    setShadowEnabled(true);
                    setShadowColor(shadow.color || '#000000');
                    setShadowBlur(shadow.blur || 10);
                    setShadowOffsetX(shadow.offsetX || 5);
                    setShadowOffsetY(shadow.offsetY || 5);
                } else {
                    setShadowEnabled(false);
                    // Reset defaults for clean UI if re-enabled
                    setShadowBlur(10);
                    setShadowOffsetX(5);
                    setShadowOffsetY(5);
                }

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
        setIsGradient(false);
        if (selectedObject && canvas) {
            selectedObject.set('fill', newColor);
            canvas.requestRenderAll();
        }
    };

    const updateGradientStops = (start: string, end: string, angle: number = gradientAngle, type: 'linear' | 'radial' = gradientType, transition: number = gradientTransition) => {
         // Update state
         setGradientStart(start);
         setGradientEnd(end);
         setGradientAngle(angle);
         setGradientType(type);
         setGradientTransition(transition);

         if (selectedObject && canvas) {
             // Calculate Coords based on Angle
             let coords: any = { x1: 0, y1: 0, x2: 1, y2: 0 };
             
             if (type === 'linear') {
                const rad = angle * (Math.PI / 180);
                const len = 1; 
                coords = {
                    x1: 0.5 - (Math.cos(rad) * len)/2,
                    y1: 0.5 - (Math.sin(rad) * len)/2,
                    x2: 0.5 + (Math.cos(rad) * len)/2,
                    y2: 0.5 + (Math.sin(rad) * len)/2
                };
             } else {
                 // Radial
                 coords = {
                     x1: 0.5, y1: 0.5,
                     x2: 0.5, y2: 0.5,
                     r1: 0,
                     r2: 0.5 // Fit to box half-width (radius)
                 };
             }

             // Calculate Transition offsets
             // Transition = 1 (Smooth, offsets 0 and 1)
             // Transition = 0 (Hard, offsets 0.5 and 0.5)
             const halfSpread = transition / 2;
             const offset1 = 0.5 - halfSpread;
             const offset2 = 0.5 + halfSpread;

             const gradient = new fabric.Gradient({
                type: type,
                gradientUnits: 'percentage',
                coords: coords,
                colorStops: [
                    { offset: offset1, color: start },
                    { offset: offset2, color: end }
                ]
             });
             
             setIsGradient(true);
             selectedObject.set('fill', gradient);
             canvas.requestRenderAll();
         }
    }

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

    // --- EFFECTS HANDLERS ---
    
    // Create or update text path for curvature
    const updateTextCurve = (strength: number) => {
         // Strength: -100 to 100
         if (!selectedObject || (selectedObject.type !== 'text' && selectedObject.type !== 'i-text')) return;
         
         const textObj = selectedObject as fabric.IText;
         setCurveStrength(strength);
         // Store strength for UI consistency
         (textObj as any).curveStrength = strength;

         if (strength === 0) {
             textObj.set('path', null);
         } else {
             // Calculate Path
             // A simple Quadratic curve
             const len = textObj.width || 200;
             const height = (strength / 100) * len * 0.5; // Height of arch
             
             // In SVG path format: M startX startY Q controlX controlY endX endY
             // Start at 0,0 relative to path
             // End at len, 0
             // Control at len/2, height*2 (approx)
             const pathData = `M 0 0 Q ${len/2} ${height * -1.5} ${len} 0`;
             
             const path = new fabric.Path(pathData);
             path.set({ 
                 visible: false,
                 // Align text to path center usually looks best for arches
                 left: -len/2,
                 top: 0
             });
             
             textObj.set('path', path);
             // Center align often needed for symmetry
             // textObj.set('textAlign', 'center'); 
         }
         
         textObj.canvas?.requestRenderAll();
    };

    const updateSkew = (axis: 'x'|'y', val: number) => {
         if (!selectedObject) return;
         if (axis === 'x') {
             setSkewX(val);
             selectedObject.set('skewX', val);
         } else {
             setSkewY(val);
             selectedObject.set('skewY', val);
         }
         selectedObject.canvas?.requestRenderAll();
    };

    const updateStroke = (newWidth: number) => {
         if (!selectedObject) return;
         setStrokeWidth(newWidth);
         selectedObject.set({
             stroke: strokeColor,
             strokeWidth: newWidth
         });
         selectedObject.canvas?.requestRenderAll();
    };

    const updateStrokeColor = (newColor: string) => {
         if (!selectedObject) return;
         setStrokeColor(newColor);
         if (strokeWidth > 0) {
            selectedObject.set('stroke', newColor);
            selectedObject.canvas?.requestRenderAll();
         } else {
             // If width is 0, user probably wants to see it, so set width to 1
             setStrokeWidth(1);
             selectedObject.set({ stroke: newColor, strokeWidth: 1 });
             selectedObject.canvas?.requestRenderAll();
         }
    };

    const toggleShadow = (enable: boolean) => {
        if (!selectedObject) return;
        setShadowEnabled(enable);
        
        if (enable) {
             const shadow = new fabric.Shadow({
                color: shadowColor,
                blur: shadowBlur,
                offsetX: shadowOffsetX,
                offsetY: shadowOffsetY
            });
            selectedObject.set('shadow', shadow);
        } else {
            selectedObject.set('shadow', null);
        }
        selectedObject.canvas?.requestRenderAll();
    };

    const updateShadowProp = (prop: string, value: any) => {
        if (!selectedObject) return;
        
        let shadow = selectedObject.shadow as fabric.Shadow;
        
        if (!shadow) {
            // Create if missing (e.g. user drags slider before checking box)
             setShadowEnabled(true);
             shadow = new fabric.Shadow({
                color: shadowColor,
                blur: shadowBlur,
                offsetX: shadowOffsetX,
                offsetY: shadowOffsetY
            });
            selectedObject.set('shadow', shadow);
        }

        if (prop === 'color') { 
            setShadowColor(value);
            shadow.color = value;
        }
        if (prop === 'blur') {
            setShadowBlur(value);
            shadow.blur = value;
        }
        if (prop === 'offsetX') {
            setShadowOffsetX(value);
            shadow.offsetX = value;
        }
        if (prop === 'offsetY') {
             setShadowOffsetY(value);
             shadow.offsetY = value;
        }
        
        // Fabric doesn't always auto-detect deep property change on shadow
        // So we reset it or mark dirty
        selectedObject.set('dirty', true);
        selectedObject.canvas?.requestRenderAll();
    };

    const deleteLayer = (obj: fabric.Object) => {
        if (!canvas) return;
        canvas.remove(obj);
        canvas.requestRenderAll();
        // updates handled by event listener
    };

    const toggleVisibility = (obj: fabric.Object) => {
        if (!canvas) return;
        // Toggle visible property, defaulting to true if undefined
        obj.set('visible', !(obj.visible ?? true));
        // Deselect if hiding current selection
        if (!obj.visible && canvas.getActiveObject() === obj) {
            canvas.discardActiveObject();
        }
        canvas.requestRenderAll();
        
        // Force update local state to reflect visibility change in UI
        setObjects([...canvas.getObjects().reverse()]); 
    };

    const selectLayer = (obj: fabric.Object) => {
        if (!canvas) return;
        // If hidden, make visible when selecting via layer panel? 
        // Or just allow selecting hidden objects? Usually better to keep hidden.
        // If user wants to see it, they should click eye. 
        // BUT, Fabric doesn't allow selecting invisible objects by click. 
        // We can manually set active object though.
        
        if (!obj.visible) {
             // Optional: Auto-unhide on select?
             // obj.set('visible', true);
        }
        
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
                                    deleteLayer={deleteLayer}                                    toggleVisibility={toggleVisibility}                                 />
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
                {/* Fill / Gradient Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                         <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fill Style</label>
                         <div className="flex gap-1 text-[10px] bg-secondary/50 p-1 rounded">
                             <button 
                                onClick={() => updateColor(gradientStart)} 
                                className={`px-2 py-0.5 rounded transition-all ${!isGradient ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                            >
                                Solid
                             </button>
                             <button 
                                onClick={() => updateGradientStops(gradientStart, gradientEnd)}
                                className={`px-2 py-0.5 rounded transition-all ${isGradient ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                            >
                                Gradient
                             </button>
                         </div>
                    </div>
                    
                    {!isGradient ? (
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
                    ) : (
                        <div className="space-y-4 bg-secondary/20 p-3 rounded-lg border border-border/50">
                             
                             {/* Gradient Type */}
                             <div className="flex gap-1 bg-secondary/30 p-1 rounded-md mb-2">
                                <button
                                    onClick={() => updateGradientStops(gradientStart, gradientEnd, gradientAngle, 'linear', gradientTransition)}
                                    className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] uppercase font-medium rounded transition-all ${gradientType === 'linear' ? 'bg-background shadow text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                                >
                                    Linear
                                </button>
                                <button
                                    onClick={() => updateGradientStops(gradientStart, gradientEnd, gradientAngle, 'radial', gradientTransition)}
                                    className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] uppercase font-medium rounded transition-all ${gradientType === 'radial' ? 'bg-background shadow text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                                >
                                    Radial
                                </button>
                             </div>

                             {/* Gradient Preview Bar */}
                             <div 
                                className="h-6 rounded-md w-full shadow-inner ring-1 ring-border/20 transition-all"
                                style={{ 
                                    background: gradientType === 'linear' 
                                        ? `linear-gradient(${gradientAngle + 90}deg, ${gradientStart}, ${gradientEnd})`
                                        : `radial-gradient(circle, ${gradientStart}, ${gradientEnd})`
                                }}
                             />
                             
                             {/* Colors */}
                             <div className="flex items-center gap-3">
                                 <div className="space-y-1 flex-1">
                                    <label className="text-[10px] text-muted-foreground uppercase">Start</label>
                                    <div className="relative h-8 rounded border border-border flex items-center gap-2 px-2 bg-background hover:bg-secondary/50">
                                        <div className="w-5 h-5 rounded-full border shadow-sm" style={{ backgroundColor: gradientStart }} />
                                        <input 
                                            type="color" 
                                            value={gradientStart}
                                            onChange={(e) => updateGradientStops(e.target.value, gradientEnd, gradientAngle, gradientType, gradientTransition)}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                                        />
                                        <span className="text-xs font-mono">{gradientStart}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => updateGradientStops(gradientEnd, gradientStart, gradientAngle, gradientType, gradientTransition)}
                                    className="mt-4 p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                    title="Swap Colors"
                                >
                                    <ArrowLeftRight size={14} />
                                </button>
                                <div className="space-y-1 flex-1">
                                    <label className="text-[10px] text-muted-foreground uppercase">End</label>
                                    <div className="relative h-8 rounded border border-border flex items-center gap-2 px-2 bg-background hover:bg-secondary/50">
                                        <div className="w-5 h-5 rounded-full border shadow-sm" style={{ backgroundColor: gradientEnd }} />
                                        <input 
                                            type="color" 
                                            value={gradientEnd}
                                            onChange={(e) => updateGradientStops(gradientStart, e.target.value, gradientAngle, gradientType, gradientTransition)}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                                        />
                                        <span className="text-xs font-mono">{gradientEnd}</span>
                                    </div>
                                </div>
                             </div>

                             {/* Angle Control */}
                             {gradientType === 'linear' && (
                                <div className="space-y-2 pt-2 border-t border-border/30">
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                        <span>Angle</span>
                                        <span>{gradientAngle}°</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="360" 
                                        value={gradientAngle}
                                        onChange={(e) => updateGradientStops(gradientStart, gradientEnd, parseInt(e.target.value), gradientType, gradientTransition)}
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                             )}

                             {/* Transition / Spread Control */}
                             <div className="space-y-2 pt-2 border-t border-border/30">
                                <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                    <span>Transition Area</span>
                                    <span>{Math.round(gradientTransition * 100)}%</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.01" 
                                    value={gradientTransition}
                                    onChange={(e) => updateGradientStops(gradientStart, gradientEnd, gradientAngle, gradientType, parseFloat(e.target.value))}
                                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                />
                             </div>
                        </div>
                    )}
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

                {/* Effects Section (Stroke, Shadow, Skew) */}
                <div className="pt-6 border-t border-border/50 space-y-4">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Effects</label>
                    
                    {/* Stroke */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                            <span>Stroke</span>
                            <div className="flex items-center gap-2">
                                <input type="number" min="0" max="20" value={strokeWidth} onChange={(e) => updateStroke(parseFloat(e.target.value))} className="w-8 h-4 bg-transparent text-right outline-none text-xs" />
                                <span>px</span>
                            </div>
                        </div>
                        <div className="flex gap-2 items-center">
                             <input 
                                type="range" 
                                min="0" 
                                max="20" 
                                step="0.5" 
                                value={strokeWidth}
                                onChange={(e) => updateStroke(parseFloat(e.target.value))}
                                className="flex-1 h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="w-6 h-6 rounded-full border border-border shadow-sm relative overflow-hidden shrink-0">
                                <div className="absolute inset-0" style={{ backgroundColor: strokeColor }} />
                                <input 
                                    type="color" 
                                    value={strokeColor} 
                                    onChange={(e) => updateStrokeColor(e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Skew */}
                     <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                             <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>Skew X</span>
                                <span>{Math.round(skewX)}°</span>
                             </div>
                             <input 
                                type="range" 
                                min="-45" 
                                max="45" 
                                value={skewX}
                                onChange={(e) => updateSkew('x', parseFloat(e.target.value))}
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div className="space-y-1">
                             <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>Skew Y</span>
                                <span>{Math.round(skewY)}°</span>
                             </div>
                             <input 
                                type="range" 
                                min="-45" 
                                max="45" 
                                value={skewY}
                                onChange={(e) => updateSkew('y', parseFloat(e.target.value))}
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Shadow */}
                    <div className="space-y-3 pt-2">
                         <div className="flex items-center justify-between">
                             <span className="text-xs font-medium">Drop Shadow</span>
                             <div className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${shadowEnabled ? 'bg-primary' : 'bg-secondary'}`} onClick={() => toggleShadow(!shadowEnabled)}>
                                 <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${shadowEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                             </div>
                         </div>
                         
                         {shadowEnabled && (
                             <div className="space-y-3 p-3 bg-secondary/10 rounded-lg border border-border/30 animate-in fade-in slide-in-from-top-2">
                                 {/* Color & Blur */}
                                 <div className="flex gap-3">
                                     <div className="w-8 h-8 rounded-md border border-border shadow-sm relative overflow-hidden shrink-0">
                                        <div className="absolute inset-0" style={{ backgroundColor: shadowColor }} />
                                        <input 
                                            type="color" 
                                            value={shadowColor} 
                                            onChange={(e) => updateShadowProp('color', e.target.value)}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                            <span>Blur</span>
                                            <span>{shadowBlur}px</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="50" 
                                            value={shadowBlur}
                                            onChange={(e) => updateShadowProp('blur', parseFloat(e.target.value))}
                                            className="w-full h-1 bg-secondary/50 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                 </div>
                                 
                                 {/* Offset */}
                                 <div className="grid grid-cols-2 gap-3">
                                     <div className="space-y-1">
                                         <label className="text-[10px] text-muted-foreground uppercase">Offset X</label>
                                         <input 
                                            type="number" 
                                            value={shadowOffsetX}
                                            onChange={(e) => updateShadowProp('offsetX', parseFloat(e.target.value))}
                                            className="w-full bg-secondary btn-ghost text-xs p-1 px-2 rounded-md border border-border/50 outline-none"
                                         />
                                     </div>
                                     <div className="space-y-1">
                                         <label className="text-[10px] text-muted-foreground uppercase">Offset Y</label>
                                         <input 
                                            type="number" 
                                            value={shadowOffsetY}
                                            onChange={(e) => updateShadowProp('offsetY', parseFloat(e.target.value))}
                                            className="w-full bg-secondary btn-ghost text-xs p-1 px-2 rounded-md border border-border/50 outline-none"
                                         />
                                     </div>
                                 </div>
                             </div>
                         )}
                    </div>
                </div>

                {selectedObject.type === 'image' && onMake3D && (
                    <div className="pt-6 border-t border-border/50 space-y-4">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">AI Actions</label>
                        <button
                            onClick={() => {
                                const imgObj = selectedObject as fabric.Image;
                                // Use toDataURL to get the image content, enabling it to be sent to API
                                const dataUrl = imgObj.toDataURL();
                                onMake3D(dataUrl);
                            }}
                            className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 transform active:scale-95"
                        >
                            <Box size={16} />
                            <span>Make 3D</span>
                        </button>
                    </div>
                )}
                
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
                        
                         <div className="space-y-2 pt-2 border-t border-border/30">
                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>Curvature (Arch)</span>
                                <span>{curveStrength}</span>
                             </div>
                             <input 
                                type="range" 
                                min="-100" 
                                max="100" 
                                value={curveStrength}
                                onChange={(e) => updateTextCurve(parseInt(e.target.value))}
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
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
