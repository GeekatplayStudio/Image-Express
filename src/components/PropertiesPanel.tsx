'use client';
import { useCallback, useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { 
    ExtendedFabricObject, 
    AdjustmentLayerType, 
    AdjustmentLayerSettings, 
    CurvesAdjustmentSettings,
    CurvesChannel, 
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
    // ensureObjectId, 
    // applyAlphaToColor, 
    // parseColorWithAlpha as extractColorFromStyle, // Alias for legacy usage
} from '@/lib/utils';

// We import fabric utils from where they actually are
import { 
    ensureObjectId, 
    applyAlphaToColor,
    normalizeColorValue, 
    parseColorWithAlpha,
    parseColorWithAlpha as extractColorFromStyle,
    getAdjustmentLabel,
    getDefaultAdjustmentSettings,
    moveObjectToGroup,
    moveObjectToCanvas
} from '@/lib/fabric-utils';

import { CurvesFilter } from '@/lib/fabric-filters';

interface CustomObjectState {
    _strokeEnabled?: boolean;
    _borderEnabled?: boolean;
    _strokeCachedWidth?: number;
    _borderCachedWidth?: number;
    _strokeCachedColor?: string;
    _borderCachedColor?: string;
    _strokeCachedOpacity?: number;
    _borderCachedOpacity?: number;
}

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
    activeTool: string;
    onLayerDblClick?: () => void;
    onMake3D?: (imageUrl: string) => void;
    onDuplicate?: () => void;
}

