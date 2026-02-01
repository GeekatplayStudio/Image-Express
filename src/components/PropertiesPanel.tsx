'use client';
import { useCallback, useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { 
    ExtendedFabricObject, 
    AdjustmentLayerType, 
    AdjustmentLayerSettings, 
    CurvesAdjustmentSettings, 
    LevelsAdjustmentSettings, 
    SaturationVibranceSettings, 
    HueSaturationSettings, 
    ExposureSettings, 
    FabricBaseFilter, 
} from '@/types';

// Extracted Components
import { LayersView } from './properties/LayersView';
import { SelectionProperties } from './properties/SelectionProperties';
import { PaintProperties } from './properties/PaintProperties';
import { CanvasSettingsPanel } from './properties/CanvasSettingsPanel';

// Utils & Libs
import { 
    ensureObjectId, 
    applyAlphaToColor, 
    normalizeColorValue, 
    parseColorWithAlpha,
    getGroupNames,
    getNextIndexedName,
    getAdjustmentLabel,
    getDefaultAdjustmentSettings
} from '@/lib/fabric-utils';
import { CurvesFilter } from '@/lib/fabric-filters';

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number; left: number; top: number };
    artboardRect?: fabric.Rect;
    centerArtboard?: () => void;
    hostContainer?: HTMLDivElement;
    workspaceBackground?: string;
    setWorkspaceBackground?: (color: string) => void;
    getWorkspaceBackground?: () => string;
};

interface PropertiesPanelProps {
    canvas: fabric.Canvas | null;
    activeTool?: string;
    onMake3D?: (imageUrl: string) => void;
    onLayerDblClick?: () => void;
    onPreviewMedia?: (payload: { type: 'video' | 'audio'; url: string }) => void;
}

