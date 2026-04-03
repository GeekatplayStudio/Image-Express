'use client';
import { MouseEvent as ReactMouseEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as fabric from 'fabric';
import { GripVertical, Link2, Link2Off } from 'lucide-react';
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
    BrightnessContrastSettings,
    ColorBalanceSettings,
    LightAndColorSettings,
    SolidColorSettings,
    FabricBaseFilter, 
    PenNode,
} from '@/types';

// Extracted Components
import { LayersView } from './properties/LayersView';
import { SelectionProperties } from './properties/SelectionProperties';
import { CanvasSettingsPanel } from './properties/CanvasSettingsPanel';
import { useGradientControls } from '@/hooks/useGradientControls';
import type { RasterBlendMode, RasterBrushPreset } from '@/lib/raster-engine';

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
    parseColorWithAlpha as extractColorFromStyle,
    getAdjustmentLabel,
    getDefaultAdjustmentSettings,
    moveObjectToGroup,
    moveObjectToCanvas
} from '@/lib/fabric-utils';

import { CurvesFilter } from '@/lib/fabric-filters';

import { PenModeSetting, extractScenePenPoints, PEN_DEFAULT_FILL, PEN_DEFAULT_STROKE, buildSmoothPathData, extractSceneBezierNodes, buildBezierPathData, buildAutoBezierNodes } from '@/lib/pen-utils';
import { PanelMode, PanelModeRail } from './properties/PanelModeRail';
import {
    HistoryPanelView,
    ColorPanelView,
    SwatchesPanelView,
    BrushesPanelView,
    AdjustmentsPanelView,
    NavigatorPanelView,
    InfoPanelView,
    ColorPanelMode,
    NavigatorSceneRect,
} from './properties/PanelUtilityViews';
import { ChannelsPanelView } from './properties/ChannelsPanelView';
import {
    applyChannelStateToColor,
    buildChannelFilterState,
    createChannelColorMatrixFilter,
    createDefaultChannelFilterState,
    isDefaultChannelFilterState,
    normalizeChannelFilterState,
    readChannelFilterState,
    setChannelValueInColor,
    setChannelAdjustmentSettings,
    setChannelBaseFilters,
    setChannelObjectState,
    stripChannelFilters,
    type ChannelControlState,
    type ChannelFilterState,
    type EditableChannelTarget,
} from './properties/channelEditing';
import {
    buildMaskGradientFill,
    mergeMaskGradientSettings,
    readMaskGradientSettings,
} from './properties/maskGradientUtils';
import { buildNavigatorPreviewDataUrl } from './properties/navigatorPreview';
import { cn } from '@/lib/utils';

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

type ArtboardRectWithBackground = fabric.Rect & {
    canvasBackgroundColor?: string;
    canvasBackgroundEnabled?: boolean;
};

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number; left: number; top: number };
    artboardRect?: ArtboardRectWithBackground;
    centerArtboard?: () => void;
    hostContainer?: HTMLDivElement;
    workspaceBackground?: string;
    setWorkspaceBackground?: (color: string) => void;
    getWorkspaceBackground?: () => string;
};

interface PropertiesPanelProps {
    canvas: fabric.Canvas | null;
    activeTool: string;
    panelMode?: PanelMode;
    enablePanelRailHoverLabels?: boolean;
    onPanelModeChange?: (mode: PanelMode) => void;
    onLayerDblClick?: (obj?: fabric.Object) => void;
    onMake3D?: (imageUrl: string) => void;
    onDuplicate?: () => void;
    onAssetSelect?: (url: string, type: string, name?: string) => void;
    historyState?: { undo: number; redo: number };
    onUndo?: () => void;
    onRedo?: () => void;
    zoom?: number;
    brushOptions?: {
        brushPreset: RasterBrushPreset;
        size: number;
        hardness: number;
        opacity: number;
        flow: number;
        smoothing: number;
        blendMode: RasterBlendMode;
    };
    onBrushPresetChange?: (preset: RasterBrushPreset) => void;
    onBrushSizeChange?: (size: number) => void;
    onBrushHardnessChange?: (hardness: number) => void;
    onBrushOpacityChange?: (opacity: number) => void;
    onBrushFlowChange?: (flow: number) => void;
    onBrushSmoothingChange?: (smoothing: number) => void;
    onBrushBlendModeChange?: (mode: RasterBlendMode) => void;
    onActivatePaintTool?: () => void;
}

const PANEL_MODE_STORAGE_KEY = 'image-express-properties-panel-mode';
const PANEL_MODE_VALUES: PanelMode[] = [
    'layers',
    'properties',
    'history',
    'color',
    'swatches',
    'brushes',
    'channels',
    'adjustments',
    'navigator',
    'info',
];