export default function PropertiesPanel({ canvas, activeTool, onLayerDblClick, onMake3D, onDuplicate }: PropertiesPanelProps) {
    const [selectedObject, setSelectedObject] = useState<ExtendedFabricObject | null>(null);
    const [objects, setObjects] = useState<fabric.Object[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    // Canvas Settings
    const [canvasWidth, setCanvasWidth] = useState(1080);
    const [canvasHeight, setCanvasHeight] = useState(1080);
    const [canvasColor, setCanvasColor] = useState('#ffffff');

    // Selection Props
    const [color, setColor] = useState('#000000');
    // Note: We use isGradient from types typically, but here we track if fill is gradient object
    const [isGradient, setIsGradient] = useState(false); 
    // const [useGradient, setIsGradient] = useState(false); // Removed duplicate

    const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
    const [gradientStart, setGradientStart] = useState('#000000');
    const [gradientEnd, setGradientEnd] = useState('#ffffff');
    const [gradientAngle, setGradientAngle] = useState(0);

    const [opacity, setOpacity] = useState(1);
    
    // Stroke / Border
    const [strokeWidth, setStrokeWidth] = useState(0);
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [strokeOpacity, setStrokeOpacity] = useState(1);
    const [strokeInside, setStrokeInside] = useState(true);
    const [strokeBlend, setStrokeBlend] = useState('normal'); 

    const [borderWidth, setBorderWidth] = useState(0);
    const [borderColor, setBorderColor] = useState('#000000');
    const [borderOpacity, setBorderOpacity] = useState(1);
    const [borderBlend, setBorderBlend] = useState('normal');

    // --- Render Props for ShadowStrokeProperties State ---
    const [strokeEnabled, setStrokeEnabled] = useState(false);
    const [borderEnabled, setBorderEnabled] = useState(false);

    // Filters
    const [blurValue, setBlurValue] = useState(0);

    // Text Effects
    const [activeTextEffects, setActiveTextEffects] = useState<string[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [textEffectConfigs, setTextEffectConfigs] = useState<Record<string, any>>({});
    const [brightnessValue, setBrightnessValue] = useState(0);
    const [contrastValue, setContrastValue] = useState(0);
    const [noiseValue, setNoiseValue] = useState(0);
    const [saturationValue, setSaturationValue] = useState(0);
    const [vibranceValue, setVibranceValue] = useState(0);
    const [pixelateValue, setPixelateValue] = useState(0);

    // Shadow
    const [shadowEnabled, setShadowEnabled] = useState(false);
    const [shadowColor, setShadowColor] = useState('#000000');
    const [shadowBlur, setShadowBlur] = useState(10);
    const [shadowOffsetX, setShadowOffsetX] = useState(5);
    const [shadowOffsetY, setShadowOffsetY] = useState(5);
    const [shadowOpacity, setShadowOpacity] = useState(1);
    const [shadowBlend, setShadowBlend] = useState('normal');
    
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

        // Prioritize actual Artboard Rect (Object)
        if (extendedCanvas.artboardRect) {
             const rect = extendedCanvas.artboardRect;
             setCanvasWidth(Math.round((rect.width || 0) * (rect.scaleX || 1)));
             setCanvasHeight(Math.round((rect.height || 0) * (rect.scaleY || 1)));
             const fill = rect.fill;
             if (typeof fill === 'string') setCanvasColor(fill);
             return;
        }

        if (extendedCanvas.artboard) {
            setCanvasWidth(Math.round(extendedCanvas.artboard.width));
            setCanvasHeight(Math.round(extendedCanvas.artboard.height));
        } else {
            const zoom = canvas.getZoom() || 1;
            setCanvasWidth(Math.round((canvas.width || 1080) / zoom));
            setCanvasHeight(Math.round((canvas.height || 1080) / zoom));
        }
        
        if (typeof canvas.backgroundColor === 'string' && canvas.backgroundColor !== 'transparent') {
            setCanvasColor(normalizeColorValue(canvas.backgroundColor) || '#ffffff');
        }
    }, [canvas]);

    const applyAdjustmentLayers = useCallback(() => {
        if (!canvas) return;
        const objs = canvas.getObjects();

        const adjustmentFilterTypes = new Set([
            'Curves',
            'Brightness',
            'Contrast',
            'HueRotation',
            'Saturation',
            'Vibrance',
            'BlackWhite'
        ]);

        const filtersRegistry = fabric.filters as unknown as Record<string, new (options?: Record<string, unknown>) => FabricBaseFilter>;

        const buildFiltersForAdjustment = (
            type: AdjustmentLayerType,
            settings: AdjustmentLayerSettings,
            intensity: number
        ): FabricBaseFilter[] => {
            const clampedIntensity = Math.min(1, Math.max(0, intensity));
            if (type === 'curves') {
                const curves = settings as CurvesAdjustmentSettings;
                const filters: FabricBaseFilter[] = [];

                // 1. Process explicit channels from pointsByChannel
                if (curves.pointsByChannel) {
                    Object.entries(curves.pointsByChannel).forEach(([ch, pts]) => {
                         if (pts && pts.length >= 2) {
                             filters.push(
                                 new CurvesFilter({
                                     points: pts,
                                     channel: ch as CurvesChannel,
                                     intensity: clampedIntensity
                                 }) as unknown as FabricBaseFilter
                             );
                         }
                    });
                } 
                // 2. Fallback to legacy single-channel if no map exists
                else if (curves.points && curves.points.length >= 2) {
                    filters.push(
                        new CurvesFilter({
                            points: curves.points,
                            channel: curves.channel || 'rgb',
                            intensity: clampedIntensity
                        }) as unknown as FabricBaseFilter
                    );
                }

                return filters;
            }

            if (type === 'levels') {
                const levels = settings as LevelsAdjustmentSettings;
                const brightness = ((levels.black || 0) * 0.5 - ((1 - (levels.white || 1)) * 0.5)) * clampedIntensity;
                const contrast = (((levels.mid || 1) - 1) * 0.5) * clampedIntensity;
                const filters: FabricBaseFilter[] = [];
                if (Math.abs(brightness) > 0.01) {
                    filters.push(new fabric.filters.Brightness({ brightness }) as unknown as FabricBaseFilter);
                }
                if (Math.abs(contrast) > 0.01) {
                    filters.push(new fabric.filters.Contrast({ contrast }) as unknown as FabricBaseFilter);
                }
                return filters;
            }

            if (type === 'exposure') {
                const exposure = settings as ExposureSettings;
                return [
                    new fabric.filters.Brightness({ brightness: (exposure.exposure || 0) * clampedIntensity }) as unknown as FabricBaseFilter,
                    new fabric.filters.Contrast({ contrast: (exposure.contrast || 0) * clampedIntensity }) as unknown as FabricBaseFilter
                ];
            }

            if (type === 'hue-saturation') {
                const hueSat = settings as HueSaturationSettings;
                const filters: FabricBaseFilter[] = [
                    new fabric.filters.HueRotation({ rotation: (hueSat.hue || 0) * 2 * clampedIntensity }) as unknown as FabricBaseFilter,
                    new fabric.filters.Saturation({ saturation: (hueSat.saturation || 0) * clampedIntensity }) as unknown as FabricBaseFilter
                ];
                if (typeof hueSat.lightness === 'number' && Math.abs(hueSat.lightness) > 0.001) {
                    filters.push(new fabric.filters.Brightness({ brightness: hueSat.lightness * clampedIntensity }) as unknown as FabricBaseFilter);
                }
                return filters;
            }

            if (type === 'saturation-vibrance') {
                const satVib = settings as SaturationVibranceSettings;
                const filters: FabricBaseFilter[] = [
                    new fabric.filters.Saturation({ saturation: (satVib.saturation || 0) * clampedIntensity }) as unknown as FabricBaseFilter
                ];
                const VibranceFilter = filtersRegistry.Vibrance;
                if (VibranceFilter) {
                    filters.push(new VibranceFilter({ vibrance: (satVib.vibrance || 0) * clampedIntensity }) as unknown as FabricBaseFilter);
                }
                return filters;
            }

            if (type === 'black-white') {
                const bw = new fabric.filters.BlackWhite() as unknown as FabricBaseFilter;
                // fabric's BlackWhite doesn't support intensity; opacity blending is handled by clampedIntensity
                // by stacking a desaturation via saturation if not full intensity
                if (clampedIntensity >= 0.99) return [bw];
                return [
                    new fabric.filters.Saturation({ saturation: -clampedIntensity }) as unknown as FabricBaseFilter
                ];
            }

            return [];
        };

        const defaultFilterBackend = fabric.getFilterBackend();
        const canvas2dFilterBackend = new fabric.Canvas2dFilterBackend();

        // Apply adjustment layers to each image based on stack order
        objs.forEach((obj, idx) => {
            if (obj.type !== 'image' && obj.type !== 'group') return; // Apply to images and groups (if supported)
            const image = obj as fabric.Image;
            const imageExt = image as ExtendedFabricObject;

            if (!imageExt.baseFilters) {
                const existing = image.filters || [];
                // Save original filters that are NOT adjustment filters
                imageExt.baseFilters = existing.filter((f) => !adjustmentFilterTypes.has(f.type));
            }

            // Find adjustment layers above this object
            const layersAbove = objs.slice(idx + 1);
            
            const adjustmentFilters: FabricBaseFilter[] = [];
            
            // Track if we hit a "blocking" visual layer (like another Image) 
            // that prevents Clipped adjustments from reaching us
            let blockedForClipped = false;

            for (const layerObj of layersAbove) {
                const layer = layerObj as ExtendedFabricObject;
                
                // If it is an adjustment layer
                if (layer.isAdjustmentLayer && layer.adjustmentType && layer.adjustmentSettings && layer.visible !== false) {
                     // Determine if it should apply to 'obj'
                     
                     // If it is CLIPPED:
                     // It only applies if 'obj' is part of the immediate stack below it.
                     // i.e., NO blocking visual layers in between.
                     if (layer.clipped) {
                         if (!blockedForClipped) {
                            const layerOpacity = typeof layer.opacity === 'number' ? layer.opacity : 1;
                            adjustmentFilters.push(
                                ...buildFiltersForAdjustment(layer.adjustmentType, layer.adjustmentSettings, layerOpacity)
                            );
                         } 
                         // If blocked, this clipped layer belongs to the blocker, not us.
                     } 
                     // If it is GLOBAL (Unclipped):
                     // It applies to everything below it, regardless of blockers.
                     else {
                        const layerOpacity = typeof layer.opacity === 'number' ? layer.opacity : 1;
                        adjustmentFilters.push(
                            ...buildFiltersForAdjustment(layer.adjustmentType, layer.adjustmentSettings, layerOpacity)
                        );
                     }
                } 
                // If it is a potential "Blocker" (Visual content layer)
                // e.g., Image, Group, Text, Path... but NOT an adjustment layer
                else if (!layer.isAdjustmentLayer && layer.type !== 'selection') {
                    // It blocks future CLIPPED layers
                    blockedForClipped = true;
                }
            }

            image.filters = [...imageExt.baseFilters, ...adjustmentFilters];
            if (typeof image.applyFilters === 'function') {
                const needsCanvas2d = adjustmentFilters.some((filter) => filter.type === 'Curves');
                const shouldSwapBackend = needsCanvas2d && !(defaultFilterBackend instanceof fabric.Canvas2dFilterBackend);
                if (shouldSwapBackend) {
                    fabric.setFilterBackend(canvas2dFilterBackend);
                }
                image.applyFilters();
                if (shouldSwapBackend) {
                    fabric.setFilterBackend(defaultFilterBackend);
                }
            }
        });

        canvas.requestRenderAll();
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
        const extendedCanvas = canvas as CanvasWithArtboard;
        const artboardRect = extendedCanvas.artboardRect;
        const objs = canvas.getObjects().filter((obj) => obj !== artboardRect);
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
                
                // --- Hydrate Stroke/Border State from Object + Custom Props ---
                const sColor = extractColorFromStyle(typeof target.stroke === 'string' ? target.stroke : undefined);
                const isBorderMode = target.paintFirst === 'stroke'; // If true, it renders as 'Border'
                const currentWidth = target.strokeWidth || 0;
                
                // Read custom props or fallback to standard inference
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const custom = target as any as CustomObjectState;
                
                let sEnabled = custom._strokeEnabled;
                let bEnabled = custom._borderEnabled;
                
                // Check actual stroke visual presence (Fabric defaults strokeWidth=1 even if stroke is null)
                const hasVisibleStroke = !!target.stroke && target.stroke !== 'transparent';

                // Fallback inference if custom props not set (first load)
                if (sEnabled === undefined) sEnabled = (currentWidth > 0 && !isBorderMode && hasVisibleStroke);
                if (bEnabled === undefined) bEnabled = (currentWidth > 0 && isBorderMode && hasVisibleStroke);

                // Default to OFF if width is 0 or undefined
                if (currentWidth === 0) {
                    sEnabled = false;
                    bEnabled = false;
                }
                
                // If neither is "enabled" but we have a stroke width > 0, logic defaults to what paintFirst is
                if (currentWidth > 0 && sEnabled === undefined && bEnabled === undefined) {
                     if (isBorderMode) bEnabled = true;
                     else sEnabled = true;
                }

                // Hydrate Rendering State
                if (isBorderMode) {
                     // Active: Border
                     setBorderWidth(currentWidth);
                     setBorderColor(sColor.color || '#000000');
                     setBorderOpacity(sColor.alpha ?? 1);
                     
                     // Inactive: Stroke (Restored from cache or default)
                     setStrokeWidth(custom._strokeCachedWidth || 0);
                     setStrokeColor(custom._strokeCachedColor || '#000000');
                     setStrokeOpacity(custom._strokeCachedOpacity || 1);
                } else {
                     // Active: Stroke
                     setStrokeWidth(currentWidth);
                     setStrokeColor(sColor.color || '#000000');
                     setStrokeOpacity(sColor.alpha ?? 1);
                     
                     // Inactive: Border (Restored from cache or default)
                     setBorderWidth(custom._borderCachedWidth || 0);
                     setBorderColor(custom._borderCachedColor || '#000000');
                     setBorderOpacity(custom._borderCachedOpacity || 1);
                }


                // Persist if inferred
                const tCustom = target as unknown as CustomObjectState;
                if (tCustom._strokeEnabled !== sEnabled) tCustom._strokeEnabled = sEnabled;
                if (tCustom._borderEnabled !== bEnabled) tCustom._borderEnabled = bEnabled;

                setStrokeEnabled(!!sEnabled);
                setBorderEnabled(!!bEnabled);

                setStrokeInside(!isBorderMode);
                
                const shadow = target.shadow as fabric.Shadow;
                if (shadow) {
                    setShadowEnabled(true);
                    const parsedShadow = parseColorWithAlpha(shadow.color);
                    setShadowColor(parsedShadow.color || '#000000');
                    setShadowBlur(shadow.blur || 0);
                    setShadowOffsetX(shadow.offsetX || 0);
                    setShadowOffsetY(shadow.offsetY || 0);
                    setShadowOpacity(parsedShadow.alpha ?? 1);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setShadowBlend((target as any).shadowBlend || 'normal');
                } else {
                    setShadowEnabled(false);
                    setShadowBlend('normal');
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
                    
                    // Restore Text Effect State
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const d = (target as any).data || {};
                    if (d.textEffects) {
                        setActiveTextEffects(d.textEffects);
                        setTextEffectConfigs(d.effectConfigs || {});
                    } else if (d.textEffect) {
                        setActiveTextEffects([d.textEffect]);
                        const configs = d.effectConfig ? { [d.textEffect]: d.effectConfig } : {};
                        setTextEffectConfigs(configs);
                    } else {
                        setActiveTextEffects([]);
                        setTextEffectConfigs({});
                    }
                } else {
                    setActiveTextEffects([]);
                    setTextEffectConfigs({});
                }
                
                if (target.type === 'image') {
                    setBlurValue(0); setBrightnessValue(0); setContrastValue(0);
                    setNoiseValue(0); setSaturationValue(0); setVibranceValue(0); setPixelateValue(0);
                    
                    const filters = (target as fabric.Image).filters || [];
                    filters.forEach(f => {
                         if (!f) return;
                         const anyF = f as unknown as Record<string, number>;
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

           const handleChange = () => {
               updateObjects();
               applyAdjustmentLayers();
           };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleAdjustmentCreate = (e: any) => {
             const type = e.type as AdjustmentLayerType;
             if (!canvas) return;
             
             // Create adjustment layer (overlay)
             // Using current active artboard/canvas bounds
             const width = canvas.width || 1080;
             const height = canvas.height || 1080;
             
             const rect = new fabric.Rect({
                 left: 0, top: 0,
                 width: width, height: height,
                 fill: 'transparent',
                 selectable: true,
                 evented: true,
             });
             
             const ext = rect as ExtendedFabricObject;
             ext.isAdjustmentLayer = true;
             ext.adjustmentType = type;
             ext.adjustmentSettings = getDefaultAdjustmentSettings(type);
             ext.name = getAdjustmentLabel(type);
             
             // Use 50% opacity for overlay indicating presence? Or just settings?
             // Usually adjustment layer implies affect. 
             // For now we just add it as a layer that holds settings.
             
               canvas.add(rect);
               canvas.setActiveObject(rect);
               canvas.requestRenderAll();
               updateObjects();
               applyAdjustmentLayers();
        };

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', handleSelection);
        canvas.on('object:added', handleChange);
        canvas.on('object:removed', handleChange);
        canvas.on('object:modified', handleChange);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (canvas as any).on('adjustment:create', handleAdjustmentCreate);
        
        handleSelection();
        updateObjects(); // Initial sync

        return () => {
            canvas.off('selection:created', handleSelection);
            canvas.off('selection:updated', handleSelection);
            canvas.off('selection:cleared', handleSelection);
            canvas.off('object:added', handleChange);
            canvas.off('object:removed', handleChange);
            canvas.off('object:modified', handleChange);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (canvas as any).off('adjustment:create', handleAdjustmentCreate);
        };
    }, [canvas, updateObjects, applyAdjustmentLayers]);


    // --- Helper Functions ---
    const applyTaper = (skewZVal: number, taperVal: number) => {
        if (!selectedObject) return;
        // Simple shim for perspective/taper - fabric.js 6 doesn't have 3D transform natively just yet without extensions
        // Storing as custom props
        selectedObject.set('skewZ', skewZVal);
        selectedObject.set('taperDirection', taperVal);
        const shear = skewZVal * 0.01;
        // Just simulating with skewX/Y combination for now as placeholder
        selectedObject.set('skewX', selectedObject.skewX + (shear * 10)); 
        selectedObject.set('dirty', true);
        canvas?.requestRenderAll();
    };



    const updateAdjustment = (updates: Partial<AdjustmentLayerSettings>) => {
        if (!selectedObject || !selectedObject.isAdjustmentLayer) return;
        const newSettings = { ...selectedObject.adjustmentSettings, ...updates };
        // eslint-disable-next-line react-hooks/immutability
        selectedObject.adjustmentSettings = newSettings as AdjustmentLayerSettings;
        setAdjustmentSettings(newSettings as AdjustmentLayerSettings);
        applyAdjustmentLayers();
    };


    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlePropChange = (prop: string, value: any) => {
        if (!selectedObject || !canvas) return;

        // Standard Props & layout
        const startProps = ['left', 'top', 'width', 'height', 'angle', 'scaleX', 'scaleY', 'skewX', 'skewY', 'visible', 'globalCompositeOperation'];
        if (startProps.includes(prop)) {
            selectedObject.set(prop, value);
            selectedObject.set('dirty', true);
        }
        
        if (prop === 'opacity') {
            setOpacity(value);
            selectedObject.set('opacity', value);
            if ((selectedObject as ExtendedFabricObject).isAdjustmentLayer) {
                applyAdjustmentLayers();
            }
        }

        if (prop === 'fill') {
             setColor(value);
             setIsGradient(false);
             selectedObject.set('fill', value);
             selectedObject.set('dirty', true);
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
             setCurveCenter(center ?? 0);
             
             if (strength === 0) {
                 selectedObject.set('path', null);
             } else {
                 const len = selectedObject.width || 200;
                 // Improved curve algorithm with better arc control
                 // Use cubic bezier for smoother curves at extreme values
                 const normalizedStrength = strength / 100;
                 const normalizedCenter = (center ?? 0) / 100;
                 
                 // Calculate control point height based on strength
                 // Using quadratic relationship for more natural feel
                 const curveHeight = normalizedStrength * len * 0.6;
                 
                 // Center offset affects the peak position
                 const peakX = (len / 2) + (normalizedCenter * len * 0.4);
                 
                 // For extreme curves (>80%), use circular arc approximation
                 if (Math.abs(strength) >= 80) {
                     // Circular arc path for full circle effect
                     const arcHeight = curveHeight * 1.2;
                     // Use cubic bezier for smoother arc
                     const cp1x = len * 0.25 + (normalizedCenter * len * 0.2);
                     const cp2x = len * 0.75 + (normalizedCenter * len * 0.2);
                     const pathData = `M 0 0 C ${cp1x} ${-arcHeight} ${cp2x} ${-arcHeight} ${len} 0`;
                     const path = new fabric.Path(pathData);
                     path.set({ visible: false, left: -len/2, top: 0 });
                     selectedObject.set('path', path);
                 } else {
                     // Standard quadratic bezier for moderate curves
                     const pathData = `M 0 0 Q ${peakX} ${-curveHeight} ${len} 0`;
                     const path = new fabric.Path(pathData);
                     path.set({ visible: false, left: -len/2, top: 0 });
                     selectedObject.set('path', path);
                 }
                 selectedObject.setCoords();
             }
        }
        
        if (prop === 'taperDirection') {
             setTaperDirection(value);
             applyTaper(skewZ, value);
        }
        if (prop === 'skewZ') {
             setSkewZ(value);
             applyTaper(value, taperDirection);
        } 
        
        if (prop === 'filter') {
            const { type, value: filterVal } = value;
            const img = selectedObject as fabric.Image;
            if (img.type === 'image') {
                // Ensure filters array
                // eslint-disable-next-line react-hooks/immutability
                if (!img.filters) img.filters = [];
                
                // Map UI type to Fabric filter class
                
                // Remove existing filter of this type to replace/update
                // Note: This matches based on class type name.
                // Assuming type map: 'Blur' -> fabric.Image.filters.Blur
                
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const typeMap: Record<string, any> = {
                    'Blur': fabric.filters.Blur,
                    'Brightness': fabric.filters.Brightness,
                    'Contrast': fabric.filters.Contrast,
                    'Saturation': fabric.filters.Saturation,
                    'Vibrance': fabric.filters.Vibrance,
                    'Noise': fabric.filters.Noise,
                    'Pixelate': fabric.filters.Pixelate
                };

                const FilterClass = typeMap[type];
                if (FilterClass) {
                     // Find existing index
                     const idx = img.filters.findIndex(f => f instanceof FilterClass);
                     if (idx > -1) img.filters.splice(idx, 1);

                     // Create new if value > 0 (or non-neutral)
                     // Check neutrality conditions
                     let isNeutral = false;
                     if (type === 'Blur' && filterVal === 0) isNeutral = true;
                     if (type === 'Brightness' && filterVal === 0) isNeutral = true;
                     if (type === 'Contrast' && filterVal === 0) isNeutral = true;
                     if (type === 'Saturation' && filterVal === 0) isNeutral = true;
                     if (type === 'Vibrance' && filterVal === 0) isNeutral = true;
                     if (type === 'Noise' && filterVal === 0) isNeutral = true;
                     if (type === 'Pixelate' && filterVal === 0) isNeutral = true;

                     if (!isNeutral) {
                         // Build options
                         // eslint-disable-next-line @typescript-eslint/no-explicit-any
                         const options: any = {};
                         if (type === 'Blur') options.blur = filterVal;
                         if (type === 'Brightness') options.brightness = filterVal;
                         if (type === 'Contrast') options.contrast = filterVal;
                         if (type === 'Saturation') options.saturation = filterVal;
                         if (type === 'Vibrance') options.vibrance = filterVal;
                         if (type === 'Noise') options.noise = filterVal;
                         if (type === 'Pixelate') options.blocksize = Math.max(2, filterVal); // Pixelate needs > 1 usually
                         
                         img.filters.push(new FilterClass(options));
                     }
                }
                
                img.applyFilters();
                const imgExt = img as ExtendedFabricObject;
                imgExt.baseFilters = [...(img.filters || [])];
                selectedObject.set('dirty', true);

                // Update Local State for UI
                if (type === 'Blur') setBlurValue(filterVal);
                if (type === 'Brightness') setBrightnessValue(filterVal);
                if (type === 'Contrast') setContrastValue(filterVal);
                if (type === 'Noise') setNoiseValue(filterVal);
                if (type === 'Saturation') setSaturationValue(filterVal);
                if (type === 'Vibrance') setVibranceValue(filterVal);
                if (type === 'Pixelate') setPixelateValue(filterVal);
            }
        }
        
        if (prop.startsWith('lock')) {
             selectedObject.set(prop, value);
        }

        if (prop === 'stroke') {
            const { key, value: sVal } = value;
            if (key === 'color') {
                setStrokeColor(sVal as string);
                selectedObject.set('stroke', applyAlphaToColor(sVal as string, strokeOpacity));
            }
            if (key === 'width') {
                setStrokeWidth(sVal as number);
                selectedObject.set('strokeWidth', sVal as number);
                if (Number(sVal) > 0 && !selectedObject.stroke) {
                     selectedObject.set('stroke', applyAlphaToColor(strokeColor, strokeOpacity));
                }
            }
            if (key === 'opacity') {
                setStrokeOpacity(sVal as number);
                selectedObject.set('stroke', applyAlphaToColor(strokeColor, sVal as number));
            }
            if (key === 'inside') {
                setStrokeInside(sVal as boolean);
                selectedObject.set('paintFirst', sVal ? 'fill' : 'stroke');
                selectedObject.set('dirty', true);
            }
        }

        if (prop === 'shadowStrokeUpdate') {
             // value is Partial<ShadowStrokeValues>
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const v = value as any;
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const t = selectedObject as any;

             // --- STROKE STATE UPDATE ---
             if ('strokeEnabled' in v) {
                 const isEnabled = !!v.strokeEnabled;
                 t._strokeEnabled = isEnabled; // Store UI intent
                 setStrokeEnabled(isEnabled);

                 // If user actively enabled stroke, render stroke
                 if (isEnabled) {
                     setStrokeInside(true);
                     selectedObject.set('paintFirst', 'fill');
                     
                     // Restore cached values if needed
                     const width = v.strokeWidth ?? (t._strokeCachedWidth || strokeWidth || 1);
                     const color = v.strokeColor ?? (t._strokeCachedColor || strokeColor || '#000000');
                     const opacity = v.strokeOpacity ?? (t._strokeCachedOpacity ?? strokeOpacity ?? 1);

                     // Update live object
                     selectedObject.set('stroke', applyAlphaToColor(color, opacity));
                     selectedObject.set('strokeWidth', width);
                     
                     // Sync local state
                     setStrokeWidth(width);
                     setStrokeColor(color);
                     setStrokeOpacity(opacity);
                 } else {
                     // Turning OFF Stroke.
                     // If Border is currently desired (stored state), switch to Border rendering
                     if (t._borderEnabled) {
                         // Switch to Border Mode
                         setStrokeInside(false);
                         selectedObject.set('paintFirst', 'stroke');
                         // Restore Border settings
                         const bWidth = t._borderCachedWidth || borderWidth || 1;
                         const bColor = t._borderCachedColor || borderColor || '#000000';
                         const bOpacity = t._borderCachedOpacity ?? borderOpacity ?? 1;
                         
                         selectedObject.set('stroke', applyAlphaToColor(bColor, bOpacity));
                         selectedObject.set('strokeWidth', bWidth);
                         
                         setBorderWidth(bWidth);
                         setBorderColor(bColor);
                         setBorderOpacity(bOpacity);
                     } else {
                         // Both OFF -> Clear stroke
                         selectedObject.set('strokeWidth', 0);
                         selectedObject.set('stroke', null);
                         setStrokeWidth(0); 
                     }
                 }
                 selectedObject.set('dirty', true);
             }

             // Update Stroke Properties (Live)
             if (('strokeColor' in v || 'strokeOpacity' in v) && strokeEnabled) { // Check local state or v? Use derived if persisted
                 const c = v.strokeColor || strokeColor;
                 const o = v.strokeOpacity !== undefined ? v.strokeOpacity : strokeOpacity;
                 
                 // Update cache
                 // eslint-disable-next-line react-hooks/immutability
                 t._strokeCachedColor = c;
                  
                 t._strokeCachedOpacity = o;
                 setStrokeColor(c);
                 setStrokeOpacity(o);

                 // Only apply if currently rendering Stroke
                 if (selectedObject.paintFirst === 'fill') {
                     selectedObject.set('stroke', applyAlphaToColor(c, o));
                 }
             }
             if ('strokeWidth' in v && strokeEnabled) {
                 t._strokeCachedWidth = v.strokeWidth;
                 setStrokeWidth(v.strokeWidth);
                 
                 if (selectedObject.paintFirst === 'fill') {
                     selectedObject.set('strokeWidth', v.strokeWidth);
                     if (v.strokeWidth > 0 && !selectedObject.stroke) {
                        selectedObject.set('stroke', applyAlphaToColor(strokeColor, strokeOpacity));
                     }
                 }
             }
             if ('strokeBlur' in v) { /* removed */ }
             if ('strokeBlend' in v) setStrokeBlend(v.strokeBlend);

             // --- BORDER STATE UPDATE ---
             if ('borderEnabled' in v) {
                 const isEnabled = !!v.borderEnabled;
                 // eslint-disable-next-line react-hooks/immutability
                 t._borderEnabled = isEnabled; // Store UI intent
                 setBorderEnabled(isEnabled);

                 if (isEnabled) {
                     // User Wants Border.
                     // "Last interaction wins" -> switch to Border rendering
                     setStrokeInside(false);
                     selectedObject.set('paintFirst', 'stroke');
                     // Fix for clipping: Ensure stroke doesn't get clipped by object cache
                     selectedObject.set('objectCaching', false); 

                     // Restore cached
                     const width = v.borderWidth ?? (t._borderCachedWidth || borderWidth || 1);
                     const color = v.borderColor ?? (t._borderCachedColor || borderColor || '#000000');
                     const opacity = v.borderOpacity ?? (t._borderCachedOpacity ?? borderOpacity ?? 1);

                     selectedObject.set('stroke', applyAlphaToColor(color, opacity));
                     selectedObject.set('strokeWidth', width);

                     setBorderWidth(width);
                     setBorderColor(color);
                     setBorderOpacity(opacity);
                 } else {
                     // Turning OFF Border.
                     // If Stroke is ON, switch to it check?
                     if (t._strokeEnabled) {
                         setStrokeInside(true);
                         selectedObject.set('paintFirst', 'fill');
                         
                         const sWidth = t._strokeCachedWidth || strokeWidth || 1;
                         const sColor = t._strokeCachedColor || strokeColor || '#000000';
                         const sOpacity = t._strokeCachedOpacity ?? strokeOpacity ?? 1;

                         selectedObject.set('stroke', applyAlphaToColor(sColor, sOpacity));
                         selectedObject.set('strokeWidth', sWidth);

                         setStrokeWidth(sWidth);
                         setStrokeColor(sColor);
                         setStrokeOpacity(sOpacity);
                     } else {
                         // Both OFF
                         selectedObject.set('strokeWidth', 0);
                         selectedObject.set('stroke', null);
                         setBorderWidth(0);
                     }
                 }
                 selectedObject.set('dirty', true);
             }

             // Update Border Properties (Live)
             if (('borderColor' in v || 'borderOpacity' in v) && borderEnabled) {
                 const c = v.borderColor || borderColor;
                 const o = v.borderOpacity !== undefined ? v.borderOpacity : borderOpacity;
                 
                 // eslint-disable-next-line react-hooks/immutability
                 t._borderCachedColor = c;
                  
                 t._borderCachedOpacity = o;
                 setBorderColor(c);
                 setBorderOpacity(o);

                 if (selectedObject.paintFirst === 'stroke') {
                    selectedObject.set('stroke', applyAlphaToColor(c, o));
                 }
             }
             if ('borderWidth' in v && borderEnabled) {
                 t._borderCachedWidth = v.borderWidth;
                 setBorderWidth(v.borderWidth);
                 
                 if (selectedObject.paintFirst === 'stroke') {
                     selectedObject.set('strokeWidth', v.borderWidth);
                     if (v.borderWidth > 0 && !selectedObject.stroke) {
                        selectedObject.set('stroke', applyAlphaToColor(borderColor, borderOpacity));
                     }
                 }
             }
             if ('borderBlur' in v) { /* removed */ }
             if ('borderBlend' in v) setBorderBlend(v.borderBlend);

            // --- SHADOW --- (Unchanged logic mostly, but ensured separate)
             if ('shadowEnabled' in v) {
                if (v.shadowEnabled) {
                    setShadowEnabled(true);
                    const color = v.shadowColor || shadowColor;
                    const blur = v.shadowBlur !== undefined ? v.shadowBlur : shadowBlur;
                    const opacity = v.shadowOpacity !== undefined ? v.shadowOpacity : shadowOpacity;
                    const offX = v.shadowOffsetX !== undefined ? v.shadowOffsetX : shadowOffsetX;
                    const offY = v.shadowOffsetY !== undefined ? v.shadowOffsetY : shadowOffsetY;
                    
                    const shadow = new fabric.Shadow({
                        color: applyAlphaToColor(color, opacity),
                        blur: blur,
                        offsetX: offX,
                        offsetY: offY
                    });
                    selectedObject.set('shadow', shadow);
                } else {
                    setShadowEnabled(false);
                    selectedObject.set('shadow', null);
                }
                selectedObject.set('dirty', true);
             }
             
             if ('shadowColor' in v || 'shadowBlur' in v || 'shadowOpacity' in v || 'shadowOffsetX' in v || 'shadowOffsetY' in v) {
                    if (selectedObject.shadow) {
                        const s = selectedObject.shadow as fabric.Shadow;
                        const c = v.shadowColor || shadowColor;
                        const o = v.shadowOpacity !== undefined ? v.shadowOpacity : shadowOpacity;
                        
                         if ('shadowColor' in v) setShadowColor(c);
                         if ('shadowOpacity' in v) setShadowOpacity(o);
                         if ('shadowBlur' in v) { 
                             // eslint-disable-next-line react-hooks/immutability
                             s.blur = v.shadowBlur || 0; 
                             setShadowBlur(v.shadowBlur); 
                         }
                         if ('shadowOffsetX' in v) { 
                              
                             s.offsetX = v.shadowOffsetX || 0; 
                             setShadowOffsetX(v.shadowOffsetX); 
                         }
                         if ('shadowOffsetY' in v) { 
                              
                             s.offsetY = v.shadowOffsetY || 0; 
                             setShadowOffsetY(v.shadowOffsetY); 
                         }
                         
                         // eslint-disable-next-line react-hooks/immutability
                         s.color = applyAlphaToColor(c, o);
                         selectedObject.set('dirty', true);
                    }
             }

             if ('shadowBlend' in v) {
                setShadowBlend(v.shadowBlend);
                // Store blend on object for persistence, even if standard render doesn't support it yet
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (selectedObject as any).shadowBlend = v.shadowBlend; 
                selectedObject.set('dirty', true);
             }
        }

        if (prop === 'toggleTextEffect' || prop === 'updateTextEffectConfig') {
             if (selectedObject.type !== 'text' && selectedObject.type !== 'i-text') return;
             
             let newActive = [...activeTextEffects];
             let newConfigs = { ...textEffectConfigs };

             if (prop === 'toggleTextEffect') {
                const { preset, enabled } = value as { preset: string, enabled: boolean };
                if (enabled) {
                    if (!newActive.includes(preset)) newActive.push(preset);
                    
                    // Initialize default config if not present
                    if (!newConfigs[preset]) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        let defaultConfig: any = {};
                        switch (preset) {
                            case 'drop-shadow':
                                defaultConfig = { color: '#000000', blur: 10, opacity: 0.5, offsetX: 6, offsetY: 6 }; break;
                            case 'double-outline':
                                defaultConfig = { strokeColor: '#111827', strokeWidth: 3, shadowColor: '#ffffff', shadowOpacity: 1, shadowOffsetX: 4, shadowOffsetY: 4 }; break;
                            case 'glow':
                                defaultConfig = { color: '#00f5ff', blur: 22, opacity: 0.85 }; break;
                            case 'neon':
                                defaultConfig = { color: '#ff2bd6', intensity: 30, width: 2 }; break;
                            case 'highlight':
                                defaultConfig = { color: '#fde047', opacity: 0.7 }; break;
                            case 'gradient-fill':
                                defaultConfig = { start: '#ff5bd5', end: '#48c6ff', angle: 90 }; break;
                            case 'extrude':
                                defaultConfig = { color: '#0f172a', depth: 8, opacity: 0.8 }; break;
                            case 'bevel':
                                defaultConfig = { highlightColor: '#f8fafc', shadowColor: '#0f172a', width: 2, blur: 6 }; break;
                            case 'sticker':
                                defaultConfig = { borderColor: '#ffffff', borderWidth: 8, shadowBlur: 12 }; break;
                            case 'readability':
                                defaultConfig = { color: '#000000', opacity: 0.5 }; break;
                            case 'texture':
                                defaultConfig = { scale: 1 }; break;
                        }
                        newConfigs[preset] = defaultConfig;
                        setTextEffectConfigs(newConfigs);
                    }
                } else {
                    newActive = newActive.filter(p => p !== preset);
                }
                setActiveTextEffects(newActive);
             } 
             else if (prop === 'updateTextEffectConfig') {
                const castValue = value as Record<string, unknown>;
                const preset = castValue.preset as string;
                const config = castValue.config;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                newConfigs = { ...newConfigs, [preset]: config as any };
                setTextEffectConfigs(newConfigs);
             }

             // Update Object Data
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const target = selectedObject as unknown as { data: Record<string, any> };
             target.data = { 
                 ...(target.data || {}),
                 textEffects: newActive, 
                 effectConfigs: newConfigs 
             };

             
             const applyTextEffects = () => {
                 // 1. Reset base effect properties
                 handlePropChange('shadowStrokeUpdate', {
                     shadowEnabled: false,
                     strokeEnabled: false,
                     borderEnabled: false
                 });
                 selectedObject.set('backgroundColor', '');
                 selectedObject.set('globalCompositeOperation', 'source-over');
                 
                 // 2. Apply each active effect
                 newActive.forEach(preset => {
                     const config = newConfigs[preset] || {};
                     switch (preset) {
                         case 'drop-shadow':
                             handlePropChange('shadowStrokeUpdate', {
                                 shadowEnabled: true,
                                 shadowColor: config.color,
                                 shadowBlur: config.blur,
                                 shadowOpacity: config.opacity,
                                 shadowOffsetX: config.offsetX,
                                 shadowOffsetY: config.offsetY
                             });
                             break;
                         // Outline case removed
                         case 'double-outline':
                             handlePropChange('shadowStrokeUpdate', {
                                 strokeEnabled: true,
                                 strokeColor: config.strokeColor,
                                 strokeWidth: config.strokeWidth,
                                 strokeOpacity: 1,
                                 shadowEnabled: true,
                                 shadowColor: config.shadowColor,
                                 shadowBlur: 0.001,
                                 shadowOpacity: config.shadowOpacity,
                                 shadowOffsetX: config.shadowOffsetX !== undefined ? config.shadowOffsetX : 4,
                                 shadowOffsetY: config.shadowOffsetY !== undefined ? config.shadowOffsetY : 4
                             });
                             break;
                         case 'glow':
                             handlePropChange('shadowStrokeUpdate', {
                                 shadowEnabled: true,
                                 shadowColor: config.color,
                                 shadowBlur: config.blur,
                                 shadowOpacity: config.opacity,
                                 shadowOffsetX: 0,
                                 shadowOffsetY: 0
                             });
                             break;
                         case 'neon':
                             handlePropChange('shadowStrokeUpdate', {
                                 strokeEnabled: true,
                                 strokeColor: config.color,
                                 strokeWidth: config.width,
                                 strokeOpacity: 1,
                                 shadowEnabled: true,
                                 shadowColor: config.color,
                                 shadowBlur: config.intensity,
                                 shadowOpacity: 1,
                                 shadowOffsetX: 0,
                                 shadowOffsetY: 0
                             });
                             break;
                         case 'highlight':
                         case 'readability':
                             selectedObject.set('backgroundColor', applyAlphaToColor(config.color, config.opacity));
                             if (config.blendMode) selectedObject.set('globalCompositeOperation', config.blendMode);
                             break;
                 case 'gradient-fill':
                     handlePropChange('gradient', {
                        type: 'linear',
                        start: config.start,
                        end: config.end,
                        angle: config.angle
                    });
                     break;
                         case 'extrude':
                             handlePropChange('shadowStrokeUpdate', {
                         shadowEnabled: true,
                         shadowColor: config.color,
                         shadowBlur: 0,
                         shadowOpacity: config.opacity,
                         shadowOffsetX: config.depth,
                         shadowOffsetY: config.depth
                     });
                     break;
                         case 'bevel':
                             handlePropChange('shadowStrokeUpdate', {
                         strokeEnabled: true,
                         strokeColor: config.highlightColor, // Using as highlight
                         strokeWidth: config.width/2,
                         strokeOpacity: 0.8,
                         shadowEnabled: true,
                         shadowColor: config.shadowColor,
                         shadowBlur: config.blur,
                         shadowOpacity: 0.5,
                         shadowOffsetX: config.width,
                         shadowOffsetY: config.width
                     });
                     break;
                         case 'sticker':
                             handlePropChange('shadowStrokeUpdate', {
                         borderEnabled: true,
                         borderColor: config.borderColor,
                         borderWidth: config.borderWidth,
                         borderOpacity: 1,
                         shadowEnabled: true,
                         shadowColor: '#000000',
                         shadowBlur: config.shadowBlur,
                         shadowOpacity: 0.35,
                         shadowOffsetX: 4,
                         shadowOffsetY: 4
                     });
                     break;
                 case 'texture':
                     // Texture usually static but could have scale
                     // For now, keep texture static or re-generate if we add controls
                     // eslint-disable-next-line @typescript-eslint/no-explicit-any
                     if (!selectedObject.fill || (selectedObject.fill as any).type !== 'pattern') {
                        // Re-generate texture
                        const patternCanvas = document.createElement('canvas');
                        patternCanvas.width = 64; patternCanvas.height = 64;
                        const ctx = patternCanvas.getContext('2d');
                        if (ctx) {
                            const imageData = ctx.createImageData(64, 64);
                            for (let i = 0; i < imageData.data.length; i += 4) {
                                const v = Math.floor(Math.random() * 255);
                                imageData.data[i] = v;
                                imageData.data[i + 1] = v;
                                imageData.data[i + 2] = v;
                                imageData.data[i + 3] = 50;
                            }
                            ctx.putImageData(imageData, 0, 0);
                        }
                        const pattern = new fabric.Pattern({ source: patternCanvas, repeat: 'repeat' });
                        selectedObject.set('fill', pattern);
                        setIsGradient(false);
                        selectedObject.set('dirty', true);
                     }
                     break;
             }
            });
         };
         applyTextEffects();
         canvas.requestRenderAll();
        }


        
        canvas.requestRenderAll();
        // Force re-render for transform props that don't have their own state
        updateObjects();
    };

    const handleReorder = (activeId: string, overId: string) => {
        if (!canvas) return;

        // Recursive Finder
        const findObj = (id: string, searchSpace: fabric.Object[], parent: fabric.Group | null = null): { obj: fabric.Object, parent: fabric.Group | null, index: number } | null => {
            for (let i = 0; i < searchSpace.length; i++) {
                const o = searchSpace[i];
                if ((o as ExtendedFabricObject).id === id) {
                    return { obj: o, parent, index: i };
                }
                if (o.type === 'group' && !(o as ExtendedFabricObject).isAdjustmentLayer) {
                     const res = findObj(id, (o as fabric.Group).getObjects(), o as fabric.Group);
                     if (res) return res;
                }
            }
            return null;
        };

        const canvasObjs = canvas.getObjects(); 
        const activeRes = findObj(activeId, canvasObjs);
        const overRes = findObj(overId, canvasObjs);
        
        if (!activeRes || !overRes) return;
        
        const { obj: active, parent: activeParent } = activeRes;
        const { obj: over, parent: overParent, index: overIndex } = overRes;

        // Same Parent
        if (activeParent === overParent) {
             if (activeParent) {
                 // Group Reposition
                 activeParent.remove(active);
                 // fabric Group objects stack: 0 (bottom) -> N (top)
                 // Layers View: 0 (top) -> N (bottom) or we map index?
                 // LayersView sends us IDs. 
                 // If we drop Active 'over' Over in the List.
                 // We want Active to be at Over's index (shifting Over down/up).
                 // List Index 0 = Top = Fabric Index N.
                 // This mirroring is confusing.
                 // HOWEVER, SortableContext usually moves based on List Index.
                 // If we assume LayersView displays [N, N-1, ... 0].
                 // If dragging, we get 'over' id.
                 
                 // Simpler: Just move Active to Over's index.
                 // But wait, if we use insertAt(index), previously removed object shifts indices?
                 // Yes. 
                 
                 // Re-find overIndex after removal?
                 const updatedOverIndex = activeParent.getObjects().indexOf(over);
                 activeParent.insertAt(updatedOverIndex >= 0 ? updatedOverIndex : overIndex, active);
                 activeParent.setCoords();
                 activeParent.set('dirty', true);
             } else {
                 // Canvas Reposition
                 const idx = canvasObjs.indexOf(over);
                 canvas.moveObjectTo(active, idx);
             }
        } 
        // Different Parent (Reparenting)
        else {
            // Case 1: Active in Group -> Over in Root (Drag Out)
            if (activeParent && !overParent) {
                 moveObjectToCanvas(active, activeParent, canvas);
                 // Now move to correct index in canvas
                 // canvas.moveObjectTo(active, overIndex); // overIndex is from before insertion?
                 // moveObjectToCanvas adds to end usually (canvas.add).
                 const idx = canvas.getObjects().indexOf(over);
                 canvas.moveObjectTo(active, idx);
            }
            // Case 2: Active in Root -> Over in Group (Drag In - via List Sort)
            else if (!activeParent && overParent) {
                 moveObjectToGroup(active, overParent, canvas);
                 // Move to index inside group
                 const idx = overParent.getObjects().indexOf(over);
                 overParent.remove(active); // Temporarily remove from end
                 overParent.insertAt(idx, active);
                 overParent.setCoords();
                 overParent.set('dirty', true);
            }
            // Case 3: Group A -> Group B
            else if (activeParent && overParent) {
                 moveObjectToCanvas(active, activeParent, canvas); // Intermediate step to Root
                 moveObjectToGroup(active, overParent, canvas);    // Then to new Group
                 
                 const idx = overParent.getObjects().indexOf(over);
                 overParent.remove(active);
                 overParent.insertAt(idx, active);
                 overParent.setCoords();
                 overParent.set('dirty', true);
            }
        }
        
        canvas.requestRenderAll();
        updateObjects();
        applyAdjustmentLayers();
    };
    
    // New: Handle dropping ON a folder
    const handleAddToFolder = (activeId: string, folderId: string) => {
        if (!canvas) return;
        
        // Find objects
        const findObj = (id: string, searchSpace: fabric.Object[], parent: fabric.Group | null = null): { obj: fabric.Object, parent: fabric.Group | null } | null => {
            for (const o of searchSpace) {
                if ((o as ExtendedFabricObject).id === id) return { obj: o, parent };
                if (o.type === 'group' && !(o as ExtendedFabricObject).isAdjustmentLayer) {
                     const res = findObj(id, (o as fabric.Group).getObjects(), o as fabric.Group);
                     if (res) return res;
                }
            }
            return null;
        };

        const canvasObjs = canvas.getObjects();
        const activeRes = findObj(activeId, canvasObjs);
        const folderRes = findObj(folderId, canvasObjs);
        
        if (!activeRes || !folderRes) return;
        if (folderRes.obj.type !== 'group') return;
        
        const active = activeRes.obj;
        const oldParent = activeRes.parent;
        const folder = folderRes.obj as fabric.Group;
        
        if (active === folder) return; // Can't add to self
        
        // Logic similar to reparenting
        if (oldParent) {
             moveObjectToCanvas(active, oldParent, canvas);
        }
        
        moveObjectToGroup(active, folder, canvas);
        // Default: Add to end (top) of folder, which moveObjectToGroup does via addToGroup
        
        canvas.requestRenderAll();
        updateObjects();
        applyAdjustmentLayers();
    };

    const handleRemoveFromFolder = (itemId: string) => {
        if (!canvas) return;

        const findObj = (id: string, searchSpace: fabric.Object[], parent: fabric.Group | null = null): { obj: fabric.Object, parent: fabric.Group | null } | null => {
            for (const o of searchSpace) {
                if ((o as ExtendedFabricObject).id === id) return { obj: o, parent };
                if (o.type === 'group' && !(o as ExtendedFabricObject).isAdjustmentLayer) {
                     const res = findObj(id, (o as fabric.Group).getObjects(), o as fabric.Group);
                     if (res) return res;
                }
            }
            return null;
        };
        
        const canvasObjs = canvas.getObjects();
        const res = findObj(itemId, canvasObjs);
        
        if (res && res.parent) {
             moveObjectToCanvas(res.obj, res.parent, canvas);
             canvas.requestRenderAll();
             updateObjects();
        }
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



        const deleteLayer = (obj: fabric.Object) => {
            if(!canvas) return;
            const artboardRect = (canvas as CanvasWithArtboard).artboardRect;
            if (obj === artboardRect) return;
            if(obj.group) obj.group.remove(obj);
            else canvas.remove(obj);
            canvas.requestRenderAll();
        };

    const handleGroup = () => {
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'activeSelection') return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (active as any).toGroup();
        canvas.requestRenderAll();
        updateObjects();
    };

    const handleUngroup = () => {
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'group') return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (active as any).toActiveSelection();
        canvas.requestRenderAll();
        updateObjects();
    };

    const handleCreateFolder = () => {
        if (!canvas) return;
        const active = canvas.getActiveObject();
        // If selection exists, group it as a folder
        if (active && active.type === 'activeSelection') {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const group = (active as any).toGroup();
             (group as ExtendedFabricObject).name = "Folder";
             canvas.requestRenderAll();
           } else {
               // Create empty folder (visible container)
               // Using invisible rect inside to give it presence? Fabric empty group is fine but hard to select.
               const group = new fabric.Group([]);
               (group as ExtendedFabricObject).name = 'Folder';
               canvas.add(group);
               canvas.centerObject(group); // Just to put it somewhere
           }
        updateObjects();
    };

    const handleCreateMask = async () => {
        if (!canvas) return;
        const active = canvas.getActiveObjects();
        if (active.length !== 2) return;
        
        const sorted = [...active].sort((a,b) => {
             const idxA = canvas.getObjects().indexOf(a);
             const idxB = canvas.getObjects().indexOf(b);
             return idxA - idxB;
        });
        
        const target = sorted[0]; // Bottom
        const mask = sorted[1];   // Top
        
        // 1. Clone mask
        const cloned = await mask.clone();
        
        // 2. Calculate transform to move Mask into Target's local space (Relative)
        // This ensures the mask stays visually in place but attaches to the target.
        const targetMatrix = target.calcTransformMatrix();
        const maskMatrix = mask.calcTransformMatrix();
        const targetInverse = fabric.util.invertTransform(targetMatrix);
        const localMatrix = fabric.util.multiplyTransformMatrices(targetInverse, maskMatrix);

        // Apply local transform to cloned mask
        fabric.util.applyTransformToObject(cloned, localMatrix);

        // 3. Configure as relative mask
        cloned.set({
             absolutePositioned: false 
        });
        
        // 4. Update Target
        target.clipPath = cloned;

        // 5. Cleanup
        canvas.remove(mask);
        canvas.discardActiveObject();
        canvas.setActiveObject(target);
        canvas.requestRenderAll();
        updateObjects();
    };

    const handleCreateClip = async () => {
        if (!canvas) return;
        const active = canvas.getActiveObjects();
        if (active.length !== 2) return;

        // Stacking order: Bottom (lower index) clips Top (higher index)
        const sorted = [...active].sort((a, b) => {
            const idxA = canvas.getObjects().indexOf(a);
            const idxB = canvas.getObjects().indexOf(b);
            return idxA - idxB;
        });

        const mask = sorted[0];   // Bottom acts as mask
        const target = sorted[1]; // Top is clipped

        const cloned = await mask.clone();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cloned as any).absolutePositioned = true;
        cloned.left = mask.left;
        cloned.top = mask.top;
        cloned.angle = mask.angle;
        cloned.scaleX = mask.scaleX;
        cloned.scaleY = mask.scaleY;

        target.clipPath = cloned;
        canvas.discardActiveObject();
        canvas.setActiveObject(target);
        canvas.requestRenderAll();
        updateObjects();
    };

    const handleReleaseMask = () => {
        if (!selectedObject || !canvas) return;
        if (selectedObject.clipPath) {
            selectedObject.clipPath.clone().then((restored) => {
                 const restoredObj = restored as unknown as fabric.Object;
                 const clipWithPosition = selectedObject.clipPath as unknown as { absolutePositioned?: boolean };
                 
                 if (clipWithPosition.absolutePositioned) {
                     // Absolute: restore directly
                     restoredObj.left = selectedObject.clipPath!.left;
                     restoredObj.top = selectedObject.clipPath!.top;
                } else {
                     // Relative: Convert Local -> World
                     const targetMatrix = selectedObject.calcTransformMatrix();
                     // Wait, calcTransformMatrix on a child object might behave differently?
                     // Actually, if it's not on canvas, its matrix is just local properties.
                     // The correct World Matrix for a relative child is: ParentMatrix * ChildLocalMatrix
                     
                     // We need to construct ChildLocalMatrix manually from properties because calcTransformMatrix usually does recursive calculation up to canvas
                     // But clipPath isn't in header hierarchy in the same way.
                     
                     // Safer way:
                     const localMatrix = selectedObject.clipPath!.calcTransformMatrix(); 
                     const worldMatrix = fabric.util.multiplyTransformMatrices(targetMatrix, localMatrix);
                     
                     fabric.util.applyTransformToObject(restoredObj, worldMatrix);
                }
                 
                 canvas.add(restoredObj);
                selectedObject.clipPath = undefined;
                selectedObject.set('dirty', true);
                canvas.requestRenderAll();
                updateObjects();
            });
        }
    };

    const toggleMaskLock = async () => {
        if (!selectedObject || !canvas || !selectedObject.clipPath) return;
        const mask = selectedObject.clipPath;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isAbsolute = !!(mask as any).absolutePositioned;
        
        // We are switching modes. We need to recalculate coordinates to keep visual position constant.
        const targetMatrix = selectedObject.calcTransformMatrix();
        
        if (isAbsolute) {
             // Switching Absolute -> Relative (Locking)
             // Current Mask Matrix (World) need to be converted to Local
             const maskMatrix = mask.calcTransformMatrix(); 
             const targetInverse = fabric.util.invertTransform(targetMatrix);
             const localMatrix = fabric.util.multiplyTransformMatrices(targetInverse, maskMatrix);
             
             fabric.util.applyTransformToObject(mask, localMatrix);
             // eslint-disable-next-line 
             (mask as any).absolutePositioned = false;
        } else {
             // Switching Relative -> Absolute (Unlocking)
             // Current Mask "Matrix" is Local properties.
             const localMatrix = mask.calcTransformMatrix();
             const worldMatrix = fabric.util.multiplyTransformMatrices(targetMatrix, localMatrix);
             
             fabric.util.applyTransformToObject(mask, worldMatrix);
             // eslint-disable-next-line 
             (mask as any).absolutePositioned = true;
        }
        
        selectedObject.set('dirty', true);
        canvas.requestRenderAll();
        // Force update to refresh UI
        updateObjects();
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
                selectedObject={selectedObject}
                onDuplicate={onDuplicate}
                onSelect={(obj, e) => {
                     if (e?.shiftKey) { /* multi */ } 
                     else { 
                         canvas?.discardActiveObject();
                         canvas?.setActiveObject(obj);
                         canvas?.requestRenderAll(); 
                     }
                }}
                onLayerOpacityChange={(value) => {
                    if (!selectedObject) return;
                    handlePropChange('opacity', value);
                }}
                onLayerBlendChange={(value) => {
                    if (!selectedObject) return;
                    handlePropChange('globalCompositeOperation', value);
                }}
                onToggleVisibility={(obj) => { 
                    obj.visible = !obj.visible; 
                    canvas?.requestRenderAll(); 
                    if ((obj as ExtendedFabricObject).isAdjustmentLayer) applyAdjustmentLayers();
                    updateObjects();
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
                onRemoveFromFolder={handleRemoveFromFolder}
                onAddToFolder={handleAddToFolder}
                onGroup={handleGroup}
                onUngroup={handleUngroup}
                onCreateFolder={handleCreateFolder}
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

    if (!selectedObject && selectedIds.size === 0) {
         return (
             <div className="h-full bg-card overflow-y-auto">
                 <CanvasSettingsPanel 
                     width={canvasWidth}
                     height={canvasHeight}
                     backgroundColor={canvasColor}
                     onResize={(w, h) => {
                          if (!canvas) return;
                          const ext = canvas as CanvasWithArtboard;
                          if (ext.artboardRect) { 
                              ext.artboardRect.set({ width: w, height: h });
                              ext.artboardRect.setCoords();
                              // Update local state immediately to reflect in inputs
                              setCanvasWidth(w);
                              setCanvasHeight(h);
                              // Trigger canvas updates
                              canvas.requestRenderAll();
                              canvas.fire('object:modified', { target: ext.artboardRect });
                          }
                     }}
                     onColorChange={(c) => {
                          if (!canvas) return;
                          const ext = canvas as CanvasWithArtboard;
                          if (ext.artboardRect) {
                              ext.artboardRect.set('fill', c);
                              canvas.requestRenderAll();
                              setCanvasColor(c);
                          }
                     }}
                 />
             </div>
         );
    }

    void opacity; void adjustmentSettings;

    return (
        <SelectionProperties 
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
             onGroup={handleGroup}
             onUngroup={handleUngroup}
             onCreateMask={handleCreateMask}
                onCreateClip={handleCreateClip}
             onReleaseMask={handleReleaseMask}
             onToggleMaskLock={toggleMaskLock}
             updateAdjustment={updateAdjustment}
             textState={{ font: fontFamily, weight: fontWeight, curve: curveStrength, center: curveCenter }}
             activeTextEffects={activeTextEffects}
             textEffectConfigs={textEffectConfigs}
             effectState={{ 
                 filters: { 
                     blur: blurValue, brightness: brightnessValue, contrast: contrastValue,
                     noise: noiseValue, saturation: saturationValue, vibrance: vibranceValue, pixelate: pixelateValue 
                 },
                 stroke: { 
                    color: strokeColor, width: strokeWidth, opacity: strokeOpacity, inside: strokeInside 
                 },
                 shadow: { 
                    enabled: shadowEnabled, color: shadowColor, blur: shadowBlur, offsetX: shadowOffsetX, offsetY: shadowOffsetY, opacity: shadowOpacity 
                 },
                 skew: { x: skewX, y: skewY, z: skewZ, dir: taperDirection }
             }}
             // Need to pass extended state that SelectionProperties expects for new component
             shadowStrokeState={{
                strokeEnabled: strokeEnabled,
                strokeColor, strokeWidth, strokeOpacity, strokeBlend,
                borderEnabled: borderEnabled,
                borderColor, borderWidth, borderOpacity, borderBlend,
                shadowEnabled, shadowColor, shadowBlur, shadowOpacity, shadowOffsetX, shadowOffsetY, shadowBlend
             }}
             onMake3D={onMake3D}
        />
    );
}