export default function PropertiesPanel({ canvas, activeTool, onMake3D, onLayerDblClick, onPreviewMedia }: PropertiesPanelProps) {
    // Global Object State
    const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
    const [objects, setObjects] = useState<fabric.Object[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    // Canvas Settings State
    const [canvasWidth, setCanvasWidth] = useState(1080);
    const [canvasHeight, setCanvasHeight] = useState(1080);
    const [canvasColor, setCanvasColor] = useState('#ffffff');
    
    // Paint State - Delegated to PaintProperties component


    // Filter/Effect State
    const [blurValue, setBlurValue] = useState(0);
    const [brightnessValue, setBrightnessValue] = useState(0);
    const [contrastValue, setContrastValue] = useState(0);
    const [noiseValue, setNoiseValue] = useState(0);
    const [saturationValue, setSaturationValue] = useState(0);
    const [vibranceValue, setVibranceValue] = useState(0);
    const [pixelateValue, setPixelateValue] = useState(0);
    
    // Transform/Style State
    const [opacity, setOpacity] = useState(1);
    const [color, setColor] = useState('#000000');
    // Gradient State
    const [isGradient, setIsGradient] = useState(false);
    const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
    const [gradientStart, setGradientStart] = useState('#000000');
    const [gradientEnd, setGradientEnd] = useState('#ffffff');
    const [gradientAngle, setGradientAngle] = useState(0);
    
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [strokeWidth, setStrokeWidth] = useState(0);
    const [strokeOpacity, setStrokeOpacity] = useState(1);
    const [strokeInside, setStrokeInside] = useState(true);

    const [shadowEnabled, setShadowEnabled] = useState(false);
    const [shadowColor, setShadowColor] = useState('#000000');
    const [shadowBlur, setShadowBlur] = useState(10);
    const [shadowOffsetX, setShadowOffsetX] = useState(5);
    const [shadowOffsetY, setShadowOffsetY] = useState(5);
    const [shadowOpacity, setShadowOpacity] = useState(1);
    
    const [skewX, setSkewX] = useState(0);
    const [skewY, setSkewY] = useState(0);
    const [skewZ, setSkewZ] = useState(0);
    const [taperDirection, setTaperDirection] = useState(0);

    const [curveStrength, setCurveStrength] = useState(0);
    const [curveCenter, setCurveCenter] = useState(0);
    const [fontFamily, setFontFamily] = useState('Arial');
    const [fontWeight, setFontWeight] = useState('normal');

    const [adjustmentSettings, setAdjustmentSettings] = useState<AdjustmentLayerSettings | null>(null);

    // --- Paint Logic ---
    // Delegated to PaintProperties component


    // --- Canvas Sync Logic ---
    const syncCanvasMetrics = useCallback(() => {
        if (!canvas) return;
        const extendedCanvas = canvas as CanvasWithArtboard;
        if (extendedCanvas.artboard) {
            setCanvasWidth(Math.round(extendedCanvas.artboard.width));
            setCanvasHeight(Math.round(extendedCanvas.artboard.height));
        } else {
            const zoom = canvas.getZoom() || 1;
            setCanvasWidth(Math.round((canvas.width || 1080) / zoom));
            setCanvasHeight(Math.round((canvas.height || 1080) / zoom));
        }
        
        if (typeof canvas.backgroundColor === 'string') {
            setCanvasColor(normalizeColorValue(canvas.backgroundColor) || '#ffffff');
        }
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (canvas as any).on('artboard:resize', syncCanvasMetrics);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (canvas as any).on('workspace:color', syncCanvasMetrics);
        syncCanvasMetrics();
        return () => {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             (canvas as any).off('artboard:resize', syncCanvasMetrics);
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             (canvas as any).off('workspace:color', syncCanvasMetrics);
        };
    }, [canvas, syncCanvasMetrics]);


    // --- Layer & Selection Sync ---
    const updateObjects = useCallback(() => {
        if (!canvas) return;
        const objs = canvas.getObjects();
        objs.forEach(o => {
            ensureObjectId(o);
            if (o.type === 'group') (o as fabric.Group).getObjects().forEach(ensureObjectId);
        });
        setObjects([...objs].reverse());
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;
        
        const handleSelection = () => {
            const active = canvas.getActiveObjects() || [];
            if (active.length === 1) {
                const target = active[0] as ExtendedFabricObject;
                setSelectedObject(target);
                setAdjustmentSettings(target.adjustmentSettings || null);
                
                // Content Fill Check (Solid vs Gradient)
                const fill = target.fill;
                if (fill && typeof fill !== 'string' && (fill as fabric.Gradient<'linear'>).colorStops) {
                    setIsGradient(true);
                    const grad = fill as fabric.Gradient<'linear'>;
                    setGradientType(grad.type as 'linear' | 'radial');
                    const stops = grad.colorStops || [];
                    if (stops.length > 0) {
                        setGradientStart(stops[0].color);
                        setGradientEnd(stops[stops.length - 1].color);
                    }
                    // TODO: Angle inference is complex, default to 0 for now or stored prop
                    setGradientAngle(0); 
                } else {
                    setColor(typeof target.fill === 'string' ? target.fill : '#000000');
                    setIsGradient(false);
                }

                setOpacity(target.opacity || 1);
                
                const sColor = parseColorWithAlpha(typeof target.stroke === 'string' ? target.stroke : undefined);
                setStrokeColor(sColor.color || '#000000');
                setStrokeOpacity(sColor.alpha ?? 1);
                setStrokeWidth(target.strokeWidth || 0);
                setStrokeInside(target.paintFirst !== 'stroke');
                
                const shadow = target.shadow as fabric.Shadow;
                if (shadow) {
                    setShadowEnabled(true);
                    const parsedShadow = parseColorWithAlpha(shadow.color);
                    setShadowColor(parsedShadow.color || '#000000');
                    setShadowBlur(shadow.blur || 0);
                    setShadowOffsetX(shadow.offsetX || 0);
                    setShadowOffsetY(shadow.offsetY || 0);
                    setShadowOpacity(parsedShadow.alpha ?? 1);
                } else {
                    setShadowEnabled(false);
                }

                setSkewX(target.skewX || 0);
                setSkewY(target.skewY || 0);
                setSkewZ(target.skewZ || 0);
                setTaperDirection(target.taperDirection || 0);

                if (target.type === 'text' || target.type === 'i-text') {
                    const t = target as fabric.IText;
                    setFontFamily(t.fontFamily || 'Arial');
                    setFontWeight((t.fontWeight as string) || 'normal');
                    setCurveStrength(target.curveStrength || 0);
                    setCurveCenter(target.curveCenter || 0);
                }
                
                if (target.type === 'image') {
                    setBlurValue(0); setBrightnessValue(0); setContrastValue(0);
                    setNoiseValue(0); setSaturationValue(0); setVibranceValue(0); setPixelateValue(0);
                    
                    const filters = (target as fabric.Image).filters || [];
                    filters.forEach(f => {
                         if (!f) return;
                         // eslint-disable-next-line @typescript-eslint/no-explicit-any
                         const anyF = f as any;
                         if (f.type === 'Blur') setBlurValue(anyF.blur || 0);
                         if (f.type === 'Brightness') setBrightnessValue(anyF.brightness || 0);
                         if (f.type === 'Contrast') setContrastValue(anyF.contrast || 0);
                         if (f.type === 'Noise') setNoiseValue(anyF.noise || 0);
                         if (f.type === 'Saturation') setSaturationValue(anyF.saturation || 0);
                         if (f.type === 'Vibrance') setVibranceValue(anyF.vibrance || 0);
                         if (f.type === 'Pixelate') setPixelateValue(anyF.blocksize || 0);
                    });
                }

            } else {
                setSelectedObject(null);
            }
            setSelectedIds(new Set(active.map(o => ensureObjectId(o))));
        };

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', handleSelection);
        
        handleSelection();

        return () => {
            canvas.off('selection:created', handleSelection);
            canvas.off('selection:updated', handleSelection);
            canvas.off('selection:cleared', handleSelection);
        };
    }, [canvas]);

    // Independent Helper
    const buildAdjustmentFilters = (type: AdjustmentLayerType, settings: AdjustmentLayerSettings, intensity: number) => {
        const filters: FabricBaseFilter[] = [];
        const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
        const scaled = (v: number) => clamp(v * intensity, -1, 1);
        
        if (type === 'curves') {
            const s = settings as CurvesAdjustmentSettings;
            const channel = s.channel ?? 'rgb';
            const points = s.pointsByChannel?.[channel] ?? s.points ?? [{x:0,y:0}, {x:1,y:1}];
            filters.push(new CurvesFilter({ points: points, channel: channel, intensity }) as unknown as FabricBaseFilter);
        }
        if (type === 'levels') {
            const s = settings as LevelsAdjustmentSettings;
            const brightness = scaled((s.white - 1) - s.black);
            const contrast = scaled(s.white - s.black - 1);
            const gamma = clamp(s.mid, 0.2, 2);
            filters.push(new fabric.filters.Brightness({ brightness }));
            filters.push(new fabric.filters.Contrast({ contrast }));
            filters.push(new fabric.filters.Gamma({ gamma: [gamma, gamma, gamma] }));
        }
        if (type === 'hue-saturation') {
             const s = settings as HueSaturationSettings;
             if(s.hue !== 0) filters.push(new fabric.filters.HueRotation({ rotation: scaled(s.hue) }));
             if(s.saturation !== 0) filters.push(new fabric.filters.Saturation({ saturation: scaled(s.saturation) }));
             if(s.lightness !== 0) filters.push(new fabric.filters.Brightness({ brightness: scaled(s.lightness) }));
        }
        if (type === 'exposure') {
            const s = settings as ExposureSettings;
             if(s.exposure !== 0) filters.push(new fabric.filters.Brightness({ brightness: scaled(s.exposure) }));
             if(s.contrast !== 0) filters.push(new fabric.filters.Contrast({ contrast: scaled(s.contrast) }));
        }
        if (type === 'saturation-vibrance') {
            filters.push(new fabric.filters.Saturation({ saturation: scaled((settings as SaturationVibranceSettings).saturation) }));
            filters.push(new fabric.filters.Vibrance({ vibrance: scaled((settings as SaturationVibranceSettings).vibrance) }));
        }
        if (type === 'black-white') {
            filters.push(new fabric.filters.Grayscale());
        }
        return filters;
    };


    const applyAdjustmentLayers = useCallback(() => {
        if (!canvas) return;
        const stack = canvas.getObjects();
        const adjustments = stack.filter(o => (o as ExtendedFabricObject).isAdjustmentLayer);
        
        stack.forEach((obj, index) => {
            if (obj.type !== 'image') return;
            const img = obj as fabric.Image;
            const ext = obj as ExtendedFabricObject;
            if (!ext.baseFilters) ext.baseFilters = (img.filters || []).slice();
            const applied = [...(ext.baseFilters || [])];
            
            adjustments.forEach(adj => {
                 const adjIndex = stack.indexOf(adj);
                 if (adjIndex > index && adj.visible) {
                     const extAdj = adj as ExtendedFabricObject;
                     if (extAdj.adjustmentType && extAdj.adjustmentSettings) {
                         const intensity = typeof adj.opacity === 'number' ? adj.opacity : 1;
                         const newFilters = buildAdjustmentFilters(extAdj.adjustmentType, extAdj.adjustmentSettings, intensity);
                         applied.push(...newFilters);
                     }
                 }
            });
            img.filters = applied;
            img.applyFilters();
        });
        canvas.requestRenderAll();
    }, [canvas]);

    // Track object changes to update UI list AND re-apply adjustments (if z-index changed etc)
    useEffect(() => {
        if (!canvas) return;
        const handleChange = () => {
             updateObjects();
             applyAdjustmentLayers();
        };

        canvas.on('object:added', handleChange);
        canvas.on('object:removed', handleChange);
        canvas.on('object:modified', handleChange); // Covers reordering if fired
        
        updateObjects();
        // Initial apply
        setTimeout(() => applyAdjustmentLayers(), 100);

        return () => {
            canvas.off('object:added', handleChange);
            canvas.off('object:removed', handleChange);
            canvas.off('object:modified', handleChange);
        };
    }, [canvas, updateObjects, applyAdjustmentLayers]);

    const updateAdjustment = (newSettings: AdjustmentLayerSettings) => {
        if (!selectedObject) return;
        (selectedObject as ExtendedFabricObject).set('adjustmentSettings', newSettings);
        setAdjustmentSettings(newSettings);
        applyAdjustmentLayers();
    };

    const createAdjustmentLayer = useCallback((type: AdjustmentLayerType) => {
        if (!canvas) return;
        const layer = new fabric.Rect({
            left: 0,
            top: 0,
            width: 1,
            height: 1,
            fill: 'transparent',
            opacity: 1,
            selectable: true,
            evented: false,
            excludeFromExport: true
        });
        const extLayer = layer as ExtendedFabricObject;
        extLayer.isAdjustmentLayer = true;
        extLayer.adjustmentType = type;
        extLayer.adjustmentSettings = getDefaultAdjustmentSettings(type);
        extLayer.name = getNextIndexedName(getAdjustmentLabel(type), getGroupNames(canvas));
        if (!extLayer.id) extLayer.id = `adjust-${Date.now()}`;

        canvas.add(layer);
        canvas.setActiveObject(layer);
        canvas.fire('selection:created', { selected: [layer] });
        canvas.requestRenderAll();
        applyAdjustmentLayers();
    }, [applyAdjustmentLayers, canvas]);

    useEffect(() => {
        if (!canvas) return;
        const handleCreate = (payload?: { type?: AdjustmentLayerType }) => {
            if (payload?.type) {
                createAdjustmentLayer(payload.type);
            }
        };
        // @ts-expect-error Custom event
        canvas.on('adjustment:create', handleCreate);
        return () => {
             // @ts-expect-error Custom event
            canvas.off('adjustment:create', handleCreate);
        };
    }, [canvas, createAdjustmentLayer]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlePropChange = (prop: string, value: any) => {
        if (!selectedObject || !canvas) return;

        // Standard props
        if (prop === 'fill' || prop === 'left' || prop === 'top' || prop === 'width' || prop === 'height' || prop === 'angle' || prop === 'scaleX' || prop === 'scaleY' || prop === 'skewX' || prop === 'skewY') {
            selectedObject.set(prop, value);
        }

        if (prop === 'fill') {
             if (value === 'transparent' || typeof value === 'string') {
                 setIsGradient(false);
                 setColor(value);
                 selectedObject.set('fill', value);
             }
        }

        if (prop === 'gradient') {
             const { start, end, angle, type } = value;
             setIsGradient(true);
             setGradientStart(start);
             setGradientEnd(end);
             setGradientAngle(angle);
             setGradientType(type);

             let coords: Record<string, number> = {};
             
             if (type === 'linear') {
                const rad = (angle || 0) * (Math.PI / 180);
                coords = {
                    x1: 0.5 - (Math.cos(rad) * 0.5),
                    y1: 0.5 - (Math.sin(rad) * 0.5),
                    x2: 0.5 + (Math.cos(rad) * 0.5),
                    y2: 0.5 + (Math.sin(rad) * 0.5)
                };
             } else {
                 coords = { x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, r1: 0, r2: 0.5 };
             }

             const gradient = new fabric.Gradient({
                type: type || 'linear',
                gradientUnits: 'percentage',
                coords: coords,
                colorStops: [
                    { offset: 0, color: start },
                    { offset: 1, color: end }
                ]
             });
             selectedObject.set('fill', gradient);
        }

        if (prop === 'opacity') {
            selectedObject.set('opacity', value);
            setOpacity(value);
        }

         if (prop === 'skewX') setSkewX(value);
         if (prop === 'skewY') setSkewY(value);
        
        if (prop === 'fontFamily') (selectedObject as fabric.IText).set('fontFamily', value);
        if (prop === 'fontWeight') (selectedObject as fabric.IText).set('fontWeight', value);
        
        if (prop === 'curve') {
             const { strength, center } = value;
             const extended = selectedObject as ExtendedFabricObject;
             extended.set({ curveStrength: strength, curveCenter: center });
             setCurveStrength(strength);
             setCurveCenter(center);
             
             if (strength === 0) {
                 selectedObject.set('path', null);
             } else {
                 const len = selectedObject.width || 200;
                 const height = (strength / 100) * len * 0.5;
                 const offset = (center / 100) * len * 0.5;
                 const pathData = `M 0 0 Q ${len/2 + offset} ${height * -1.5} ${len} 0`;
                 const path = new fabric.Path(pathData);
                 path.set({ visible: false, left: -len/2, top: 0 });
                 selectedObject.set('path', path);
             }
        }
        
        if (prop === 'taperDirection') {
             setTaperDirection(value);
             (selectedObject as ExtendedFabricObject).set({ taperDirection: value });
        }
        if (prop === 'skewZ') setSkewZ(value); 
        
        if (prop === 'filter') {
            if (value.type === 'Blur') setBlurValue(value.value);
            // ... (sync other states if needed, though they are only used for UI display which is now handled)
        }
        
        if (prop.startsWith('lock')) {
             selectedObject.set(prop, value);
        }

        if (prop === 'stroke') {
            const { key, value: sVal } = value;
            if (key === 'strokeColor') {
                selectedObject.set('stroke', sVal);
                setStrokeColor(sVal);
            }
            if (key === 'strokeWidth') {
                selectedObject.set('strokeWidth', sVal);
                setStrokeWidth(sVal);
            }
            // ... could add opacity etc
        }

        canvas.requestRenderAll();
        if ((selectedObject as ExtendedFabricObject).isAdjustmentLayer) applyAdjustmentLayers();
        
        // Force re-render for transform props that don't have their own state
        updateObjects();
    };
    
    const handleLayoutAction = (type: 'align' | 'distribute', value: string) => {
        if (!selectedObject || !canvas) return;
        
        if (type === 'align') {
             const artboard = (canvas as CanvasWithArtboard).artboardRect;
             const bound = artboard ? artboard.getBoundingRect() : { left: 0, top: 0, width: canvas.width || 0, height: canvas.height || 0 };
             const objRect = selectedObject.getBoundingRect();
             
             switch (value) {
                 case 'left':
                     selectedObject.set('left', bound.left);
                     break;
                 case 'center':
                     selectedObject.set('left', bound.left + (bound.width / 2) - (objRect.width / 2));
                     break;
                 case 'right':
                     selectedObject.set('left', bound.left + bound.width - objRect.width);
                     break;
                 case 'top':
                     selectedObject.set('top', bound.top);
                     break;
                 case 'middle':
                     selectedObject.set('top', bound.top + (bound.height / 2) - (objRect.height / 2));
                     break;
                 case 'bottom':
                     selectedObject.set('top', bound.top + bound.height - objRect.height);
                     break;
             }
             selectedObject.setCoords();
             handlePropChange('left', selectedObject.left); // Sync UI
        }
    };

    const handleReorder = (activeId: string, overId: string) => {
        if (!canvas) return;
        const active = canvas.getObjects().find(o => (o as ExtendedFabricObject).id === activeId);
        const over = canvas.getObjects().find(o => (o as ExtendedFabricObject).id === overId);
        if (!active || !over) return;
        
        const overIdx = canvas.getObjects().indexOf(over);
        canvas.moveObjectTo(active, overIdx);
        canvas.requestRenderAll();
        updateObjects();
        applyAdjustmentLayers();
    };

    const deleteLayer = (obj: fabric.Object) => {
         if(!canvas) return;
         if(obj.group) obj.group.remove(obj);
         else canvas.remove(obj);
         canvas.requestRenderAll();
    };

    if (activeTool === 'paint') {
        return (
            <PaintProperties 
                canvas={canvas}
                activeTool={activeTool}
                onExpandFolder={(id) => {
                     setExpandedFolders(prev => {
                         const n = new Set(prev);
                         n.add(id);
                         return n;
                     });
                }}
                onObjectsUpdate={updateObjects}
            />
        );
    }
    
    if (activeTool === 'layers') {
        return (
            <LayersView 
                objects={objects}
                selectedIds={selectedIds}
                onSelect={(obj, e) => {
                     if (e?.shiftKey) { /* multi */ } 
                     else { 
                         canvas?.discardActiveObject();
                         canvas?.setActiveObject(obj);
                         canvas?.requestRenderAll(); 
                     }
                }}
                onToggleVisibility={(obj) => { 
                    obj.visible = !obj.visible; 
                    canvas?.requestRenderAll(); 
                    if ((obj as ExtendedFabricObject).isAdjustmentLayer) applyAdjustmentLayers();
                }}
                onToggleLock={(obj) => { 
                    const l = !(obj as ExtendedFabricObject).locked;
                    (obj as ExtendedFabricObject).locked = l;
                    obj.set({ lockMovementX: l, lockMovementY: l, selectable: !l, evented: !l });
                    canvas?.discardActiveObject();
                    canvas?.requestRenderAll();
                }}
                onDelete={deleteLayer}
                onReorder={handleReorder}
                onGroup={() => {}}
                onUngroup={() => {}}
                onCreateFolder={() => {}}
                onDblClick={() => onLayerDblClick && onLayerDblClick()}
                expandedFolders={expandedFolders}
                onToggleFolder={(obj) => {
                     const id = ensureObjectId(obj);
                     setExpandedFolders(prev => {
                         const n = new Set(prev);
                         if (n.has(id)) n.delete(id); else n.add(id);
                         return n;
                     });
                }}
            />
        );
    }

    if (!selectedObject) {
         return (
             <div className="h-full bg-card overflow-y-auto">
                 <CanvasSettingsPanel 
                     width={canvasWidth}
                     height={canvasHeight}
                     backgroundColor={canvasColor}
                     onResize={(w, h) => {
                          if (!canvas) return;
                          const ext = canvas as CanvasWithArtboard;
                          if (ext.artboardRect) { ext.artboardRect.set({ width: w, height: h }); }
                          canvas.requestRenderAll();
                     }}
                     onColorChange={(c) => {
                          if (!canvas) return;
                          const cvs = canvas;
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any, react-hooks/immutability
                          (cvs as any).backgroundColor = c;
                          cvs.requestRenderAll();
                     }}
                 />
             </div>
         );
    }

    void opacity; void adjustmentSettings;

    return (
        <SelectionProperties 
             canvas={canvas}
             selectedObject={selectedObject}
             selectedObjects={canvas?.getActiveObjects() || []}
             color={color}
             isGradient={isGradient}
             gradientState={{
                 type: gradientType,
                 start: gradientStart,
                 end: gradientEnd,
                 angle: gradientAngle
             }}
             onPropChange={handlePropChange}
             onLayoutAction={handleLayoutAction}
             onGroup={() => { /* group logic */ }}
             onUngroup={() => { /* ungroup logic */ }}
             onCreateMask={() => { /* mask logic */ }}
             onReleaseMask={() => { /* unmask logic */ }}
             updateAdjustment={updateAdjustment}
             textState={{ font: fontFamily, weight: fontWeight, curve: curveStrength, center: curveCenter }}
             effectState={{ 
                 filters: { 
                     blur: blurValue, brightness: brightnessValue, contrast: contrastValue,
                     noise: noiseValue, saturation: saturationValue, vibrance: vibranceValue, pixelate: pixelateValue 
                 },
                 stroke: { color: strokeColor, width: strokeWidth, opacity: strokeOpacity, inside: strokeInside },
                 shadow: { enabled: shadowEnabled, color: shadowColor, blur: shadowBlur, offsetX: shadowOffsetX, offsetY: shadowOffsetY, opacity: shadowOpacity },
                 skew: { x: skewX, y: skewY, z: skewZ, dir: taperDirection }
             }}
        />
    );
}