export default function PropertiesPanel({
    canvas,
    activeTool,
    panelMode: controlledPanelMode,
    enablePanelRailHoverLabels = true,
    onPanelModeChange,
    onLayerDblClick,
    onMake3D,
    onDuplicate,
    historyState,
    onUndo,
    onRedo,
    zoom = 1,
    brushOptions,
    onBrushPresetChange,
    onBrushSizeChange,
    onBrushHardnessChange,
    onBrushOpacityChange,
    onBrushFlowChange,
    onBrushSmoothingChange,
    onBrushBlendModeChange,
    onActivatePaintTool,
}: PropertiesPanelProps) {
    const [selectedObject, setSelectedObject] = useState<ExtendedFabricObject | null>(() => {
        if (!canvas) return null;
        const active = canvas.getActiveObjects();
        return (active.length === 1 ? active[0] as ExtendedFabricObject : null);
    });

    useEffect(() => {
        if (canvas) {
            const active = canvas.getActiveObjects();
            if (active.length === 1) {
                // If we mount with a selection already, sync it
                setSelectedObject(active[0] as ExtendedFabricObject);
            }
        }
    }, [canvas, activeTool]);

    const [objects, setObjects] = useState<fabric.Object[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [uncontrolledPanelMode, setUncontrolledPanelMode] = useState<PanelMode>('properties');
    const panelMode = controlledPanelMode ?? uncontrolledPanelMode;
    const setPanelMode = useCallback((mode: PanelMode) => {
        if (onPanelModeChange) {
            onPanelModeChange(mode);
        }
        if (controlledPanelMode === undefined) {
            setUncontrolledPanelMode(mode);
        }
    }, [controlledPanelMode, onPanelModeChange]);
    const [colorPanelMode, setColorPanelMode] = useState<ColorPanelMode>('RGB');

    useEffect(() => {
        if (controlledPanelMode !== undefined) return;
        if (typeof window === 'undefined') return;
        const persisted = window.localStorage.getItem(PANEL_MODE_STORAGE_KEY);
        if (persisted && PANEL_MODE_VALUES.includes(persisted as PanelMode)) {
            setPanelMode(persisted as PanelMode);
        }
    }, [controlledPanelMode, setPanelMode]);

    useEffect(() => {
        if (controlledPanelMode !== undefined) return;
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, panelMode);
    }, [controlledPanelMode, panelMode]);

    useEffect(() => {
        if (activeTool === 'paint' && panelMode === 'properties') {
            setPanelMode('brushes');
        }
    }, [activeTool, panelMode, setPanelMode]);

    const panelRailHostRef = useRef<HTMLDivElement | null>(null);
    const railDragOffsetRef = useRef<{ x: number; y: number } | null>(null);
    const [isRailDetached, setIsRailDetached] = useState(false);
    const [isRailDragging, setIsRailDragging] = useState(false);
    const [detachedRailPosition, setDetachedRailPosition] = useState({ x: 8, y: 8 });
    const [isClient, setIsClient] = useState(false);
    const [dockedRailAnchor, setDockedRailAnchor] = useState<{ left: number; top: number } | null>(null);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const updateDockedRailAnchor = useCallback(() => {
        const host = panelRailHostRef.current;
        if (!host) {
            setDockedRailAnchor(null);
            return;
        }
        const rect = host.getBoundingClientRect();
        setDockedRailAnchor({
            left: Math.max(8, rect.left - 52),
            top: Math.max(8, rect.top + 8),
        });
    }, []);

    useEffect(() => {
        updateDockedRailAnchor();
        const host = panelRailHostRef.current;
        if (!host) return;

        const resizeObserver = new ResizeObserver(() => {
            updateDockedRailAnchor();
        });
        resizeObserver.observe(host);

        const handleWindowChange = () => updateDockedRailAnchor();
        window.addEventListener('resize', handleWindowChange);
        window.addEventListener('scroll', handleWindowChange, true);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', handleWindowChange);
            window.removeEventListener('scroll', handleWindowChange, true);
        };
    }, [updateDockedRailAnchor]);

    const dockRail = useCallback(() => {
        setIsRailDetached(false);
        setIsRailDragging(false);
        railDragOffsetRef.current = null;
        setDetachedRailPosition({ x: 8, y: 8 });
    }, []);

    const handleDetachRail = useCallback(() => {
        if (isRailDetached) {
            dockRail();
            return;
        }
        setIsRailDetached(true);
    }, [dockRail, isRailDetached]);

    const handleRailDragStart = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
        if (!isRailDetached) return;
        const host = panelRailHostRef.current;
        if (!host) return;

        const hostRect = host.getBoundingClientRect();
        railDragOffsetRef.current = {
            x: event.clientX - hostRect.left - detachedRailPosition.x,
            y: event.clientY - hostRect.top - detachedRailPosition.y,
        };
        setIsRailDragging(true);
        event.preventDefault();
        event.stopPropagation();
    }, [detachedRailPosition.x, detachedRailPosition.y, isRailDetached]);

    useEffect(() => {
        if (!isRailDragging) return;

        const handleMouseMove = (event: MouseEvent) => {
            const host = panelRailHostRef.current;
            const dragOffset = railDragOffsetRef.current;
            if (!host || !dragOffset) return;

            const hostRect = host.getBoundingClientRect();
            const railWidth = enablePanelRailHoverLabels ? 176 : 44;
            const railHeight = 360;

            let nextX = event.clientX - hostRect.left - dragOffset.x;
            let nextY = event.clientY - hostRect.top - dragOffset.y;

            nextX = Math.max(8, Math.min(nextX, Math.max(8, hostRect.width - railWidth - 8)));
            nextY = Math.max(8, Math.min(nextY, Math.max(8, hostRect.height - railHeight - 8)));

            if (nextX <= 24) {
                nextX = 8;
            }

            setDetachedRailPosition({ x: nextX, y: nextY });
        };

        const handleMouseUp = () => {
            setIsRailDragging(false);
            railDragOffsetRef.current = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [enablePanelRailHoverLabels, isRailDragging]);

    const withPanelRail = (content: ReactNode) => (
        <div
            ref={panelRailHostRef}
            className="h-full relative"
        >
            {isRailDetached && (
                <div
                    className={cn('absolute z-20', isRailDragging ? 'cursor-grabbing' : 'cursor-grab')}
                    style={{ left: detachedRailPosition.x, top: detachedRailPosition.y }}
                >
                    <div className="mb-1 flex w-10 flex-col gap-1 rounded-md border border-border/60 bg-card/90 p-1 backdrop-blur-sm">
                        <button
                            type="button"
                            onClick={handleDetachRail}
                            className="h-6 w-full inline-flex items-center justify-center rounded text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            title="Dock rail to panel"
                            aria-label="Dock rail to panel"
                        >
                            <Link2 size={13} />
                        </button>
                        <button
                            type="button"
                            onMouseDown={handleRailDragStart}
                            className="h-6 w-full inline-flex items-center justify-center rounded text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            title="Drag rail"
                            aria-label="Drag rail"
                        >
                            <GripVertical size={13} />
                        </button>
                    </div>
                    <PanelModeRail
                        mode={panelMode}
                        onModeChange={setPanelMode}
                        showHoverLabels={enablePanelRailHoverLabels}
                        expandDirection="right"
                        className="absolute top-16 left-0"
                    />
                </div>
            )}
            {content}
            {isClient && !isRailDetached && dockedRailAnchor && createPortal(
                <div
                    className="fixed z-[140]"
                    style={{ left: dockedRailAnchor.left, top: dockedRailAnchor.top }}
                >
                    <div className="mb-1 flex w-10 flex-col gap-1 rounded-md border border-border/60 bg-card/90 p-1 backdrop-blur-sm">
                        <button
                            type="button"
                            onClick={handleDetachRail}
                            className="h-6 w-full inline-flex items-center justify-center rounded text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            title="Detach rail"
                            aria-label="Detach rail"
                        >
                            <Link2Off size={13} />
                        </button>
                    </div>
                    <PanelModeRail
                        mode={panelMode}
                        onModeChange={setPanelMode}
                        showHoverLabels={enablePanelRailHoverLabels}
                        expandDirection="left"
                        className="absolute top-8 right-0"
                    />
                </div>,
                document.body
            )}
        </div>
    );

    // Canvas Settings
    const [canvasWidth, setCanvasWidth] = useState(1080);
    const [canvasHeight, setCanvasHeight] = useState(1080);
    const [canvasColor, setCanvasColor] = useState('#ffffff');
    const [canvasBackgroundEnabled, setCanvasBackgroundEnabled] = useState(true);
    const [navigatorWorld, setNavigatorWorld] = useState<NavigatorSceneRect>({ left: 0, top: 0, width: 1080, height: 1080 });
    const [navigatorViewport, setNavigatorViewport] = useState<NavigatorSceneRect>({ left: 0, top: 0, width: 1080, height: 1080 });
    const [navigatorObjects, setNavigatorObjects] = useState<NavigatorSceneRect[]>([]);
    const [navigatorBackground, setNavigatorBackground] = useState('#ffffff');
    const [navigatorPreviewDataUrl, setNavigatorPreviewDataUrl] = useState<string | null>(null);
    const navigatorWorldRef = useRef<NavigatorSceneRect>({ left: 0, top: 0, width: 1080, height: 1080 });

    // Selection Props
    const [color, setColor] = useState('#000000');
    // Note: We use isGradient from types typically, but here we track if fill is gradient object
    const [isGradient, setIsGradient] = useState(false); 
    // const [useGradient, setIsGradient] = useState(false); // Removed duplicate

    const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
    const [gradientStart, setGradientStart] = useState('#000000');
    const [gradientEnd, setGradientEnd] = useState('#ffffff');
    const [gradientAngle, setGradientAngle] = useState(0);
    const [gradientCoords, setGradientCoords] = useState({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });

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

    // Gradient Handles

    useGradientControls(canvas, selectedObject, isGradient, setGradientCoords, setGradientAngle);



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
    const [curveSpan, setCurveSpan] = useState(180);


    const [fontFamily, setFontFamily] = useState('Arial');
    const [fontWeight, setFontWeight] = useState('normal');
    const [textContent, setTextContent] = useState('');
    const [textSpellcheck, setTextSpellcheck] = useState(true);

    const [adjustmentSettings, setAdjustmentSettings] = useState<AdjustmentLayerSettings | null>(null);

    const isTextObject = (obj: fabric.Object | null | undefined): obj is fabric.IText => {
        if (!obj) return false;
        return obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox';
    };

    const isPathCandidate = (obj: fabric.Object | null | undefined) => {
        if (!obj) return false;
        if (!['path', 'polyline', 'polygon'].includes(obj.type || '')) return false;
        const ext = obj as ExtendedFabricObject;
        return !!ext.isPenPath || !!ext.penMode || (typeof ext.name === 'string' && ext.name.toLowerCase().includes('vector'));
    };

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
             const storedColor = typeof rect.canvasBackgroundColor === 'string'
                 ? normalizeColorValue(rect.canvasBackgroundColor) || rect.canvasBackgroundColor
                 : null;
             const fillInfo = typeof rect.fill === 'string' ? extractColorFromStyle(rect.fill) : null;
             const fillColor = fillInfo && fillInfo.alpha > 0 ? normalizeColorValue(fillInfo.color) || fillInfo.color : null;
             const nextColor = storedColor || fillColor || '#ffffff';
             const nextEnabled = typeof rect.canvasBackgroundEnabled === 'boolean'
                 ? rect.canvasBackgroundEnabled
                 : Boolean(fillColor);

             const setRectMeta = rect as unknown as { set: (key: string, value: unknown) => void };
             setRectMeta.set('canvasBackgroundColor', nextColor);
             setRectMeta.set('canvasBackgroundEnabled', nextEnabled);
             setCanvasColor(nextColor);
             setCanvasBackgroundEnabled(nextEnabled);
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
        setCanvasBackgroundEnabled(true);
    }, [canvas]);

    const normalizeNavigatorRect = useCallback((rect: NavigatorSceneRect): NavigatorSceneRect => {
        const width = Number.isFinite(rect.width) ? Math.max(1, rect.width) : 1;
        const height = Number.isFinite(rect.height) ? Math.max(1, rect.height) : 1;
        const left = Number.isFinite(rect.left) ? rect.left : 0;
        const top = Number.isFinite(rect.top) ? rect.top : 0;
        return { left, top, width, height };
    }, []);

    const getObjectSceneRect = useCallback((obj: fabric.Object | null | undefined): NavigatorSceneRect | null => {
        if (!obj) return null;
        if (typeof obj.getCoords === 'function') {
            const coords = obj.getCoords();
            if (Array.isArray(coords) && coords.length > 0) {
                const xs = coords.map((point) => point.x).filter((value) => Number.isFinite(value));
                const ys = coords.map((point) => point.y).filter((value) => Number.isFinite(value));
                if (xs.length > 0 && ys.length > 0) {
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);
                    if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)) {
                        return normalizeNavigatorRect({
                            left: minX,
                            top: minY,
                            width: maxX - minX,
                            height: maxY - minY,
                        });
                    }
                }
            }
        }

        if (typeof obj.getBoundingRect === 'function') {
            const bounds = obj.getBoundingRect();
            if (
                Number.isFinite(bounds.left)
                && Number.isFinite(bounds.top)
                && Number.isFinite(bounds.width)
                && Number.isFinite(bounds.height)
            ) {
                return normalizeNavigatorRect({
                    left: bounds.left,
                    top: bounds.top,
                    width: bounds.width,
                    height: bounds.height,
                });
            }
        }

        return null;
    }, [normalizeNavigatorRect]);

    const getNavigatorWorldBounds = useCallback((): NavigatorSceneRect => {
        if (!canvas) {
            return { left: 0, top: 0, width: Math.max(1, canvasWidth), height: Math.max(1, canvasHeight) };
        }

        const extendedCanvas = canvas as CanvasWithArtboard;
        if (extendedCanvas.artboard) {
            return normalizeNavigatorRect({
                left: extendedCanvas.artboard.left,
                top: extendedCanvas.artboard.top,
                width: extendedCanvas.artboard.width,
                height: extendedCanvas.artboard.height,
            });
        }

        if (extendedCanvas.artboardRect) {
            const artboardRect = getObjectSceneRect(extendedCanvas.artboardRect);
            if (artboardRect) {
                return artboardRect;
            }
        }

        return { left: 0, top: 0, width: Math.max(1, canvasWidth), height: Math.max(1, canvasHeight) };
    }, [canvas, canvasWidth, canvasHeight, getObjectSceneRect, normalizeNavigatorRect]);

    const getNavigatorObjectRects = useCallback((world: NavigatorSceneRect) => {
        if (!canvas) return [];
        const extendedCanvas = canvas as CanvasWithArtboard;
        const items = canvas.getObjects()
            .filter((obj) => obj !== extendedCanvas.artboardRect && obj.visible !== false)
            .map((obj) => getObjectSceneRect(obj))
            .filter((rect): rect is NavigatorSceneRect => !!rect)
            .map((rect) => {
                const right = Math.min(world.left + world.width, rect.left + rect.width);
                const bottom = Math.min(world.top + world.height, rect.top + rect.height);
                const left = Math.max(world.left, rect.left);
                const top = Math.max(world.top, rect.top);
                const width = right - left;
                const height = bottom - top;
                if (width <= 0 || height <= 0) return null;
                return { left, top, width, height };
            })
            .filter((rect): rect is NavigatorSceneRect => !!rect);
        return items.slice(0, 200);
    }, [canvas, getObjectSceneRect]);

    const syncNavigatorStatic = useCallback(() => {
        if (!canvas) {
            setNavigatorPreviewDataUrl(null);
            return;
        }
        const nextWorld = getNavigatorWorldBounds();
        navigatorWorldRef.current = nextWorld;
        setNavigatorWorld(nextWorld);
        setNavigatorObjects(getNavigatorObjectRects(nextWorld));

        const extendedCanvas = canvas as CanvasWithArtboard;
        const artboardColor = extendedCanvas.artboardRect && typeof extendedCanvas.artboardRect.canvasBackgroundColor === 'string'
            ? normalizeColorValue(extendedCanvas.artboardRect.canvasBackgroundColor) || extendedCanvas.artboardRect.canvasBackgroundColor
            : null;
        const nextBackground = artboardColor || canvasColor || '#ffffff';
        setNavigatorBackground(nextBackground);
        setNavigatorPreviewDataUrl(buildNavigatorPreviewDataUrl({
            canvas,
            world: nextWorld,
            backgroundColor: nextBackground,
        }));
    }, [canvas, canvasColor, getNavigatorObjectRects, getNavigatorWorldBounds]);

    const syncNavigatorViewport = useCallback(() => {
        if (!canvas) return;
        const world = navigatorWorldRef.current;
        const zoomValue = Math.max(0.0001, canvas.getZoom() || 1);
        const viewport = canvas.viewportTransform || [zoomValue, 0, 0, zoomValue, 0, 0];
        const visibleWidth = (canvas.width || canvas.getWidth() || 1) / zoomValue;
        const visibleHeight = (canvas.height || canvas.getHeight() || 1) / zoomValue;
        const sceneLeft = (-viewport[4]) / zoomValue;
        const sceneTop = (-viewport[5]) / zoomValue;
        const nextViewport = normalizeNavigatorRect({
            left: Math.max(world.left, Math.min(sceneLeft, world.left + world.width - visibleWidth)),
            top: Math.max(world.top, Math.min(sceneTop, world.top + world.height - visibleHeight)),
            width: Math.min(world.width, visibleWidth),
            height: Math.min(world.height, visibleHeight),
        });
        setNavigatorViewport(nextViewport);
    }, [canvas, normalizeNavigatorRect]);

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

            if (type === 'brightness-contrast') {
                const bc = settings as BrightnessContrastSettings;
                return [
                    new fabric.filters.Brightness({ brightness: (bc.brightness || 0) * clampedIntensity }) as unknown as FabricBaseFilter,
                    new fabric.filters.Contrast({ contrast: (bc.contrast || 0) * clampedIntensity }) as unknown as FabricBaseFilter
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

            if (type === 'color-balance') {
                const balance = settings as ColorBalanceSettings;
                const red = Math.max(-1, Math.min(1, balance.red || 0)) * 0.35 * clampedIntensity;
                const green = Math.max(-1, Math.min(1, balance.green || 0)) * 0.35 * clampedIntensity;
                const blue = Math.max(-1, Math.min(1, balance.blue || 0)) * 0.35 * clampedIntensity;
                const matrix = [
                    1, 0, 0, 0, red,
                    0, 1, 0, 0, green,
                    0, 0, 1, 0, blue,
                    0, 0, 0, 1, 0,
                ];
                return [
                    new fabric.filters.ColorMatrix({ matrix }) as unknown as FabricBaseFilter
                ];
            }

            if (type === 'light-and-color') {
                const lac = settings as LightAndColorSettings;
                const filters: FabricBaseFilter[] = [];
                const temperature = Math.max(-1, Math.min(1, lac.temperature || 0)) * 0.2 * clampedIntensity;
                const tint = Math.max(-1, Math.min(1, lac.tint || 0)) * 0.2 * clampedIntensity;
                const matrix = [
                    1, 0, 0, 0, temperature,
                    0, 1, 0, 0, tint,
                    0, 0, 1, 0, -temperature,
                    0, 0, 0, 1, 0,
                ];
                if (Math.abs(temperature) > 0.001 || Math.abs(tint) > 0.001) {
                    filters.push(new fabric.filters.ColorMatrix({ matrix }) as unknown as FabricBaseFilter);
                }

                if (Math.abs(lac.exposure || 0) > 0.001) {
                    filters.push(new fabric.filters.Brightness({ brightness: (lac.exposure || 0) * clampedIntensity }) as unknown as FabricBaseFilter);
                }
                if (Math.abs(lac.saturation || 0) > 0.001) {
                    filters.push(new fabric.filters.Saturation({ saturation: (lac.saturation || 0) * clampedIntensity }) as unknown as FabricBaseFilter);
                }
                const VibranceFilter = filtersRegistry.Vibrance;
                if (VibranceFilter && Math.abs(lac.vibrance || 0) > 0.001) {
                    filters.push(new VibranceFilter({ vibrance: (lac.vibrance || 0) * clampedIntensity }) as unknown as FabricBaseFilter);
                }
                return filters;
            }

            if (type === 'solid-color') {
                const solid = settings as SolidColorSettings;
                const BlendColorFilter = filtersRegistry.BlendColor;
                if (!BlendColorFilter) return [];
                const alpha = Math.max(0, Math.min(1, solid.opacity ?? 0.5));
                return [
                    new BlendColorFilter({
                        color: solid.color || '#ff8800',
                        mode: solid.mode || 'tint',
                        alpha: alpha * clampedIntensity,
                    }) as unknown as FabricBaseFilter
                ];
            }

            return [];
        };

        const defaultFilterBackend = fabric.getFilterBackend();
        const canvas2dFilterBackend = new fabric.Canvas2dFilterBackend();

        // New Logic: Top-Down "Stack Consumption" to correctly handle clipping blockers
        // We accumulate filters as we traverse from Top to Bottom
        const globalFilters: FabricBaseFilter[] = [];
        let currentClipStack: FabricBaseFilter[] = [];

        // Iterate from Top (last object) to Bottom (first object)
        for (let i = objs.length - 1; i >= 0; i--) {
            const obj = objs[i];
            const ext = obj as ExtendedFabricObject;

            // 1. Skip helpers/selection overlays
            if (obj.type === 'selection' || obj.type === 'activeSelection' || !obj.visible && !ext.isAdjustmentLayer) {
                 // Note: We skip invisible visual layers, but invisible adjustment layers just don't contribute
                 // If an invisible visual layer is here, it should probably block clipping? 
                 // If we skip it here, we "see through" it to the layer below.
                 // The user requested rigorous blocking. 
                 // If I hide a layer, does the clip pass through? Usually yes if the layer is gone.
                 // But let's stick to the visible stack logic.
                 if (ext.isAdjustmentLayer) {
                     // handled below
                 } else if (obj.visible === false) {
                    // Invisible visual layer -> Treat as non-existent for clipping flow
                     continue; 
                 } else if (obj.type === 'selection' || obj.type === 'activeSelection') {
                     continue;
                 }
            }

            // 2. Is it an Adjustment Layer?
            if (ext.isAdjustmentLayer && ext.adjustmentType && ext.adjustmentSettings) {
                if (obj.visible === false) {
                     // Hidden adjustment layer -> contributes nothing
                     continue;
                }

                const opacity = typeof obj.opacity === 'number' ? obj.opacity : 1;
                const newFilters = buildFiltersForAdjustment(ext.adjustmentType, ext.adjustmentSettings, opacity);

                if (ext.clipped) {
                     // Add to Current Clip Stack
                     // Since we are going Top -> Bottom, the new filter (Top) should be applied AFTER inner filters (Bottom)
                     // BUT, fabric applies array [0, 1, 2] in order.
                     // Filter 0 acts on Image. Filter 1 acts on result of 0.
                     // So Bottom Most Filter should be 0.
                     // Since we visit Top first, we are seeing the LAST applied filter first.
                     // So we should APPEND (Push) to a stack that we will eventually REVERSE?
                     // Or, just construct the final array correctly.
                     
                     // If we have [A, B] (B over A).
                     // We visit B. ClipStack = [B].
                     // Visit A. ClipStack = [A, B]? No. Adjustments stack on each other.
                     // If B is Top. B is applied LAST.
                     // So final array should be [...Old, ...New].
                     // Wait. B is "On Top" visually.
                     // Image -> Filter A -> Filter B.
                     // So B is last in list.
                     // We visit B first.
                     // currentClipStack = [B].
                     // Next is A. currentClipStack = [A, B] ?? 
                     // No. currentClipStack is ACCUMULATING filters to apply to the NEXT VISUAL LAYER.
                     // If we have Adj B (Top), Adj A (Below B).
                     // They both apply to Image (Bottom).
                     // Image should get [A, B].
                     // We visit B. stack = [B].
                     // We visit A. stack = [A, B]. (Unshift).
                     currentClipStack.unshift(...newFilters);
                } else {
                     // Global
                     // Same logic. Global B, Global A. Image gets [A, B].
                     globalFilters.unshift(...newFilters);
                }
                continue;
            }

            // 3. Visual Layer (Image/Group/etc)
            // It CONSUMES the Clip Stack.
            
            // Check if supported target (Image)
            if (obj.type === 'image') {
                 const image = obj as fabric.Image;
                 const imageExt = image as ExtendedFabricObject; // Re-cast to be sure
                 // Init Base Filters if needed
                 if (!imageExt.baseFilters) {
                     const existing = image.filters || [];
                     imageExt.baseFilters = existing.filter((f) => !adjustmentFilterTypes.has(f.type));
                 }
                 
                 // Apply: Base + Global + LocalClipped
                 // Note: Global filters usually apply AFTER local clipped filters? 
                 // Or do they apply generally?
                 // In PS: Global Adj Layer acts on everything below.
                 // Local Clipped Adj Layer acts on Specific Layer.
                 // So Local Clipped is tightly bound. Global is "Above".
                 // So Global should be LAST in the pipeline (Index High).
                 // Pipeline: Image -> Base -> Clipped -> Global.
                 const combinedFilters = [...imageExt.baseFilters, ...currentClipStack, ...globalFilters];
                 
                 image.filters = combinedFilters;

                 // Backend Swap Logic (Curves)
                 if (typeof image.applyFilters === 'function') {
                    const needsCanvas2d = combinedFilters.some((filter) => filter.type === 'Curves');
                    const shouldSwapBackend = needsCanvas2d && !(defaultFilterBackend instanceof fabric.Canvas2dFilterBackend);
                    if (shouldSwapBackend) {
                        fabric.setFilterBackend(canvas2dFilterBackend);
                    }
                    image.applyFilters();
                    if (shouldSwapBackend) {
                        fabric.setFilterBackend(defaultFilterBackend);
                    }
                 }
            } else if (obj.type === 'group') {
                // Group logic - consumes stack but doesn't render filters by default
                // TODO: Support filters on groups if possible
            } else {
                // Texts, etc
            }
            
            // Visual layer acts as a stopper for the clip stack
            // All "pending" clipped layers have found their target.
            currentClipStack = [];
        }

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

    useEffect(() => {
        if (!canvas || panelMode !== 'navigator') return;

        const syncAll = () => {
            syncNavigatorStatic();
            syncNavigatorViewport();
        };
        const syncViewportOnly = () => {
            syncNavigatorViewport();
        };

        syncAll();

        canvas.on('object:added', syncAll);
        canvas.on('object:removed', syncAll);
        canvas.on('object:modified', syncAll);
        canvas.on('path:created', syncAll);
        canvas.on('after:render', syncViewportOnly);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (canvas as any).on('artboard:resize', syncAll);

        return () => {
            canvas.off('object:added', syncAll);
            canvas.off('object:removed', syncAll);
            canvas.off('object:modified', syncAll);
            canvas.off('path:created', syncAll);
            canvas.off('after:render', syncViewportOnly);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (canvas as any).off('artboard:resize', syncAll);
        };
    }, [canvas, panelMode, syncNavigatorStatic, syncNavigatorViewport]);




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
            try {
            const active = canvas.getActiveObjects() || [];
            if (active.length === 1) {
                // Single object selected
                const target = active[0] as ExtendedFabricObject;
                setSelectedObject(target);
                setAdjustmentSettings(target.adjustmentSettings || null);
                
                // Content Fill Sync
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
                    if (grad.type === 'linear' && grad.coords) {
                        const coords = { x1: grad.coords.x1 ?? 0, y1: grad.coords.y1 ?? 0.5, x2: grad.coords.x2 ?? 1, y2: grad.coords.y2 ?? 0.5 };
                        setGradientCoords(coords);
                        const dx = coords.x2 - coords.x1;
                        const dy = coords.y2 - coords.y1;
                        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
                        setGradientAngle(Math.round(angle));
                    } else {
                        setGradientCoords({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
                        setGradientAngle(0);
                    }
                } else {
                    setColor(typeof target.fill === 'string' ? target.fill : '#000000');
                    setIsGradient(false);
                }
                setOpacity(target.opacity || 1);
                
                // Stroke/Border Sync
                const sColor = extractColorFromStyle(typeof target.stroke === 'string' ? target.stroke : undefined);
                const isBorderMode = target.paintFirst === 'stroke'; 
                const currentWidth = target.strokeWidth || 0;
                
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const custom = target as any as CustomObjectState;
                let sEnabled = custom._strokeEnabled;
                let bEnabled = custom._borderEnabled;
                const hasVisibleStroke = !!target.stroke && target.stroke !== 'transparent';
                if (sEnabled === undefined) sEnabled = (currentWidth > 0 && !isBorderMode && hasVisibleStroke);
                if (bEnabled === undefined) bEnabled = (currentWidth > 0 && isBorderMode && hasVisibleStroke);

                setStrokeEnabled(!!sEnabled);
                setBorderEnabled(!!bEnabled);
                
                if (isBorderMode) {
                     setBorderWidth(currentWidth);
                     setBorderColor(sColor.color || '#000000');
                     setBorderOpacity(sColor.alpha ?? 1); 
                     setStrokeWidth(custom._strokeCachedWidth || 0); 
                } else {
                     setStrokeWidth(currentWidth);
                     setStrokeColor(sColor.color || '#000000');
                     setStrokeOpacity(sColor.alpha ?? 1); 
                     setBorderWidth(custom._borderCachedWidth || 0);
                }

                // Shadow
                const shadow = target.shadow as fabric.Shadow; 
                if (shadow) {
                    setShadowEnabled(true);
                    setShadowColor(shadow.color || '#000000');
                    setShadowBlur(shadow.blur || 0);
                    setShadowOffsetX(shadow.offsetX || 0);
                    setShadowOffsetY(shadow.offsetY || 0);
                } else {
                    setShadowEnabled(false);
                }

                // Transform
                setSkewX(target.skewX || 0);
                setSkewY(target.skewY || 0);
                setSkewZ(target.skewZ || 0);
                setTaperDirection(target.taperDirection || 0);

                // Text
                if (target.type === 'text' || target.type === 'i-text' || target.type === 'textbox') {
                    const t = target as fabric.IText;
                    setTextContent(t.text || '');
                    setFontFamily(t.fontFamily || 'Arial');
                    setFontWeight((t.fontWeight as string) || 'normal');
                    setCurveStrength(target.curveStrength || 0);
                    setCurveCenter(target.curveCenter || 0);
                    setCurveSpan(target.curveSpan || 180);
                    setTextSpellcheck(target.textSpellcheck !== false);
                    
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const d = (target as any).data || {};
                    if (d.textEffects) {
                        setActiveTextEffects(d.textEffects);
                        setTextEffectConfigs(d.effectConfigs || {});
                    } else {
                        setActiveTextEffects([]);
                        setTextEffectConfigs({});
                    }
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
                // No selection or multiple
                setSelectedObject(null);
            }
            
            setSelectedIds(new Set(active.map(o => ensureObjectId(o))));
            } catch (e) {
                console.warn('Property Panel Selection Sync Error:', e);
            }
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
             setSelectedObject(rect as ExtendedFabricObject);
             setSelectedIds(new Set([ensureObjectId(rect)]));
             setAdjustmentSettings(ext.adjustmentSettings ?? null);
             setPanelMode('properties');
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
    }, [canvas, updateObjects, applyAdjustmentLayers, activeTool, setPanelMode]);


    // --- Helper Functions ---
    const applyTaper = (skewZVal: number, taperVal: number) => {
        if (!selectedObject) return;
        const ext = selectedObject as ExtendedFabricObject;
        const intensity = Math.min(Math.abs(skewZVal), 100) / 100;
        const dirRaw = Math.max(-100, Math.min(100, taperVal)) / 100;
        const dirSign = dirRaw === 0 ? (skewZVal >= 0 ? 1 : -1) : Math.sign(dirRaw);
        const dirMagnitude = dirRaw === 0 ? 1 : Math.abs(dirRaw);
        const currentCenter = selectedObject.getCenterPoint();

        const hasBase =
            ext.skewZBaseScaleX !== undefined ||
            ext.skewZBaseScaleY !== undefined ||
            ext.skewZBaseSkewX !== undefined ||
            ext.skewZBaseSkewY !== undefined;

        if (!hasBase) {
            selectedObject.set({
                skewZBaseScaleX: selectedObject.scaleX ?? 1,
                skewZBaseScaleY: selectedObject.scaleY ?? 1,
                skewZBaseSkewX: selectedObject.skewX ?? 0,
                skewZBaseSkewY: selectedObject.skewY ?? 0
            });
        }

        if (intensity === 0) {
            selectedObject.set({
                scaleX: ext.skewZBaseScaleX ?? selectedObject.scaleX ?? 1,
                scaleY: ext.skewZBaseScaleY ?? selectedObject.scaleY ?? 1,
                skewX: ext.skewZBaseSkewX ?? selectedObject.skewX ?? 0,
                skewY: ext.skewZBaseSkewY ?? selectedObject.skewY ?? 0
            });
            selectedObject.set({
                skewZBaseScaleX: undefined,
                skewZBaseScaleY: undefined,
                skewZBaseSkewX: undefined,
                skewZBaseSkewY: undefined,
                skewZ: skewZVal,
                taperDirection: taperVal
            });
            selectedObject.setPositionByOrigin(currentCenter, 'center', 'center');
            selectedObject.setCoords();
            selectedObject.set('dirty', true);
            canvas?.requestRenderAll();
            return;
        }

        const baseScaleX = ext.skewZBaseScaleX ?? selectedObject.scaleX ?? 1;
        const baseScaleY = ext.skewZBaseScaleY ?? selectedObject.scaleY ?? 1;
        const baseSkewX = ext.skewZBaseSkewX ?? selectedObject.skewX ?? 0;
        const baseSkewY = ext.skewZBaseSkewY ?? selectedObject.skewY ?? 0;
        const maxSkew = 35;
        const skewX = baseSkewX + (dirSign * dirMagnitude * intensity * maxSkew);
        const skewY = baseSkewY + (dirSign * intensity * 6);
        const scaleX = baseScaleX * (1 - (intensity * 0.2));

        selectedObject.set({
            skewX,
            skewY,
            scaleX,
            scaleY: baseScaleY,
            skewZ: skewZVal,
            taperDirection: taperVal
        });
        selectedObject.setPositionByOrigin(currentCenter, 'center', 'center');
        selectedObject.setCoords();
        selectedObject.set('dirty', true);
        canvas?.requestRenderAll();
    };

    const applyPseudoBacksidePreset = (preset: 'front' | 'back') => {
        if (!selectedObject) return;

        const ext = selectedObject as ExtendedFabricObject;
        const currentCenter = selectedObject.getCenterPoint();
        const baseFlipX = typeof ext.backsideBaseFlipX === 'boolean'
            ? ext.backsideBaseFlipX
            : Boolean(selectedObject.flipX);

        if (typeof ext.backsideBaseFlipX !== 'boolean') {
            selectedObject.set('backsideBaseFlipX', baseFlipX);
        }

        if (preset === 'front') {
            selectedObject.set({
                flipX: baseFlipX,
                pseudoBacksidePreset: 'front',
            });
            setSkewZ(0);
            setTaperDirection(0);
            applyTaper(0, 0);
        } else {
            selectedObject.set({
                flipX: !baseFlipX,
                pseudoBacksidePreset: preset,
            });
            setSkewZ(0);
            setTaperDirection(0);
            applyTaper(0, 0);
        }

        selectedObject.setPositionByOrigin(currentCenter, 'center', 'center');
        selectedObject.setCoords();
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

    const handleCreateAdjustmentLayer = (type: AdjustmentLayerType) => {
        if (!canvas) return;
        (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('adjustment:create', { type });
    };

    const handleAdjustmentTypeChange = (type: AdjustmentLayerType) => {
        if (!selectedObject || !canvas) return;
        const target = selectedObject as ExtendedFabricObject;
        if (!target.isAdjustmentLayer) return;

        // eslint-disable-next-line react-hooks/immutability
        target.adjustmentType = type;
        target.adjustmentSettings = getDefaultAdjustmentSettings(type);
        target.name = getAdjustmentLabel(type);
        setAdjustmentSettings(target.adjustmentSettings);
        target.set('dirty', true);

        applyAdjustmentLayers();
        canvas.requestRenderAll();
        updateObjects();
    };

    const createTextPathFromObject = useCallback(async (source: fabric.Object): Promise<fabric.Path | null> => {
        if (source.type === 'path') {
            const cloned = await source.clone();
            if (cloned.type !== 'path') return null;
            const pathClone = cloned as fabric.Path;
            pathClone.set({ visible: false, evented: false, selectable: false });
            return pathClone;
        }

        const sourcePoints = extractScenePenPoints(source as ExtendedFabricObject);
        if (!sourcePoints || sourcePoints.length < 2) return null;

        const isClosed = source.type === 'polygon' || !!(source as ExtendedFabricObject).penClosed;
        const pathData = sourcePoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
        const finalPathData = isClosed ? `${pathData} Z` : pathData;
        const path = new fabric.Path(finalPathData, { visible: false, evented: false, selectable: false });
        return path;
    }, []);

    const applyTextPathRenderSafety = useCallback((textObj: fabric.IText) => {
        const nextPadding = Math.max(20, textObj.padding || 0);
        textObj.set('padding', nextPadding);
        textObj.set('objectCaching', false);
        textObj.set('dirty', true);
    }, []);

    const clearTextPathRenderSafetyIfUnused = useCallback((textObj: fabric.IText) => {
        const activeEffects = ((textObj as unknown as { data?: { textEffects?: string[] } }).data?.textEffects) || [];
        const hasEffects = Array.isArray(activeEffects) && activeEffects.length > 0;
        const hasPath = !!(textObj as unknown as { path?: fabric.Path | null }).path;
        if (!hasEffects && !hasPath) {
            textObj.set('padding', 0);
        }
        textObj.set('dirty', true);
    }, []);

    const alignTextToPathObject = useCallback(async (textObj: fabric.IText, sourcePathObj: fabric.Object) => {
        if (!canvas) return false;

        const pathForText = await createTextPathFromObject(sourcePathObj);
        if (!pathForText) return false;

        const currentCenter = textObj.getCenterPoint();
        textObj.set('path', pathForText);
        if (typeof textObj.pathStartOffset !== 'number') {
            textObj.set('pathStartOffset', 0);
        }
        applyTextPathRenderSafety(textObj);

        textObj.set('textPathSourceId', ensureObjectId(sourcePathObj));
        const extText = textObj as ExtendedFabricObject;
        extText.curveStrength = 0;
        extText.curveCenter = 0;
        extText.curveSpan = 180;

        textObj.setPositionByOrigin(currentCenter, 'center', 'center');
        textObj.setCoords();
        textObj.set('dirty', true);

        setCurveStrength(0);
        setCurveCenter(0);
        setCurveSpan(180);
        canvas.requestRenderAll();
        updateObjects();
        return true;
    }, [applyTextPathRenderSafety, canvas, createTextPathFromObject, updateObjects]);


    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlePropChange = (prop: string, value: any) => {
        if (!selectedObject || !canvas) return;
        const shouldEmitObjectModified = true;

        if (prop === 'penPathUpdate') {
            const updates = value as { mode?: PenModeSetting; closed?: boolean };
            const oldObject = selectedObject as ExtendedFabricObject;
            const currentMode = (oldObject.penMode || 'straight') as PenModeSetting;
            const nextMode = updates.mode || currentMode;
            const nextClosed = typeof updates.closed === 'boolean' ? updates.closed : !!oldObject.penClosed;

            const scenePoints = extractScenePenPoints(oldObject);
            const minPoints = nextClosed ? 3 : 2;
            if (scenePoints.length < minPoints) return;

            const styleProps: Partial<fabric.FabricObjectProps> = {
                fill: nextClosed ? (oldObject.fill || PEN_DEFAULT_FILL) : 'transparent',
                stroke: oldObject.stroke || PEN_DEFAULT_STROKE,
                strokeWidth: oldObject.strokeWidth ?? 2,
                objectCaching: false,
                opacity: oldObject.opacity,
                globalCompositeOperation: oldObject.globalCompositeOperation,
                shadow: oldObject.shadow || null,
                strokeDashArray: oldObject.strokeDashArray,
                strokeLineCap: oldObject.strokeLineCap,
                strokeLineJoin: oldObject.strokeLineJoin,
                strokeMiterLimit: oldObject.strokeMiterLimit,
                paintFirst: oldObject.paintFirst
            };

            let replacement: fabric.Object;
            let replacementNodes: PenNode[] | undefined;

            if (nextMode === 'straight') {
                if (nextClosed) {
                    replacement = new fabric.Polygon(scenePoints, styleProps);
                } else {
                    replacement = new fabric.Polyline(scenePoints, {
                        ...styleProps,
                        fill: 'transparent'
                    });
                }
            } else if (nextMode === 'smooth') {
                const pathData = buildSmoothPathData(scenePoints, nextClosed);
                replacement = new fabric.Path(pathData, styleProps);
            } else {
                replacementNodes = extractSceneBezierNodes(oldObject, nextClosed);
                if (replacementNodes.length < 2) {
                    replacementNodes = buildAutoBezierNodes(scenePoints, nextClosed);
                }
                const pathData = buildBezierPathData(replacementNodes, nextClosed);
                replacement = new fabric.Path(pathData, styleProps);
            }

            const replacementExt = replacement as ExtendedFabricObject;
            if (oldObject.id) replacementExt.id = oldObject.id;
            ensureObjectId(replacement);
            replacementExt.name = oldObject.name || (nextClosed ? 'Vector Shape' : 'Vector Path');
            replacementExt.layerTagColor = oldObject.layerTagColor;
            replacementExt.locked = oldObject.locked;
            replacementExt.penMode = nextMode;
            replacementExt.penClosed = nextClosed;
            replacementExt.isPenPath = nextMode === 'bezier';
            replacementExt.penSourcePoints = scenePoints.map((point) => ({ ...point }));
            replacementExt.penNodes = nextMode === 'bezier' ? replacementNodes : undefined;

            if (oldObject.clipPath) {
                replacement.clipPath = oldObject.clipPath;
            }

            const oldIndex = canvas.getObjects().indexOf(oldObject);
            canvas.remove(oldObject);
            canvas.add(replacement);
            if (oldIndex >= 0) {
                canvas.moveObjectTo(replacement, oldIndex);
            }

            if (replacementExt.locked) {
                replacement.set({
                    lockMovementX: true,
                    lockMovementY: true,
                    lockRotation: true,
                    lockScalingX: true,
                    lockScalingY: true,
                    selectable: false,
                    evented: false
                });
            }

            canvas.setActiveObject(replacement);
            if (nextMode === 'bezier') {
                // Ensure custom bezier controls are attached by listeners that hook selection events.
                (canvas as unknown as { fire: (name: string, data?: unknown) => void }).fire('selection:updated', {
                    selected: [replacement]
                });
            }
            canvas.requestRenderAll();
            setSelectedObject(replacementExt);
            updateObjects();
            applyAdjustmentLayers();
            return;
        }

        if (prop === 'attachTextToPath') {
            if (!isTextObject(selectedObject)) return;
            const pathId = typeof value === 'string' ? value : value?.pathId;
            if (!pathId) return;
            const sourcePathObj = canvas.getObjects().find((obj) => ensureObjectId(obj) === pathId);
            if (!sourcePathObj || !isPathCandidate(sourcePathObj)) return;

            void alignTextToPathObject(selectedObject as fabric.IText, sourcePathObj);
            return;
        }

        if (prop === 'detachTextPath') {
            if (!isTextObject(selectedObject)) return;
            selectedObject.set('path', null);
            selectedObject.set('pathStartOffset', 0);
            selectedObject.set('textPathSourceId', undefined);
            clearTextPathRenderSafetyIfUnused(selectedObject as fabric.IText);
            setCurveStrength(0);
            setCurveCenter(0);
            setCurveSpan(180);
            canvas.requestRenderAll();
            canvas.fire('object:modified', { target: selectedObject });
            updateObjects();
            return;
        }

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
             const { start, end, angle, type, coords: incomingCoords } = value as {
                 start: string;
                 end: string;
                 angle: number;
                 type: 'linear' | 'radial';
                 coords?: { x1: number; y1: number; x2: number; y2: number };
             };
             setIsGradient(true);
             setGradientStart(start);
             setGradientEnd(end);
             setGradientType(type);

             let coords: Record<string, number> = {};
             
             if (type === 'linear') {
                if (incomingCoords) {
                    coords = { ...incomingCoords };
                    setGradientCoords(incomingCoords);
                    const dx = (incomingCoords.x2 ?? 1) - (incomingCoords.x1 ?? 0);
                    const dy = (incomingCoords.y2 ?? 0.5) - (incomingCoords.y1 ?? 0.5);
                    const computedAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
                    setGradientAngle(Math.round(computedAngle));
                } else {
                    const rad = (angle || 0) * (Math.PI / 180);
                    coords = {
                        x1: 0.5 - (Math.cos(rad) * 0.5),
                        y1: 0.5 - (Math.sin(rad) * 0.5),
                        x2: 0.5 + (Math.cos(rad) * 0.5),
                        y2: 0.5 + (Math.sin(rad) * 0.5)
                    };
                    setGradientCoords({ x1: coords.x1, y1: coords.y1, x2: coords.x2, y2: coords.y2 });
                    setGradientAngle(angle);
                }
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

        if (prop === 'maskGradient') {
            const mask = selectedObject.clipPath;
            if (!mask) {
                return;
            }

            const nextMaskGradient = mergeMaskGradientSettings(
                readMaskGradientSettings(mask as fabric.Object),
                value as Partial<ReturnType<typeof readMaskGradientSettings>>,
            );

            mask.set({
                fill: buildMaskGradientFill(nextMaskGradient),
                stroke: undefined,
                dirty: true,
            });
            selectedObject.set('dirty', true);

            if ((selectedObject as ExtendedFabricObject).isAdjustmentLayer) {
                applyAdjustmentLayers();
            }

            canvas.requestRenderAll();
            updateObjects();
            canvas.fire('object:modified', { target: selectedObject });
            return;
        }

        if (prop === 'opacity') {
            selectedObject.set('opacity', value);
            setOpacity(value);
        }

         if (prop === 'skewX') setSkewX(value);
         if (prop === 'skewY') setSkewY(value);
         if ((prop === 'skewX' || prop === 'skewY' || prop === 'scaleX' || prop === 'scaleY') && (skewZ !== 0 || taperDirection !== 0)) {
             if (prop === 'skewX') selectedObject.set('skewZBaseSkewX', value);
             if (prop === 'skewY') selectedObject.set('skewZBaseSkewY', value);
             if (prop === 'scaleX') selectedObject.set('skewZBaseScaleX', value);
             if (prop === 'scaleY') selectedObject.set('skewZBaseScaleY', value);
             applyTaper(skewZ, taperDirection);
         }
        
        if (prop === 'fontFamily') {
            (selectedObject as fabric.IText).set('fontFamily', value);
            setFontFamily(String(value));
        }
        if (prop === 'fontWeight') {
            (selectedObject as fabric.IText).set('fontWeight', value);
            setFontWeight(String(value));
        }
        if (prop === 'textSpellcheck') {
            const enabled = Boolean(value);
            const textObj = selectedObject as fabric.IText & { hiddenTextarea?: HTMLTextAreaElement } & ExtendedFabricObject;
            textObj.set('textSpellcheck', enabled);
            setTextSpellcheck(enabled);
            textObj.set('dirty', true);
        }
        if (prop === 'textContent') {
            const textObj = selectedObject as fabric.IText;
            const nextText = typeof value === 'string' ? value : String(value ?? '');
            textObj.set('text', nextText);
            setTextContent(nextText);
            textObj.set('dirty', true);
            canvas.requestRenderAll();
            return;
        }
        
        if (prop === 'curve') {
             const { strength, center, span } = value as { strength: number; center?: number; span?: number };
             const extended = selectedObject as ExtendedFabricObject;
             const nextCenter = center ?? 0;
             const nextSpan = Math.max(15, Math.min(359, Math.round(span ?? curveSpan ?? 180)));
               const normalizedStrength = Math.max(0, Math.min(1, Math.abs(strength) / 100));
             extended.set({ curveStrength: strength, curveCenter: nextCenter, curveSpan: nextSpan, textPathSourceId: undefined });
             setCurveStrength(strength);
             setCurveCenter(nextCenter);
             setCurveSpan(nextSpan);
             
             if (strength === 0) {
                 selectedObject.set('path', null);
                 (selectedObject as fabric.IText).set('pathStartOffset', 0);
                 clearTextPathRenderSafetyIfUnused(selectedObject as fabric.IText);
             } else {
                 const textObj = selectedObject as fabric.IText;
                 const baseWidth = typeof textObj.calcTextWidth === 'function'
                     ? textObj.calcTextWidth()
                     : (textObj.width ?? 0);
                 const textWidth = Math.max(baseWidth || 0, 1);
                 const angle = (Math.max(15, Math.min(359, nextSpan)) * Math.PI) / 180;
                 // Add a generous length buffer at stronger curves to keep text from wrapping on itself or clipping end characters.
                 // Glyphs on curve edges often need more room.
                 const fontSize = typeof textObj.fontSize === 'number' ? textObj.fontSize : 16;
                 const padding = Math.max(24, fontSize * 1.5, textWidth * 0.25); 
                 const arcLength = textWidth + padding;
                 const startX = -(arcLength / 2);
                 const endX = arcLength / 2;
                 const baseRadius = arcLength / angle;
                 const maxSagitta = Math.max(fontSize * 0.35, baseRadius * (1 - Math.cos(angle / 2)));
                 const easedStrength = Math.pow(normalizedStrength, 1.4);
                 const curveDepth = maxSagitta * easedStrength;
                 const direction = strength >= 0 ? -1 : 1;
                 const controlY = direction * curveDepth;
                 const originX = (selectedObject.originX ?? 'center') as 'left' | 'center' | 'right';
                 const originY = (selectedObject.originY ?? 'center') as 'top' | 'center' | 'bottom';
                 const anchorPoint = selectedObject.getPointByOrigin(originX, originY);

                 const pathData = `M ${startX} 0 Q 0 ${controlY} ${endX} 0`;

                 const path = new fabric.Path(pathData);
                 path.set({ visible: false });
                 selectedObject.set('path', path);
                 applyTextPathRenderSafety(textObj);
                 const pathLength = Math.max(1, arcLength);
                 const slack = Math.max(0, pathLength - textWidth);
                 const align = (textObj.textAlign || 'left').toLowerCase();
                 let baseOffset = 0;
                 if (align.includes('left')) baseOffset = slack / 2;
                 else if (align.includes('right')) baseOffset = -(slack / 2);
                 const centerShift = (nextCenter / 100) * (pathLength * 0.5);
                 textObj.set('pathStartOffset', baseOffset + centerShift);
                 selectedObject.setPositionByOrigin(anchorPoint, originX, originY);
                 selectedObject.setCoords();
             }
        }

           if (prop === 'pseudoBacksidePreset') {
               applyPseudoBacksidePreset(value as 'front' | 'back');
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
             if (selectedObject.type !== 'text' && selectedObject.type !== 'i-text' && selectedObject.type !== 'textbox') return;
             
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
                                 strokeColor: config.highlightColor, 
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
                             if (!selectedObject.fill || (selectedObject.fill as fabric.Pattern).type !== 'pattern') {
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

                 // Fix clipping for text with effects or paths by adding padding
                 if (newActive.length > 0 || (selectedObject as fabric.Path).path) {
                    if ((selectedObject.padding || 0) < 20) {
                        selectedObject.set('padding', 20);
                        // Also adjust dirty flag to ensure bounding box redraw
                        selectedObject.set('dirty', true); 
                    }
                 } else {
                     // Reset padding if no effects/path
                     selectedObject.set('padding', 0);
                 }
            };
         applyTextEffects();
         canvas.requestRenderAll();
        }


        
        canvas.requestRenderAll();
        if (shouldEmitObjectModified) {
            canvas.fire('object:modified', { target: selectedObject });
        }
        // Force re-render for transform props that don't have their own state
        updateObjects();
    };

    const getLayerOrderState = useCallback((target: fabric.Object | null) => {
        if (!canvas || !target) {
            return {
                canMoveUp: false,
                canMoveDown: false,
                canBringToFront: false,
                canSendToBack: false,
            };
        }

        const ext = target as ExtendedFabricObject;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (
            target.type === 'activeSelection'
            || target.type === 'selection'
            || ext.isRetouchLayer
            || ext.name === 'Artboard'
            || (canvasWithArtboard.artboardRect && target === canvasWithArtboard.artboardRect)
        ) {
            return {
                canMoveUp: false,
                canMoveDown: false,
                canBringToFront: false,
                canSendToBack: false,
            };
        }

        if (target.group && typeof target.group.getObjects === 'function') {
            const siblings = target.group.getObjects();
            const currentIndex = siblings.indexOf(target);
            const maxIndex = siblings.length - 1;
            const canMoveUp = currentIndex >= 0 && currentIndex < maxIndex;
            const canMoveDown = currentIndex > 0;
            return {
                canMoveUp,
                canMoveDown,
                canBringToFront: canMoveUp,
                canSendToBack: canMoveDown,
            };
        }

        const objects = canvas.getObjects();
        const currentIndex = objects.indexOf(target);
        if (currentIndex < 0) {
            return {
                canMoveUp: false,
                canMoveDown: false,
                canBringToFront: false,
                canSendToBack: false,
            };
        }
        const artboardIndex = canvasWithArtboard.artboardRect ? objects.indexOf(canvasWithArtboard.artboardRect) : -1;
        const minIndex = artboardIndex >= 0 ? artboardIndex + 1 : 0;
        const maxIndex = objects.length - 1;
        const canMoveUp = currentIndex < maxIndex;
        const canMoveDown = currentIndex > minIndex;
        return {
            canMoveUp,
            canMoveDown,
            canBringToFront: canMoveUp,
            canSendToBack: canMoveDown,
        };
    }, [canvas]);

    const handleLayerOrderAction = useCallback((action: 'move-up' | 'move-down' | 'to-front' | 'to-back', targetOverride?: fabric.Object | null) => {
        if (!canvas) return;
        const target = targetOverride || selectedObject;
        if (!target) return;
        const ext = target as ExtendedFabricObject;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (
            target.type === 'activeSelection'
            || target.type === 'selection'
            || ext.isRetouchLayer
            || ext.name === 'Artboard'
            || (canvasWithArtboard.artboardRect && target === canvasWithArtboard.artboardRect)
        ) {
            return;
        }

        let moved = false;
        if (target.group && typeof target.group.getObjects === 'function') {
            const parent = target.group as fabric.Group;
            const siblings = parent.getObjects();
            const currentIndex = siblings.indexOf(target);
            if (currentIndex < 0) return;
            const maxIndex = siblings.length - 1;
            let nextIndex = currentIndex;
            if (action === 'move-up') nextIndex = Math.min(maxIndex, currentIndex + 1);
            if (action === 'move-down') nextIndex = Math.max(0, currentIndex - 1);
            if (action === 'to-front') nextIndex = maxIndex;
            if (action === 'to-back') nextIndex = 0;
            if (nextIndex !== currentIndex) {
                parent.remove(target);
                parent.insertAt(nextIndex, target);
                parent.setCoords();
                parent.set('dirty', true);
                moved = true;
            }
        } else {
            const objects = canvas.getObjects();
            const currentIndex = objects.indexOf(target);
            if (currentIndex < 0) return;
            const artboardIndex = canvasWithArtboard.artboardRect ? objects.indexOf(canvasWithArtboard.artboardRect) : -1;
            const minIndex = artboardIndex >= 0 ? artboardIndex + 1 : 0;
            const maxIndex = objects.length - 1;
            let nextIndex = currentIndex;
            if (action === 'move-up') nextIndex = Math.min(maxIndex, currentIndex + 1);
            if (action === 'move-down') nextIndex = Math.max(minIndex, currentIndex - 1);
            if (action === 'to-front') nextIndex = maxIndex;
            if (action === 'to-back') nextIndex = minIndex;
            if (nextIndex !== currentIndex) {
                canvas.moveObjectTo(target, nextIndex);
                moved = true;
            }
        }

        if (!moved) return;
        target.setCoords();
        if (target.group) target.group.set('dirty', true);
        canvas.setActiveObject(target);
        canvas.fire('object:modified', { target });
        canvas.requestRenderAll();
        updateObjects();
        applyAdjustmentLayers();
    }, [canvas, selectedObject, updateObjects, applyAdjustmentLayers]);

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
        
        // Smart Masking Logic
        // Heuristic: Shape usually masks Image.
        const isShape = (o: fabric.Object) => 
            ['rect', 'circle', 'triangle', 'polygon', 'path', 'ellipse'].includes(o.type);
        const isImage = (o: fabric.Object) => 
            ['image', 'group'].includes(o.type);

        const objA = active[0];
        const objB = active[1];
        
        let mask: fabric.Object | null = null;
        let target: fabric.Object | null = null;

        // 1. Identify Mask vs Target
        if (isShape(objA) && isImage(objB)) {
            mask = objA; target = objB;
        } else if (isShape(objB) && isImage(objA)) {
            mask = objB; target = objA;
        } else {
             // 2. Fallback: Top masks Bottom (Standard)
             // We need Z-index order
             const idxA = canvas.getObjects().indexOf(objA);
             const idxB = canvas.getObjects().indexOf(objB);
             
             if (idxA > idxB) {
                 mask = objA; target = objB; // Top is Mask
             } else {
                 mask = objB; target = objA;
             }
        }
        
        if (!mask || !target) return;

        // Clone mask
        const cloned = await mask.clone();
        
        // Convert Mask World Transform -> Target Local Transform
        // This ensures the mask stays visually in place relative to the target, and moves with it.
        const targetMatrix = target.calcTransformMatrix();
        const maskMatrix = mask.calcTransformMatrix();
        const targetInverse = fabric.util.invertTransform(targetMatrix);
        const localMatrix = fabric.util.multiplyTransformMatrices(targetInverse, maskMatrix);

        // Apply local transform to cloned mask
        fabric.util.applyTransformToObject(cloned, localMatrix);

        // Configure as relative mask
        cloned.set({
             absolutePositioned: false 
        });
        
        // Apply
        target.clipPath = cloned;

        // Handle Adjustment Layers special case
        if ((target as ExtendedFabricObject).isAdjustmentLayer) {
            (target as ExtendedFabricObject).clipped = true;
            applyAdjustmentLayers();
        }

        // Cleanup
        canvas.remove(mask);
        canvas.discardActiveObject();
        canvas.setActiveObject(target);
        canvas.requestRenderAll();
        updateObjects();
    };

    const handleTextOnPath = async () => {
        if (!canvas) return;
        const active = canvas.getActiveObjects();
        if (active.length !== 2) return;
        
        const textObj = active.find((obj) => isTextObject(obj)) as fabric.IText | undefined;
        const pathObj = active.find((obj) => isPathCandidate(obj));
        
        if (!textObj || !pathObj) return;
        const attached = await alignTextToPathObject(textObj, pathObj);
        if (!attached) return;
        
        canvas.discardActiveObject();
        canvas.setActiveObject(textObj);
        canvas.requestRenderAll();
        updateObjects();
    };

    const handleReleaseMask = () => {
        if (!selectedObject || !canvas) return;
        if (selectedObject.clipPath) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            selectedObject.clipPath.clone().then((restored: any) => {
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
                
                if ((selectedObject as ExtendedFabricObject).isAdjustmentLayer) {
                    (selectedObject as ExtendedFabricObject).clipped = false;
                    applyAdjustmentLayers();
                }

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

    const selectedExt = selectedObject as ExtendedFabricObject | null;
    const hasEditableFillTarget = !!selectedObject
        && selectedIds.size <= 1
        && selectedObject.type !== 'image'
        && selectedObject.type !== 'group'
        && !selectedExt?.isAdjustmentLayer;
    const selectedAdjustmentType = selectedExt?.isAdjustmentLayer ? selectedExt.adjustmentType ?? null : null;
    const selectedSolidColorSettings = selectedExt?.isAdjustmentLayer && selectedAdjustmentType === 'solid-color'
        ? (selectedExt.adjustmentSettings as SolidColorSettings | undefined) ?? null
        : null;
    const selectedFillStyle = typeof selectedObject?.fill === 'string' ? selectedObject.fill : null;
    const selectedOpacityValue = typeof selectedObject?.opacity === 'number' ? selectedObject.opacity : 1;
    const channelSupportedTarget = selectedObject?.type === 'image'
        ? 'image'
        : (selectedSolidColorSettings || selectedFillStyle ? 'color' : 'none');
    const channelCurrentColor = selectedSolidColorSettings?.color ?? selectedFillStyle ?? '#000000';
    const channelCurrentOpacity = selectedSolidColorSettings?.opacity ?? selectedOpacityValue;
    const channelPreviewSource = (() => {
        if (selectedObject?.type === 'image') {
            const image = selectedObject as fabric.Image;
            const element = typeof image.getElement === 'function' ? image.getElement() : null;
            if (element instanceof HTMLCanvasElement || element instanceof HTMLImageElement) {
                return { kind: 'image' as const, element };
            }
        }

        if (channelSupportedTarget === 'color') {
            return {
                kind: 'color' as const,
                color: channelCurrentColor,
                opacity: channelCurrentOpacity,
            };
        }

        return null;
    })();
    const channelStoredState = selectedExt?.channelSettings as Partial<ChannelFilterState> | undefined;
    const channelAppliedState = selectedObject
        ? normalizeChannelFilterState(
            channelStoredState ?? (selectedObject.type === 'image'
                ? readChannelFilterState(((selectedObject as ExtendedFabricObject).baseFilters ?? (selectedObject as fabric.Image).filters ?? []))
                : undefined),
        )
        : createDefaultChannelFilterState();
    const channelSelectionLabel = selectedObject?.name
        ?? (selectedObject?.type === 'image' ? 'Selected image' : selectedObject?.type ?? 'Selected layer');
    const channelPanelKey = `channels:${selectedObject?.id ?? channelSelectionLabel}:${channelSupportedTarget}`;

    const finalizeChannelMutation = (targetObject: ExtendedFabricObject, nextState?: ChannelFilterState) => {
        if (nextState) {
            setChannelObjectState(targetObject, nextState);
        }
        targetObject.set('dirty', true);
        if (targetObject.isAdjustmentLayer) {
            applyAdjustmentLayers();
        }
        canvas?.requestRenderAll();
        updateObjects();
        canvas?.fire('object:modified', { target: targetObject });
    };

    const applyImageChannelState = (
        image: fabric.Image & ExtendedFabricObject,
        nextState: ChannelFilterState,
    ) => {
        const existingBaseFilters = stripChannelFilters(image.baseFilters ?? image.filters ?? []);
        setChannelBaseFilters(
            image,
            isDefaultChannelFilterState(nextState)
                ? existingBaseFilters
                : [...existingBaseFilters, createChannelColorMatrixFilter(nextState)],
        );
        finalizeChannelMutation(image, nextState);
    };

    const handleChangeChannelControls = (controls: ChannelControlState) => {
        if (!selectedObject || !selectedExt) return;
        const nextState = normalizeChannelFilterState({
            ...channelAppliedState,
            opacities: controls.opacities,
            masks: controls.masks,
        });

        if (selectedObject.type === 'image') {
            applyImageChannelState(selectedObject as fabric.Image & ExtendedFabricObject, nextState);
            return;
        }

        setChannelObjectState(selectedExt, nextState);
        selectedExt.set('dirty', true);
        canvas?.requestRenderAll();
        updateObjects();
    };

    const handleApplyChannelMode = (
        target: EditableChannelTarget,
        mode: 'isolate' | 'invert' | 'mask',
        controls: ChannelControlState,
    ) => {
        if (!selectedObject || !canvas) return;

        const nextState = buildChannelFilterState(target, mode, controls);

        if (selectedObject.type === 'image') {
            const image = selectedObject as fabric.Image & ExtendedFabricObject;
            applyImageChannelState(image, nextState);
            return;
        }

        if (channelSupportedTarget !== 'color') return;

        const next = applyChannelStateToColor(channelCurrentColor, channelCurrentOpacity, nextState);
        const nextFill = normalizeColorValue(next.color) ?? next.color;

        if (selectedSolidColorSettings && selectedExt) {
            setChannelAdjustmentSettings(selectedExt, {
                ...selectedSolidColorSettings,
                color: nextFill,
                opacity: next.opacity,
                channelSettings: nextState,
            } as SolidColorSettings & { channelSettings?: ChannelFilterState });
            finalizeChannelMutation(selectedExt, nextState);
            return;
        }

        selectedObject.set('fill', nextFill);
        selectedObject.set('opacity', next.opacity);
        finalizeChannelMutation(selectedExt ?? selectedObject as ExtendedFabricObject, nextState);
    };

    const handleResetChannelComposite = () => {
        if (!selectedObject || !selectedExt) return;
        const nextState = createDefaultChannelFilterState();

        if (selectedObject.type === 'image') {
            applyImageChannelState(selectedObject as fabric.Image & ExtendedFabricObject, nextState);
            return;
        }

        setChannelObjectState(selectedExt, nextState);
        selectedExt.set('dirty', true);
        canvas?.requestRenderAll();
        updateObjects();
    };

    const handleSetChannelValue = (
        target: Exclude<EditableChannelTarget, 'lum'>,
        nextValue: number,
        controls: ChannelControlState,
    ) => {
        if (!selectedObject || !canvas || channelSupportedTarget !== 'color') return;
        const next = setChannelValueInColor(channelCurrentColor, channelCurrentOpacity, target, nextValue);
        const nextFill = normalizeColorValue(next.color) ?? next.color;
        const nextState = normalizeChannelFilterState({
            ...channelAppliedState,
            opacities: controls.opacities,
            masks: controls.masks,
        });

        if (selectedSolidColorSettings && selectedExt) {
            setChannelAdjustmentSettings(selectedExt, {
                ...selectedSolidColorSettings,
                color: nextFill,
                opacity: next.opacity,
                channelSettings: nextState,
            } as SolidColorSettings & { channelSettings?: ChannelFilterState });
            finalizeChannelMutation(selectedExt, nextState);
            return;
        }

        selectedObject.set('fill', nextFill);
        selectedObject.set('opacity', next.opacity);
        finalizeChannelMutation(selectedExt ?? selectedObject as ExtendedFabricObject, nextState);
    };

    if (panelMode === 'color') {
        return withPanelRail(
            <ColorPanelView
                color={color}
                colorMode={colorPanelMode}
                hasEditableTarget={hasEditableFillTarget}
                onColorModeChange={setColorPanelMode}
                onColorChange={(nextColor) => handlePropChange('fill', nextColor)}
            />
        );
    }

    if (panelMode === 'swatches') {
        return withPanelRail(
            <SwatchesPanelView
                hasEditableTarget={hasEditableFillTarget}
                currentColor={color}
                onApplySwatch={(nextColor) => handlePropChange('fill', nextColor)}
            />
        );
    }

    if (panelMode === 'brushes') {
        return withPanelRail(
            <BrushesPanelView
                activeTool={activeTool}
                brushOptions={brushOptions}
                onBrushPresetChange={onBrushPresetChange}
                onBrushSizeChange={onBrushSizeChange}
                onBrushHardnessChange={onBrushHardnessChange}
                onBrushOpacityChange={onBrushOpacityChange}
                onBrushFlowChange={onBrushFlowChange}
                onBrushSmoothingChange={onBrushSmoothingChange}
                onBrushBlendModeChange={onBrushBlendModeChange}
                onActivatePaintTool={onActivatePaintTool}
            />
        );
    }

    if (panelMode === 'channels') {
        return withPanelRail(
            <ChannelsPanelView
                key={channelPanelKey}
                supportedTarget={channelSupportedTarget}
                selectionLabel={channelSelectionLabel}
                previewSource={channelPreviewSource}
                currentColor={channelCurrentColor}
                currentOpacity={channelCurrentOpacity}
                appliedState={channelAppliedState}
                onApplyMode={handleApplyChannelMode}
                onResetComposite={handleResetChannelComposite}
                onSetChannelValue={channelSupportedTarget === 'color' ? handleSetChannelValue : undefined}
                onChangeControls={handleChangeChannelControls}
            />
        );
    }

    if (panelMode === 'adjustments') {
        return withPanelRail(
            <AdjustmentsPanelView
                selectedAdjustmentType={selectedAdjustmentType}
                onCreateAdjustment={handleCreateAdjustmentLayer}
                onSwitchAdjustmentType={selectedAdjustmentType ? (type) => {
                    handleAdjustmentTypeChange(type);
                    setPanelMode('properties');
                } : undefined}
            />
        );
    }

    if (panelMode === 'history') {
        return withPanelRail(
            <HistoryPanelView
                undoCount={historyState?.undo ?? 0}
                redoCount={historyState?.redo ?? 0}
                onUndo={onUndo}
                onRedo={onRedo}
            />
        );
    }

    if (panelMode === 'navigator') {
        return withPanelRail(
            <NavigatorPanelView
                zoom={zoom}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                navigatorWorld={navigatorWorld}
                navigatorViewport={navigatorViewport}
                navigatorObjects={navigatorObjects}
                navigatorBackground={navigatorBackground}
                navigatorPreviewDataUrl={navigatorPreviewDataUrl}
                onZoomStep={(delta) => {
                    if (!canvas) return;
                    const currentZoom = canvas.getZoom();
                    const nextZoom = Math.max(0.05, Math.min(20, currentZoom + delta));
                    const centerPoint = new fabric.Point((canvas.width || 1) / 2, (canvas.height || 1) / 2);
                    canvas.zoomToPoint(centerPoint, nextZoom);
                    canvas.requestRenderAll();
                }}
                onResetView={() => {
                    if (!canvas) return;
                    canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as fabric.TMat2D);
                    canvas.requestRenderAll();
                }}
                onNavigate={(sceneX, sceneY) => {
                    if (!canvas) return;
                    const world = navigatorWorldRef.current;
                    const zoomValue = Math.max(0.05, canvas.getZoom() || 1);
                    const viewportWidth = (canvas.width || canvas.getWidth() || 1) / zoomValue;
                    const viewportHeight = (canvas.height || canvas.getHeight() || 1) / zoomValue;

                    const centerX = world.width <= viewportWidth
                        ? world.left + (world.width / 2)
                        : Math.max(world.left + (viewportWidth / 2), Math.min(sceneX, world.left + world.width - (viewportWidth / 2)));
                    const centerY = world.height <= viewportHeight
                        ? world.top + (world.height / 2)
                        : Math.max(world.top + (viewportHeight / 2), Math.min(sceneY, world.top + world.height - (viewportHeight / 2)));

                    const viewport = (canvas.viewportTransform ? [...canvas.viewportTransform] : [zoomValue, 0, 0, zoomValue, 0, 0]) as fabric.TMat2D;
                    viewport[4] = ((canvas.width || canvas.getWidth() || 1) / 2) - (centerX * zoomValue);
                    viewport[5] = ((canvas.height || canvas.getHeight() || 1) / 2) - (centerY * zoomValue);
                    canvas.setViewportTransform(viewport);
                    canvas.requestRenderAll();
                }}
            />
        );
    }

    if (panelMode === 'info') {
        return withPanelRail(
            <InfoPanelView
                activeTool={activeTool}
                zoom={zoom}
                objectCount={objects.length}
                selectedCount={selectedIds.size}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
            />
        );
    }
    
    if (activeTool === 'layers' || panelMode === 'layers') {
        const layerOrderState = getLayerOrderState(selectedObject);
        const handleToggleClip = () => {
            if (!selectedObject || !canvas) return;
            const ext = selectedObject as ExtendedFabricObject;
            selectedObject.set('clipped', !ext.clipped);
            if (ext.isAdjustmentLayer) applyAdjustmentLayers();
            canvas.requestRenderAll();
            updateObjects();
        };
        return withPanelRail(
            <LayersView 
                objects={objects}
                selectedIds={selectedIds}
                selectedObject={selectedObject}
                onDuplicate={onDuplicate}
                onSelect={(obj, e) => {
                     if (!canvas) return;
                     const isMulti = !!(e?.shiftKey || e?.metaKey || e?.ctrlKey);
                     if (!isMulti) { 
                         const currentActive = canvas.getActiveObject();
                         if (currentActive === obj) return;

                         canvas.discardActiveObject();
                         canvas.setActiveObject(obj);
                         canvas.requestRenderAll(); 
                         return;
                     }
                     const active = canvas.getActiveObjects() || [];
                     const alreadySelected = active.includes(obj);
                     const next = alreadySelected ? active.filter(o => o !== obj) : [...active, obj];
                     if (next.length === 0) {
                         canvas.discardActiveObject();
                         canvas.requestRenderAll();
                         return;
                     }
                     if (next.length === 1) {
                         canvas.discardActiveObject();
                         canvas.setActiveObject(next[0]);
                         canvas.requestRenderAll();
                         return;
                     }
                     const selection = new fabric.ActiveSelection(next, { canvas });
                     canvas.setActiveObject(selection);
                     canvas.requestRenderAll();
                }}
                onLayerOpacityChange={(value) => {
                    if (!selectedObject) return;
                    handlePropChange('opacity', value);
                }}
                onLayerBlendChange={(value) => {
                    if (!selectedObject) return;
                    handlePropChange('globalCompositeOperation', value);
                }}
                onLayerNumericPropChange={(prop, value) => {
                    if (!selectedObject || !canvas) return;
                    const normalizedValue = Number.isFinite(value) ? value : 0;
                    if (prop === 'left' || prop === 'top') {
                        selectedObject.set(prop, normalizedValue);
                        selectedObject.setCoords();
                        canvas.requestRenderAll();
                        updateObjects();
                        return;
                    }

                    if (prop === 'width') {
                        const baseWidth = selectedObject.width || 1;
                        const nextScaleX = Math.max(0.01, normalizedValue / baseWidth);
                        selectedObject.set('scaleX', nextScaleX);
                        selectedObject.setCoords();
                        canvas.requestRenderAll();
                        updateObjects();
                        return;
                    }

                    const baseHeight = selectedObject.height || 1;
                    const nextScaleY = Math.max(0.01, normalizedValue / baseHeight);
                    selectedObject.set('scaleY', nextScaleY);
                    selectedObject.setCoords();
                    canvas.requestRenderAll();
                    updateObjects();
                }}
                onToggleClip={handleToggleClip}
                onToggleVisibility={(obj) => { 
                    obj.visible = !obj.visible;
                    if (obj.group) obj.group.set('dirty', true); // Ensure group redraws if child visibility changes 
                    canvas?.requestRenderAll(); 
                    if ((obj as ExtendedFabricObject).isAdjustmentLayer) applyAdjustmentLayers();
                    updateObjects();
                }}
                onToggleLock={(obj) => { 
                    const l = !(obj as ExtendedFabricObject).locked;
                    (obj as ExtendedFabricObject).locked = l;
                    obj.set({
                        lockMovementX: l,
                        lockMovementY: l,
                        lockRotation: l,
                        lockScalingX: l,
                        lockScalingY: l,
                        selectable: !l,
                        evented: !l
                    });
                    if (obj.group) obj.group.set('dirty', true);
                    if (l) canvas?.discardActiveObject();
                    canvas?.fire('object:modified', { target: obj });
                    canvas?.requestRenderAll();
                    updateObjects();
                }}
                onDelete={deleteLayer}
                onReorder={handleReorder}
                onMoveLayerUp={() => handleLayerOrderAction('move-up')}
                onMoveLayerDown={() => handleLayerOrderAction('move-down')}
                onBringLayerToFront={() => handleLayerOrderAction('to-front')}
                onSendLayerToBack={() => handleLayerOrderAction('to-back')}
                canMoveLayerUp={layerOrderState.canMoveUp}
                canMoveLayerDown={layerOrderState.canMoveDown}
                canBringLayerToFront={layerOrderState.canBringToFront}
                canSendLayerToBack={layerOrderState.canSendToBack}
                onRemoveFromFolder={handleRemoveFromFolder}
                onAddToFolder={handleAddToFolder}
                onGroup={handleGroup}
                onUngroup={handleUngroup}
                onCreateFolder={handleCreateFolder}
                onDblClick={(obj) => onLayerDblClick && onLayerDblClick(obj)}
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
         return withPanelRail(
             <div className="h-full bg-card overflow-y-auto">
                 <CanvasSettingsPanel 
                     width={canvasWidth}
                     height={canvasHeight}
                     backgroundColor={canvasColor}
                     backgroundEnabled={canvasBackgroundEnabled}
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
                              const rect = ext.artboardRect as ArtboardRectWithBackground;
                              const normalized = normalizeColorValue(c) || c;
                              const setRectMeta = rect as unknown as { set: (key: string, value: unknown) => void };
                              setRectMeta.set('canvasBackgroundColor', normalized);
                              if (rect.canvasBackgroundEnabled !== false) {
                                  rect.set('fill', normalized);
                              }
                              canvas.requestRenderAll();
                              setCanvasColor(normalized);
                          }
                     }}
                     onBackgroundToggle={(enabled) => {
                          if (!canvas) return;
                          const ext = canvas as CanvasWithArtboard;
                          if (ext.artboardRect) {
                              const rect = ext.artboardRect as ArtboardRectWithBackground;
                              const stored = normalizeColorValue(rect.canvasBackgroundColor || canvasColor) || canvasColor || '#ffffff';
                              const setRectMeta = rect as unknown as { set: (key: string, value: unknown) => void };
                              setRectMeta.set('canvasBackgroundColor', stored);
                              setRectMeta.set('canvasBackgroundEnabled', enabled);
                              rect.set('fill', enabled ? stored : 'rgba(0,0,0,0)');
                              canvas.requestRenderAll();
                              setCanvasColor(stored);
                              setCanvasBackgroundEnabled(enabled);
                          }
                     }}
                 />
             </div>
         );
    }

    void opacity; void adjustmentSettings;

    const textPathOptions = objects
        .filter((obj) => obj !== selectedObject && isPathCandidate(obj))
        .map((obj, index) => {
            const ext = obj as ExtendedFabricObject;
            return {
                id: ensureObjectId(obj),
                label: ext.name || `Path ${index + 1}`
            };
        });

    const selectedTextPathId = selectedObject?.textPathSourceId ?? null;
    const hasAttachedTextPath = isTextObject(selectedObject)
        && !!((selectedObject as unknown as { path?: fabric.Path | null }).path);

    return withPanelRail(
        <SelectionProperties 
             selectedObject={selectedObject}
             selectedObjects={canvas?.getActiveObjects() || []}
             color={color}
             isGradient={isGradient}
             gradientState={{
                 type: gradientType,
                 start: gradientStart,
                 end: gradientEnd,
                 angle: gradientAngle,
                 coords: gradientCoords
             }}
             onPropChange={handlePropChange}
             onLayoutAction={handleLayoutAction}
             onGroup={handleGroup}
             onUngroup={handleUngroup}
             onCreateMask={handleCreateMask}
             onTextOnPath={handleTextOnPath}
             textPathOptions={textPathOptions}
             selectedTextPathId={selectedTextPathId}
             hasAttachedTextPath={hasAttachedTextPath}
             onReleaseMask={handleReleaseMask}
             onToggleMaskLock={toggleMaskLock}
             onAttachTextToPath={(pathId) => handlePropChange('attachTextToPath', pathId)}
             onDetachTextPath={() => handlePropChange('detachTextPath', true)}
             updateAdjustment={updateAdjustment}
             onAdjustmentTypeChange={handleAdjustmentTypeChange}
             onCreateAdjustmentLayer={handleCreateAdjustmentLayer}
             textState={{ text: textContent, font: fontFamily, weight: fontWeight, curve: curveStrength, center: curveCenter, span: curveSpan, spellcheck: textSpellcheck }}
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
                      skew: { x: skewX, y: skewY, z: skewZ, dir: taperDirection, preset: (selectedObject as ExtendedFabricObject | null)?.pseudoBacksidePreset || 'front' }
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
