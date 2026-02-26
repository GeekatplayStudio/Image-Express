'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import NextImage from 'next/image';
import DesignCanvas from '@/components/DesignCanvas';
import Toolbar, { type ToolbarHandle } from '@/components/Toolbar';
import PropertiesPanel from '@/components/PropertiesPanel';
import ThreeDGenerator from '@/components/ThreeDGenerator';
import ThreeDLayerEditor from '@/components/ThreeDLayerEditor';
import JobStatusFooter from '@/components/JobStatusFooter';
import UserProfileModal from '@/components/UserProfileModal';
import TopToolOptionsBar from '@/components/Editor/TopToolOptionsBar';
import TextQuickBar from '@/components/Editor/TextQuickBar';
import { loadProfileSettings, UserProfileSettings } from '@/lib/profile-utils';
import AssetLibrary from '@/components/AssetLibrary';
import MissingAssetsModal from '@/components/MissingAssetsModal';
import * as fabric from 'fabric';
import { GridOverlay, GridType } from '@/components/GridOverlay';
import { GradientControls } from '@/components/GradientControls';
import { Download, Share2, Home as HomeIcon, ChevronDown, Image as ImageIcon, FileText, FileCode, Settings, User, X, Maximize, Minimize, ChevronLeft, ChevronRight, GripHorizontal, Grid3x3, LayoutGrid, Crosshair as CrosshairIcon, Archive, Square, Facebook, Instagram, Lock, Unlock } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { BackgroundJob, ThreeDImage, ThreeDGroup, ExtendedFabricObject, ColorPalette } from '@/types';
import JSZip from 'jszip';
import { loadDriveConfig, uploadBackup } from '@/lib/googleDrive';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import CircularContextMenu, { type LayerOrderAction, type LayerOrderState } from '@/components/CircularContextMenu';
import BrandIcon from '@/components/BrandIcon';
import { Switch } from '@/components/ui/switch';
import { ensureObjectId, normalizeColorValue, parseColorWithAlpha } from '@/lib/fabric-utils';
import { APP_THEME } from '@/lib/theme-tokens';
import { PanelMode as PanelRailMode } from '@/components/properties/PanelModeRail';
import { loadUiPreferences, UI_PREFERENCES_CHANGED_EVENT } from '@/lib/ui-preferences';
import {
    applyRasterBrushToCanvas,
    disableRasterDrawingMode,
    type RasterBlendMode,
    type RasterBrushPreset
} from '@/lib/raster-engine';
import {
    computeRetouchBrushProfile,
    createSoftBrushMask,
    interpolateStrokePoints,
    isLocalPointInsideBounds,
    resolveNextCloneSourcePoint,
    stampDodge,
    stampFromSource,
    stampSharpen,
    toLocalRetouchPoint,
    type RetouchBounds,
} from '@/lib/retouch-engine';
import { TOP_TEXT_FONT_FAMILIES, TOP_TEXT_FONT_STYLES } from '@/lib/typography';

interface MissingItem {
    id: string; 
    type: 'image' | 'model';
    originalSrc: string;
}

interface EditorViewProps {
    initialDesign: { data?: unknown } | null;
    initialTemplateJsonUrl: string | null;
    initialSize?: { width: number, height: number } | null;
    user: string;
    onBack: () => void;
    onLogout: () => void;
    currentDesignName: string;
    currentDesignId: string | null;
    onUpdateDesignInfo: (id: string | null, name: string) => void;
    onOpenDocumentation?: () => void;
    onOpenSettings: () => void;
    onOpenAdminArea?: () => void;
    isAdminUser?: boolean;
    settingsOpen: boolean;
    initialActiveTool?: string;
}

type PanelDockMode = 'docked-left' | 'docked-right' | 'floating' | 'collapsed-left' | 'collapsed-right';

type ArtboardRectWithBackground = fabric.Rect & {
    canvasBackgroundColor?: string;
    canvasBackgroundEnabled?: boolean;
};

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number; left: number; top: number };
    artboardRect?: ArtboardRectWithBackground;
    centerArtboard?: () => void;
};

type MarqueeSelectionHelper = fabric.Rect & {
    isSelectionOverlayHelper?: boolean;
};

type LassoSelectionHelper = fabric.Path & {
    isSelectionOverlayHelper?: boolean;
};

type CanvasWithExportInternals = fabric.Canvas & {
    disposed?: boolean;
    destroyed?: boolean;
    elements?: {
        upper?: { ctx?: CanvasRenderingContext2D; el?: HTMLCanvasElement };
        lower?: { el?: HTMLCanvasElement };
    };
    lowerCanvasEl?: HTMLCanvasElement;
    getElement?: () => HTMLCanvasElement;
};

type ExportDataUrlOptions = fabric.TDataUrlOptions & {
    backgroundColor?: string;
};

type RetouchLayerState = {
    bounds: RetouchBounds;
    layerCanvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    image: fabric.Image & ExtendedFabricObject;
};

type RectBounds = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type LockedLayerOverlayEntry = {
    id: string;
    object: fabric.Object & ExtendedFabricObject;
    paintOrder: number;
    sceneBounds: RectBounds;
    viewportBounds: RectBounds;
    iconBounds: RectBounds;
};

type CanvasLockControl = {
    id: string;
    object: fabric.Object & ExtendedFabricObject;
    locked: boolean;
    buttonBounds: RectBounds;
    label: string;
};

type SerializedFill = {
    src?: string;
    source?: string;
    colorStops?: Array<{ src?: string }>;
};

type SerializedObject = {
    type?: string;
    src?: string;
    modelUrl?: string;
    mediaType?: 'video' | 'audio' | string;
    mediaSource?: string;
    name?: string;
    is3DModel?: boolean;
    clipPath?: SerializedObject;
    objects?: SerializedObject[];
    paths?: SerializedObject[];
    fill?: unknown;
    stroke?: unknown;
    backgroundColor?: unknown;
    overlayFill?: unknown;
    [key: string]: unknown;
};

type DesignJson = {
    objects?: SerializedObject[];
    backgroundImage?: { src?: string };
    overlayImage?: { src?: string };
    clipPath?: SerializedObject;
    metadata?: unknown;
    [key: string]: unknown;
};

const TOP_TEXT_DEFAULT_SIZE = 40;
const TOP_CROP_RATIO_PRESETS = ['free', '1:1', '4:3', '16:9'] as const;
const TOP_EYEDROPPER_SAMPLE_SIZES = [1, 3, 5, 11] as const;
const TOP_ZOOM_STEPS = [5, 10, 25, 50] as const;
const PANEL_MODE_STORAGE_KEY = 'image-express-properties-panel-mode';
const WINDOW_PANEL_ITEMS: Array<{ mode: PanelRailMode; label: string }> = [
    { mode: 'layers', label: 'Layers Panel' },
    { mode: 'properties', label: 'Properties Panel' },
    { mode: 'history', label: 'History Panel' },
    { mode: 'color', label: 'Color Panel' },
    { mode: 'swatches', label: 'Swatches Panel' },
    { mode: 'brushes', label: 'Brushes Panel' },
    { mode: 'channels', label: 'Channels Panel' },
    { mode: 'adjustments', label: 'Adjustments Panel' },
    { mode: 'navigator', label: 'Navigator Panel' },
    { mode: 'info', label: 'Info Panel' },
];

type TopCropRatioPreset = typeof TOP_CROP_RATIO_PRESETS[number];
type TopEyedropperSampleSize = typeof TOP_EYEDROPPER_SAMPLE_SIZES[number];
type TopZoomStep = typeof TOP_ZOOM_STEPS[number];
type CursorPreviewKind = 'brush' | 'eyedropper';
type CursorPreviewConfig = {
    kind: CursorPreviewKind;
    diameter: number;
};
type CursorPreviewState = {
    kind: CursorPreviewKind;
    clientX: number;
    clientY: number;
    diameter: number;
};
type MediaOverlayPreset =
    | 'canvas-original'
    | 'instagram-square'
    | 'instagram-story'
    | 'facebook-post'
    | 'linkedin-post'
    | 'x-post'
    | 'youtube-landscape'
    | 'youtube-shorts'
    | 'tiktok-vertical';
type MediaOverlayPresetSpec = {
    id: MediaOverlayPreset;
    label: string;
    width: number;
    height: number;
};
type MediaOverlayPersistedState = {
    enabled: boolean;
    preset: MediaOverlayPreset;
    frameBounds?: RectBounds;
};
type EditorMenuId =
    | 'file'
    | 'edit'
    | 'image'
    | 'layer'
    | 'select'
    | 'filter'
    | 'view'
    | 'window'
    | 'settings'
    | 'help'
    | 'export'
    | 'share'
    | 'grid'
    | 'tools';
const DISABLED_LAYER_ORDER_STATE: LayerOrderState = {
    enabled: false,
    canMoveUp: false,
    canMoveDown: false,
    canBringToFront: false,
    canSendToBack: false,
};
const MEDIA_OVERLAY_PRESETS: MediaOverlayPresetSpec[] = [
    { id: 'canvas-original', label: 'Original Size (Canvas)', width: 1, height: 1 },
    { id: 'instagram-square', label: 'Instagram 1:1', width: 1080, height: 1080 },
    { id: 'instagram-story', label: 'Instagram Story 9:16', width: 1080, height: 1920 },
    { id: 'facebook-post', label: 'Facebook Post 1200x630', width: 1200, height: 630 },
    { id: 'linkedin-post', label: 'LinkedIn Post 1200x627', width: 1200, height: 627 },
    { id: 'x-post', label: 'X Post 16:9', width: 1600, height: 900 },
    { id: 'youtube-landscape', label: 'YouTube 16:9', width: 1920, height: 1080 },
    { id: 'youtube-shorts', label: 'YouTube Shorts 9:16', width: 1080, height: 1920 },
    { id: 'tiktok-vertical', label: 'TikTok 9:16', width: 1080, height: 1920 },
];
const MEDIA_OVERLAY_STORAGE_KEY_PREFIX = 'image-express-media-overlay';

export default function EditorView({ 
    initialDesign, 
    initialTemplateJsonUrl,
    initialSize,
    user, 
    onBack,
    onLogout,
    currentDesignName: propDesignName,
    currentDesignId: propDesignId,
    onUpdateDesignInfo,
    onOpenDocumentation,
    onOpenSettings,
    onOpenAdminArea,
    isAdminUser = false,
    settingsOpen,
    initialActiveTool
}: EditorViewProps) {
    const dialog = useDialog();
    const { toast } = useToast();

    const getDisplayName = (url: string) => {
        const withoutQuery = url.split('?')[0];
        const last = decodeURIComponent(withoutQuery.split('/').pop() || 'Media');
        return last || 'Media';
    };
    const envDriveClientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? '';
    
    // Core Logic States
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const canvasRef = useRef<fabric.Canvas | null>(null);
    const [activeTool, setActiveTool] = useState<string>('select');
    const [activePalette, setActivePalette] = useState<ColorPalette | null>(null);
    const [zoom, setZoom] = useState(1);
    const [isDirty, setIsDirty] = useState(false);
    const [isRenamingDesignTitle, setIsRenamingDesignTitle] = useState(false);
    const [designTitleDraft, setDesignTitleDraft] = useState(propDesignName || 'Untitled Design');
    
    // Context Menu
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; isOpen: boolean }>({ x: 0, y: 0, isOpen: false });
    const [lockedLayerOverlayEntries, setLockedLayerOverlayEntries] = useState<LockedLayerOverlayEntry[]>([]);
    const [hoveredLockedLayerId, setHoveredLockedLayerId] = useState<string | null>(null);
    const [canvasLockControl, setCanvasLockControl] = useState<CanvasLockControl | null>(null);

    const customHistoryProps = useMemo(() => [
        'id',
        'gradient',
        'pattern',
        'is3DModel',
        'modelUrl',
        'isStar',
        'starPoints',
        'starInnerRadius',
        'mediaType',
        'mediaSource',
        'layerTagColor',
        'name',
        'locked',
        'curveStrength',
        'curveCenter',
        'curveSpan',
        'textSpellcheck',
        'skewZ',
        'skewZBaseScale',
        'skewZBaseScaleX',
        'skewZBaseScaleY',
        'skewZBaseSkewX',
        'skewZBaseSkewY',
        'taperDirection',
        'taperBaseLeft',
        'taperBaseTop',
        'threeDSettings',
        'isAdjustmentLayer',
        'adjustmentType',
        'adjustmentSettings',
        'baseFilters',
        'aiGenerated',
        'aiProvider',
        'isPenPath',
        'penMode',
        'penClosed',
        'penNodes',
        'penSourcePoints',
        'textPathSourceId',
        'shapeCornerRadius',
        'isRetouchLayer',
        'gradientTypeHint',
        'gradientReversed',
        'gradientDitherEnabled'
    ], []);

    const getHistorySnapshot = useCallback(() => {
        const activeCanvas = canvasRef.current;
        if (!activeCanvas) return null;
        const json = (activeCanvas as unknown as { toJSON: (properties?: string[]) => DesignJson }).toJSON(customHistoryProps);
        return JSON.stringify(json);
    }, [customHistoryProps]);

    const refreshHistoryState = useCallback(() => {
        setHistoryState({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
    }, []);

    const resetHistory = useCallback(() => {
        if (!canvasRef.current) return;
        const snapshot = getHistorySnapshot();
        if (!snapshot) return;
        undoStackRef.current = [snapshot];
        redoStackRef.current = [];
        historyReadyRef.current = true;
        refreshHistoryState();
    }, [getHistorySnapshot, refreshHistoryState]);

    const pushHistory = useCallback(() => {
        if (!canvasRef.current || isRestoringRef.current || !historyReadyRef.current) return;
        const snapshot = getHistorySnapshot();
        if (!snapshot) return;
        const undoStack = undoStackRef.current;
        if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshot) return;
        undoStack.push(snapshot);
        if (undoStack.length > 50) undoStack.shift();
        redoStackRef.current = [];
        refreshHistoryState();
    }, [getHistorySnapshot, refreshHistoryState]);

    const restoreFromSnapshot = useCallback((snapshot: string) => {
        const activeCanvas = canvasRef.current;
        if (!activeCanvas) return;
        isRestoringRef.current = true;
        const json = JSON.parse(snapshot);
        activeCanvas.loadFromJSON(json, () => {
            activeCanvas.requestRenderAll();
            isRestoringRef.current = false;
            setIsDirty(true);
        });
    }, []);

    const handleUndo = useCallback(() => {
        if (!canvasRef.current) return;
        const undoStack = undoStackRef.current;
        if (undoStack.length < 2) return;
        const current = undoStack.pop();
        if (current) redoStackRef.current.push(current);
        const previous = undoStack[undoStack.length - 1];
        if (previous) restoreFromSnapshot(previous);
        refreshHistoryState();
    }, [restoreFromSnapshot, refreshHistoryState]);

    const handleRedo = useCallback(() => {
        if (!canvasRef.current) return;
        const redoStack = redoStackRef.current;
        if (redoStack.length === 0) return;
        const next = redoStack.pop();
        if (next) {
            undoStackRef.current.push(next);
            restoreFromSnapshot(next);
        }
        refreshHistoryState();
    }, [restoreFromSnapshot, refreshHistoryState]);

    const handleDuplicate = useCallback(async () => {
        if (!canvas) return;
        const activeObjects = canvas.getActiveObjects();
        if (!activeObjects || activeObjects.length === 0) return;

        canvas.discardActiveObject();

        const clones: fabric.Object[] = [];
        for (const obj of activeObjects) {
            const cloned = await obj.clone();
            cloned.set({
                left: (cloned.left || 0) + 20,
                top: (cloned.top || 0) + 20,
                evented: true,
            });

            // Ensure unique ID
            (cloned as ExtendedFabricObject).id = crypto.randomUUID();
            
            // "Name" copy
            if ((obj as ExtendedFabricObject).name) {
                 (cloned as ExtendedFabricObject).name = (obj as ExtendedFabricObject).name + ' (Copy)';
            }

            canvas.add(cloned);
            clones.push(cloned);
        }

        if (clones.length > 0) {
            if (clones.length === 1) {
                canvas.setActiveObject(clones[0]);
            } else {
                const selection = new fabric.ActiveSelection(clones, {
                    canvas: canvas,
                });
                canvas.setActiveObject(selection);
            }
            canvas.requestRenderAll();
            pushHistory();
            setIsDirty(true);
        }
    }, [canvas, pushHistory]);

    const handleAssetSelect = useCallback((url: string, type: string, name?: string) => {
        if (!canvas) return;

        if (type === 'models' || type === 'model' || url.endsWith('.glb') || url.endsWith('.gltf')) {
             fabric.FabricImage.fromURL(url).then(img => {
                img.scaleToWidth(300);
                canvas.centerObject(img);
                const threeDImg = img as ThreeDImage;
                threeDImg.is3DModel = true;
                threeDImg.modelUrl = url;
                if (name) (threeDImg as ExtendedFabricObject).name = name;
                canvas.add(img); 
                canvas.setActiveObject(img);
                canvas.requestRenderAll();
                pushHistory();
            });
        } else if (type === 'videos' || type === 'video') {
             toast({ title: "Video support", description: "Video placement is experimental." });
        } else {
             fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then(img => {
                 const artboard = (canvas as CanvasWithArtboard).artboard || { width: canvas.width || 800, height: canvas.height || 600 };
                 const viewW = artboard.width;
                 if (img.width! > viewW * 0.5) {
                     img.scaleToWidth(viewW * 0.5);
                 }
                 canvas.centerObject(img);
                 if (name) (img as ExtendedFabricObject).name = name;
                 canvas.add(img);
                 canvas.setActiveObject(img);
                 canvas.requestRenderAll();
                 pushHistory();
             }).catch(() => {
                toast({ title: "Error", description: "Failed to load image", variant: "destructive" });
             });
        }
    }, [canvas, pushHistory, toast]);

    const handleCanvasModified = useCallback(() => {
        setIsDirty(true);
        pushHistory();
    }, [pushHistory]);

    const handleRightClick = useCallback((e: MouseEvent) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            isOpen: true
        });
    }, []);

    const getActiveLayerOrderState = useCallback((): LayerOrderState => {
        if (!canvas) return DISABLED_LAYER_ORDER_STATE;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
        if (!active) return DISABLED_LAYER_ORDER_STATE;
        if (active.type === 'activeSelection' || active.type === 'selection') return DISABLED_LAYER_ORDER_STATE;
        const ext = active as ExtendedFabricObject;
        if (ext.isRetouchLayer || ext.name === 'Artboard') return DISABLED_LAYER_ORDER_STATE;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (canvasWithArtboard.artboardRect && active === canvasWithArtboard.artboardRect) return DISABLED_LAYER_ORDER_STATE;

        if (active.group && typeof active.group.getObjects === 'function') {
            const siblings = active.group.getObjects();
            const currentIndex = siblings.indexOf(active);
            if (currentIndex < 0) return DISABLED_LAYER_ORDER_STATE;
            const maxIndex = siblings.length - 1;
            const canMoveUp = currentIndex < maxIndex;
            const canMoveDown = currentIndex > 0;
            return {
                enabled: siblings.length > 1,
                canMoveUp,
                canMoveDown,
                canBringToFront: canMoveUp,
                canSendToBack: canMoveDown,
            };
        }

        const objects = canvas.getObjects();
        const currentIndex = objects.indexOf(active);
        if (currentIndex < 0) return DISABLED_LAYER_ORDER_STATE;
        const artboardIndex = canvasWithArtboard.artboardRect ? objects.indexOf(canvasWithArtboard.artboardRect) : -1;
        const minIndex = artboardIndex >= 0 ? artboardIndex + 1 : 0;
        const maxIndex = objects.length - 1;
        if (currentIndex < minIndex || maxIndex < minIndex) return DISABLED_LAYER_ORDER_STATE;
        const canMoveUp = currentIndex < maxIndex;
        const canMoveDown = currentIndex > minIndex;
        return {
            enabled: true,
            canMoveUp,
            canMoveDown,
            canBringToFront: canMoveUp,
            canSendToBack: canMoveDown,
        };
    }, [canvas]);

    useEffect(() => {
        if (!canvas) {
            setTextQuickBarPos({ visible: false, left: 0, top: 0 });
            return;
        }

        const toViewportPoint = (point: fabric.Point) => {
            const transform = canvas.viewportTransform || [1, 0, 0, 1, 0, 0] as fabric.TMat2D;
            return (fabric.util as unknown as { transformPoint: (p: fabric.Point, t: fabric.TMat2D) => fabric.Point }).transformPoint(point, transform);
        };

        const syncTextQuickBar = () => {
            const active = canvas.getActiveObject() as (fabric.Object & { type?: string }) | null;
            const isTextObject = active?.type === 'i-text' || active?.type === 'text' || active?.type === 'textbox';
            if (!active || !isTextObject) {
                setTextQuickBarPos({ visible: false, left: 0, top: 0 });
                return;
            }

            const canvasElement = canvas.lowerCanvasEl;
            if (!canvasElement) {
                setTextQuickBarPos({ visible: false, left: 0, top: 0 });
                return;
            }

            const coords = typeof active.getCoords === 'function' ? active.getCoords() : [];
            if (!Array.isArray(coords) || coords.length === 0) {
                setTextQuickBarPos({ visible: false, left: 0, top: 0 });
                return;
            }

            const viewportPoints = coords.map((coord) => toViewportPoint(new fabric.Point(coord.x, coord.y)));
            const minX = Math.min(...viewportPoints.map((point) => point.x));
            const maxX = Math.max(...viewportPoints.map((point) => point.x));
            const maxY = Math.max(...viewportPoints.map((point) => point.y));

            const canvasRect = canvasElement.getBoundingClientRect();
            const desiredLeft = canvasRect.left + ((minX + maxX) / 2);
            const desiredTop = canvasRect.top + maxY + 16;
            const clampedLeft = Math.max(190, Math.min(window.innerWidth - 190, desiredLeft));
            const clampedTop = Math.max(84, Math.min(window.innerHeight - 84, desiredTop));

            setTextQuickBarPos({ visible: true, left: clampedLeft, top: clampedTop });
        };

        syncTextQuickBar();

        canvas.on('selection:created', syncTextQuickBar);
        canvas.on('selection:updated', syncTextQuickBar);
        canvas.on('selection:cleared', syncTextQuickBar);
        canvas.on('object:modified', syncTextQuickBar);
        canvas.on('object:moving', syncTextQuickBar);
        canvas.on('object:scaling', syncTextQuickBar);
        canvas.on('object:rotating', syncTextQuickBar);

        const syncOnWindow = () => syncTextQuickBar();
        window.addEventListener('resize', syncOnWindow);
        window.addEventListener('scroll', syncOnWindow, true);

        return () => {
            canvas.off('selection:created', syncTextQuickBar);
            canvas.off('selection:updated', syncTextQuickBar);
            canvas.off('selection:cleared', syncTextQuickBar);
            canvas.off('object:modified', syncTextQuickBar);
            canvas.off('object:moving', syncTextQuickBar);
            canvas.off('object:scaling', syncTextQuickBar);
            canvas.off('object:rotating', syncTextQuickBar);
            window.removeEventListener('resize', syncOnWindow);
            window.removeEventListener('scroll', syncOnWindow, true);
        };
    }, [canvas]);

    const handleContextLayerOrderAction = useCallback((action: LayerOrderAction) => {
        if (!canvas) return;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
        if (!active) {
            toast({ title: 'Layer reorder unavailable', description: 'Select a layer on canvas first.', variant: 'warning' });
            return;
        }
        if (active.type === 'activeSelection' || active.type === 'selection') {
            toast({ title: 'Layer reorder unavailable', description: 'Select a single layer to reorder.', variant: 'warning' });
            return;
        }
        const ext = active as ExtendedFabricObject;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (ext.isRetouchLayer || ext.name === 'Artboard' || (canvasWithArtboard.artboardRect && active === canvasWithArtboard.artboardRect)) {
            return;
        }

        const runtimeCanvas = canvas as fabric.Canvas & {
            moveObjectTo?: (object: fabric.Object, index: number) => void;
            fire?: (eventName: string, payload?: Record<string, unknown>) => void;
        };
        let moved = false;

        if (active.group && typeof active.group.getObjects === 'function') {
            const parent = active.group as fabric.Group;
            const siblings = parent.getObjects();
            const currentIndex = siblings.indexOf(active);
            if (currentIndex < 0) return;
            const maxIndex = siblings.length - 1;
            let nextIndex = currentIndex;
            if (action === 'move-up') nextIndex = Math.min(maxIndex, currentIndex + 1);
            if (action === 'move-down') nextIndex = Math.max(0, currentIndex - 1);
            if (action === 'to-front') nextIndex = maxIndex;
            if (action === 'to-back') nextIndex = 0;
            if (nextIndex !== currentIndex) {
                parent.remove(active);
                parent.insertAt(nextIndex, active);
                parent.set('dirty', true);
                parent.setCoords();
                moved = true;
            }
        } else {
            const objects = canvas.getObjects();
            const currentIndex = objects.indexOf(active);
            if (currentIndex < 0 || !runtimeCanvas.moveObjectTo) return;
            const artboardIndex = canvasWithArtboard.artboardRect ? objects.indexOf(canvasWithArtboard.artboardRect) : -1;
            const minIndex = artboardIndex >= 0 ? artboardIndex + 1 : 0;
            const maxIndex = objects.length - 1;
            let nextIndex = currentIndex;
            if (action === 'move-up') nextIndex = Math.min(maxIndex, currentIndex + 1);
            if (action === 'move-down') nextIndex = Math.max(minIndex, currentIndex - 1);
            if (action === 'to-front') nextIndex = maxIndex;
            if (action === 'to-back') nextIndex = minIndex;
            if (nextIndex !== currentIndex) {
                runtimeCanvas.moveObjectTo(active, nextIndex);
                moved = true;
            }
        }

        if (!moved) return;
        active.setCoords();
        if (active.group) active.group.set('dirty', true);
        canvas.setActiveObject(active);
        runtimeCanvas.fire?.('object:modified', { target: active });
        canvas.requestRenderAll();
    }, [canvas, toast]);

    // Panel State
    const [panelState, setPanelState] = useState<{
        mode: PanelDockMode;
        position: { x: number; y: number };
        width: number;
    }>({
        mode: 'docked-right', // Default like original
        position: { x: 100, y: 100 },
        width: 320
    });
    const [propertiesPanelMode, setPropertiesPanelMode] = useState<PanelRailMode>('properties');
    
    const [isDraggingPanel, setIsDraggingPanel] = useState(false);
    const dragPanelOffset = useRef({ x: 0, y: 0 });

    const handlePanelDragStart = (e: React.MouseEvent) => {
        setIsDraggingPanel(true);
        const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        dragPanelOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        
        // Use window listeners for smoother drag
        const moveHandler = (moveEvent: MouseEvent) => {
            setPanelState(prev => {
                // If we were docked, we are now floating
                // We update position to follow mouse
                return {
                    ...prev,
                    mode: 'floating',
                    position: {
                        x: moveEvent.clientX - dragPanelOffset.current.x,
                        y: moveEvent.clientY - dragPanelOffset.current.y
                    }
                };
            });
        };

        const upHandler = (upEvent: MouseEvent) => {
            setIsDraggingPanel(false);
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);
            
            // Check for Docking
            const screenWidth = window.innerWidth;
            const x = upEvent.clientX;
            
            if (x < 100) {
                setPanelState(prev => ({ ...prev, mode: 'docked-left', position: { x: 0, y: 0 } }));
            } else if (x > screenWidth - 100) {
                setPanelState(prev => ({ ...prev, mode: 'docked-right', position: { x: 0, y: 0 } }));
            }
        };

        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
    };

    const handleFileDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        toast({ title: "Uploading assets..." });

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', 'uploads');
            formData.append('owner', user);

            try {
                const res = await fetch('/api/assets/upload', { method: 'POST', body: formData });
                const json = await res.json();
                const assetUrl = json.path || json.url;

                if (json.success && assetUrl) {
                     const type = json.type || 'images'; // API endpoint returns plural usually 'images', 'models'
                     if (!canvas) continue;

                     if (type === 'images' || type === 'image') {
                         fabric.FabricImage.fromURL(assetUrl, { crossOrigin: 'anonymous' }).then(img => {
                             if (!img) return; // Error handling
                             img.scaleToWidth(Math.min(300, (canvas.width || 800) / 3));
                             canvas.centerObject(img);
                             const ext = img as ExtendedFabricObject;
                             ext.id = crypto.randomUUID();
                             ext.name = file.name;
                             canvas.add(img);
                             canvas.setActiveObject(img);
                             canvas.requestRenderAll();
                             pushHistory();
                         });
                     } else if (type === 'models' || type === 'model') {
                         // Placeholder for 3D model
                         const group = new fabric.Group([], { left: 100, top: 100, subTargetCheck: true, interactive: true });
                         const box = new fabric.Rect({ width: 100, height: 100, fill: '#3b82f6', rx: 10, ry: 10 });
                         const text = new fabric.IText('3D', { fontSize: 30, fill: 'white', left: 30, top: 35, fontFamily: 'sans-serif', fontWeight: 'bold' });
                         group.add(box); group.add(text);
                         const threeDGroup = group as ThreeDGroup;
                         threeDGroup.is3DModel = true;
                         threeDGroup.modelUrl = assetUrl;
                         threeDGroup.id = crypto.randomUUID();
                         threeDGroup.name = file.name;
                         
                         canvas.centerObject(threeDGroup);
                         canvas.add(threeDGroup);
                         canvas.setActiveObject(threeDGroup);
                         canvas.requestRenderAll();
                         pushHistory();
                     } else if (type === 'videos' || type === 'video') {
                          // Basic Video Support (Screenshot placeholder typically required, or Video element)
                          // For now, let's treat as unsupported or add generic video icon?
                          // The project seems to have generic media handling or video frame capture.
                          // EditorView has mediaPreview but adding to canvas is different.
                          // Let's rely on Image logic for 'video' frames usually, but if we want component we need implementation.
                          // Skip for now or add generic placeholder.
                          toast({ title: "Video uploaded to library. Please add from library.", variant: "success" });
                     }
                }
            } catch (err) {
                console.error("Upload failed", err);
                toast({ title: "Upload failed for " + file.name, variant: "destructive" });
            }
        }
    }, [canvas, pushHistory, toast, user]);

    const startPanelResize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const startX = e.clientX;
        const startWidth = panelState.width;
        
        const moveHandler = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - startX;
            setPanelState(prev => {
                let newWidth = startWidth;
                
                if (prev.mode === 'docked-right') {
                    newWidth = startWidth - dx;
                } else {
                    // docked-left or floating (assuming resize right edge)
                    newWidth = startWidth + dx;
                }
                
                // Constraints
                if (newWidth < 280) newWidth = 280;
                if (newWidth > 600) newWidth = 600;
                
                return { ...prev, width: newWidth };
            });
        };

        const upHandler = () => {
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);
        };
        
        document.body.style.cursor = 'ew-resize';
        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
    };

    const toggleCollapse = () => {
        setPanelState(prev => {
            if (prev.mode === 'docked-left') return { ...prev, mode: 'collapsed-left' };
            if (prev.mode === 'docked-right') return { ...prev, mode: 'collapsed-right' };
            if (prev.mode === 'collapsed-left') return { ...prev, mode: 'docked-left' };
            if (prev.mode === 'collapsed-right') return { ...prev, mode: 'docked-right' };
            return prev;
        });
    };

    const toggleFloat = () => {
        setPanelState(prev => {
            if (prev.mode === 'floating') return { ...prev, mode: 'docked-right', position: { x: 0, y: 0 }};
            // Default float pos center-ish
             return { ...prev, mode: 'floating', position: { x: window.innerWidth - 400, y: 100 }};
        });
    };

    const isPropertiesPanelVisible = panelState.mode !== 'collapsed-left' && panelState.mode !== 'collapsed-right';

    const handleWindowPanelToggle = useCallback((mode: PanelRailMode) => {
        const isChecked = isPropertiesPanelVisible && propertiesPanelMode === mode;
        if (isChecked) {
            setPanelState((prev) => {
                if (prev.mode === 'docked-left') return { ...prev, mode: 'collapsed-left' };
                if (prev.mode === 'docked-right') return { ...prev, mode: 'collapsed-right' };
                if (prev.mode === 'floating') return { ...prev, mode: 'collapsed-right', position: { x: 0, y: 0 } };
                return prev;
            });
            return;
        }

        setPropertiesPanelMode(mode);
        setPanelState((prev) => {
            if (prev.mode === 'collapsed-left') return { ...prev, mode: 'docked-left' };
            if (prev.mode === 'collapsed-right') return { ...prev, mode: 'docked-right' };
            return prev;
        });
    }, [isPropertiesPanelVisible, propertiesPanelMode]);

    const handleWindowDockMode = useCallback((mode: 'docked-left' | 'docked-right' | 'floating') => {
        setPanelState((prev) => {
            if (mode === 'floating') {
                const nextX = typeof window !== 'undefined' ? Math.max(24, window.innerWidth - 400) : prev.position.x;
                return { ...prev, mode: 'floating', position: { x: nextX, y: 100 } };
            }
            return { ...prev, mode, position: { x: 0, y: 0 } };
        });
    }, []);
    
    // UI States
    const [showFileMenu, setShowFileMenu] = useState(false);
    const [showEditMenu, setShowEditMenu] = useState(false);
    const [showImageMenu, setShowImageMenu] = useState(false);
    const [showLayerMenu, setShowLayerMenu] = useState(false);
    const [showSelectMenu, setShowSelectMenu] = useState(false);
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [showViewMenu, setShowViewMenu] = useState(false);
    const [showWindowMenu, setShowWindowMenu] = useState(false);
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [showHelpMenu, setShowHelpMenu] = useState(false);
    const [showTopNavMenus, setShowTopNavMenus] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const shareRef = useRef<HTMLDivElement>(null);
    const [showGridMenu, setShowGridMenu] = useState(false);
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const closeEditorMenus = useCallback((except?: EditorMenuId) => {
        if (except !== 'file') setShowFileMenu(false);
        if (except !== 'edit') setShowEditMenu(false);
        if (except !== 'image') setShowImageMenu(false);
        if (except !== 'layer') setShowLayerMenu(false);
        if (except !== 'select') setShowSelectMenu(false);
        if (except !== 'filter') setShowFilterMenu(false);
        if (except !== 'view') setShowViewMenu(false);
        if (except !== 'window') setShowWindowMenu(false);
        if (except !== 'settings') setShowSettingsMenu(false);
        if (except !== 'help') setShowHelpMenu(false);
        if (except !== 'export') setShowExportMenu(false);
        if (except !== 'share') setShowShareMenu(false);
        if (except !== 'grid') setShowGridMenu(false);
        if (except !== 'tools') setShowToolsMenu(false);
    }, []);
    const toggleEditorMenu = useCallback((menu: EditorMenuId) => {
        closeEditorMenus(menu);
        if (menu === 'file') setShowFileMenu((prev) => !prev);
        if (menu === 'edit') setShowEditMenu((prev) => !prev);
        if (menu === 'image') setShowImageMenu((prev) => !prev);
        if (menu === 'layer') setShowLayerMenu((prev) => !prev);
        if (menu === 'select') setShowSelectMenu((prev) => !prev);
        if (menu === 'filter') setShowFilterMenu((prev) => !prev);
        if (menu === 'view') setShowViewMenu((prev) => !prev);
        if (menu === 'window') setShowWindowMenu((prev) => !prev);
        if (menu === 'settings') setShowSettingsMenu((prev) => !prev);
        if (menu === 'help') setShowHelpMenu((prev) => !prev);
        if (menu === 'export') setShowExportMenu((prev) => !prev);
        if (menu === 'share') setShowShareMenu((prev) => !prev);
        if (menu === 'grid') setShowGridMenu((prev) => !prev);
        if (menu === 'tools') setShowToolsMenu((prev) => !prev);
    }, [closeEditorMenus]);
    const openEditorMenu = useCallback((menu: EditorMenuId) => {
        closeEditorMenus(menu);
        if (menu === 'file') setShowFileMenu(true);
        if (menu === 'edit') setShowEditMenu(true);
        if (menu === 'image') setShowImageMenu(true);
        if (menu === 'layer') setShowLayerMenu(true);
        if (menu === 'select') setShowSelectMenu(true);
        if (menu === 'filter') setShowFilterMenu(true);
        if (menu === 'view') setShowViewMenu(true);
        if (menu === 'window') setShowWindowMenu(true);
        if (menu === 'settings') setShowSettingsMenu(true);
        if (menu === 'help') setShowHelpMenu(true);
        if (menu === 'export') setShowExportMenu(true);
        if (menu === 'share') setShowShareMenu(true);
        if (menu === 'grid') setShowGridMenu(true);
        if (menu === 'tools') setShowToolsMenu(true);
    }, [closeEditorMenus]);
    const [gridType, setGridType] = useState<GridType>('none');
    const [utilityCanvasSize, setUtilityCanvasSize] = useState({ width: 1080, height: 1080 });
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [isExporting, setIsExporting] = useState(false);
    const [showExportQualityModal, setShowExportQualityModal] = useState(false);
    const [exportQualityValue, setExportQualityValue] = useState(100);
    const [exportQualitySize, setExportQualitySize] = useState<string>('');
    const [pendingExportFormat, setPendingExportFormat] = useState<'png' | 'jpg' | null>(null);
    const [pendingExportFilename, setPendingExportFilename] = useState('');
    const [includeCanvasBackground, setIncludeCanvasBackground] = useState(true);
    const pendingExportCropRef = useRef<{ left: number; top: number; width: number; height: number } | undefined>(undefined);
    const exportSizeTimerRef = useRef<number | null>(null);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [autoSelectEnabled, setAutoSelectEnabled] = useState(true);
    const [selectionMode, setSelectionMode] = useState<'layer' | 'group'>('layer');
    const [showTransformControls, setShowTransformControls] = useState(true);
    const [selectFeather, setSelectFeather] = useState(0);
    const [selectAntiAlias, setSelectAntiAlias] = useState(true);
    const [selectionModifyPixels, setSelectionModifyPixels] = useState(12);
    const [wandTopThreshold, setWandTopThreshold] = useState(48);
    const [healingTopSize, setHealingTopSize] = useState(24);
    const [healingTopHardness, setHealingTopHardness] = useState(70);
    const [healingTopSampleAllLayers, setHealingTopSampleAllLayers] = useState(true);
    const [historyBrushTopSize, setHistoryBrushTopSize] = useState(24);
    const [historyBrushTopHardness, setHistoryBrushTopHardness] = useState(70);
    const [historyBrushTopSampleAllLayers, setHistoryBrushTopSampleAllLayers] = useState(true);
    const [blurTopSize, setBlurTopSize] = useState(28);
    const [blurTopStrength, setBlurTopStrength] = useState(45);
    const [blurTopSampleAllLayers, setBlurTopSampleAllLayers] = useState(true);
    const [sharpenTopSize, setSharpenTopSize] = useState(28);
    const [sharpenTopStrength, setSharpenTopStrength] = useState(42);
    const [sharpenTopSampleAllLayers, setSharpenTopSampleAllLayers] = useState(true);
    const [dodgeTopSize, setDodgeTopSize] = useState(28);
    const [dodgeTopExposure, setDodgeTopExposure] = useState(30);
    const [dodgeTopProtectTones, setDodgeTopProtectTones] = useState(true);
    const [cloneTopSize, setCloneTopSize] = useState(24);
    const [cloneTopHardness, setCloneTopHardness] = useState(70);
    const [cloneTopAligned, setCloneTopAligned] = useState(true);
    const [cloneTopSampleAllLayers, setCloneTopSampleAllLayers] = useState(true);
    const [cloneSourcePoint, setCloneSourcePoint] = useState<fabric.Point | null>(null);
    const [expandToolRailLabelsOnHover, setExpandToolRailLabelsOnHover] = useState(() => (
        loadUiPreferences().expandToolRailLabelsOnHover
    ));
    const [paintBrushPreset, setPaintBrushPreset] = useState<RasterBrushPreset>('Pencil');
    const [paintBrushSize, setPaintBrushSize] = useState(10);
    const [paintBrushHardness, setPaintBrushHardness] = useState(80);
    const [paintBrushOpacity, setPaintBrushOpacity] = useState(100);
    const [paintBrushFlow, setPaintBrushFlow] = useState(100);
    const [paintBrushSmoothing, setPaintBrushSmoothing] = useState(50);
    const [paintBlendMode, setPaintBlendMode] = useState<RasterBlendMode>('source-over');
    const [gradientTopType, setGradientTopType] = useState<'linear' | 'radial' | 'angle'>('linear');
    const [gradientTopBlendMode, setGradientTopBlendMode] = useState<'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'>('source-over');
    const [gradientTopOpacity, setGradientTopOpacity] = useState(100);
    const [gradientTopReverse, setGradientTopReverse] = useState(false);
    const [gradientTopDither, setGradientTopDither] = useState(false);
    const [penTopMode, setPenTopMode] = useState<'path' | 'shape'>('path');
    const [penTopPathOperation, setPenTopPathOperation] = useState<'add' | 'subtract' | 'intersect'>('add');
    const [penTopAutoAddDelete, setPenTopAutoAddDelete] = useState(true);
    const [penTopRubberBand, setPenTopRubberBand] = useState(true);
    const [textTopFontFamily, setTextTopFontFamily] = useState(TOP_TEXT_FONT_FAMILIES[0]);
    const [textTopFontStyle, setTextTopFontStyle] = useState(TOP_TEXT_FONT_STYLES[0]);
    const [textTopFontSize, setTextTopFontSize] = useState(TOP_TEXT_DEFAULT_SIZE);
    const [textTopColor, setTextTopColor] = useState('#000000');
    const [textTopBold, setTextTopBold] = useState(false);
    const [textTopItalic, setTextTopItalic] = useState(false);
    const [textTopUnderline, setTextTopUnderline] = useState(false);
    const [textTopAlign, setTextTopAlign] = useState<'left' | 'center' | 'right' | 'justify'>('left');
    const [textTopSpellcheck, setTextTopSpellcheck] = useState(true);
    const [textQuickBarPos, setTextQuickBarPos] = useState<{ visible: boolean; left: number; top: number }>({
        visible: false,
        left: 0,
        top: 0,
    });
    const [shapeTopMode, setShapeTopMode] = useState<'shape' | 'path' | 'pixels'>('shape');
    const [shapeTopFillColor, setShapeTopFillColor] = useState<string>(APP_THEME.shapeDefaultFillHex);
    const [shapeTopStrokeColor, setShapeTopStrokeColor] = useState('#111827');
    const [shapeTopStrokeWidth, setShapeTopStrokeWidth] = useState(0);
    const [shapeTopCornerRadius, setShapeTopCornerRadius] = useState(0);
    const [shapeTopCanSmoothAngles, setShapeTopCanSmoothAngles] = useState(false);
    const [shapeTopFixedSize, setShapeTopFixedSize] = useState(false);
    const [cropTopRatioPreset, setCropTopRatioPreset] = useState<TopCropRatioPreset>('free');
    const [cropTopDeleteOutside, setCropTopDeleteOutside] = useState(false);
    const [cropTopUseArtboardBounds, setCropTopUseArtboardBounds] = useState(true);
    const [cropTopDraftRect, setCropTopDraftRect] = useState<RectBounds | null>(null);
    const [mediaOverlayEnabled, setMediaOverlayEnabled] = useState(true);
    const [mediaOverlayPreset, setMediaOverlayPreset] = useState<MediaOverlayPreset>('canvas-original');
    const [eyedropperTopSampleSize, setEyedropperTopSampleSize] = useState<TopEyedropperSampleSize>(1);
    const [eyedropperTopSampleSource, setEyedropperTopSampleSource] = useState<'current-layer' | 'all-layers'>('current-layer');
    const [eyedropperTopSampledColor, setEyedropperTopSampledColor] = useState('#000000');
    const [zoomTopMode, setZoomTopMode] = useState<'in' | 'out'>('in');
    const [zoomTopStep, setZoomTopStep] = useState<TopZoomStep>(10);
    const [handTopLockPan, setHandTopLockPan] = useState(true);
    const [cursorPreview, setCursorPreview] = useState<CursorPreviewState | null>(null);
    const eyedropperPointerRef = useRef<fabric.Point | null>(null);
    const cropDraftHelperRef = useRef<(fabric.Rect & { isSelectionOverlayHelper?: boolean }) | null>(null);
    const mediaOverlayFrameRef = useRef<(fabric.Rect & ExtendedFabricObject & { excludeFromExport?: boolean }) | null>(null);
    const mediaOverlayLabelRef = useRef<(fabric.Textbox & ExtendedFabricObject & { excludeFromExport?: boolean }) | null>(null);
    const mediaOverlayPendingRestoreRef = useRef<RectBounds | null>(null);

    const cursorPreviewConfig = useMemo<CursorPreviewConfig | null>(() => {
        if (activeTool === 'eyedropper') {
            return { kind: 'eyedropper', diameter: 20 };
        }
        if (activeTool === 'paint') {
            return { kind: 'brush', diameter: paintBrushSize };
        }
        if (activeTool === 'healing') {
            return { kind: 'brush', diameter: healingTopSize };
        }
        if (activeTool === 'clone-stamp') {
            return { kind: 'brush', diameter: cloneTopSize };
        }
        if (activeTool === 'history-brush') {
            return { kind: 'brush', diameter: historyBrushTopSize };
        }
        if (activeTool === 'blur') {
            return { kind: 'brush', diameter: blurTopSize };
        }
        if (activeTool === 'sharpen') {
            return { kind: 'brush', diameter: sharpenTopSize };
        }
        if (activeTool === 'dodge') {
            return { kind: 'brush', diameter: dodgeTopSize };
        }
        return null;
    }, [
        activeTool,
        blurTopSize,
        cloneTopSize,
        dodgeTopSize,
        healingTopSize,
        historyBrushTopSize,
        paintBrushSize,
        sharpenTopSize,
    ]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const persistedMode = window.localStorage.getItem(PANEL_MODE_STORAGE_KEY);
        if (persistedMode) {
            const matched = WINDOW_PANEL_ITEMS.find((item) => item.mode === persistedMode);
            if (matched) {
                setPropertiesPanelMode(matched.mode);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, propertiesPanelMode);
    }, [propertiesPanelMode]);
    const [profileSettings, setProfileSettings] = useState<UserProfileSettings | null>(null);
    const undoStackRef = useRef<string[]>([]);
    const redoStackRef = useRef<string[]>([]);
    const isRestoringRef = useRef(false);
    const historyReadyRef = useRef(false);
    const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
    const retouchNoticeAtRef = useRef(0);
    const retouchLayerRef = useRef<RetouchLayerState | null>(null);
    const retouchHistorySourceRef = useRef<ImageData | null>(null);
    
    // Assets & Missing Items
    const [showMissingAssetsModal, setShowMissingAssetsModal] = useState(false);
    const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
    const [pendingTemplateJson, setPendingTemplateJson] = useState<DesignJson | null>(null);
    const [showAssetBrowserForMissing, setShowAssetBrowserForMissing] = useState(false);
    const [replacingItemId, setReplacingItemId] = useState<string | null>(null);
    const [replacementMap, setReplacementMap] = useState<Record<string, string>>({});
    
    // Auto-switch to properties when clicking canvas objects
    useEffect(() => {
        if (!canvas) return;
        const handleSelection = (e: { e?: Event }) => {
            // If user explicitly clicks on canvas (event exists) and we are not in a creation tool, ensure we show properties
            const creationTools = ['marquee', 'lasso', 'wand', 'quick-select', 'selection-brush', 'healing', 'clone-stamp', 'history-brush', 'blur', 'sharpen', 'dodge', 'pen', 'paint', 'text', 'shapes', '3d-gen', 'ai-zone', 'crop', 'eyedropper', 'zoom', 'hand'];
            if (autoSelectEnabled && e.e && !creationTools.includes(activeTool) && activeTool !== 'select') {
                setActiveTool('select');
            }
        };
        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        return () => {
            canvas.off('selection:created', handleSelection);
            canvas.off('selection:updated', handleSelection);
        };
    }, [canvas, activeTool, autoSelectEnabled, setActiveTool]);

    useEffect(() => {
        if (!canvas) return;
        const objects = canvas.getObjects();
        objects.forEach((object) => {
            object.set({
                hasControls: showTransformControls,
                hasBorders: showTransformControls,
            });
            object.setCoords();
        });
        canvas.requestRenderAll();
    }, [canvas, showTransformControls]);

    useEffect(() => {
        if (!canvas) return;
        const activeCanvas = canvas as fabric.Canvas & {
            contextContainer?: CanvasRenderingContext2D | null;
            contextTop?: CanvasRenderingContext2D | null;
        };
        if (activeCanvas.contextContainer) {
            activeCanvas.contextContainer.imageSmoothingEnabled = selectAntiAlias;
        }
        if (activeCanvas.contextTop) {
            activeCanvas.contextTop.imageSmoothingEnabled = selectAntiAlias;
        }
        canvas.requestRenderAll();
    }, [canvas, selectAntiAlias]);

    const getRetouchBounds = useCallback((): RetouchBounds | null => {
        if (!canvas) return null;

        const withArtboard = canvas as CanvasWithArtboard;
        const artboard = withArtboard.artboard;
        if (artboard && artboard.width > 0 && artboard.height > 0) {
            return {
                left: artboard.left,
                top: artboard.top,
                width: Math.max(1, Math.round(artboard.width)),
                height: Math.max(1, Math.round(artboard.height)),
            };
        }

        const fallbackWidth = Number(canvas.getWidth?.() || utilityCanvasSize.width || 1);
        const fallbackHeight = Number(canvas.getHeight?.() || utilityCanvasSize.height || 1);
        return {
            left: 0,
            top: 0,
            width: Math.max(1, Math.round(fallbackWidth)),
            height: Math.max(1, Math.round(fallbackHeight)),
        };
    }, [canvas, utilityCanvasSize.height, utilityCanvasSize.width]);

    const ensureRetouchLayer = useCallback((): RetouchLayerState | null => {
        if (!canvas) return null;

        const bounds = getRetouchBounds();
        if (!bounds) return null;
        const normalizeLayer = (
            imageLayer: fabric.Image & ExtendedFabricObject,
            sourceElement?: HTMLCanvasElement | HTMLImageElement | null
        ): RetouchLayerState | null => {
            const layerCanvas = document.createElement('canvas');
            layerCanvas.width = bounds.width;
            layerCanvas.height = bounds.height;
            const layerCtx = layerCanvas.getContext('2d');
            if (!layerCtx) return null;
            if (sourceElement) {
                try {
                    layerCtx.drawImage(sourceElement, 0, 0, bounds.width, bounds.height);
                } catch {
                    // ignore invalid source draw
                }
            }

            const imageAny = imageLayer as unknown as {
                setElement?: (element: HTMLCanvasElement) => void;
            };
            imageAny.setElement?.(layerCanvas);
            imageLayer.set({
                left: bounds.left,
                top: bounds.top,
                originX: 'left',
                originY: 'top',
                selectable: false,
                evented: false,
                hasControls: false,
                hasBorders: false,
                objectCaching: false,
                isRetouchLayer: true,
                name: imageLayer.name || 'Retouch Layer',
                dirty: true,
            });
            imageLayer.setCoords();

            const canvasWithFront = canvas as unknown as {
                bringObjectToFront?: (object: fabric.Object) => void;
                bringToFront?: (object: fabric.Object) => void;
            };
            canvasWithFront.bringObjectToFront?.(imageLayer);
            canvasWithFront.bringToFront?.(imageLayer);

            const layerState = {
                bounds,
                layerCanvas,
                ctx: layerCtx,
                image: imageLayer,
            };
            retouchLayerRef.current = layerState;
            try {
                retouchHistorySourceRef.current = layerCtx.getImageData(0, 0, bounds.width, bounds.height);
            } catch {
                retouchHistorySourceRef.current = null;
            }
            return layerState;
        };

        const current = retouchLayerRef.current;
        if (
            current
            && current.bounds.width === bounds.width
            && current.bounds.height === bounds.height
            && current.bounds.left === bounds.left
            && current.bounds.top === bounds.top
        ) {
            return current;
        }

        const existingLayer = canvas.getObjects().find((obj) => (obj as ExtendedFabricObject).isRetouchLayer) as (fabric.Image & ExtendedFabricObject) | undefined;
        if (existingLayer) {
            const existingAny = existingLayer as unknown as {
                getElement?: () => HTMLCanvasElement | HTMLImageElement | null;
            };
            const existingElement = existingAny.getElement?.() || null;
            return normalizeLayer(existingLayer, existingElement);
        }

        const newCanvas = document.createElement('canvas');
        newCanvas.width = bounds.width;
        newCanvas.height = bounds.height;
        const newCtx = newCanvas.getContext('2d');
        if (!newCtx) return null;

        const image = new fabric.Image(newCanvas, {
            left: bounds.left,
            top: bounds.top,
            originX: 'left',
            originY: 'top',
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false,
            objectCaching: false,
        }) as fabric.Image & ExtendedFabricObject;
        image.isRetouchLayer = true;
        image.name = 'Retouch Layer';
        image.id = image.id || `retouch-${Date.now()}`;

        canvas.add(image);
        const canvasWithFront = canvas as unknown as {
            bringObjectToFront?: (object: fabric.Object) => void;
            bringToFront?: (object: fabric.Object) => void;
        };
        canvasWithFront.bringObjectToFront?.(image);
        canvasWithFront.bringToFront?.(image);
        canvas.requestRenderAll();

        const layerState = {
            bounds,
            layerCanvas: newCanvas,
            ctx: newCtx,
            image,
        };
        retouchLayerRef.current = layerState;
        try {
            retouchHistorySourceRef.current = newCtx.getImageData(0, 0, bounds.width, bounds.height);
        } catch {
            retouchHistorySourceRef.current = null;
        }
        return layerState;
    }, [canvas, getRetouchBounds]);

    useEffect(() => {
        if (!canvas) {
            retouchLayerRef.current = null;
            retouchHistorySourceRef.current = null;
        }
    }, [canvas]);

    const setObjectLockedFromCanvasOverlay = useCallback((obj: fabric.Object & ExtendedFabricObject, nextLocked: boolean) => {
        if (!canvas) return;
        const runtimeCanvas = canvas as fabric.Canvas & {
            fire?: (eventName: string, payload?: Record<string, unknown>) => void;
        };
        obj.locked = nextLocked;
        obj.set({
            lockMovementX: nextLocked,
            lockMovementY: nextLocked,
            lockRotation: nextLocked,
            lockScalingX: nextLocked,
            lockScalingY: nextLocked,
            selectable: !nextLocked,
            evented: !nextLocked,
        });
        obj.setCoords();
        if (obj.group) obj.group.set('dirty', true);
        if (nextLocked) canvas.discardActiveObject();
        runtimeCanvas.fire?.('object:modified', { target: obj });
        canvas.requestRenderAll();
    }, [canvas]);

    useEffect(() => {
        if (!canvas) {
            setLockedLayerOverlayEntries([]);
            setHoveredLockedLayerId(null);
            setCanvasLockControl(null);
            return;
        }

        const LOCK_BADGE_MIN_SIZE = 11;
        const LOCK_BADGE_MAX_SIZE = 14;

        const isLockedOverlayCandidate = (obj: fabric.Object): obj is fabric.Object & ExtendedFabricObject => {
            const ext = obj as ExtendedFabricObject & {
                isSelectionOverlayHelper?: boolean;
                isPenDraftAnchor?: boolean;
            };
            if (!ext.locked) return false;
            if (obj.visible === false) return false;
            if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
            if (ext.isSelectionOverlayHelper || ext.isPenDraftAnchor || ext.isRetouchLayer) return false;
            if (ext.name === 'Artboard') return false;
            return true;
        };

        const isCanvasLockControlCandidate = (obj: fabric.Object | null | undefined): obj is fabric.Object & ExtendedFabricObject => {
            if (!obj) return false;
            const ext = obj as ExtendedFabricObject & {
                isSelectionOverlayHelper?: boolean;
                isPenDraftAnchor?: boolean;
            };
            if (ext.locked) return false;
            if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
            if (ext.isSelectionOverlayHelper || ext.isPenDraftAnchor || ext.isRetouchLayer) return false;
            if (ext.name === 'Artboard') return false;
            if (obj.visible === false) return false;
            return true;
        };

        const toRectBounds = (
            bounds: Partial<{ left: number; top: number; width: number; height: number }>
        ): RectBounds | null => {
            const left = Number(bounds.left);
            const top = Number(bounds.top);
            const width = Number(bounds.width);
            const height = Number(bounds.height);
            if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
                return null;
            }
            if (width <= 0 || height <= 0) return null;
            return { left, top, width, height };
        };

        const getObjectSceneBounds = (obj: fabric.Object): RectBounds | null => {
            if (typeof obj.getCoords === 'function') {
                const coords = obj.getCoords();
                if (Array.isArray(coords) && coords.length > 0) {
                    const xs = coords.map((point) => point.x).filter((value) => Number.isFinite(value));
                    const ys = coords.map((point) => point.y).filter((value) => Number.isFinite(value));
                    if (xs.length > 0 && ys.length > 0) {
                        const left = Math.min(...xs);
                        const right = Math.max(...xs);
                        const top = Math.min(...ys);
                        const bottom = Math.max(...ys);
                        if (Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom)) {
                            return toRectBounds({
                                left,
                                top,
                                width: right - left,
                                height: bottom - top,
                            });
                        }
                    }
                }
            }

            if (typeof obj.getBoundingRect === 'function') {
                return toRectBounds(obj.getBoundingRect());
            }

            return null;
        };

        const toViewportRect = (sceneBounds: RectBounds): RectBounds => {
            const viewport = canvas.viewportTransform || [1, 0, 0, 1, 0, 0] as fabric.TMat2D;
            const transformPoint = (
                point: fabric.Point
            ) => fabric.util.transformPoint(point, viewport);

            const topLeft = transformPoint(new fabric.Point(sceneBounds.left, sceneBounds.top));
            const bottomRight = transformPoint(new fabric.Point(
                sceneBounds.left + sceneBounds.width,
                sceneBounds.top + sceneBounds.height
            ));

            const left = Math.min(topLeft.x, bottomRight.x);
            const top = Math.min(topLeft.y, bottomRight.y);
            const width = Math.abs(bottomRight.x - topLeft.x);
            const height = Math.abs(bottomRight.y - topLeft.y);
            return { left, top, width, height };
        };

        const buildLockedOverlayEntries = (): LockedLayerOverlayEntry[] => {
            const entries: LockedLayerOverlayEntry[] = [];
            let paintOrder = 0;

            const walkObject = (obj: fabric.Object, parentLocked: boolean) => {
                const ext = obj as ExtendedFabricObject;
                const isCurrentLocked = Boolean(ext.locked);

                if (!parentLocked && isLockedOverlayCandidate(obj)) {
                    const sceneBounds = getObjectSceneBounds(obj);
                    if (sceneBounds) {
                        const viewportBounds = toViewportRect(sceneBounds);
                        if (viewportBounds.width > 0 && viewportBounds.height > 0) {
                            const iconSizeBase = Math.min(viewportBounds.width, viewportBounds.height) * 0.18;
                            const iconSize = Math.max(LOCK_BADGE_MIN_SIZE, Math.min(LOCK_BADGE_MAX_SIZE, iconSizeBase));
                            const iconPadding = Math.max(3, Math.round(iconSize * 0.22));
                            const iconBounds: RectBounds = {
                                left: viewportBounds.left + viewportBounds.width - iconSize - iconPadding,
                                top: viewportBounds.top + iconPadding,
                                width: iconSize,
                                height: iconSize,
                            };
                            const id = ensureObjectId(obj);

                            entries.push({
                                id,
                                object: obj as fabric.Object & ExtendedFabricObject,
                                paintOrder,
                                sceneBounds,
                                viewportBounds,
                                iconBounds,
                            });
                        }
                    }
                }

                paintOrder += 1;

                const isGroup = obj.type === 'group' && typeof (obj as fabric.Group).getObjects === 'function';
                if (!isGroup) return;

                const nextParentLocked = parentLocked || isCurrentLocked;
                if (nextParentLocked) return;

                const children = (obj as fabric.Group).getObjects();
                children.forEach((child) => walkObject(child, nextParentLocked));
            };

            canvas.getObjects().forEach((obj) => walkObject(obj, false));
            return entries;
        };

        const areEntriesEqual = (
            entries: LockedLayerOverlayEntry[],
            nextEntries: LockedLayerOverlayEntry[]
        ) => {
            if (entries.length !== nextEntries.length) return false;
            for (let index = 0; index < entries.length; index += 1) {
                const current = entries[index];
                const next = nextEntries[index];
                if (current.id !== next.id) return false;
                if (current.paintOrder !== next.paintOrder) return false;
                if (current.viewportBounds.left !== next.viewportBounds.left) return false;
                if (current.viewportBounds.top !== next.viewportBounds.top) return false;
                if (current.viewportBounds.width !== next.viewportBounds.width) return false;
                if (current.viewportBounds.height !== next.viewportBounds.height) return false;
                if (current.iconBounds.left !== next.iconBounds.left) return false;
                if (current.iconBounds.top !== next.iconBounds.top) return false;
                if (current.iconBounds.width !== next.iconBounds.width) return false;
                if (current.iconBounds.height !== next.iconBounds.height) return false;
            }
            return true;
        };

        const syncLockedLayerOverlayEntries = () => {
            const nextEntries = buildLockedOverlayEntries();
            setLockedLayerOverlayEntries((current) => (
                areEntriesEqual(current, nextEntries) ? current : nextEntries
            ));
            setHoveredLockedLayerId((current) => (
                current && nextEntries.some((entry) => entry.id === current) ? current : null
            ));

            const activeObject = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
            if (!isCanvasLockControlCandidate(activeObject)) {
                setCanvasLockControl(null);
                return;
            }

            const activeSceneBounds = getObjectSceneBounds(activeObject);
            if (!activeSceneBounds) {
                setCanvasLockControl(null);
                return;
            }

            const activeViewportBounds = toViewportRect(activeSceneBounds);
            const buttonSize = Math.max(12, Math.min(16, Math.min(activeViewportBounds.width, activeViewportBounds.height) * 0.16));
            const canvasElement = typeof canvas.getElement === 'function' ? canvas.getElement() : null;
            const maxLeft = Number.isFinite(canvasElement?.clientWidth)
                ? Math.max(2, (canvasElement?.clientWidth ?? 0) - buttonSize - 2)
                : Number.POSITIVE_INFINITY;
            const maxTop = Number.isFinite(canvasElement?.clientHeight)
                ? Math.max(2, (canvasElement?.clientHeight ?? 0) - buttonSize - 2)
                : Number.POSITIVE_INFINITY;
            const cornerInset = Math.max(2, Math.round(buttonSize * 0.24));
            const desiredLeft = activeViewportBounds.left + activeViewportBounds.width - buttonSize - cornerInset;
            const desiredTop = activeViewportBounds.top + cornerInset;
            const buttonBounds: RectBounds = {
                left: Math.min(maxLeft, Math.max(2, desiredLeft)),
                top: Math.min(maxTop, Math.max(2, desiredTop)),
                width: buttonSize,
                height: buttonSize,
            };
            const activeId = ensureObjectId(activeObject);
            const locked = Boolean(activeObject.locked);
            const label = `${locked ? 'Unlock' : 'Lock'} layer ${activeObject.name || activeId}`;
            setCanvasLockControl({
                id: activeId,
                object: activeObject,
                locked,
                buttonBounds,
                label,
            });
        };

        canvas.on('after:render', syncLockedLayerOverlayEntries);
        canvas.on('object:added', syncLockedLayerOverlayEntries);
        canvas.on('object:removed', syncLockedLayerOverlayEntries);
        canvas.on('object:modified', syncLockedLayerOverlayEntries);
        canvas.on('selection:created', syncLockedLayerOverlayEntries);
        canvas.on('selection:updated', syncLockedLayerOverlayEntries);
        canvas.on('selection:cleared', syncLockedLayerOverlayEntries);
        canvas.requestRenderAll();
        syncLockedLayerOverlayEntries();

        return () => {
            canvas.off('after:render', syncLockedLayerOverlayEntries);
            canvas.off('object:added', syncLockedLayerOverlayEntries);
            canvas.off('object:removed', syncLockedLayerOverlayEntries);
            canvas.off('object:modified', syncLockedLayerOverlayEntries);
            canvas.off('selection:created', syncLockedLayerOverlayEntries);
            canvas.off('selection:updated', syncLockedLayerOverlayEntries);
            canvas.off('selection:cleared', syncLockedLayerOverlayEntries);
        };
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;
        const resolvedSelectionTool = activeTool === 'quick-select'
            ? 'wand'
            : activeTool === 'selection-brush'
                ? 'lasso'
                : activeTool;

        let isDragging = false;
        let selectionTool: 'marquee' | 'lasso' | null = null;
        let dragStart: fabric.Point | null = null;
        let marqueeHelper: MarqueeSelectionHelper | null = null;
        let lassoHelper: LassoSelectionHelper | null = null;
        let lassoPoints: fabric.Point[] = [];

        const intersectsBounds = (
            a: { left: number; top: number; width: number; height: number },
            b: { left: number; top: number; width: number; height: number }
        ) => {
            return !(
                a.left + a.width < b.left
                || b.left + b.width < a.left
                || a.top + a.height < b.top
                || b.top + b.height < a.top
            );
        };

        const pointInPolygon = (point: fabric.Point, polygon: fabric.Point[]) => {
            if (polygon.length < 3) return false;
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const xi = polygon[i].x;
                const yi = polygon[i].y;
                const xj = polygon[j].x;
                const yj = polygon[j].y;
                const intersects = ((yi > point.y) !== (yj > point.y))
                    && (point.x < (((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON)) + xi);
                if (intersects) inside = !inside;
            }
            return inside;
        };

        const getPolygonBounds = (points: fabric.Point[]) => {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            points.forEach((point) => {
                if (point.x < minX) minX = point.x;
                if (point.y < minY) minY = point.y;
                if (point.x > maxX) maxX = point.x;
                if (point.y > maxY) maxY = point.y;
            });
            return {
                left: minX,
                top: minY,
                width: Math.max(0, maxX - minX),
                height: Math.max(0, maxY - minY),
            };
        };

        const buildLassoPathData = (points: fabric.Point[], closed = false) => {
            if (points.length === 0) return '';
            const start = points[0];
            let pathData = `M ${start.x} ${start.y}`;
            for (let i = 1; i < points.length; i += 1) {
                pathData += ` L ${points[i].x} ${points[i].y}`;
            }
            if (closed && points.length > 2) {
                pathData += ' Z';
            }
            return pathData;
        };

        const updateLassoHelperPath = (points: fabric.Point[], closed = false) => {
            if (!lassoHelper || points.length === 0) return;
            const nextPath = new fabric.Path(buildLassoPathData(points, closed));
            lassoHelper.set({
                path: nextPath.path,
                width: nextPath.width,
                height: nextPath.height,
                pathOffset: nextPath.pathOffset,
                dirty: true,
            });
            lassoHelper.setCoords();
        };

        const clearSelectionHelpers = () => {
            if (marqueeHelper) {
                canvas.remove(marqueeHelper);
                marqueeHelper = null;
            }
            if (lassoHelper) {
                canvas.remove(lassoHelper);
                lassoHelper = null;
            }
            lassoPoints = [];
        };

        const getScenePointer = (opt: fabric.TPointerEventInfo): fabric.Point | null => {
            const optWithScene = opt as unknown as { scenePoint?: fabric.Point };
            if (optWithScene.scenePoint) return optWithScene.scenePoint;

            const canvasWithScene = canvas as unknown as {
                getScenePoint?: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point;
            };
            if (opt.e && typeof canvasWithScene.getScenePoint === 'function') {
                return canvasWithScene.getScenePoint(opt.e);
            }

            return null;
        };

        const collectSelectableObjects = () => canvas.getObjects().filter((obj) => {
                const ext = obj as ExtendedFabricObject & {
                    isPenDraftAnchor?: boolean;
                    isSelectionOverlayHelper?: boolean;
                };

                if (obj === marqueeHelper || obj === lassoHelper || ext.isSelectionOverlayHelper) return false;
                if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
                if (ext.isPenDraftAnchor) return false;
                if (ext.name === 'Artboard') return false;
                if (obj.selectable === false || obj.evented === false) return false;
                return true;
            });

        const commitSelectedObjects = (selected: fabric.Object[]) => {
            if (selected.length === 0) {
                canvas.discardActiveObject();
                canvas.requestRenderAll();
                return;
            }

            if (selectionMode === 'layer' || selected.length === 1) {
                const topMost = selected[selected.length - 1];
                if (topMost) {
                    canvas.setActiveObject(topMost);
                    canvas.requestRenderAll();
                }
                return;
            }

            const activeSelection = new fabric.ActiveSelection(selected, { canvas });
            canvas.setActiveObject(activeSelection);
            canvas.requestRenderAll();
        };

        const commitMarqueeSelection = (selectionBounds: { left: number; top: number; width: number; height: number }) => {
            const selected = collectSelectableObjects().filter((obj) => {
                const objectBounds = obj.getBoundingRect();
                return intersectsBounds(selectionBounds, objectBounds);
            });
            commitSelectedObjects(selected);
        };

        const commitLassoSelection = (points: fabric.Point[]) => {
            if (points.length < 3) {
                canvas.requestRenderAll();
                return;
            }
            const polygonBounds = getPolygonBounds(points);
            const selected = collectSelectableObjects().filter((obj) => {
                const objectBounds = obj.getBoundingRect();
                if (!intersectsBounds(polygonBounds, objectBounds)) return false;

                const center = new fabric.Point(
                    objectBounds.left + (objectBounds.width / 2),
                    objectBounds.top + (objectBounds.height / 2)
                );
                if (pointInPolygon(center, points)) return true;

                const corners = [
                    new fabric.Point(objectBounds.left, objectBounds.top),
                    new fabric.Point(objectBounds.left + objectBounds.width, objectBounds.top),
                    new fabric.Point(objectBounds.left, objectBounds.top + objectBounds.height),
                    new fabric.Point(objectBounds.left + objectBounds.width, objectBounds.top + objectBounds.height),
                ];
                return corners.some((corner) => pointInPolygon(corner, points));
            });

            commitSelectedObjects(selected);
        };

        const toRgbColor = (value: unknown): { r: number; g: number; b: number } | null => {
            if (typeof value !== 'string') return null;
            const parsed = parseColorWithAlpha(value);
            if (parsed.alpha <= 0) return null;

            const normalized = (normalizeColorValue(parsed.color) || parsed.color).trim();
            const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
            if (shortHex) {
                const digits = shortHex[1];
                return {
                    r: Number.parseInt(`${digits[0]}${digits[0]}`, 16),
                    g: Number.parseInt(`${digits[1]}${digits[1]}`, 16),
                    b: Number.parseInt(`${digits[2]}${digits[2]}`, 16),
                };
            }

            const fullHex = normalized.match(/^#([0-9a-f]{6})$/i);
            if (fullHex) {
                const digits = fullHex[1];
                return {
                    r: Number.parseInt(digits.slice(0, 2), 16),
                    g: Number.parseInt(digits.slice(2, 4), 16),
                    b: Number.parseInt(digits.slice(4, 6), 16),
                };
            }

            const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
            if (rgbMatch) {
                const channels = rgbMatch[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part.trim()));
                if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) {
                    return {
                        r: Math.max(0, Math.min(255, Math.round(channels[0]))),
                        g: Math.max(0, Math.min(255, Math.round(channels[1]))),
                        b: Math.max(0, Math.min(255, Math.round(channels[2]))),
                    };
                }
            }

            return null;
        };

        const getObjectRepresentativeColor = (obj: fabric.Object): { r: number; g: number; b: number } | null => {
            const ext = obj as ExtendedFabricObject;
            return toRgbColor(ext.fill) || toRgbColor(ext.stroke) || null;
        };

        const colorDistance = (
            a: { r: number; g: number; b: number },
            b: { r: number; g: number; b: number }
        ) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

        const isPointInsideBounds = (
            point: fabric.Point,
            bounds: { left: number; top: number; width: number; height: number }
        ) => (
            point.x >= bounds.left
            && point.x <= bounds.left + bounds.width
            && point.y >= bounds.top
            && point.y <= bounds.top + bounds.height
        );

        const commitWandSelection = (opt: fabric.TPointerEventInfo, pointer: fabric.Point) => {
            const selectableObjects = collectSelectableObjects();
            if (selectableObjects.length === 0) {
                commitSelectedObjects([]);
                return;
            }

            const optWithTarget = opt as fabric.TPointerEventInfo & { target?: fabric.Object | null };
            const directTarget = optWithTarget.target && selectableObjects.includes(optWithTarget.target)
                ? optWithTarget.target
                : null;
            const fallbackTarget = selectableObjects.filter((obj) => isPointInsideBounds(pointer, obj.getBoundingRect())).at(-1) || null;
            const seedTarget = directTarget || fallbackTarget;
            if (!seedTarget) {
                commitSelectedObjects([]);
                return;
            }

            const normalizedThreshold = Math.max(0, Math.min(180, Math.round(wandTopThreshold)));
            const seedColor = getObjectRepresentativeColor(seedTarget);
            if (!seedColor || normalizedThreshold <= 0) {
                commitSelectedObjects([seedTarget]);
                return;
            }

            const selected = selectableObjects.filter((obj) => {
                const objectColor = getObjectRepresentativeColor(obj);
                if (!objectColor) return obj === seedTarget;
                return colorDistance(seedColor, objectColor) <= normalizedThreshold;
            });

            if (!selected.includes(seedTarget)) {
                selected.push(seedTarget);
            }
            commitSelectedObjects(selected);
        };

        const cancelLassoCapture = () => {
            if (!isDragging || selectionTool !== 'lasso') return false;
            isDragging = false;
            selectionTool = null;
            dragStart = null;
            clearSelectionHelpers();
            canvas.requestRenderAll();
            return true;
        };

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const isMarquee = resolvedSelectionTool === 'marquee';
            const isLasso = resolvedSelectionTool === 'lasso';
            const isWand = resolvedSelectionTool === 'wand';
            if (!isMarquee && !isLasso && !isWand) return;
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;

            const pointer = getScenePointer(opt);
            if (!pointer) return;

            if (isWand) {
                commitWandSelection(opt, pointer);
                return;
            }

            isDragging = true;
            selectionTool = isLasso ? 'lasso' : 'marquee';
            dragStart = pointer;
            clearSelectionHelpers();

            if (selectionTool === 'marquee') {
                marqueeHelper = new fabric.Rect({
                    left: pointer.x,
                    top: pointer.y,
                    width: 1,
                    height: 1,
                    fill: 'rgba(37,99,235,0.12)',
                    stroke: '#2563eb',
                    strokeWidth: 1,
                    strokeDashArray: [4, 4],
                    originX: 'left',
                    originY: 'top',
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    excludeFromExport: true,
                }) as MarqueeSelectionHelper;
                marqueeHelper.isSelectionOverlayHelper = true;
                canvas.add(marqueeHelper);
            } else {
                lassoPoints = [pointer];
                lassoHelper = new fabric.Path(buildLassoPathData([pointer, pointer]), {
                    fill: 'rgba(37,99,235,0.12)',
                    stroke: '#2563eb',
                    strokeWidth: 1.2,
                    strokeDashArray: [4, 4],
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    excludeFromExport: true,
                }) as LassoSelectionHelper;
                lassoHelper.isSelectionOverlayHelper = true;
                canvas.add(lassoHelper);
            }

            canvas.requestRenderAll();
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            if (!isDragging || !selectionTool) return;
            const pointer = getScenePointer(opt);
            if (!pointer) return;

            if (selectionTool === 'marquee') {
                if (!dragStart || !marqueeHelper) return;
                const left = Math.min(dragStart.x, pointer.x);
                const top = Math.min(dragStart.y, pointer.y);
                const width = Math.max(1, Math.abs(pointer.x - dragStart.x));
                const height = Math.max(1, Math.abs(pointer.y - dragStart.y));
                marqueeHelper.set({
                    left,
                    top,
                    width,
                    height,
                });
                marqueeHelper.setCoords();
                canvas.requestRenderAll();
                return;
            }

            if (!lassoHelper) return;
            const lastPoint = lassoPoints[lassoPoints.length - 1];
            if (lastPoint && Math.hypot(pointer.x - lastPoint.x, pointer.y - lastPoint.y) < 2) return;
            lassoPoints = [...lassoPoints, pointer];
            updateLassoHelperPath(lassoPoints, false);
            canvas.requestRenderAll();
        };

        const handleMouseUp = (opt: fabric.TPointerEventInfo) => {
            if (!isDragging || !selectionTool) return;
            isDragging = false;

            const pointer = getScenePointer(opt) || dragStart;
            if (!pointer || !dragStart) {
                selectionTool = null;
                dragStart = null;
                clearSelectionHelpers();
                return;
            }

            if (selectionTool === 'marquee') {
                const selectionBounds = {
                    left: Math.min(dragStart.x, pointer.x),
                    top: Math.min(dragStart.y, pointer.y),
                    width: Math.abs(pointer.x - dragStart.x),
                    height: Math.abs(pointer.y - dragStart.y),
                };
                selectionTool = null;
                dragStart = null;
                clearSelectionHelpers();

                if (selectionBounds.width < 2 || selectionBounds.height < 2) {
                    canvas.requestRenderAll();
                    return;
                }

                commitMarqueeSelection(selectionBounds);
                return;
            }

            const finalizedPoints = [...lassoPoints];
            const lastPoint = finalizedPoints[finalizedPoints.length - 1];
            if (!lastPoint || Math.hypot(pointer.x - lastPoint.x, pointer.y - lastPoint.y) >= 1) {
                finalizedPoints.push(pointer);
            }

            selectionTool = null;
            dragStart = null;
            clearSelectionHelpers();
            if (finalizedPoints.length < 3) {
                canvas.requestRenderAll();
                return;
            }

            commitLassoSelection(finalizedPoints);
        };

        const handleWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (cancelLassoCapture()) {
                event.preventDefault();
            }
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        window.addEventListener('keydown', handleWindowKeyDown);

        return () => {
            isDragging = false;
            selectionTool = null;
            dragStart = null;
            lassoPoints = [];
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
            window.removeEventListener('keydown', handleWindowKeyDown);
            clearSelectionHelpers();
        };
    }, [canvas, activeTool, selectionMode, wandTopThreshold]);

    useEffect(() => {
        if (!canvas) return;
        const isHealing = activeTool === 'healing';
        const isCloneStamp = activeTool === 'clone-stamp';
        const isHistoryBrush = activeTool === 'history-brush';
        const isBlur = activeTool === 'blur';
        const isSharpen = activeTool === 'sharpen';
        const isDodge = activeTool === 'dodge';
        if (!isHealing && !isCloneStamp && !isHistoryBrush && !isBlur && !isSharpen && !isDodge) return;

        let isDrawing = false;
        let strokeMutated = false;
        let lastPoint: fabric.Point | null = null;
        let cloneOffset: fabric.Point | null = null;
        let sourceCanvas: HTMLCanvasElement | null = null;
        let maskCanvas: HTMLCanvasElement | null = null;

        const notifyRetouch = (title: string, description: string) => {
            const now = Date.now();
            if (now - retouchNoticeAtRef.current < 1200) return;
            retouchNoticeAtRef.current = now;
            toast({
                title,
                description,
                variant: 'warning',
            });
        };

        const getScenePointer = (opt: fabric.TPointerEventInfo): fabric.Point | null => {
            const optWithScene = opt as unknown as { scenePoint?: fabric.Point };
            if (optWithScene.scenePoint) return optWithScene.scenePoint;

            const canvasWithScene = canvas as unknown as {
                getScenePoint?: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point;
            };
            if (opt.e && typeof canvasWithScene.getScenePoint === 'function') {
                return canvasWithScene.getScenePoint(opt.e);
            }

            return null;
        };

        const buildSceneSourceCanvas = (layer: RetouchLayerState, useAllLayers: boolean) => {
            if (!useAllLayers) {
                return layer.layerCanvas;
            }

            const source = document.createElement('canvas');
            source.width = layer.bounds.width;
            source.height = layer.bounds.height;
            const sourceCtx = source.getContext('2d');
            if (!sourceCtx) return null;

            const canvasAny = canvas as unknown as {
                toCanvasElement?: (options?: Record<string, unknown>) => HTMLCanvasElement;
                lowerCanvasEl?: HTMLCanvasElement;
                getElement?: () => HTMLCanvasElement | null;
            };

            if (typeof canvasAny.toCanvasElement === 'function') {
                try {
                    const snapshot = canvasAny.toCanvasElement({
                        left: layer.bounds.left,
                        top: layer.bounds.top,
                        width: layer.bounds.width,
                        height: layer.bounds.height,
                        multiplier: 1,
                        enableRetinaScaling: false,
                        withoutTransform: true,
                    });
                    sourceCtx.drawImage(snapshot, 0, 0, layer.bounds.width, layer.bounds.height);
                    return source;
                } catch {
                    // fall through to lower-canvas sampling
                }
            }

            const lowerCanvas = canvasAny.lowerCanvasEl || canvasAny.getElement?.();
            if (lowerCanvas) {
                try {
                    const vt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
                    const mapSceneToViewport = (point: fabric.Point) => new fabric.Point(
                        (point.x * vt[0]) + (point.y * vt[2]) + vt[4],
                        (point.x * vt[1]) + (point.y * vt[3]) + vt[5]
                    );

                    const topLeft = mapSceneToViewport(new fabric.Point(layer.bounds.left, layer.bounds.top));
                    const bottomRight = mapSceneToViewport(new fabric.Point(layer.bounds.left + layer.bounds.width, layer.bounds.top + layer.bounds.height));
                    const logicalWidth = Number(canvas.getWidth?.() || layer.bounds.width || 1);
                    const logicalHeight = Number(canvas.getHeight?.() || layer.bounds.height || 1);
                    const pixelScaleX = lowerCanvas.width / Math.max(1, logicalWidth);
                    const pixelScaleY = lowerCanvas.height / Math.max(1, logicalHeight);

                    let sx = Math.floor(Math.min(topLeft.x, bottomRight.x) * pixelScaleX);
                    let sy = Math.floor(Math.min(topLeft.y, bottomRight.y) * pixelScaleY);
                    let sw = Math.ceil(Math.abs(bottomRight.x - topLeft.x) * pixelScaleX);
                    let sh = Math.ceil(Math.abs(bottomRight.y - topLeft.y) * pixelScaleY);

                    sx = Math.max(0, Math.min(lowerCanvas.width - 1, sx));
                    sy = Math.max(0, Math.min(lowerCanvas.height - 1, sy));
                    sw = Math.max(1, Math.min(lowerCanvas.width - sx, sw));
                    sh = Math.max(1, Math.min(lowerCanvas.height - sy, sh));

                    sourceCtx.drawImage(lowerCanvas, sx, sy, sw, sh, 0, 0, layer.bounds.width, layer.bounds.height);
                    return source;
                } catch {
                    // fallback to retouch-layer-only sampling
                }
            }

            try {
                sourceCtx.drawImage(layer.layerCanvas, 0, 0);
            } catch {
                return null;
            }
            return source;
        };

        const buildHistorySourceCanvas = (layer: RetouchLayerState) => {
            const historyImageData = retouchHistorySourceRef.current;
            if (!historyImageData) return layer.layerCanvas;

            const historyCanvas = document.createElement('canvas');
            historyCanvas.width = historyImageData.width;
            historyCanvas.height = historyImageData.height;
            const historyCtx = historyCanvas.getContext('2d');
            if (!historyCtx) return layer.layerCanvas;
            historyCtx.putImageData(historyImageData, 0, 0);
            return historyCanvas;
        };

        const getBrushProfile = () => {
            if (isCloneStamp) {
                return computeRetouchBrushProfile({
                    mode: 'clone',
                    size: cloneTopSize,
                    hardness: cloneTopHardness,
                });
            }
            if (isHealing) {
                return computeRetouchBrushProfile({
                    mode: 'healing',
                    size: healingTopSize,
                    hardness: healingTopHardness,
                });
            }
            if (isHistoryBrush) {
                return computeRetouchBrushProfile({
                    mode: 'history',
                    size: historyBrushTopSize,
                    hardness: historyBrushTopHardness,
                });
            }
            if (isBlur) {
                return computeRetouchBrushProfile({
                    mode: 'blur',
                    size: blurTopSize,
                    strength: blurTopStrength,
                });
            }
            if (isSharpen) {
                return computeRetouchBrushProfile({
                    mode: 'sharpen',
                    size: sharpenTopSize,
                    strength: sharpenTopStrength,
                });
            }
            return computeRetouchBrushProfile({
                mode: 'dodge',
                size: dodgeTopSize,
                exposure: dodgeTopExposure,
                protectTones: dodgeTopProtectTones,
            });
        };

        const markLayerMutated = (layer: RetouchLayerState) => {
            layer.image.set({ dirty: true });
            layer.image.setCoords();
            canvas.requestRenderAll();
            strokeMutated = true;
        };

        const stampAtPoint = (scenePoint: fabric.Point, layer: RetouchLayerState) => {
            const localDestination = toLocalRetouchPoint(scenePoint, layer.bounds);
            if (!isLocalPointInsideBounds(localDestination, layer.bounds)) return;

            const profile = getBrushProfile();
            const size = profile.size;
            const opacity = profile.opacity;

            if (isDodge) {
                const didStampDodge = stampDodge({
                    destinationCtx: layer.ctx,
                    destinationPoint: localDestination,
                    size,
                    opacity,
                    protectTones: dodgeTopProtectTones,
                    maskCanvas,
                });
                if (didStampDodge) {
                    markLayerMutated(layer);
                }
                return;
            }

            if (!sourceCanvas) return;

            const localSource = isCloneStamp
                ? new fabric.Point(
                    localDestination.x + (cloneOffset?.x || 0),
                    localDestination.y + (cloneOffset?.y || 0)
                )
                : localDestination;

            if (!isLocalPointInsideBounds(localSource, layer.bounds)) return;

            const blurPx = profile.blurPx;

            if (isSharpen) {
                const didSharpen = stampSharpen({
                    sourceCanvas,
                    destinationCtx: layer.ctx,
                    sourcePoint: localSource,
                    destinationPoint: localDestination,
                    size,
                    opacity,
                    amount: profile.sharpenAmount,
                    maskCanvas,
                });
                if (didSharpen) {
                    markLayerMutated(layer);
                }
                return;
            }

            const didStamp = stampFromSource({
                sourceCanvas,
                destinationCtx: layer.ctx,
                sourcePoint: localSource,
                destinationPoint: localDestination,
                size,
                opacity,
                blurPx,
                maskCanvas,
                compositeOperation: profile.compositeOperation,
            });
            let didMutate = didStamp;

            if (isHealing && didStamp && profile.secondaryPass) {
                const didSecondaryStamp = stampFromSource({
                    sourceCanvas,
                    destinationCtx: layer.ctx,
                    sourcePoint: localSource,
                    destinationPoint: localDestination,
                    size,
                    opacity: profile.secondaryPass.opacity,
                    blurPx: profile.secondaryPass.blurPx,
                    maskCanvas,
                    compositeOperation: profile.secondaryPass.compositeOperation,
                });
                didMutate = didMutate || didSecondaryStamp;
            }

            if (didMutate) {
                markLayerMutated(layer);
            }
        };

        const finishStroke = () => {
            if (!isDrawing) return;
            const endPoint = lastPoint;
            const nextCloneSourcePoint = isCloneStamp
                ? resolveNextCloneSourcePoint({
                    aligned: cloneTopAligned,
                    strokeMutated,
                    endPoint,
                    cloneOffset,
                })
                : null;
            isDrawing = false;
            lastPoint = null;
            cloneOffset = null;
            sourceCanvas = null;
            maskCanvas = null;
            if (strokeMutated) {
                pushHistory();
                setIsDirty(true);
            }
            if (nextCloneSourcePoint) {
                setCloneSourcePoint(nextCloneSourcePoint);
            }
            strokeMutated = false;
        };

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;
            const pointer = getScenePointer(opt);
            if (!pointer) return;

            if (isCloneStamp) {
                const isAltKey = Boolean(rawEvent && 'altKey' in rawEvent && rawEvent.altKey);
                if (isAltKey) {
                    setCloneSourcePoint(new fabric.Point(pointer.x, pointer.y));
                    return;
                }
                if (!cloneSourcePoint) {
                    notifyRetouch(
                        'Clone source required',
                        'Option-click on the canvas to set a clone source point.'
                    );
                    return;
                }
            }

            const layer = ensureRetouchLayer();
            if (!layer) {
                notifyRetouch(
                    'Retouch unavailable',
                    'Retouch layer could not be prepared on this canvas.'
                );
                return;
            }

            try {
                retouchHistorySourceRef.current = layer.ctx.getImageData(0, 0, layer.bounds.width, layer.bounds.height);
            } catch {
                retouchHistorySourceRef.current = null;
            }
            isDrawing = true;
            strokeMutated = false;
            lastPoint = pointer;
            const profile = getBrushProfile();
            maskCanvas = createSoftBrushMask(profile.size, profile.maskHardness);

            if (isCloneStamp) {
                cloneOffset = new fabric.Point(
                    (cloneSourcePoint?.x || 0) - pointer.x,
                    (cloneSourcePoint?.y || 0) - pointer.y
                );
                sourceCanvas = buildSceneSourceCanvas(layer, cloneTopSampleAllLayers);
            } else if (isHealing) {
                sourceCanvas = buildSceneSourceCanvas(layer, healingTopSampleAllLayers);
            } else if (isHistoryBrush) {
                sourceCanvas = buildHistorySourceCanvas(layer);
            } else if (isBlur) {
                sourceCanvas = buildSceneSourceCanvas(layer, blurTopSampleAllLayers);
            } else if (isSharpen) {
                sourceCanvas = buildSceneSourceCanvas(layer, sharpenTopSampleAllLayers);
            } else {
                sourceCanvas = null;
            }

            stampAtPoint(pointer, layer);
            if (!strokeMutated && !isDodge) {
                notifyRetouch(
                    'Retouch source unavailable',
                    'Could not read source pixels for the current stroke.'
                );
                finishStroke();
                return;
            }
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            if (!isDrawing || !lastPoint) return;
            const pointer = getScenePointer(opt);
            if (!pointer) return;
            const layer = retouchLayerRef.current;
            if (!layer) return;

            const stepSpacing = getBrushProfile().spacing;
            const points = interpolateStrokePoints(lastPoint, pointer, stepSpacing);
            points.forEach((point) => stampAtPoint(point, layer));
            lastPoint = pointer;
        };

        const handleMouseUp = () => {
            finishStroke();
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        return () => {
            finishStroke();
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
        };
    }, [
        canvas,
        activeTool,
        blurTopSampleAllLayers,
        blurTopSize,
        blurTopStrength,
        cloneSourcePoint,
        cloneTopAligned,
        cloneTopHardness,
        cloneTopSampleAllLayers,
        cloneTopSize,
        dodgeTopExposure,
        dodgeTopProtectTones,
        dodgeTopSize,
        ensureRetouchLayer,
        healingTopHardness,
        healingTopSampleAllLayers,
        healingTopSize,
        historyBrushTopHardness,
        historyBrushTopSize,
        sharpenTopSampleAllLayers,
        sharpenTopSize,
        sharpenTopStrength,
        pushHistory,
        toast,
    ]);

    useEffect(() => {
        if (!canvas || !cursorPreviewConfig) {
            setCursorPreview(null);
            return;
        }

        const clampCursorDiameter = (diameter: number) => {
            if (cursorPreviewConfig.kind !== 'brush') return 20;
            const zoomScale = Number.isFinite(zoom) ? Math.max(0.05, zoom) : 1;
            return Math.max(8, Math.min(320, diameter * zoomScale));
        };

        const resolveClientPoint = (opt: fabric.TPointerEventInfo): { x: number; y: number } | null => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'clientX' in rawEvent && 'clientY' in rawEvent) {
                return { x: rawEvent.clientX, y: rawEvent.clientY };
            }

            const optWithScene = opt as unknown as { scenePoint?: fabric.Point };
            const canvasWithScene = canvas as unknown as {
                getScenePoint?: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point;
                lowerCanvasEl?: HTMLCanvasElement;
                getElement?: () => HTMLCanvasElement | null;
            };
            const scenePoint = optWithScene.scenePoint
                || (opt.e && typeof canvasWithScene.getScenePoint === 'function'
                    ? canvasWithScene.getScenePoint(opt.e)
                    : null);
            if (!scenePoint) return null;

            const canvasElement = canvasWithScene.lowerCanvasEl || canvasWithScene.getElement?.();
            if (!canvasElement) return null;

            const rect = canvasElement.getBoundingClientRect();
            const logicalWidth = Number(canvas.getWidth?.() || canvasElement.width || 1);
            const logicalHeight = Number(canvas.getHeight?.() || canvasElement.height || 1);
            const vt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
            const viewportX = (scenePoint.x * vt[0]) + (scenePoint.y * vt[2]) + vt[4];
            const viewportY = (scenePoint.x * vt[1]) + (scenePoint.y * vt[3]) + vt[5];

            return {
                x: rect.left + (viewportX * (rect.width / Math.max(1, logicalWidth))),
                y: rect.top + (viewportY * (rect.height / Math.max(1, logicalHeight))),
            };
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            const point = resolveClientPoint(opt);
            if (!point) return;

            setCursorPreview({
                kind: cursorPreviewConfig.kind,
                clientX: point.x,
                clientY: point.y,
                diameter: clampCursorDiameter(cursorPreviewConfig.diameter),
            });
        };

        const clearCursorPreview = () => {
            setCursorPreview(null);
        };

        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:out', clearCursorPreview);
        return () => {
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:out', clearCursorPreview);
            setCursorPreview(null);
        };
    }, [canvas, cursorPreviewConfig, zoom]);

    const handleSelectionModify = useCallback((mode: 'expand' | 'contract') => {
        if (!canvas) return;

        const intersectsBounds = (
            a: { left: number; top: number; width: number; height: number },
            b: { left: number; top: number; width: number; height: number }
        ) => !(
            a.left + a.width < b.left
            || b.left + b.width < a.left
            || a.top + a.height < b.top
            || b.top + b.height < a.top
        );

        const collectSelectableObjects = () => canvas.getObjects().filter((obj) => {
            const ext = obj as ExtendedFabricObject & {
                isPenDraftAnchor?: boolean;
                isSelectionOverlayHelper?: boolean;
            };
            if (ext.isSelectionOverlayHelper) return false;
            if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
            if (ext.isPenDraftAnchor) return false;
            if (ext.name === 'Artboard') return false;
            if (obj.selectable === false || obj.evented === false) return false;
            return true;
        });

        const commitSelectedObjects = (selected: fabric.Object[]) => {
            if (selected.length === 0) {
                canvas.discardActiveObject();
                canvas.requestRenderAll();
                return;
            }
            if (selectionMode === 'layer' || selected.length === 1) {
                const topMost = selected[selected.length - 1];
                if (topMost) {
                    canvas.setActiveObject(topMost);
                    canvas.requestRenderAll();
                }
                return;
            }
            const nextSelection = new fabric.ActiveSelection(selected, { canvas });
            canvas.setActiveObject(nextSelection);
            canvas.requestRenderAll();
        };

        const activeObjects = canvas.getActiveObjects();
        const activeObject = canvas.getActiveObject();
        const selectedObjects = activeObjects.length > 0
            ? activeObjects
            : activeObject
                ? [activeObject]
                : [];
        if (selectedObjects.length === 0) {
            canvas.requestRenderAll();
            return;
        }

        const bounds = selectedObjects.map((obj) => obj.getBoundingRect());
        const unionBounds = bounds.reduce((acc, rect) => ({
            left: Math.min(acc.left, rect.left),
            top: Math.min(acc.top, rect.top),
            width: Math.max(acc.left + acc.width, rect.left + rect.width) - Math.min(acc.left, rect.left),
            height: Math.max(acc.top + acc.height, rect.top + rect.height) - Math.min(acc.top, rect.top),
        }));

        const modifyPixels = Math.max(1, Math.min(120, Math.round(selectionModifyPixels)));
        if (mode === 'expand') {
            const expandedBounds = {
                left: unionBounds.left - modifyPixels,
                top: unionBounds.top - modifyPixels,
                width: unionBounds.width + (modifyPixels * 2),
                height: unionBounds.height + (modifyPixels * 2),
            };
            const expandedSelection = collectSelectableObjects().filter((obj) => intersectsBounds(expandedBounds, obj.getBoundingRect()));
            commitSelectedObjects(expandedSelection);
            return;
        }

        const contractedBounds = {
            left: unionBounds.left + modifyPixels,
            top: unionBounds.top + modifyPixels,
            width: Math.max(0, unionBounds.width - (modifyPixels * 2)),
            height: Math.max(0, unionBounds.height - (modifyPixels * 2)),
        };

        if (contractedBounds.width < 1 || contractedBounds.height < 1) {
            commitSelectedObjects([selectedObjects[selectedObjects.length - 1]]);
            return;
        }

        const contractedSelection = selectedObjects.filter((obj) => {
            const rect = obj.getBoundingRect();
            const centerX = rect.left + (rect.width / 2);
            const centerY = rect.top + (rect.height / 2);
            return (
                centerX >= contractedBounds.left
                && centerX <= contractedBounds.left + contractedBounds.width
                && centerY >= contractedBounds.top
                && centerY <= contractedBounds.top + contractedBounds.height
            );
        });

        commitSelectedObjects(contractedSelection);
    }, [canvas, selectionMode, selectionModifyPixels]);

    useEffect(() => {
        if (!canvas) return;
        if (activeTool !== 'paint') {
            disableRasterDrawingMode(canvas);
            return;
        }

        try {
            applyRasterBrushToCanvas(canvas, {
                preset: paintBrushPreset,
                size: paintBrushSize,
                hardness: paintBrushHardness,
                opacity: paintBrushOpacity,
                flow: paintBrushFlow,
                smoothing: paintBrushSmoothing,
                color: '#000000',
            });
            canvas.requestRenderAll();
        } catch {
            return;
        }
    }, [
        canvas,
        activeTool,
        paintBrushPreset,
        paintBrushSize,
        paintBrushHardness,
        paintBrushOpacity,
        paintBrushFlow,
        paintBrushSmoothing,
    ]);

    useEffect(() => {
        if (!canvas || activeTool !== 'paint') return;

        const handlePathBlendMode = (event: { path?: fabric.Object }) => {
            if (!event.path) return;
            window.setTimeout(() => {
                if (!event.path) return;
                event.path.set({ globalCompositeOperation: paintBlendMode });
                event.path.setCoords();
                canvas.requestRenderAll();
            }, 0);
        };

        canvas.on('path:created', handlePathBlendMode);
        return () => {
            canvas.off('path:created', handlePathBlendMode);
        };
    }, [canvas, activeTool, paintBlendMode]);

    useEffect(() => {
        if (!canvas) return;

        const canvasWithEvents = canvas as unknown as {
            on: (eventName: string, cb: (payload?: { closure?: 'open' | 'closed'; pathOperation?: 'add' | 'subtract' | 'intersect'; autoAddDelete?: boolean; rubberBand?: boolean }) => void) => void;
            off: (eventName: string, cb: (payload?: { closure?: 'open' | 'closed'; pathOperation?: 'add' | 'subtract' | 'intersect'; autoAddDelete?: boolean; rubberBand?: boolean }) => void) => void;
        };

        const syncPenMode = (payload?: { closure?: 'open' | 'closed'; pathOperation?: 'add' | 'subtract' | 'intersect'; autoAddDelete?: boolean; rubberBand?: boolean }) => {
            if (payload?.closure) {
                setPenTopMode(payload.closure === 'closed' ? 'shape' : 'path');
            }
            if (payload?.pathOperation) {
                setPenTopPathOperation(payload.pathOperation);
            }
            if (typeof payload?.autoAddDelete === 'boolean') {
                setPenTopAutoAddDelete(payload.autoAddDelete);
            }
            if (typeof payload?.rubberBand === 'boolean') {
                setPenTopRubberBand(payload.rubberBand);
            }
        };

        canvasWithEvents.on('pen:draft:update', syncPenMode);
        return () => {
            canvasWithEvents.off('pen:draft:update', syncPenMode);
        };
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;

        const syncTextFontFamily = () => {
            const active = canvas.getActiveObject() as (fabric.Object & {
                type?: string;
                fontFamily?: string;
                fontWeight?: string | number;
                fontStyle?: string;
                underline?: boolean;
                textAlign?: 'left' | 'center' | 'right' | 'justify';
                fill?: unknown;
            }) | null;
            if (!active) {
                setTextTopFontFamily(TOP_TEXT_FONT_FAMILIES[0]);
                setTextTopFontStyle(TOP_TEXT_FONT_STYLES[0]);
                setTextTopFontSize(TOP_TEXT_DEFAULT_SIZE);
                setTextTopColor('#000000');
                setTextTopBold(false);
                setTextTopItalic(false);
                setTextTopUnderline(false);
                setTextTopAlign('left');
                setTextTopSpellcheck(true);
                return;
            }
            const activeType = active.type;
            const isTextObject = activeType === 'i-text' || activeType === 'text' || activeType === 'textbox';
            if (!isTextObject) return;
            if (typeof active.fontFamily === 'string' && active.fontFamily.trim().length > 0) {
                setTextTopFontFamily(active.fontFamily);
            }
            if (typeof active.fontWeight === 'string' || typeof active.fontWeight === 'number') {
                setTextTopFontStyle(String(active.fontWeight));
                const normalizedWeight = String(active.fontWeight).toLowerCase();
                const numericWeight = Number(normalizedWeight);
                setTextTopBold(normalizedWeight === 'bold' || (!Number.isNaN(numericWeight) && numericWeight >= 600));
            }
            const activeWithFontSize = active as unknown as { fontSize?: number };
            if (typeof activeWithFontSize.fontSize === 'number') {
                setTextTopFontSize(Math.max(8, Math.round(activeWithFontSize.fontSize)));
            }
            if (typeof active.fill === 'string' && active.fill.trim().length > 0) {
                const { color } = parseColorWithAlpha(active.fill);
                const normalizedColor = normalizeColorValue(color);
                if (typeof normalizedColor === 'string' && normalizedColor.startsWith('#') && normalizedColor.length === 7) {
                    setTextTopColor(normalizedColor);
                }
            }
            setTextTopItalic(active.fontStyle === 'italic');
            setTextTopUnderline(Boolean(active.underline));
            if (active.textAlign) {
                setTextTopAlign(active.textAlign);
            }
            const activeExt = active as ExtendedFabricObject;
            setTextTopSpellcheck(activeExt.textSpellcheck !== false);
        };

        syncTextFontFamily();
        canvas.on('selection:created', syncTextFontFamily);
        canvas.on('selection:updated', syncTextFontFamily);
        canvas.on('selection:cleared', syncTextFontFamily);
        canvas.on('object:modified', syncTextFontFamily);
        return () => {
            canvas.off('selection:created', syncTextFontFamily);
            canvas.off('selection:updated', syncTextFontFamily);
            canvas.off('selection:cleared', syncTextFontFamily);
            canvas.off('object:modified', syncTextFontFamily);
        };
    }, [canvas]);

    const isShapeEditableObject = useCallback((obj: fabric.Object | null | undefined): obj is fabric.Object & ExtendedFabricObject => {
        if (!obj) return false;
        if ((obj as ExtendedFabricObject).isStar) return true;
        return ['rect', 'circle', 'triangle', 'polygon', 'polyline', 'path', 'ellipse', 'line'].includes(obj.type || '');
    }, []);

    const emitShapeTopConfig = useCallback((overrides?: Partial<{
        mode: 'shape' | 'path' | 'pixels';
        fillColor: string;
        strokeColor: string;
        strokeWidth: number;
        cornerRadius: number;
        fixedSize: boolean;
    }>) => {
        if (!canvas) return;
        const nextMode = overrides?.mode ?? shapeTopMode;
        const nextFillColor = overrides?.fillColor ?? shapeTopFillColor;
        const nextStrokeColor = overrides?.strokeColor ?? shapeTopStrokeColor;
        const nextStrokeWidth = overrides?.strokeWidth ?? shapeTopStrokeWidth;
        const nextCornerRadius = overrides?.cornerRadius ?? shapeTopCornerRadius;
        const nextFixedSize = overrides?.fixedSize ?? shapeTopFixedSize;
        (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('shape:config:set', {
            mode: nextMode,
            fillColor: nextFillColor,
            strokeColor: nextStrokeColor,
            strokeWidth: Math.max(0, Math.min(40, Math.round(nextStrokeWidth))),
            cornerRadius: Math.max(0, Math.min(100, Math.round(nextCornerRadius))),
            fixedSize: nextFixedSize,
        });
    }, [canvas, shapeTopMode, shapeTopFillColor, shapeTopStrokeColor, shapeTopStrokeWidth, shapeTopCornerRadius, shapeTopFixedSize]);

    const applyShapeTopConfigToActiveObject = useCallback((overrides?: Partial<{
        mode: 'shape' | 'path' | 'pixels';
        fillColor: string;
        strokeColor: string;
        strokeWidth: number;
        cornerRadius: number;
        fixedSize: boolean;
    }>) => {
        if (!canvas) return;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
        if (!isShapeEditableObject(active)) return;

        const nextMode = overrides?.mode ?? shapeTopMode;
        const nextFillColor = overrides?.fillColor ?? shapeTopFillColor;
        const nextStrokeColor = overrides?.strokeColor ?? shapeTopStrokeColor;
        const normalizedStrokeWidth = Math.max(0, Math.min(40, Math.round(overrides?.strokeWidth ?? shapeTopStrokeWidth)));
        const normalizedCornerRadius = Math.max(0, Math.min(100, Math.round(overrides?.cornerRadius ?? shapeTopCornerRadius)));
        const nextFixedSize = overrides?.fixedSize ?? shapeTopFixedSize;
        const resolvedFill = nextMode === 'path' ? 'transparent' : nextFillColor;
        const resolvedStrokeWidth = nextMode === 'path' ? Math.max(1, normalizedStrokeWidth) : normalizedStrokeWidth;

        if (active.type === 'rect') {
            (active as fabric.Rect).set({
                rx: normalizedCornerRadius,
                ry: normalizedCornerRadius,
            });
        }
        if (['triangle', 'polygon', 'polyline', 'path', 'line'].includes(active.type || '')) {
            active.set({
                strokeLineJoin: normalizedCornerRadius > 0 ? 'round' : 'miter',
                strokeLineCap: normalizedCornerRadius > 0 ? 'round' : 'butt',
            });
        }

        active.set({
            fill: resolvedFill,
            stroke: nextStrokeColor,
            strokeWidth: resolvedStrokeWidth,
            lockScalingX: nextFixedSize,
            lockScalingY: nextFixedSize,
            dirty: true,
        });
        active.shapeDrawMode = nextMode;
        active.shapeCornerRadius = normalizedCornerRadius;
        active.setCoords();
        canvas.requestRenderAll();
    }, [
        canvas,
        isShapeEditableObject,
        shapeTopMode,
        shapeTopFillColor,
        shapeTopStrokeColor,
        shapeTopStrokeWidth,
        shapeTopCornerRadius,
        shapeTopFixedSize,
    ]);

    useEffect(() => {
        if (!canvas) return;

        const syncShapeControls = () => {
            const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
            if (!isShapeEditableObject(active)) {
                setShapeTopCanSmoothAngles(false);
                return;
            }

            setShapeTopCanSmoothAngles(active.type === 'rect');

            let inferredMode: 'shape' | 'path' | 'pixels' = active.shapeDrawMode === 'pixels' ? 'pixels' : 'shape';
            if (typeof active.fill === 'string') {
                const parsedFill = parseColorWithAlpha(active.fill);
                const normalizedFill = normalizeColorValue(parsedFill.color);
                if (normalizedFill && normalizedFill.startsWith('#')) {
                    setShapeTopFillColor(normalizedFill);
                }
                if (parsedFill.alpha <= 0 || parsedFill.color.toLowerCase() === 'transparent') {
                    inferredMode = active.shapeDrawMode === 'pixels' ? 'pixels' : 'path';
                }
            }

            if (typeof active.stroke === 'string') {
                const parsedStroke = parseColorWithAlpha(active.stroke);
                const normalizedStroke = normalizeColorValue(parsedStroke.color);
                if (normalizedStroke && normalizedStroke.startsWith('#')) {
                    setShapeTopStrokeColor(normalizedStroke);
                }
            }

            if (typeof active.strokeWidth === 'number') {
                setShapeTopStrokeWidth(Math.max(0, Math.min(40, Math.round(active.strokeWidth))));
            }

            const rectRadius = active.type === 'rect'
                ? Math.max(
                    typeof (active as fabric.Rect).rx === 'number' ? (active as fabric.Rect).rx : 0,
                    typeof (active as fabric.Rect).ry === 'number' ? (active as fabric.Rect).ry : 0,
                )
                : 0;
            const extCornerRadius = typeof active.shapeCornerRadius === 'number' ? active.shapeCornerRadius : 0;
            setShapeTopCornerRadius(Math.max(0, Math.min(100, Math.round(Math.max(rectRadius, extCornerRadius)))));

            setShapeTopMode(inferredMode);
            setShapeTopFixedSize(Boolean(active.lockScalingX && active.lockScalingY));
        };

        syncShapeControls();
        canvas.on('selection:created', syncShapeControls);
        canvas.on('selection:updated', syncShapeControls);
        canvas.on('object:modified', syncShapeControls);
        return () => {
            canvas.off('selection:created', syncShapeControls);
            canvas.off('selection:updated', syncShapeControls);
            canvas.off('object:modified', syncShapeControls);
        };
    }, [canvas, isShapeEditableObject]);

    const extractGradientStops = useCallback((fill: unknown) => {
        if (!fill || typeof fill !== 'object') return null;
        const grad = fill as fabric.Gradient<'linear' | 'radial'>;
        if (!Array.isArray(grad.colorStops)) return null;
        const normalized = grad.colorStops
            .map((stop) => ({
                offset: typeof stop.offset === 'number' ? Math.max(0, Math.min(1, stop.offset)) : 0,
                color: typeof stop.color === 'string' && stop.color.trim().length > 0 ? stop.color : '#0000ff',
            }))
            .sort((a, b) => a.offset - b.offset);
        if (normalized.length === 0) return null;
        return normalized;
    }, []);

    const resolveGradientStops = useCallback((fill: unknown, reverse: boolean) => {
        const fallbackStops = [
            { offset: 0, color: '#0000ff' },
            { offset: 1, color: '#ff0000' },
        ];
        const stops = extractGradientStops(fill) || fallbackStops;
        if (!reverse) return stops;
        return stops
            .map((stop) => ({ offset: 1 - stop.offset, color: stop.color }))
            .sort((a, b) => a.offset - b.offset);
    }, [extractGradientStops]);

    const applyGradientTopConfigToActiveObject = useCallback((overrides?: Partial<{
        type: 'linear' | 'radial' | 'angle';
        blendMode: 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
        opacity: number;
        reverse: boolean;
        dither: boolean;
    }>) => {
        if (!canvas) return;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject & {
            get: (key: string) => unknown;
            set: (props: unknown) => void;
            setCoords: () => void;
        }) | null;
        if (!active) return;

        const nextType = overrides?.type ?? gradientTopType;
        const nextBlendMode = overrides?.blendMode ?? gradientTopBlendMode;
        const nextOpacity = Math.max(1, Math.min(100, Math.round(overrides?.opacity ?? gradientTopOpacity)));
        const nextReverse = overrides?.reverse ?? gradientTopReverse;
        const nextDither = overrides?.dither ?? gradientTopDither;
        const currentFill = active.get('fill');
        const existingGradient = currentFill && typeof currentFill === 'object' && (currentFill as fabric.Gradient<'linear' | 'radial'>).type
            ? (currentFill as fabric.Gradient<'linear' | 'radial'>)
            : null;
        const nextStops = resolveGradientStops(currentFill, nextReverse);

        let nextGradient: fabric.Gradient<'linear' | 'radial'> | null = null;
        if (nextType === 'radial') {
            const radialSourceCoords = existingGradient?.type === 'radial' && existingGradient.coords
                ? (existingGradient.coords as {
                    x1?: number;
                    y1?: number;
                    r1?: number;
                    x2?: number;
                    y2?: number;
                    r2?: number;
                })
                : null;
            const radialCoords = existingGradient?.type === 'radial' && existingGradient.coords
                ? {
                    x1: radialSourceCoords?.x1 ?? 0.5,
                    y1: radialSourceCoords?.y1 ?? 0.5,
                    r1: radialSourceCoords?.r1 ?? 0,
                    x2: radialSourceCoords?.x2 ?? 0.5,
                    y2: radialSourceCoords?.y2 ?? 0.5,
                    r2: radialSourceCoords?.r2 ?? 0.5,
                }
                : { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.5 };
            nextGradient = new fabric.Gradient({
                type: 'radial',
                gradientUnits: 'percentage',
                coords: radialCoords,
                colorStops: nextStops,
            });
        } else {
            const linearCoords = existingGradient?.type === 'linear' && existingGradient.coords
                ? {
                    x1: existingGradient.coords.x1 ?? 0,
                    y1: existingGradient.coords.y1 ?? 0.5,
                    x2: existingGradient.coords.x2 ?? 1,
                    y2: existingGradient.coords.y2 ?? 0.5,
                }
                : { x1: 0, y1: 0.5, x2: 1, y2: 0.5 };
            nextGradient = new fabric.Gradient({
                type: 'linear',
                gradientUnits: 'percentage',
                coords: linearCoords,
                colorStops: nextStops,
            });
        }

        active.set({
            fill: nextGradient,
            globalCompositeOperation: nextBlendMode,
            opacity: nextOpacity / 100,
            dirty: true,
        });
        active.gradientTypeHint = nextType;
        active.gradientReversed = nextReverse;
        active.gradientDitherEnabled = nextDither;
        active.setCoords();
        canvas.requestRenderAll();
    }, [
        canvas,
        gradientTopType,
        gradientTopBlendMode,
        gradientTopOpacity,
        gradientTopReverse,
        gradientTopDither,
        resolveGradientStops,
    ]);

    useEffect(() => {
        if (!canvas) return;

        const syncGradientControls = () => {
            const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
            if (!active) return;
            const fill = active.fill as unknown;
            const gradient = fill && typeof fill === 'object' && ((fill as fabric.Gradient<'linear' | 'radial'>).type === 'linear' || (fill as fabric.Gradient<'linear' | 'radial'>).type === 'radial')
                ? (fill as fabric.Gradient<'linear' | 'radial'>)
                : null;
            if (!gradient) return;

            if (gradient.type === 'radial') {
                setGradientTopType('radial');
            } else {
                setGradientTopType(active.gradientTypeHint === 'angle' ? 'angle' : 'linear');
            }

            const blendMode = active.globalCompositeOperation;
            if (blendMode && ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].includes(blendMode)) {
                setGradientTopBlendMode(blendMode as 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten');
            }

            if (typeof active.opacity === 'number') {
                setGradientTopOpacity(Math.max(1, Math.min(100, Math.round(active.opacity * 100))));
            }
            setGradientTopReverse(Boolean(active.gradientReversed));
            setGradientTopDither(Boolean(active.gradientDitherEnabled));
        };

        syncGradientControls();
        canvas.on('selection:created', syncGradientControls);
        canvas.on('selection:updated', syncGradientControls);
        canvas.on('object:modified', syncGradientControls);
        return () => {
            canvas.off('selection:created', syncGradientControls);
            canvas.off('selection:updated', syncGradientControls);
            canvas.off('object:modified', syncGradientControls);
        };
    }, [canvas]);

    // 3D & AI States
    const [initialImageFor3D, setInitialImageFor3D] = useState<string | undefined>(undefined);
    const [sourceObjectFor3D, setSourceObjectFor3D] = useState<fabric.Object | null>(null);
    const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
    const [jobsHydrated, setJobsHydrated] = useState(false);
    const backgroundJobsRef = useRef<BackgroundJob[]>([]);
    const pollTimersRef = useRef<Map<string, number>>(new Map());
    const pollIntervalsRef = useRef<Map<string, number>>(new Map());
    const [editingModelUrl, setEditingModelUrl] = useState<string | null>(null);
    const [editingModelObject, setEditingModelObject] = useState<fabric.Object | null>(null);
    const [mediaPreview, setMediaPreview] = useState<{ type: 'video' | 'audio'; url: string } | null>(null);
    const BACKGROUND_JOBS_STORAGE_KEY = 'image-express-background-jobs';
    const MAX_PERSISTED_JOBS = 80;
    const MAX_JOB_AGE_MS = 14 * 24 * 60 * 60 * 1000;

    // Initial Tool Effect
    useEffect(() => {
        if (initialActiveTool) {
             const toolMap: Record<string, string> = {
                 'upload': 'assets',
                 '3d': '3d-gen',
                 'ai': 'ai-zone',
                 'move': 'select',
                 'path-select': 'select',
             };
             // Defer slightly to ensure canvas init doesn't override
             setTimeout(() => {
                 setActiveTool(toolMap[initialActiveTool] || initialActiveTool);
             }, 100);
        }
    }, [initialActiveTool]);

    const exportRef = useRef<HTMLDivElement>(null);
    const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
    const toolbarRef = useRef<ToolbarHandle | null>(null);
    
    // API Keys State
    const [apiKeys, setApiKeys] = useState<{
        meshy?: string, 
        tripo?: string, 
        hitems?: string,
        stability?: string, 
        openai?: string, 
        google?: string,
        banana?: string
    }>({});

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        return `${(kb / 1024).toFixed(2)} MB`;
    };

    const getCanvasBackgroundSettings = useCallback(() => {
        const activeCanvas = canvas as CanvasWithArtboard | null;
        const artboardRect = activeCanvas?.artboardRect as ArtboardRectWithBackground | undefined;
        const toVisibleColor = (value: unknown): string | null => {
            if (typeof value !== 'string') return null;
            const parsed = parseColorWithAlpha(value);
            if (parsed.alpha <= 0) return null;
            return normalizeColorValue(parsed.color) || parsed.color;
        };

        const storedColor = toVisibleColor(artboardRect?.canvasBackgroundColor);
        const fillColor = toVisibleColor(artboardRect?.fill);
        const canvasColor = toVisibleColor(activeCanvas?.backgroundColor);
        const color = storedColor || fillColor || canvasColor || '#ffffff';
        const enabled = artboardRect
            ? (typeof artboardRect.canvasBackgroundEnabled === 'boolean'
                ? artboardRect.canvasBackgroundEnabled
                : Boolean(fillColor))
            : true;

        return { color, enabled };
    }, [canvas]);

    const withViewportReset = useCallback(async <T,>(action: () => T | Promise<T>) => {
        if (!canvas) {
            return action();
        }
        const runtimeCanvas = canvas as CanvasWithExportInternals;
        const originalTransform = canvas.viewportTransform ? ([...canvas.viewportTransform] as fabric.TMat2D) : undefined;
        let shouldRestoreTransform = false;
        if (originalTransform && !runtimeCanvas.disposed && !runtimeCanvas.destroyed) {
            try {
                canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as fabric.TMat2D);
                canvas.requestRenderAll();
                shouldRestoreTransform = true;
            } catch (error) {
                console.warn('Viewport reset skipped during export/save:', error);
            }
        }
        try {
            return await action();
        } finally {
            if (originalTransform && shouldRestoreTransform && !runtimeCanvas.disposed && !runtimeCanvas.destroyed) {
                try {
                    canvas.setViewportTransform(originalTransform);
                    canvas.requestRenderAll();
                } catch (error) {
                    console.warn('Viewport restore skipped after export/save:', error);
                }
            }
        }
    }, [canvas]);

    const safeCanvasToDataURL = useCallback((options: ExportDataUrlOptions) => {
        if (!canvas) throw new Error('Canvas unavailable');

        try {
            return canvas.toDataURL(options);
        } catch (primaryError) {
            const runtimeCanvas = canvas as CanvasWithExportInternals;
            const format = options.format || 'png';
            const quality = options.quality ?? 1;
            const retinaScaling = options.enableRetinaScaling && typeof canvas.getRetinaScaling === 'function'
                ? canvas.getRetinaScaling()
                : 1;
            const finalMultiplier = (options.multiplier || 1) * retinaScaling;

            // Fabric v7 Canvas#toDataURL can fail when upper canvas internals are unavailable.
            // In that case, fallback to StaticCanvas export path that does not rely on `elements.upper`.
            const canUseStaticFallback = !runtimeCanvas.elements?.upper
                && typeof fabric.StaticCanvas?.prototype?.toCanvasElement === 'function'
                && typeof (canvas as unknown as { calcViewportBoundaries?: unknown }).calcViewportBoundaries === 'function'
                && typeof (canvas as unknown as { renderCanvas?: unknown }).renderCanvas === 'function';

            if (canUseStaticFallback) {
                try {
                    const toCanvasElement = fabric.StaticCanvas.prototype.toCanvasElement as (
                        this: fabric.StaticCanvas,
                        multiplier?: number,
                        options?: fabric.TToCanvasElementOptions
                    ) => HTMLCanvasElement;
                    const snapshotCanvas = toCanvasElement.call(canvas as unknown as fabric.StaticCanvas, finalMultiplier, options);
                    return snapshotCanvas.toDataURL(`image/${format}`, quality);
                } catch (fallbackError) {
                    console.warn('StaticCanvas fallback export failed:', fallbackError);
                }
            }

            const lowerCanvasEl = runtimeCanvas.lowerCanvasEl
                || runtimeCanvas.elements?.lower?.el
                || runtimeCanvas.getElement?.();
            if (lowerCanvasEl) {
                return lowerCanvasEl.toDataURL(`image/${format}`, quality);
            }

            throw primaryError;
        }
    }, [canvas]);

    const estimateExportSize = useCallback(async (format: 'png' | 'jpg', quality: number, includeBackground: boolean) => {
        if (!canvas) return;
        const cropOptions = pendingExportCropRef.current;
        const options: ExportDataUrlOptions = {
            format: format === 'jpg' ? 'jpeg' : 'png',
            quality: Math.max(0.1, Math.min(1, quality / 100)),
            multiplier: 1,
            enableRetinaScaling: true
        };
        const shouldIncludeBackground = format === 'jpg' ? true : includeBackground;
        if (shouldIncludeBackground) {
            options.backgroundColor = getCanvasBackgroundSettings().color;
        }
        if (cropOptions) {
            options.left = cropOptions.left;
            options.top = cropOptions.top;
            options.width = cropOptions.width;
            options.height = cropOptions.height;
        }

        try {
            const dataUrl = await withViewportReset(() => safeCanvasToDataURL(options));
            const base64Index = dataUrl.indexOf(',');
            const base64Length = base64Index >= 0 ? dataUrl.length - base64Index - 1 : dataUrl.length;
            const bytes = Math.floor((base64Length * 3) / 4);
            setExportQualitySize(formatBytes(bytes));
        } catch {
            setExportQualitySize('Unavailable');
        }
    }, [canvas, getCanvasBackgroundSettings, safeCanvasToDataURL, withViewportReset]);

    useEffect(() => {
        canvasRef.current = canvas;
    }, [canvas]);

    useEffect(() => {
        if (!showExportQualityModal || !pendingExportFormat) return;
        if (exportSizeTimerRef.current) {
            window.clearTimeout(exportSizeTimerRef.current);
        }
        exportSizeTimerRef.current = window.setTimeout(() => {
            estimateExportSize(pendingExportFormat, exportQualityValue, includeCanvasBackground);
        }, 150);
    }, [showExportQualityModal, pendingExportFormat, exportQualityValue, includeCanvasBackground, estimateExportSize]);

    // Handle Open Design (Local helpers)
    const handleOpenDesign = useCallback(async (design: { data?: unknown }) => {
        if (!canvas) return;
        
        let designData: unknown = design.data;
        if (!designData) return;
        if (typeof designData === 'string') {
            try {
                const res = await fetch(designData);
                if (!res.ok) throw new Error("Failed to fetch design data");
                designData = await res.json();
            } catch (e) {
                console.error("Error loading design data", e);
                toast({ title: 'Load failed', description: 'Could not load design data.', variant: 'destructive' });
                return;
            }
        }
  
        historyReadyRef.current = false;
        canvas.loadFromJSON(designData as Record<string, unknown>, () => {
            canvas.requestRenderAll();
            // Don't set isDirty, we just opened it
            setIsDirty(false);
            resetHistory();
        });
    }, [canvas, toast, resetHistory]);


    // --- Navigation Guard ---
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const handleBack = async () => {
        if (isDirty) {
            const confirmed = await dialog.confirm('Discard unsaved changes and leave?', { title: 'Unsaved changes', variant: 'destructive' });
            if (confirmed) {
                setIsDirty(false);
                onBack();
            }
        } else {
            onBack();
        }
    };

    useEffect(() => {
        if (!canvas) return;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as HTMLElement).isContentEditable);
            if (isInput) return;

            const key = e.key.toLowerCase();
            const meta = e.metaKey || e.ctrlKey;
            if (!meta) return;

            if (!e.shiftKey && key === 'z') {
                e.preventDefault();
                handleUndo();
            } else if (key === 'y' || (e.shiftKey && key === 'z')) {
                e.preventDefault();
                handleRedo();
            } else if (key === 'd') {
                e.preventDefault();
                handleDuplicate();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [canvas, handleUndo, handleRedo, handleDuplicate]);

    useEffect(() => {
        const isTypingTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            if (target.isContentEditable) return true;
            const tag = target.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        };

        const handler = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTypingTarget(event.target)) return;

            const key = event.key.toLowerCase();
            if (key === 'v') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('select');
                return;
            }
            if (key === 'w') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('wand');
                return;
            }
            if (key === 'q') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('quick-select');
                return;
            }
            if (key === 'k') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('selection-brush');
                return;
            }
            if (key === 'm') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('marquee');
                return;
            }
            if (key === 'l') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('lasso');
                return;
            }
            if (key === 'j') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('healing');
                return;
            }
            if (key === 'y') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('history-brush');
                return;
            }
            if (key === 'b') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('blur');
                return;
            }
            if (key === 'o') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('dodge');
                return;
            }
            if (key === 's') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('clone-stamp');
                return;
            }
            if (key === 'a') {
                event.preventDefault();
                toolbarRef.current?.triggerTool('path-select');
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        if (isRenamingDesignTitle) return;
        setDesignTitleDraft(propDesignName || 'Untitled Design');
    }, [propDesignName, isRenamingDesignTitle]);

    const cancelDesignTitleEdit = () => {
        setDesignTitleDraft(propDesignName || 'Untitled Design');
        setIsRenamingDesignTitle(false);
    };

    const commitDesignTitle = useCallback(async () => {
        const nextName = (designTitleDraft || '').trim() || 'Untitled Design';
        setIsRenamingDesignTitle(false);

        if (nextName === propDesignName) {
            setDesignTitleDraft(nextName);
            return;
        }

        if (!propDesignId) {
            onUpdateDesignInfo(null, nextName);
            setDesignTitleDraft(nextName);
            setIsDirty(true);
            return;
        }

        try {
            const res = await fetch('/api/designs/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: propDesignId, name: nextName })
            });
            const data = await res.json();
            if (!res.ok || !data.success || !data.design) {
                throw new Error(data.message || 'Rename failed.');
            }
            onUpdateDesignInfo(data.design.id, data.design.name || nextName);
            setDesignTitleDraft(data.design.name || nextName);
            toast({ title: 'Design renamed', description: `Now editing "${data.design.name || nextName}".`, variant: 'success' });
        } catch (error) {
            console.error('Design rename failed', error);
            onUpdateDesignInfo(propDesignId, nextName);
            setDesignTitleDraft(nextName);
            toast({
                title: 'Rename synced locally',
                description: 'Name updated in the editor; save to persist server-side if needed.',
                variant: 'warning'
            });
        }
    }, [designTitleDraft, onUpdateDesignInfo, propDesignId, propDesignName, toast]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            const target = event.target as HTMLElement | null;
            const isInput = target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable
            );
            if (isInput) return;

            if (showExportQualityModal) {
                event.preventDefault();
                setShowExportQualityModal(false);
                return;
            }
            if (
                showFileMenu
                || showEditMenu
                || showImageMenu
                || showLayerMenu
                || showSelectMenu
                || showFilterMenu
                || showViewMenu
                || showWindowMenu
                || showSettingsMenu
                || showHelpMenu
                || showExportMenu
                || showShareMenu
                || showGridMenu
                || showToolsMenu
            ) {
                event.preventDefault();
                closeEditorMenus();
                return;
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [closeEditorMenus, showEditMenu, showExportMenu, showExportQualityModal, showFileMenu, showFilterMenu, showGridMenu, showHelpMenu, showImageMenu, showLayerMenu, showSelectMenu, showSettingsMenu, showShareMenu, showToolsMenu, showViewMenu, showWindowMenu]);

    // --- Save Logic ---
    const handleSave = async () => {
       if (!canvas) return;
       
       let name = propDesignName;
       
       if (!propDesignId && name === 'Untitled Design') {
           const inputName = await dialog.prompt('Enter design name:', {
               title: 'Design name',
               defaultValue: propDesignName,
               placeholder: 'My Design'
           });
           if (!inputName) return;
           name = inputName;
       } else if (name === 'Untitled Design') {
            const inputName = await dialog.prompt('Enter design name:', {
                title: 'Design name',
                defaultValue: propDesignName,
                placeholder: 'My Design'
            });
            if (inputName) name = inputName;
       }
       
       const json = (canvas as unknown as { toJSON: (properties?: string[]) => DesignJson }).toJSON(customHistoryProps);
       const jsonString = JSON.stringify(json);
        
       let thumbnailDataUrl = '';
       
       if (canvas.width && canvas.height && canvas.width > 0 && canvas.height > 0) {
            setIsExporting(true);
            try {
                // Attempt with multiplier
                thumbnailDataUrl = await withViewportReset(() => safeCanvasToDataURL({ format: 'png', multiplier: 0.5, enableRetinaScaling: true, quality: 1 }));
            } catch (e) {
                console.warn('Thumbnail generation with multiplier failed, retrying without:', e);
                try {
                     // Fallback without multiplier
                    thumbnailDataUrl = await withViewportReset(() => safeCanvasToDataURL({ format: 'png', multiplier: 1, enableRetinaScaling: true, quality: 1 }));
                } catch (e2) {
                    console.error('Thumbnail generation failed completely:', e2);
                }
            } finally {
                setIsExporting(false);
            }
       } else {
           console.warn('Canvas has invalid dimensions, skipping thumbnail generation.');
       }

       try {
           const response = await fetch('/api/designs/save', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                   id: propDesignId,
                   name,
                    canvasData: json,
                   thumbnailDataUrl
               })
           });
           
           const result = await response.json();
           if (result.success) {
                onUpdateDesignInfo(result.design.id, result.design.name);
                setIsDirty(false);
                toast({ title: 'Design saved', description: 'Your changes are saved.', variant: 'success' });

                 if (typeof window !== 'undefined') {
                     const driveConfig = loadDriveConfig();
                     if (driveConfig.enabled) {
                         const clientId = (driveConfig.clientId || envDriveClientId || '').trim();
                         if (!clientId) {
                             console.warn('Google Drive backup skipped: missing client ID');
                         } else {
                             const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                             const backupName = `${name || 'design'}-${timestamp}.json`;
                             uploadBackup(
                                 clientId,
                                 backupName,
                                 jsonString,
                                 'application/json',
                                 thumbnailDataUrl
                             ).catch((error) => {
                                 console.error('Google Drive backup failed', error);
                             });
                         }
                     }
                 }
           } else {
                toast({
                    title: 'Save failed',
                    description: result.message || 'Failed to save design.',
                    variant: 'destructive'
                });
           }
       } catch (error) {
           console.error("Save error:", error);
           toast({ title: 'Save failed', description: 'Error saving design to server.', variant: 'destructive' });
       }
    };

    // --- Export Logic ---
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
          if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
            setShowExportMenu(false);
          }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const stored = loadProfileSettings();
        if (stored) setProfileSettings(stored);
    }, []);

    const buildProfileOverlayText = (profile: UserProfileSettings, fallbackUser: string) => {
        const lines: string[] = [];
        if (profile.displayName) lines.push(profile.displayName);
        if (profile.username && profile.username !== fallbackUser) lines.push(`@${profile.username}`);
        if (profile.email) lines.push(profile.email);
        if (profile.info) lines.push(profile.info);
        return lines.join('\n');
    };

    const isAIGeneratedUsed = () => {
        if (!canvas) return false;
        return canvas.getObjects().some((obj) => (obj as ExtendedFabricObject).aiGenerated);
    };

    const withExportOverlays = async (action: () => void | Promise<void>) => {
        if (!canvas) return;
        
        // Prevent grid rendering during export by unmounting it (via state)
        setIsExporting(true);
        // Allow React render cycle to process unmount of GridOverlay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const overlayFrame = mediaOverlayFrameRef.current;
        const overlayLabel = mediaOverlayLabelRef.current;
        const restoreOverlayVisibility = {
            frame: overlayFrame?.visible ?? true,
            label: overlayLabel?.visible ?? true,
        };
        const overlays: fabric.Object[] = [];
        const active = canvas.getActiveObject();

        try {
            if (overlayFrame) overlayFrame.visible = false;
            if (overlayLabel) overlayLabel.visible = false;

            const profile = profileSettings;
            const aiUsed = isAIGeneratedUsed();

            const profileText = profile?.embedInfo ? buildProfileOverlayText(profile, user) : '';
            const padding = 12;
            const canvasStack = canvas as fabric.Canvas & {
                bringToFront?: (obj: fabric.Object) => void;
                moveTo?: (obj: fabric.Object, index: number) => void;
            };

            if (profileText) {
                const width = Math.min(320, Math.max(160, (canvas.width || 0) * 0.35));
                const overlay = new fabric.Textbox(profileText, {
                    width,
                    fontSize: 12,
                    lineHeight: 1.2,
                    fill: 'rgba(0,0,0,0.85)',
                    backgroundColor: 'rgba(255,255,255,0.6)',
                    selectable: false,
                    evented: false,
                    opacity: 0.9
                });

                overlay.set({
                    left: (canvas.width || 0) - width - padding,
                    top: (canvas.height || 0) - (overlay.height || 0) - padding
                });
                canvas.add(overlay);
                overlays.push(overlay);
            }

            if (aiUsed) {
                const aiOverlay = new fabric.Textbox('AI-generated content used', {
                    width: 240,
                    fontSize: 11,
                    lineHeight: 1.1,
                    fill: 'rgba(0,0,0,0.8)',
                    backgroundColor: 'rgba(255,255,255,0.6)',
                    selectable: false,
                    evented: false,
                    opacity: 0.9
                });
                aiOverlay.set({
                    left: padding,
                    top: (canvas.height || 0) - (aiOverlay.height || 0) - padding
                });
                canvas.add(aiOverlay);
                overlays.push(aiOverlay);
            }

            overlays.forEach((o) => {
                if (canvasStack.bringToFront) {
                    canvasStack.bringToFront(o);
                } else if (canvasStack.moveTo) {
                    canvasStack.moveTo(o, canvas.getObjects().length - 1);
                }
            });

            if (overlays.length > 0) {
                canvas.requestRenderAll();
            }

            // Execute the export action
            await action();
        } finally {
            overlays.forEach((o) => canvas.remove(o));
            if (overlayFrame) overlayFrame.visible = restoreOverlayVisibility.frame;
            if (overlayLabel) overlayLabel.visible = restoreOverlayVisibility.label;
            if (active) {
                canvas.setActiveObject(active);
            }
            canvas.requestRenderAll();
            // Restore grid rendering state
            setIsExporting(false);
        }
    };


    const handleExport = async (format: 'png' | 'jpg' | 'svg' | 'pdf' | 'json' | 'html') => {
        if (!canvas) return;
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `design-${timestamp}.${format}`;
    
            // Get artboard dimensions for cropping
            const extCanvas = canvas as CanvasWithArtboard;
            const artboard = extCanvas.artboard; // Data object
            const rect = extCanvas.artboardRect; // Visual object

            let cropOptions: { left: number; top: number; width: number; height: number; } | undefined;

            const mediaOverlayCropBounds = getMediaOverlayCropBounds();
            if (mediaOverlayCropBounds) {
                cropOptions = {
                    left: mediaOverlayCropBounds.left,
                    top: mediaOverlayCropBounds.top,
                    width: mediaOverlayCropBounds.width,
                    height: mediaOverlayCropBounds.height,
                };

            }

             if (!cropOptions && rect) {
                 const rectWidth = rect.getScaledWidth?.() ?? ((rect.width || 0) * (rect.scaleX || 1));
                 const rectHeight = rect.getScaledHeight?.() ?? ((rect.height || 0) * (rect.scaleY || 1));
                 cropOptions = {
                     left: rect.left || 0,
                     top: rect.top || 0,
                     width: rectWidth,
                     height: rectHeight
                 };
             } else if (!cropOptions && artboard) {
                cropOptions = {
                    left: artboard.left || 0,
                    top: artboard.top || 0,
                    width: artboard.width,
                    height: artboard.height
                };
             }
             
             // Validate and Fallback
             if (!cropOptions || cropOptions.width <= 0 || cropOptions.height <= 0) {
                 cropOptions = {
                    left: 0,
                    top: 0,
                    width: canvas.width || 800,
                    height: canvas.height || 600
                 };
             }

                switch (format) {
                    case 'png': {
                        openExportQualityModal('png', filename, cropOptions);
                        break;
                    }
                    case 'jpg': {
                        openExportQualityModal('jpg', filename, cropOptions);
                        break;
                    }
                    case 'svg':
                        // Convert width/height to strings as required by Fabric toSVG types in some versions
                        const svgContent = canvas.toSVG({
                            width: cropOptions ? `${cropOptions.width}px` : undefined,
                            height: cropOptions ? `${cropOptions.height}px` : undefined,
                            viewBox: cropOptions ? {
                                x: cropOptions.left,
                                y: cropOptions.top,
                                width: cropOptions.width,
                                height: cropOptions.height
                            } : undefined
                        });
                        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        downloadFile(url, filename);
                        break;
                                        case 'pdf': {
                                            await withExportOverlays(async () => {
                                                                                        const pdfWidth = cropOptions?.width || canvas.width!;
                                                                                        const pdfHeight = cropOptions?.height || canvas.height!;
                                                const pdf = new jsPDF({
                                                    orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
                                                    unit: 'px',
                                                    format: [pdfWidth, pdfHeight]
                                                });
                                                const imgData = safeCanvasToDataURL({
                                                    format: 'png',
                                                    quality: 1,
                                                    multiplier: 1,
                                                    enableRetinaScaling: true,
                                                    ...cropOptions
                                                });
                                                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                                                pdf.save(filename);
                                            });
                        break;
                    }
                    case 'json':
                        const json = JSON.stringify((canvas as unknown as { toJSON: (properties?: string[]) => DesignJson }).toJSON(customHistoryProps));
                        const jsonBlob = new Blob([json], { type: 'application/json' });
                        const jsonUrl = URL.createObjectURL(jsonBlob);
                        downloadFile(jsonUrl, `design-${timestamp}.json`);
                        break;
                    case 'html':
                        await exportHtmlBundle(filename.replace(/\.html$/, ''), timestamp);
                        break;
                }

        } catch (error) {
            console.error("Export failed:", error);
        }
        setShowExportMenu(false);
    };

    const downloadFile = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        downloadFile(url, filename);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleShare = async (platform: 'facebook' | 'instagram') => {
        // Trigger generic export first (PNG)
        await handleExport('png');
        
        const url = platform === 'facebook' ? 'https://www.facebook.com' : 'https://www.instagram.com';
        window.open(url, '_blank');

        toast({
            title: "Ready to Share",
            description: `Design exported. Please upload the file to ${platform === 'facebook' ? 'Facebook' : 'Instagram'}.`,
            duration: 5000,
        });
        
        setShowShareMenu(false);
    };

    const openExportQualityModal = (format: 'png' | 'jpg', filename: string, cropOptions?: { left: number; top: number; width: number; height: number }) => {
        setPendingExportFormat(format);
        setPendingExportFilename(filename);
        pendingExportCropRef.current = cropOptions;
        const defaultQuality = format === 'jpg' ? 90 : 100;
        const backgroundSettings = getCanvasBackgroundSettings();
        const defaultIncludeBackground = format === 'jpg' ? true : backgroundSettings.enabled;
        setIncludeCanvasBackground(defaultIncludeBackground);
        setExportQualityValue(defaultQuality);
        setExportQualitySize('Calculating...');
        setShowExportQualityModal(true);

        if (exportSizeTimerRef.current) {
            window.clearTimeout(exportSizeTimerRef.current);
        }
        exportSizeTimerRef.current = window.setTimeout(() => {
            estimateExportSize(format, defaultQuality, defaultIncludeBackground);
        }, 100);
    };

    const exportHtmlBundle = async (baseName: string, timestamp: string) => {
        if (!canvas) return;

        const zip = new JSZip();
        const assetsFolder = zip.folder('assets');
        const libsFolder = zip.folder('libs');
        const scriptsFolder = zip.folder('scripts');

        const customProps = ['id', 'gradient', 'pattern', 'is3DModel', 'modelUrl', 'isStar', 'starPoints', 'starInnerRadius', 'mediaType', 'mediaSource', 'layerTagColor', 'isPenPath', 'penMode', 'penClosed', 'penNodes', 'penSourcePoints', 'textPathSourceId', 'textSpellcheck', 'curveSpan', 'isRetouchLayer', 'gradientTypeHint', 'gradientReversed', 'gradientDitherEnabled'];
        const designJson = (canvas as unknown as { toJSON: (properties?: string[]) => DesignJson }).toJSON(customProps);

        const metadata = {
            canvasWidth: canvas.getWidth(),
            canvasHeight: canvas.getHeight(),
            backgroundColor: typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : undefined,
            workspaceBackground: undefined as string | undefined,
            artboard: undefined as
                | {
                      width: number;
                      height: number;
                      left: number;
                      top: number;
                      fill?: string;
                      rx?: number;
                      ry?: number;
                      shadow?: {
                          color?: string;
                          blur?: number;
                          offsetX?: number;
                          offsetY?: number;
                      };
                  }
                | undefined,
            mediaAssets: [] as Array<{ type: 'video' | 'audio'; label: string; path: string }>,
        };

        const workspaceBackground = (canvas as unknown as { getWorkspaceBackground?: () => string | undefined; workspaceBackground?: string }).getWorkspaceBackground?.()
            ?? (canvas as unknown as { workspaceBackground?: string }).workspaceBackground;

        if (typeof workspaceBackground === 'string' && workspaceBackground.trim().length > 0) {
            metadata.workspaceBackground = workspaceBackground;
        }

        const artboardRect = (canvas as unknown as { artboardRect?: fabric.Rect }).artboardRect;
        if (artboardRect) {
            metadata.artboard = {
                width: artboardRect.width ?? artboardRect.getScaledWidth?.() ?? canvas.getWidth(),
                height: artboardRect.height ?? artboardRect.getScaledHeight?.() ?? canvas.getHeight(),
                left: artboardRect.left ?? 0,
                top: artboardRect.top ?? 0,
                fill: typeof artboardRect.fill === 'string' ? artboardRect.fill : undefined,
                rx: typeof artboardRect.rx === 'number' ? artboardRect.rx : undefined,
                ry: typeof artboardRect.ry === 'number' ? artboardRect.ry : undefined,
                shadow: artboardRect.shadow
                    ? {
                          color: artboardRect.shadow.color,
                          blur: artboardRect.shadow.blur,
                          offsetX: artboardRect.shadow.offsetX,
                          offsetY: artboardRect.shadow.offsetY
                      }
                    : undefined
            };
        }

        designJson.metadata = metadata;

        const assetMap = new Map<string, string>();
        const usedNames = new Set<string>();
        const assetPromises: Array<Promise<void>> = [];

        const sanitizeSegment = (segment: string) => segment.replace(/[^a-z0-9._-]/gi, '_');

        const ensureExtension = (name: string, fallback: string) => {
            if (name.includes('.')) return name;
            return `${name}.${fallback}`;
        };

        const getUniqueFileName = (rawName: string) => {
            const parts = rawName.split('.');
            const ext = parts.length > 1 ? `.${parts.pop()}` : '';
            const base = sanitizeSegment(parts.join('.') || 'asset');
            let extension = sanitizeSegment(ext.replace('.', ''));
            if (!extension) extension = 'bin';
            let candidate = `${base}.${extension}`;
            let counter = 1;
            while (usedNames.has(candidate)) {
                candidate = `${base}-${counter}.${extension}`;
                counter += 1;
            }
            usedNames.add(candidate);
            return candidate;
        };

        const deriveFileName = (url: string, contentType: string | null) => {
            const withoutQuery = url.split('?')[0];
            const urlName = withoutQuery.split('/').pop() || '';
            let clean = sanitizeSegment(decodeURIComponent(urlName));
            if (!clean) {
                if (contentType?.includes('image/')) clean = `image.${contentType.split('/')[1]?.split(';')[0] ?? 'png'}`;
                else if (contentType?.includes('video/')) clean = `video.${contentType.split('/')[1]?.split(';')[0] ?? 'mp4'}`;
                else if (contentType?.includes('audio/')) clean = `audio.${contentType.split('/')[1]?.split(';')[0] ?? 'mp3'}`;
                else if (contentType?.includes('model/')) clean = `model.${contentType.split('/')[1]?.split(';')[0] ?? 'glb'}`;
                else clean = 'asset.bin';
            }
            return ensureExtension(clean, 'bin');
        };

        const decodeDataUrl = (dataUrl: string) => {
            const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
            if (!match) return null;
            const mimeType = match[1] || 'application/octet-stream';
            const isBase64 = Boolean(match[2]);
            const dataPart = match[3] || '';

            try {
                let buffer: ArrayBuffer;
                if (isBase64) {
                    const binary = atob(dataPart);
                    const view = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i += 1) {
                        view[i] = binary.charCodeAt(i);
                    }
                    buffer = view.buffer;
                } else {
                    const decoded = decodeURIComponent(dataPart.replace(/\+/g, '%20'));
                    buffer = new TextEncoder().encode(decoded).buffer;
                }

                const extension = mimeType.split('/')[1]?.split(';')[0] ?? 'bin';
                return { buffer, mimeType, extension };
            } catch (error) {
                console.error('Failed to decode data URL asset:', error);
                return null;
            }
        };

        const queueAsset = (url: string | undefined, setter: (relative: string) => void, manifest?: { record?: { type: 'video' | 'audio'; label: string; path: string } }) => {
            if (!url || !assetsFolder) {
                if (url) setter(url);
                if (manifest?.record) manifest.record.path = url || '';
                return;
            }

            if (url.startsWith('data:')) {
                const decoded = decodeDataUrl(url);
                if (!decoded) {
                    setter(url);
                    if (manifest?.record) manifest.record.path = url;
                    return;
                }

                const assetKey = url;
                if (assetMap.has(assetKey)) {
                    const existingPath = assetMap.get(assetKey)!;
                    setter(existingPath);
                    if (manifest?.record) manifest.record.path = existingPath;
                    return;
                }

                const inferredName = `inline-asset.${decoded.extension || 'bin'}`;
                const fileName = getUniqueFileName(inferredName);
                assetsFolder.file(fileName, decoded.buffer);
                const relativePath = `assets/${fileName}`;
                assetMap.set(assetKey, relativePath);
                setter(relativePath);
                if (manifest?.record) manifest.record.path = relativePath;
                return;
            }

            const resolveAbsoluteUrl = (input: string) => {
                try {
                    if (typeof window === 'undefined') return input;
                    return new URL(input, window.location.href).toString();
                } catch {
                    return input;
                }
            };

            const absoluteUrl = resolveAbsoluteUrl(url);
            const assetKey = absoluteUrl || url;

            if (assetMap.has(assetKey)) {
                const existing = assetMap.get(assetKey)!;
                setter(existing);
                if (manifest?.record) manifest.record.path = existing;
                return;
            }

            const isCrossOrigin = (() => {
                if (typeof window === 'undefined') return false;
                try {
                    return new URL(absoluteUrl).origin !== window.location.origin;
                } catch {
                    return false;
                }
            })();

            const candidates: string[] = [];
            if (isCrossOrigin) {
                candidates.push(`/api/export/proxy?url=${encodeURIComponent(absoluteUrl)}`);
            }
            candidates.push(absoluteUrl);
            if (url.startsWith('blob:')) {
                candidates.push(url);
            }

            const promise = (async () => {
                let lastError: unknown = null;
                for (const candidate of candidates) {
                    try {
                        const response = await fetch(candidate, { credentials: 'include', mode: 'cors' });
                        if (!response.ok) throw new Error(`Failed to fetch asset: ${candidate}`);
                        const buffer = await response.arrayBuffer();
                        const contentType = response.headers.get('content-type');
                        const fileName = getUniqueFileName(deriveFileName(absoluteUrl, contentType));
                        assetsFolder.file(fileName, buffer);
                        const relativePath = `assets/${fileName}`;
                        assetMap.set(assetKey, relativePath);
                        setter(relativePath);
                        if (manifest?.record) manifest.record.path = relativePath;
                        return;
                    } catch (error) {
                        lastError = error;
                    }
                }

                console.error('Asset bundling failed:', lastError);
                setter(url);
                if (manifest?.record) manifest.record.path = url;
            })();

            assetPromises.push(promise);
        };

        let includes3DModel = false;

        const processFill = (fill: unknown) => {
            if (!fill || typeof fill !== 'object') return;
            const fillData = fill as SerializedFill;

            if (typeof fillData.src === 'string') {
                queueAsset(fillData.src, (newPath) => {
                    fillData.src = newPath;
                });
            }

            if (typeof fillData.source === 'string') {
                queueAsset(fillData.source, (newPath) => {
                    fillData.source = newPath;
                });
            }

            if (Array.isArray(fillData.colorStops)) {
                fillData.colorStops.forEach((stop) => {
                    if (stop && typeof stop.src === 'string') {
                        queueAsset(stop.src, (newPath) => {
                            stop.src = newPath;
                        });
                    }
                });
            }
        };

        const processObject = (obj: SerializedObject) => {
            if (!obj) return;

            if (obj.type === 'image' && typeof obj.src === 'string') {
                queueAsset(obj.src, (newPath) => {
                    obj.src = newPath;
                });
            }

            if (obj.is3DModel && typeof obj.modelUrl === 'string') {
                includes3DModel = true;
                queueAsset(obj.modelUrl, (newPath) => {
                    obj.modelUrl = newPath;
                });
            }

            if (obj.mediaType && typeof obj.mediaSource === 'string') {
                const record = {
                    type: obj.mediaType as 'video' | 'audio',
                    label: obj.name || getDisplayName(obj.mediaSource),
                    path: ''
                };
                metadata.mediaAssets.push(record);
                queueAsset(obj.mediaSource, (newPath) => {
                    obj.mediaSource = newPath;
                }, { record });
            }

            if (obj.clipPath) {
                processObject(obj.clipPath);
            }

            if (Array.isArray(obj.objects)) {
                obj.objects.forEach((nested) => processObject(nested));
            }

            if (Array.isArray(obj.paths)) {
                obj.paths.forEach((pathItem) => processObject(pathItem));
            }

            processFill(obj.fill);
            processFill(obj.stroke);
            processFill(obj.backgroundColor);
            processFill(obj.overlayFill);
        };

        if (Array.isArray(designJson.objects)) {
            designJson.objects.forEach((object) => processObject(object));
        }

        const backgroundImage = designJson.backgroundImage;
        if (backgroundImage && typeof backgroundImage.src === 'string') {
            queueAsset(backgroundImage.src, (newPath) => {
                backgroundImage.src = newPath;
            });
        }

        const overlayImage = designJson.overlayImage;
        if (overlayImage && typeof overlayImage.src === 'string') {
            queueAsset(overlayImage.src, (newPath) => {
                overlayImage.src = newPath;
            });
        }

        if (designJson.clipPath) {
            processObject(designJson.clipPath);
        }

        await Promise.all(assetPromises);

        zip.file('design.json', JSON.stringify(designJson, null, 2));

        const encodeDesignPayload = () => {
            try {
                const jsonString = JSON.stringify(designJson);
                const utf8 = new TextEncoder().encode(jsonString);
                const chunkSize = 0x8000;
                let binary = '';
                for (let i = 0; i < utf8.length; i += chunkSize) {
                    const chunk = utf8.subarray(i, i + chunkSize);
                    binary += String.fromCharCode(...chunk);
                }
                if (typeof globalThis !== 'undefined' && typeof globalThis.btoa === 'function') {
                    return globalThis.btoa(binary);
                }
                if (typeof btoa === 'function') {
                    return btoa(unescape(encodeURIComponent(jsonString)));
                }
            } catch (error) {
                console.error('Failed to encode design payload for HTML export:', error);
            }
            return '';
        };

        const designJsonBase64 = encodeDesignPayload();

        const styles = `:root { color-scheme: light dark; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --workspace-bg: #0b1120; --canvas-shadow: 0 40px 120px rgba(8, 15, 35, 0.55); --media-border: rgba(148, 163, 184, 0.28); --media-surface: rgba(12, 18, 32, 0.94); --workspace-pattern: radial-gradient(#4d4d4d 1px, transparent 1px); }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--workspace-bg); color: #e2e8f0; display: flex; align-items: center; justify-content: center; font-family: inherit; }
    main { width: 100%; display: flex; justify-content: center; padding: 2.5rem 1.5rem; position: relative; }
    main::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: var(--workspace-pattern); background-size: 20px 20px; opacity: 0.18; }
    .canvas-wrapper { position: relative; box-shadow: var(--canvas-shadow); border-radius: 18px; overflow: hidden; background: transparent; backdrop-filter: saturate(120%); }
    canvas { display: block; width: 100%; height: auto; background: transparent; }
    #media-overlay { position: absolute; inset: 0; pointer-events: none; }
    #media-overlay > * { pointer-events: auto; }
    .media-element { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 16px; border: 1px solid var(--media-border); background: var(--media-surface); box-shadow: 0 20px 60px rgba(15, 23, 42, 0.45); overflow: hidden; }
    .media-element[data-media-type="video"] video,
    .media-element[data-media-type="model"] model-viewer { width: 100%; height: 100%; display: block; object-fit: cover; background: #020617; }
    .media-element[data-media-type="audio"] { padding: 16px 20px; min-height: 76px; }
    .media-element[data-media-type="audio"] audio { width: 100%; }
    @media (max-width: 900px) { main { padding: 1.5rem; } }
    `;

        zip.file('styles.css', styles);

        let fabricScriptTag = '<script src="https://cdn.jsdelivr.net/npm/fabric@7.1.0/dist/fabric.min.js"></script>';
        try {
            if (libsFolder) {
                const fabricResponse = await fetch('https://cdn.jsdelivr.net/npm/fabric@7.1.0/dist/fabric.min.js');
                if (fabricResponse.ok) {
                    libsFolder.file('fabric.min.js', await fabricResponse.text());
                    fabricScriptTag = '<script src="libs/fabric.min.js"></script>';
                }
            }
        } catch (error) {
            console.warn('Falling back to CDN fabric.js for HTML export:', error);
        }

        let modelViewerScriptTag = includes3DModel
            ? '<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>'
            : '';

        if (includes3DModel) {
            try {
                if (libsFolder) {
                    const modelViewerResponse = await fetch('https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js');
                    if (modelViewerResponse.ok) {
                        libsFolder.file('model-viewer.min.js', await modelViewerResponse.text());
                        modelViewerScriptTag = '<script type="module" src="libs/model-viewer.min.js"></script>';
                    }
                }
            } catch (error) {
                console.warn('Falling back to CDN model-viewer for HTML export:', error);
            }
        }

        const mainScript = `const DESIGN_DATA_BASE64 = '${designJsonBase64}';

const decodeDesignData = () => {
    if (!DESIGN_DATA_BASE64) return null;
    try {
        const binary = atob(DESIGN_DATA_BASE64);
        if (typeof TextDecoder !== 'undefined') {
            const length = binary.length;
            const bytes = new Uint8Array(length);
            for (let i = 0; i < length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(bytes));
        }
        const escaped = binary.replace(/(.)/g, (match, char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0'));
        return JSON.parse(decodeURIComponent(escaped));
    } catch (error) {
        console.error('Failed to decode design payload for export viewer:', error);
        return null;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const canvasEl = document.getElementById('artboard');
    const overlayEl = document.getElementById('media-overlay');
    const wrapperEl = document.querySelector('.canvas-wrapper');

    if (!canvasEl || !overlayEl) return;

    const canvas = new fabric.Canvas(canvasEl, { preserveObjectStacking: true });
    const designData = decodeDesignData();

    if (!designData) {
        return;
    }

    const metadata = designData.metadata || {};

    if (metadata.workspaceBackground) {
        document.documentElement.style.setProperty('--workspace-bg', metadata.workspaceBackground);
    }

    const syncDimensions = () => {
        overlayEl.style.width = \`\${canvas.getWidth()}px\`;
        overlayEl.style.height = \`\${canvas.getHeight()}px\`;
        canvasEl.style.width = \`\${canvas.getWidth()}px\`;
        canvasEl.style.height = \`\${canvas.getHeight()}px\`;
        canvasEl.width = canvas.getWidth();
        canvasEl.height = canvas.getHeight();
        if (wrapperEl) {
            wrapperEl.style.width = \`\${canvas.getWidth()}px\`;
            wrapperEl.style.height = \`\${canvas.getHeight()}px\`;
        }
    };

    const applyArtboard = () => {
        if (!metadata.artboard) return;

        const info = metadata.artboard;
        const artboard = new fabric.Rect({
            left: typeof info.left === 'number' ? info.left : 0,
            top: typeof info.top === 'number' ? info.top : 0,
            width: typeof info.width === 'number' ? info.width : canvas.getWidth(),
            height: typeof info.height === 'number' ? info.height : canvas.getHeight(),
            fill: info.fill || '#ffffff',
            originX: 'left',
            originY: 'top',
            rx: typeof info.rx === 'number' ? info.rx : 0,
            ry: typeof info.ry === 'number' ? info.ry : 0,
            selectable: false,
            evented: false,
            excludeFromExport: true
        });

        if (info.shadow) {
            artboard.set('shadow', new fabric.Shadow({
                color: info.shadow.color || 'rgba(0,0,0,0.2)',
                blur: typeof info.shadow.blur === 'number' ? info.shadow.blur : 20,
                offsetX: typeof info.shadow.offsetX === 'number' ? info.shadow.offsetX : 0,
                offsetY: typeof info.shadow.offsetY === 'number' ? info.shadow.offsetY : 0,
                includeDefaultValues: false
            }));
        }

        canvas.add(artboard);
        canvas.sendToBack(artboard);
        canvas.requestRenderAll();
    };

    const renderMediaOverlays = () => {
        overlayEl.innerHTML = '';
        const objects = canvas.getObjects();

        objects.forEach((obj, index) => {
            if (!obj) return;

            const mediaType = obj.mediaType as 'video' | 'audio' | undefined;
            const mediaSource = typeof obj.mediaSource === 'string' ? obj.mediaSource : undefined;
            const isModel = Boolean(obj.is3DModel && typeof obj.modelUrl === 'string');
            const modelUrl = isModel ? (obj.modelUrl as string) : undefined;

            if (!mediaType && !isModel) return;
            if (mediaType && !mediaSource) return;

            const container = document.createElement('div');
            container.className = 'media-element';
            container.dataset.mediaType = isModel ? 'model' : mediaType!;

            const scaledWidth = typeof obj.getScaledWidth === 'function'
                ? obj.getScaledWidth()
                : (typeof obj.width === 'number' ? obj.width * (typeof obj.scaleX === 'number' ? obj.scaleX : 1) : 0);
            const scaledHeight = typeof obj.getScaledHeight === 'function'
                ? obj.getScaledHeight()
                : (typeof obj.height === 'number' ? obj.height * (typeof obj.scaleY === 'number' ? obj.scaleY : 1) : 0);
            const center = typeof obj.getCenterPoint === 'function'
                ? obj.getCenterPoint()
                : { x: typeof obj.left === 'number' ? obj.left : 0, y: typeof obj.top === 'number' ? obj.top : 0 };
            const angle = typeof obj.angle === 'number' ? obj.angle : 0;

            container.style.width = \`\${scaledWidth}px\`;
            container.style.height = \`\${scaledHeight}px\`;
            container.style.left = \`\${center.x}px\`;
            container.style.top = \`\${center.y}px\`;
            container.style.transform = \`translate(-50%, -50%) rotate(\${angle}deg)\`;
            container.style.transformOrigin = 'center center';
            container.style.zIndex = String(1000 + index);

            const assignBorderRadius = (target: fabric.Object | null | undefined) => {
                if (!target) return;
                const rx = typeof target.rx === 'number' ? target.rx : undefined;
                const ry = typeof target.ry === 'number' ? target.ry : undefined;
                const radius = Math.max(rx ?? 0, ry ?? 0);
                if (radius > 0) {
                    container.style.borderRadius = \`\${radius}px\`;
                }
            };

            const groupObjects = obj.type === 'group'
                ? (obj as fabric.Group & { _objects?: fabric.Object[] })._objects
                : undefined;

            if (obj.type === 'group' && Array.isArray(groupObjects)) {
                const backgroundRect = groupObjects.find((child) => child && child.type === 'rect');
                assignBorderRadius(backgroundRect);
            } else {
                assignBorderRadius(obj);
            }

            let interactive: HTMLElement | null = null;

            if (isModel && modelUrl) {
                const viewer = document.createElement('model-viewer');
                viewer.setAttribute('src', modelUrl);
                viewer.setAttribute('camera-controls', '');
                viewer.setAttribute('auto-rotate', '');
                viewer.setAttribute('shadow-intensity', '1');
                viewer.style.width = '100%';
                viewer.style.height = '100%';
                interactive = viewer;
            } else if (mediaType === 'video' && mediaSource) {
                const video = document.createElement('video');
                video.src = mediaSource;
                video.controls = true;
                video.preload = 'metadata';
                video.playsInline = true;
                video.setAttribute('playsinline', 'true');
                video.setAttribute('webkit-playsinline', 'true');
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                interactive = video;
            } else if (mediaType === 'audio' && mediaSource) {
                const audio = document.createElement('audio');
                audio.src = mediaSource;
                audio.controls = true;
                audio.preload = 'metadata';
                audio.style.width = '100%';
                interactive = audio;
            }

            if (!interactive) return;

            container.appendChild(interactive);
            overlayEl.appendChild(container);

            if (typeof obj.set === 'function') {
                obj.set('visible', false);
            }
        });

        canvas.requestRenderAll();
    };
    if (metadata.backgroundColor) {
        canvas.setBackgroundColor(metadata.backgroundColor, () => canvas.renderAll());
    }

    if (typeof metadata.canvasWidth === 'number' && typeof metadata.canvasHeight === 'number') {
        canvas.setDimensions({ width: metadata.canvasWidth, height: metadata.canvasHeight });
    }

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    canvas.loadFromJSON(designData, () => {
        applyArtboard();
        syncDimensions();
        renderMediaOverlays();
    });

    window.addEventListener('resize', () => {
        syncDimensions();
        renderMediaOverlays();
    });
});
`;


        scriptsFolder?.file('main.js', mainScript);

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Image Express Export</title>
    <link rel="stylesheet" href="styles.css" />
    ${fabricScriptTag}
    ${modelViewerScriptTag}
</head>
<body>
    <main>
        <div class="canvas-wrapper">
            <canvas id="artboard"></canvas>
            <div id="media-overlay"></div>
        </div>
    </main>
    <script src="scripts/main.js"></script>
</body>
</html>`;

        zip.file('index.html', html);

        try {
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const archiveName = baseName ? `${baseName}.zip` : `design-${timestamp}.zip`;
            downloadBlob(zipBlob, archiveName);
        } catch (error) {
            console.error('Failed to generate HTML export bundle:', error);
            toast({ title: 'Export failed', description: 'Unable to generate HTML export.', variant: 'destructive' });
        }
    };

    // --- Template Loading Helper (Missing Assets Logic) ---
    const handleLoadTemplate = useCallback(async (templateJsonUrl: string) => {
        if (!canvas) return;
        setMissingItems([]);
        setPendingTemplateJson(null);
   
        try {
           const res = await fetch(templateJsonUrl);
           if(!res.ok) throw new Error("Failed to fetch template JSON");
           
           const json = await res.json();
           const objects = Array.isArray(json.objects) ? (json.objects as SerializedObject[]) : [];
           const missing: MissingItem[] = [];
   
           const checkUrl = (url: string): Promise<boolean> => {
               return new Promise((resolve) => {
                   const img = new window.Image();
                   img.onload = () => resolve(true);
                   img.onerror = () => resolve(false);
                   img.src = url; 
               });
           };
           
           const candidates: { index: number, src: string, type: 'image' | 'model' }[] = [];
           objects.forEach((obj, index) => {
               if (obj.type === 'image' && obj.src) candidates.push({ index, src: obj.src, type: 'image' });
               if (obj.is3DModel && obj.modelUrl) candidates.push({ index, src: obj.modelUrl, type: 'model' });
           });
   
           for (const cand of candidates) {
               let exists = false;
               if (cand.type === 'model') {
                    try {
                        const head = await fetch(cand.src, { method: 'HEAD' });
                        exists = head.ok;
                    } catch { exists = false; }
               } else {
                    exists = await checkUrl(cand.src);
               }
               if (!exists) {
                   missing.push({
                       id: cand.index.toString(),
                       type: cand.type,
                       originalSrc: cand.src
                   });
               }
           }
   
           if (missing.length > 0) {
               setMissingItems(missing);
               setPendingTemplateJson(json);
               setShowMissingAssetsModal(true);
           } else {
                historyReadyRef.current = false;
                canvas.loadFromJSON(json, () => {
                   canvas.requestRenderAll();
                   setIsDirty(false);
                    resetHistory();
               });
           }
        } catch (e) {
            console.error("Failed to load template", e);
            toast({ title: 'Load failed', description: 'Error loading template file.', variant: 'destructive' });
        }
    }, [canvas, toast, resetHistory]);

    // --- Loading Logic ---
    useEffect(() => {
        if (!canvas) return;

        // If we have an initial template URL (passed from dashboard selection)
        if (initialTemplateJsonUrl) {
            handleLoadTemplate(initialTemplateJsonUrl);
        } 
        // Or if we have a full design object (opened from dashboard)
        else if (initialDesign) {
            handleOpenDesign(initialDesign);
        }
        
    }, [canvas, initialDesign, initialTemplateJsonUrl, handleLoadTemplate, handleOpenDesign]);

    useEffect(() => {
        if (!canvas) return;
        if (!initialTemplateJsonUrl && !initialDesign) {
            resetHistory();
        }
    }, [canvas, initialDesign, initialTemplateJsonUrl, resetHistory]);
    
    // --- Resolving Missing Assets ---
    const handleResolveMissing = (replaceMap: Record<string, string> | null) => {
        if (!canvas || !pendingTemplateJson) return;
        const json = JSON.parse(JSON.stringify(pendingTemplateJson));
        if (replaceMap) {
            Object.entries(replaceMap).forEach(([indexStr, newUrl]) => {
                const idx = parseInt(indexStr);
                if (json.objects && json.objects[idx]) {
                     const obj = json.objects[idx];
                     if (obj.type === 'image') obj.src = newUrl;
                     if (obj.is3DModel) obj.modelUrl = newUrl;
                }
            });
        } else {
            const indicesToRemove = missingItems.map(m => parseInt(m.id)).sort((a,b) => b-a);
            indicesToRemove.forEach(idx => {
                 json.objects.splice(idx, 1);
            });
        }
        historyReadyRef.current = false;
        canvas.loadFromJSON(json, () => {
            canvas.requestRenderAll();
            setIsDirty(false);
            setPendingTemplateJson(null);
            setMissingItems([]);
            setShowMissingAssetsModal(false);
            resetHistory();
        });
    };

    const parseCropAspectRatio = useCallback((preset: TopCropRatioPreset): number | null => {
        if (preset === 'free') return null;
        const [widthToken, heightToken] = preset.split(':');
        const width = Number(widthToken);
        const height = Number(heightToken);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            return null;
        }
        return width / height;
    }, []);

    const buildAspectCropRect = useCallback((
        sourceRect: { left: number; top: number; width: number; height: number },
        aspectRatio: number | null
    ) => {
        if (!aspectRatio) {
            return {
                left: sourceRect.left,
                top: sourceRect.top,
                width: Math.max(1, sourceRect.width),
                height: Math.max(1, sourceRect.height),
            };
        }

        const sourceRatio = sourceRect.width / sourceRect.height;
        let width = sourceRect.width;
        let height = sourceRect.height;
        if (sourceRatio > aspectRatio) {
            width = sourceRect.height * aspectRatio;
        } else {
            height = sourceRect.width / aspectRatio;
        }
        return {
            left: sourceRect.left + (sourceRect.width - width) / 2,
            top: sourceRect.top + (sourceRect.height - height) / 2,
            width: Math.max(1, width),
            height: Math.max(1, height),
        };
    }, []);

    const getMediaOverlaySourceRect = useCallback((): RectBounds | null => {
        if (!canvas) return null;
        const activeCanvas = canvas as CanvasWithArtboard;
        const artboard = activeCanvas.artboard;
        if (artboard && artboard.width > 0 && artboard.height > 0) {
            return {
                left: artboard.left,
                top: artboard.top,
                width: artboard.width,
                height: artboard.height,
            };
        }

        const width = canvas.width || canvas.getWidth();
        const height = canvas.height || canvas.getHeight();
        if (!width || !height) return null;

        return {
            left: 0,
            top: 0,
            width,
            height,
        };
    }, [canvas]);

    const getCanvasFullRect = useCallback((): RectBounds | null => {
        if (!canvas) return null;
        const width = canvas.width || canvas.getWidth();
        const height = canvas.height || canvas.getHeight();
        if (!width || !height) return null;
        return { left: 0, top: 0, width, height };
    }, [canvas]);

    const getMediaOverlayConstraintRect = useCallback((preset: MediaOverlayPreset): RectBounds | null => {
        if (preset === 'canvas-original') {
            return getCanvasFullRect();
        }
        return getMediaOverlaySourceRect() || getCanvasFullRect();
    }, [getCanvasFullRect, getMediaOverlaySourceRect]);

    const getMediaOverlayStorageKey = useCallback(() => {
        const rawId = (propDesignId || propDesignName || 'untitled').trim().toLowerCase();
        const safeId = rawId.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
        return `${MEDIA_OVERLAY_STORAGE_KEY_PREFIX}:${safeId}`;
    }, [propDesignId, propDesignName]);

    const getMediaOverlayFrameBounds = useCallback((frame: fabric.Rect): RectBounds => {
        if (typeof frame.getCoords === 'function') {
            const coords = frame.getCoords();
            if (Array.isArray(coords) && coords.length > 0) {
                const xs = coords.map((point) => point.x).filter((value) => Number.isFinite(value));
                const ys = coords.map((point) => point.y).filter((value) => Number.isFinite(value));
                if (xs.length > 0 && ys.length > 0) {
                    const left = Math.min(...xs);
                    const top = Math.min(...ys);
                    const right = Math.max(...xs);
                    const bottom = Math.max(...ys);
                    return {
                        left,
                        top,
                        width: Math.max(1, right - left),
                        height: Math.max(1, bottom - top),
                    };
                }
            }
        }

        return {
            left: frame.left || 0,
            top: frame.top || 0,
            width: Math.max(1, frame.getScaledWidth?.() ?? ((frame.width || 1) * (frame.scaleX || 1))),
            height: Math.max(1, frame.getScaledHeight?.() ?? ((frame.height || 1) * (frame.scaleY || 1))),
        };
    }, []);

    const normalizeMediaOverlayFrameOrigin = useCallback((frame: fabric.Rect) => {
        const originX = frame.originX || 'left';
        const originY = frame.originY || 'top';
        if (originX === 'left' && originY === 'top') return;
        const bounds = getMediaOverlayFrameBounds(frame);
        frame.set({
            originX: 'left',
            originY: 'top',
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
            scaleX: 1,
            scaleY: 1,
        });
        frame.setCoords();
    }, [getMediaOverlayFrameBounds]);

    const bringMediaOverlayFrameToFront = useCallback((frameOverride?: fabric.Rect): boolean => {
        if (!canvas) return false;
        const frame = frameOverride ?? mediaOverlayFrameRef.current;
        if (!frame) return false;
        const objects = canvas.getObjects();
        if (!objects.includes(frame) || objects[objects.length - 1] === frame) {
            return false;
        }

        const canvasStack = canvas as fabric.Canvas & {
            bringToFront?: (obj: fabric.Object) => void;
            moveTo?: (obj: fabric.Object, index: number) => void;
        };
        if (canvasStack.bringToFront) {
            canvasStack.bringToFront(frame);
            return true;
        }
        if (canvasStack.moveTo) {
            canvasStack.moveTo(frame, objects.length - 1);
            return true;
        }
        return false;
    }, [canvas]);

    const constrainMediaOverlayFrame = useCallback((frame: fabric.Rect, presetOverride?: MediaOverlayPreset) => {
        const sourceRect = getMediaOverlayConstraintRect(presetOverride ?? mediaOverlayPreset);
        if (!sourceRect) return;
        normalizeMediaOverlayFrameOrigin(frame);

        let width = Math.max(1, frame.getScaledWidth?.() ?? ((frame.width || 1) * (frame.scaleX || 1)));
        let height = Math.max(1, frame.getScaledHeight?.() ?? ((frame.height || 1) * (frame.scaleY || 1)));

        if (width > sourceRect.width || height > sourceRect.height) {
            const fitScale = Math.min(sourceRect.width / width, sourceRect.height / height);
            width = Math.max(1, width * fitScale);
            height = Math.max(1, height * fitScale);
            frame.set({ width, height, scaleX: 1, scaleY: 1 });
        }

        const maxLeft = sourceRect.left + sourceRect.width - width;
        const maxTop = sourceRect.top + sourceRect.height - height;
        const clampedLeft = Math.min(Math.max(sourceRect.left, frame.left || 0), Math.max(sourceRect.left, maxLeft));
        const clampedTop = Math.min(Math.max(sourceRect.top, frame.top || 0), Math.max(sourceRect.top, maxTop));

        frame.set({ left: clampedLeft, top: clampedTop });
        frame.setCoords();
    }, [getMediaOverlayConstraintRect, mediaOverlayPreset, normalizeMediaOverlayFrameOrigin]);

    const applyMediaOverlayPresetToFrame = useCallback((frame: fabric.Rect, preset: MediaOverlayPreset) => {
        const sourceRect = getMediaOverlayConstraintRect(preset);
        if (!sourceRect) return;

        if (preset === 'canvas-original') {
            frame.set({
                left: sourceRect.left,
                top: sourceRect.top,
                width: Math.max(1, sourceRect.width),
                height: Math.max(1, sourceRect.height),
                scaleX: 1,
                scaleY: 1,
            });
            frame.setCoords();
            return;
        }

        const spec = MEDIA_OVERLAY_PRESETS.find((item) => item.id === preset) ?? MEDIA_OVERLAY_PRESETS[0];
        const targetAspectRatio = spec.width / spec.height;
        const fittedRect = buildAspectCropRect(sourceRect, targetAspectRatio);
        const frameWidth = Math.max(24, fittedRect.width * 0.7);
        const frameHeight = Math.max(24, fittedRect.height * 0.7);

        frame.set({
            left: fittedRect.left + (fittedRect.width - frameWidth) / 2,
            top: fittedRect.top + (fittedRect.height - frameHeight) / 2,
            width: frameWidth,
            height: frameHeight,
            scaleX: 1,
            scaleY: 1,
        });
        frame.setCoords();
    }, [buildAspectCropRect, getMediaOverlayConstraintRect]);

    const persistMediaOverlayState = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            const frame = mediaOverlayFrameRef.current;
            const payload: MediaOverlayPersistedState = {
                enabled: mediaOverlayEnabled,
                preset: mediaOverlayPreset,
            };
            if (frame && mediaOverlayEnabled && mediaOverlayPreset !== 'canvas-original') {
                payload.frameBounds = getMediaOverlayFrameBounds(frame);
            }
            window.localStorage.setItem(getMediaOverlayStorageKey(), JSON.stringify(payload));
        } catch {
            // ignore storage write failures
        }
    }, [getMediaOverlayFrameBounds, getMediaOverlayStorageKey, mediaOverlayEnabled, mediaOverlayPreset]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const resetOverlay = () => {
            mediaOverlayPendingRestoreRef.current = null;
            setMediaOverlayPreset('canvas-original');
            setMediaOverlayEnabled(true);
        };

        try {
            const raw = window.localStorage.getItem(getMediaOverlayStorageKey());
            if (!raw) {
                resetOverlay();
                return;
            }

            const parsed = JSON.parse(raw) as Partial<MediaOverlayPersistedState>;
            const hasValidPreset = MEDIA_OVERLAY_PRESETS.some((item) => item.id === parsed.preset);
            const nextPreset = hasValidPreset ? (parsed.preset as MediaOverlayPreset) : 'canvas-original';
            const frameBounds = parsed.frameBounds;
            const hasValidBounds = Boolean(
                frameBounds
                && Number.isFinite(frameBounds.left)
                && Number.isFinite(frameBounds.top)
                && Number.isFinite(frameBounds.width)
                && Number.isFinite(frameBounds.height)
                && frameBounds.width > 1
                && frameBounds.height > 1
            );
            mediaOverlayPendingRestoreRef.current = hasValidBounds
                ? {
                    left: Number(frameBounds!.left),
                    top: Number(frameBounds!.top),
                    width: Number(frameBounds!.width),
                    height: Number(frameBounds!.height),
                }
                : null;
            setMediaOverlayPreset(nextPreset);
            setMediaOverlayEnabled(typeof parsed.enabled === 'boolean' ? parsed.enabled : true);
        } catch {
            resetOverlay();
        }
    }, [getMediaOverlayStorageKey]);

    const getMediaOverlayCropBounds = useCallback((): RectBounds | null => {
        if (!mediaOverlayEnabled) return null;

        const sourceRect = getMediaOverlayConstraintRect(mediaOverlayPreset);
        if (!sourceRect) return null;

        if (mediaOverlayPreset === 'canvas-original') {
            return {
                left: sourceRect.left,
                top: sourceRect.top,
                width: sourceRect.width,
                height: sourceRect.height,
            };
        }

        const frame = mediaOverlayFrameRef.current;
        if (frame) {
            const frameBounds = getMediaOverlayFrameBounds(frame);
            const clampedWidth = Math.max(1, Math.min(frameBounds.width, sourceRect.width));
            const clampedHeight = Math.max(1, Math.min(frameBounds.height, sourceRect.height));
            const minLeft = sourceRect.left;
            const minTop = sourceRect.top;
            const maxLeft = sourceRect.left + sourceRect.width - clampedWidth;
            const maxTop = sourceRect.top + sourceRect.height - clampedHeight;

            return {
                left: Math.min(Math.max(frameBounds.left, minLeft), maxLeft),
                top: Math.min(Math.max(frameBounds.top, minTop), maxTop),
                width: clampedWidth,
                height: clampedHeight,
            };
        }

        const spec = MEDIA_OVERLAY_PRESETS.find((item) => item.id === mediaOverlayPreset) ?? MEDIA_OVERLAY_PRESETS[0];
        const targetAspectRatio = spec.width / spec.height;
        return buildAspectCropRect(sourceRect, targetAspectRatio);
    }, [buildAspectCropRect, getMediaOverlayConstraintRect, getMediaOverlayFrameBounds, mediaOverlayEnabled, mediaOverlayPreset]);

    useEffect(() => {
        if (!canvas) return;

        const removeOverlayFrame = () => {
            const frame = mediaOverlayFrameRef.current;
            if (frame) {
                canvas.remove(frame);
                mediaOverlayFrameRef.current = null;
            }
            const label = mediaOverlayLabelRef.current;
            if (label) {
                canvas.remove(label);
                mediaOverlayLabelRef.current = null;
            }
        };

        if (!mediaOverlayEnabled || mediaOverlayPreset === 'canvas-original') {
            removeOverlayFrame();
            persistMediaOverlayState();
            canvas.requestRenderAll();
            return;
        }

        const existingFrame = mediaOverlayFrameRef.current;
        if (existingFrame) {
            existingFrame.set({
                visible: true,
                selectable: true,
                evented: true,
                hasControls: true,
                hasBorders: true,
            });
            applyMediaOverlayPresetToFrame(existingFrame, mediaOverlayPreset);
            const pending = mediaOverlayPendingRestoreRef.current;
            if (pending) {
                existingFrame.set({
                    left: pending.left,
                    top: pending.top,
                    width: pending.width,
                    height: pending.height,
                    scaleX: 1,
                    scaleY: 1,
                });
                mediaOverlayPendingRestoreRef.current = null;
            }
            normalizeMediaOverlayFrameOrigin(existingFrame);
            constrainMediaOverlayFrame(existingFrame, mediaOverlayPreset);
            const sourceRect = getMediaOverlayConstraintRect(mediaOverlayPreset);
            const bounds = getMediaOverlayFrameBounds(existingFrame);
            const isPinnedTopLeft = Boolean(
                sourceRect
                && mediaOverlayPreset !== 'canvas-original'
                && Math.abs(bounds.left - sourceRect.left) <= 1
                && Math.abs(bounds.top - sourceRect.top) <= 1
                && (sourceRect.width - bounds.width) <= 1
                && (sourceRect.height - bounds.height) <= 1
            );
            if (isPinnedTopLeft) {
                applyMediaOverlayPresetToFrame(existingFrame, mediaOverlayPreset);
                constrainMediaOverlayFrame(existingFrame, mediaOverlayPreset);
            }
            existingFrame.off('moving');
            existingFrame.off('scaling');
            existingFrame.off('modified');
            const syncExistingMoveBounds = () => {
                constrainMediaOverlayFrame(existingFrame, mediaOverlayPreset);
                if (bringMediaOverlayFrameToFront(existingFrame)) {
                    canvas.requestRenderAll();
                    return;
                }
                canvas.requestRenderAll();
            };
            const syncExistingScaling = () => {
                bringMediaOverlayFrameToFront(existingFrame);
                canvas.requestRenderAll();
            };
            const handleExistingModified = () => {
                constrainMediaOverlayFrame(existingFrame, mediaOverlayPreset);
                bringMediaOverlayFrameToFront(existingFrame);
                canvas.requestRenderAll();
                setIsDirty(true);
                persistMediaOverlayState();
            };
            existingFrame.on('moving', syncExistingMoveBounds);
            existingFrame.on('scaling', syncExistingScaling);
            existingFrame.on('modified', handleExistingModified);
            canvas.setActiveObject(existingFrame);
            bringMediaOverlayFrameToFront(existingFrame);
            persistMediaOverlayState();
            canvas.requestRenderAll();
            return;
        }

        const frame = new fabric.Rect({
            left: 80,
            top: 80,
            width: 320,
            height: 320,
            originX: 'left',
            originY: 'top',
            fill: 'transparent',
            stroke: '#38bdf8',
            strokeWidth: 2,
            strokeDashArray: [10, 8],
            selectable: true,
            evented: true,
            hasBorders: true,
            hasControls: true,
            lockRotation: true,
            transparentCorners: false,
            cornerColor: '#38bdf8',
            borderColor: '#38bdf8',
            borderDashArray: [10, 8],
            objectCaching: false,
        }) as fabric.Rect & ExtendedFabricObject & { excludeFromExport?: boolean };
        (frame as fabric.Rect & { isSelectionOverlayHelper?: boolean }).isSelectionOverlayHelper = true;
        frame.name = 'Media Overlay Frame';
        frame.excludeFromExport = true;
        frame.visible = true;

        applyMediaOverlayPresetToFrame(frame, mediaOverlayPreset);
        const pending = mediaOverlayPendingRestoreRef.current;
        if (pending) {
            frame.set({
                left: pending.left,
                top: pending.top,
                width: pending.width,
                height: pending.height,
                scaleX: 1,
                scaleY: 1,
            });
            mediaOverlayPendingRestoreRef.current = null;
        }

        normalizeMediaOverlayFrameOrigin(frame);
        constrainMediaOverlayFrame(frame, mediaOverlayPreset);
        const sourceRect = getMediaOverlayConstraintRect(mediaOverlayPreset);
        const bounds = getMediaOverlayFrameBounds(frame);
        const isPinnedTopLeft = Boolean(
            sourceRect
            && mediaOverlayPreset !== 'canvas-original'
            && Math.abs(bounds.left - sourceRect.left) <= 1
            && Math.abs(bounds.top - sourceRect.top) <= 1
            && (sourceRect.width - bounds.width) <= 1
            && (sourceRect.height - bounds.height) <= 1
        );
        if (isPinnedTopLeft) {
            applyMediaOverlayPresetToFrame(frame, mediaOverlayPreset);
            constrainMediaOverlayFrame(frame, mediaOverlayPreset);
        }
        frame.off('moving');
        frame.off('scaling');
        frame.off('modified');
        const syncMoveBounds = () => {
            constrainMediaOverlayFrame(frame, mediaOverlayPreset);
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
        };
        const syncScaling = () => {
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
        };
        const handleModified = () => {
            constrainMediaOverlayFrame(frame, mediaOverlayPreset);
            bringMediaOverlayFrameToFront(frame);
            canvas.requestRenderAll();
            setIsDirty(true);
            persistMediaOverlayState();
        };

        frame.on('moving', syncMoveBounds);
        frame.on('scaling', syncScaling);
        frame.on('modified', handleModified);

        mediaOverlayFrameRef.current = frame;
        canvas.add(frame);
        canvas.setActiveObject(frame);
        bringMediaOverlayFrameToFront(frame);
        persistMediaOverlayState();
        canvas.requestRenderAll();
    }, [
        applyMediaOverlayPresetToFrame,
        bringMediaOverlayFrameToFront,
        canvas,
        constrainMediaOverlayFrame,
        getMediaOverlayConstraintRect,
        getMediaOverlayFrameBounds,
        mediaOverlayEnabled,
        mediaOverlayPreset,
        normalizeMediaOverlayFrameOrigin,
        persistMediaOverlayState,
    ]);

    useEffect(() => {
        if (!canvas || !mediaOverlayEnabled || mediaOverlayPreset === 'canvas-original') {
            return;
        }

        const keepOverlayFrameOnTop = (event?: fabric.IEvent) => {
            const frame = mediaOverlayFrameRef.current;
            if (!frame) return;
            const target = event?.target;
            if (target && target === frame) return;
            if (bringMediaOverlayFrameToFront(frame)) {
                canvas.requestRenderAll();
            }
        };

        canvas.on('object:added', keepOverlayFrameOnTop);
        canvas.on('object:modified', keepOverlayFrameOnTop);
        canvas.on('object:moving', keepOverlayFrameOnTop);
        canvas.on('object:scaling', keepOverlayFrameOnTop);
        canvas.on('object:rotating', keepOverlayFrameOnTop);
        canvas.on('selection:created', keepOverlayFrameOnTop);
        canvas.on('selection:updated', keepOverlayFrameOnTop);
        keepOverlayFrameOnTop();
        return () => {
            canvas.off('object:added', keepOverlayFrameOnTop);
            canvas.off('object:modified', keepOverlayFrameOnTop);
            canvas.off('object:moving', keepOverlayFrameOnTop);
            canvas.off('object:scaling', keepOverlayFrameOnTop);
            canvas.off('object:rotating', keepOverlayFrameOnTop);
            canvas.off('selection:created', keepOverlayFrameOnTop);
            canvas.off('selection:updated', keepOverlayFrameOnTop);
        };
    }, [bringMediaOverlayFrameToFront, canvas, mediaOverlayEnabled, mediaOverlayPreset]);

    useEffect(() => {
        return () => {
            const activeCanvas = canvasRef.current;
            const frame = mediaOverlayFrameRef.current;
            const label = mediaOverlayLabelRef.current;
            if (!activeCanvas) return;
            if (frame) {
                activeCanvas.remove(frame);
            }
            if (label) {
                activeCanvas.remove(label);
            }
            mediaOverlayFrameRef.current = null;
            mediaOverlayLabelRef.current = null;
        };
    }, []);

    const applyTopCropSettings = useCallback(() => {
        if (!canvas) return;
        const activeCanvas = canvas as CanvasWithArtboard;
        const fallbackWidth = canvas.width || canvas.getWidth();
        const fallbackHeight = canvas.height || canvas.getHeight();
        if (!fallbackWidth || !fallbackHeight) return;

        const sourceRect = cropTopUseArtboardBounds && activeCanvas.artboard
            ? {
                left: activeCanvas.artboard.left,
                top: activeCanvas.artboard.top,
                width: activeCanvas.artboard.width,
                height: activeCanvas.artboard.height,
            }
            : { left: 0, top: 0, width: fallbackWidth, height: fallbackHeight };

        const hasDraftRect = Boolean(
            cropTopDraftRect
            && cropTopDraftRect.width > 1
            && cropTopDraftRect.height > 1
        );
        const cropRect = hasDraftRect
            ? {
                left: cropTopDraftRect!.left,
                top: cropTopDraftRect!.top,
                width: cropTopDraftRect!.width,
                height: cropTopDraftRect!.height,
            }
            : buildAspectCropRect(sourceRect, parseCropAspectRatio(cropTopRatioPreset));

        activeCanvas.artboard = {
            left: cropRect.left,
            top: cropRect.top,
            width: cropRect.width,
            height: cropRect.height,
        };

        if (activeCanvas.artboardRect) {
            activeCanvas.artboardRect.set({
                left: cropRect.left,
                top: cropRect.top,
                width: cropRect.width,
                height: cropRect.height,
            });
            activeCanvas.artboardRect.setCoords();
        }

        let removedCount = 0;
        if (cropTopDeleteOutside) {
            const intersects = (
                a: { left: number; top: number; width: number; height: number },
                b: { left: number; top: number; width: number; height: number }
            ) => (
                a.left < b.left + b.width
                && a.left + a.width > b.left
                && a.top < b.top + b.height
                && a.top + a.height > b.top
            );

            const objects = [...canvas.getObjects()];
            for (const obj of objects) {
                if (obj === activeCanvas.artboardRect) continue;
                const bounds = obj.getBoundingRect();
                if (!intersects(bounds, cropRect)) {
                    canvas.remove(obj);
                    removedCount += 1;
                }
            }
        }

        canvas.requestRenderAll();
        setIsDirty(true);
        setActiveTool('select');
        setCropTopDraftRect(null);
        const cropHelper = cropDraftHelperRef.current;
        if (cropHelper) {
            canvas.remove(cropHelper);
            cropDraftHelperRef.current = null;
        }
        toast({
            title: 'Crop applied',
            description: removedCount > 0
                ? `Removed ${removedCount} object${removedCount === 1 ? '' : 's'} outside crop bounds.`
                : hasDraftRect
                    ? 'Draft crop bounds applied.'
                    : 'Artboard crop bounds updated.',
            variant: 'success',
        });
    }, [
        canvas,
        cropTopUseArtboardBounds,
        cropTopDraftRect,
        buildAspectCropRect,
        parseCropAspectRatio,
        cropTopRatioPreset,
        cropTopDeleteOutside,
        toast,
        setActiveTool,
    ]);

    const getScenePointerFromEvent = useCallback((opt: fabric.TPointerEventInfo): fabric.Point | null => {
        const optWithScene = opt as unknown as { scenePoint?: fabric.Point };
        if (optWithScene.scenePoint) {
            return optWithScene.scenePoint;
        }
        const canvasWithScene = canvas as unknown as {
            getScenePoint?: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point;
        };
        if (opt.e && typeof canvasWithScene.getScenePoint === 'function') {
            return canvasWithScene.getScenePoint(opt.e);
        }
        return null;
    }, [canvas]);

    const readColorFromActiveObject = useCallback((): string | null => {
        if (!canvas) return null;
        const active = canvas.getActiveObject() as (fabric.Object & { fill?: unknown; stroke?: unknown }) | null;
        if (!active) return null;
        const candidates = [active.fill, active.stroke];
        for (const value of candidates) {
            if (typeof value !== 'string' || !value.trim()) continue;
            const parsed = parseColorWithAlpha(value);
            const normalized = normalizeColorValue(parsed.color);
            if (normalized && normalized.startsWith('#') && normalized.length === 7) {
                return normalized;
            }
        }
        return null;
    }, [canvas]);

    const readColorFromCanvasPoint = useCallback((point: fabric.Point, sampleSize: TopEyedropperSampleSize): string | null => {
        if (!canvas) return null;
        const exportCanvas = canvas as CanvasWithExportInternals;
        const sourceCanvas = exportCanvas.lowerCanvasEl || exportCanvas.getElement?.();
        if (!sourceCanvas) return null;
        const context = sourceCanvas.getContext('2d');
        if (!context) return null;

        const canvasWidth = Math.max(1, canvas.getWidth?.() || sourceCanvas.width);
        const canvasHeight = Math.max(1, canvas.getHeight?.() || sourceCanvas.height);
        const vt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
        const viewportX = (point.x * vt[0]) + (point.y * vt[2]) + vt[4];
        const viewportY = (point.x * vt[1]) + (point.y * vt[3]) + vt[5];
        const pixelCenterX = Math.round((viewportX / canvasWidth) * sourceCanvas.width);
        const pixelCenterY = Math.round((viewportY / canvasHeight) * sourceCanvas.height);

        const pixelWindow = Math.max(1, sampleSize);
        const halfWindow = Math.floor(pixelWindow / 2);
        const startX = Math.max(0, pixelCenterX - halfWindow);
        const startY = Math.max(0, pixelCenterY - halfWindow);
        const width = Math.min(pixelWindow, sourceCanvas.width - startX);
        const height = Math.min(pixelWindow, sourceCanvas.height - startY);
        if (width <= 0 || height <= 0) return null;

        try {
            const imageData = context.getImageData(startX, startY, width, height).data;
            let red = 0;
            let green = 0;
            let blue = 0;
            let count = 0;
            for (let index = 0; index < imageData.length; index += 4) {
                const alpha = imageData[index + 3];
                if (alpha === 0) continue;
                red += imageData[index];
                green += imageData[index + 1];
                blue += imageData[index + 2];
                count += 1;
            }
            if (count === 0) return null;
            const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
            return `#${toHex(red / count)}${toHex(green / count)}${toHex(blue / count)}`;
        } catch {
            return null;
        }
    }, [canvas]);

    const readColorFromCanvasCenter = useCallback((sampleSize: TopEyedropperSampleSize): string | null => {
        if (!canvas) return null;
        const exportCanvas = canvas as CanvasWithExportInternals;
        const sourceCanvas = exportCanvas.lowerCanvasEl || exportCanvas.getElement?.();
        if (!sourceCanvas) return null;
        const context = sourceCanvas.getContext('2d');
        if (!context) return null;

        const pixelWindow = Math.max(1, sampleSize);
        const centerX = Math.floor(sourceCanvas.width / 2);
        const centerY = Math.floor(sourceCanvas.height / 2);
        const halfWindow = Math.floor(pixelWindow / 2);
        const startX = Math.max(0, centerX - halfWindow);
        const startY = Math.max(0, centerY - halfWindow);
        const width = Math.min(pixelWindow, sourceCanvas.width - startX);
        const height = Math.min(pixelWindow, sourceCanvas.height - startY);
        if (width <= 0 || height <= 0) return null;

        try {
            const imageData = context.getImageData(startX, startY, width, height).data;
            let red = 0;
            let green = 0;
            let blue = 0;
            let count = 0;
            for (let index = 0; index < imageData.length; index += 4) {
                const alpha = imageData[index + 3];
                if (alpha === 0) continue;
                red += imageData[index];
                green += imageData[index + 1];
                blue += imageData[index + 2];
                count += 1;
            }
            if (count === 0) return null;
            const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
            return `#${toHex(red / count)}${toHex(green / count)}${toHex(blue / count)}`;
        } catch {
            return null;
        }
    }, [canvas]);

    const resolveEyedropperSample = useCallback((preferredPoint?: fabric.Point | null): string | null => {
        const pointColor = preferredPoint
            ? readColorFromCanvasPoint(preferredPoint, eyedropperTopSampleSize)
            : null;
        const centerColor = pointColor || readColorFromCanvasCenter(eyedropperTopSampleSize);
        if (eyedropperTopSampleSource === 'current-layer') {
            return pointColor || readColorFromActiveObject() || centerColor;
        }
        return centerColor || readColorFromActiveObject();
    }, [
        eyedropperTopSampleSource,
        eyedropperTopSampleSize,
        readColorFromActiveObject,
        readColorFromCanvasCenter,
        readColorFromCanvasPoint,
    ]);

    const handleEyedropperSample = useCallback((preferredPoint?: fabric.Point | null) => {
        if (!canvas) return;
        const sampledColor = resolveEyedropperSample(preferredPoint ?? eyedropperPointerRef.current);

        if (!sampledColor) {
            toast({
                title: 'Sample unavailable',
                description: 'No readable color source was found for the current sample settings.',
                variant: 'warning',
            });
            return;
        }

        setEyedropperTopSampledColor(sampledColor);
        setShapeTopFillColor(sampledColor);
        setTextTopColor(sampledColor);
        (canvas as unknown as {
            fire: (eventName: string, payload?: unknown) => void;
        }).fire('eyedropper:sample', {
            color: sampledColor,
            sampleSize: eyedropperTopSampleSize,
            sampleSource: eyedropperTopSampleSource,
        });
        toast({
            title: 'Color sampled',
            description: `${sampledColor.toUpperCase()} captured from ${eyedropperTopSampleSource === 'current-layer' ? 'current layer' : 'all layers'}.`,
            variant: 'success',
        });
    }, [
        canvas,
        eyedropperTopSampleSource,
        resolveEyedropperSample,
        eyedropperTopSampleSize,
        toast,
    ]);

    useEffect(() => {
        if (!canvas) return;

        const clearDraftHelper = () => {
            const helper = cropDraftHelperRef.current;
            if (!helper) return;
            canvas.remove(helper);
            cropDraftHelperRef.current = null;
            canvas.requestRenderAll();
        };

        if (activeTool !== 'crop') {
            clearDraftHelper();
            setCropTopDraftRect(null);
            return;
        }

        let isDragging = false;
        let dragStart: fabric.Point | null = null;

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;

            const pointer = getScenePointerFromEvent(opt);
            if (!pointer) return;

            isDragging = true;
            dragStart = pointer;
            clearDraftHelper();
            setCropTopDraftRect(null);

            const helper = new fabric.Rect({
                left: pointer.x,
                top: pointer.y,
                width: 1,
                height: 1,
                fill: 'rgba(31,138,165,0.12)',
                stroke: '#1f8aa5',
                strokeWidth: 1.2,
                strokeDashArray: [6, 4],
                selectable: false,
                evented: false,
                objectCaching: false,
                excludeFromExport: true,
            }) as fabric.Rect & { isSelectionOverlayHelper?: boolean };
            helper.isSelectionOverlayHelper = true;
            cropDraftHelperRef.current = helper;
            canvas.add(helper);
            canvas.requestRenderAll();
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            if (!isDragging || !dragStart || !cropDraftHelperRef.current) return;
            const pointer = getScenePointerFromEvent(opt);
            if (!pointer) return;

            const left = Math.min(dragStart.x, pointer.x);
            const top = Math.min(dragStart.y, pointer.y);
            const width = Math.max(1, Math.abs(pointer.x - dragStart.x));
            const height = Math.max(1, Math.abs(pointer.y - dragStart.y));

            cropDraftHelperRef.current.set({ left, top, width, height });
            cropDraftHelperRef.current.setCoords();
            setCropTopDraftRect({ left, top, width, height });
            canvas.requestRenderAll();
        };

        const handleMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            dragStart = null;
        };

        const handleWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            applyTopCropSettings();
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        window.addEventListener('keydown', handleWindowKeyDown);
        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
            window.removeEventListener('keydown', handleWindowKeyDown);
            clearDraftHelper();
        };
    }, [canvas, activeTool, applyTopCropSettings, getScenePointerFromEvent]);

    useEffect(() => {
        if (!canvas || activeTool !== 'eyedropper') return;
        const eyedropperCanvas = canvas as fabric.Canvas & {
            skipTargetFind?: boolean;
        };
        const previousSkipTargetFind = Boolean(eyedropperCanvas.skipTargetFind);
        eyedropperCanvas.skipTargetFind = true;
        canvas.selection = false;
        if (canvas.getActiveObject()) {
            canvas.discardActiveObject();
            canvas.requestRenderAll();
        }

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            const pointer = getScenePointerFromEvent(opt);
            if (pointer) eyedropperPointerRef.current = pointer;
        };

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;
            const pointer = getScenePointerFromEvent(opt);
            if (!pointer) return;
            eyedropperPointerRef.current = pointer;
            handleEyedropperSample(pointer);
        };

        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:down', handleMouseDown);
        return () => {
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:down', handleMouseDown);
            eyedropperCanvas.skipTargetFind = previousSkipTargetFind;
        };
    }, [canvas, activeTool, getScenePointerFromEvent, handleEyedropperSample]);

    const handleFitToScreen = useCallback(() => {
        if (!canvas) return;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (typeof canvasWithArtboard.centerArtboard === 'function') {
            canvasWithArtboard.centerArtboard();
            setZoom(canvas.getZoom());
            return;
        }
        const centerPoint = new fabric.Point((canvas.width || canvas.getWidth()) / 2, (canvas.height || canvas.getHeight()) / 2);
        canvas.zoomToPoint(centerPoint, 1);
        canvas.requestRenderAll();
        setZoom(1);
    }, [canvas]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const syncViewportSize = () => {
            setViewportSize({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };
        syncViewportSize();
        window.addEventListener('resize', syncViewportSize);
        return () => window.removeEventListener('resize', syncViewportSize);
    }, []);

    useEffect(() => {
        if (!canvas) return;

        const syncUtilityCanvasSize = () => {
            const activeCanvas = canvas as CanvasWithArtboard;
            if (activeCanvas.artboardRect) {
                const width = Math.max(1, Math.round((activeCanvas.artboardRect.width || 0) * (activeCanvas.artboardRect.scaleX || 1)));
                const height = Math.max(1, Math.round((activeCanvas.artboardRect.height || 0) * (activeCanvas.artboardRect.scaleY || 1)));
                setUtilityCanvasSize({ width, height });
                return;
            }

            if (activeCanvas.artboard) {
                setUtilityCanvasSize({
                    width: Math.max(1, Math.round(activeCanvas.artboard.width)),
                    height: Math.max(1, Math.round(activeCanvas.artboard.height)),
                });
                return;
            }

            const canvasZoom = canvas.getZoom() || 1;
            const width = Math.max(1, Math.round((canvas.width || canvas.getWidth() || 1080) / canvasZoom));
            const height = Math.max(1, Math.round((canvas.height || canvas.getHeight() || 1080) / canvasZoom));
            setUtilityCanvasSize({ width, height });
        };

        const canvasWithEvents = canvas as unknown as {
            on: (eventName: string, cb: () => void) => void;
            off: (eventName: string, cb: () => void) => void;
        };

        syncUtilityCanvasSize();
        canvasWithEvents.on('artboard:resize', syncUtilityCanvasSize);
        canvas.on('object:modified', syncUtilityCanvasSize);
        canvas.on('object:added', syncUtilityCanvasSize);
        canvas.on('object:removed', syncUtilityCanvasSize);

        return () => {
            canvasWithEvents.off('artboard:resize', syncUtilityCanvasSize);
            canvas.off('object:modified', syncUtilityCanvasSize);
            canvas.off('object:added', syncUtilityCanvasSize);
            canvas.off('object:removed', syncUtilityCanvasSize);
        };
    }, [canvas]);

    const gridStatusLabel = useMemo(() => {
        const labels: Record<GridType, string> = {
            none: 'Off',
            'rule-of-thirds': 'Thirds',
            'golden-ratio': 'Golden',
            cross: 'Cross',
            'grid-4x4': '4x4',
            'canvas-border': 'Border',
        };
        return labels[gridType];
    }, [gridType]);

    const bottomRightUtilityStyle = useMemo(() => {
        const clusterWidth = 260;
        const clusterHeight = 68;
        let right = 16;
        let bottom = backgroundJobs.length > 0 ? 176 : 16;

        const activeViewportWidth = viewportSize.width || 0;
        const activeViewportHeight = viewportSize.height || 0;
        const intersects = (
            a: { left: number; top: number; right: number; bottom: number },
            b: { left: number; top: number; right: number; bottom: number }
        ) => (
            a.left < b.right
            && a.right > b.left
            && a.top < b.bottom
            && a.bottom > b.top
        );

        if (activeViewportWidth > 0 && activeViewportHeight > 0) {
            const createClusterRect = (nextRight: number, nextBottom: number) => ({
                left: activeViewportWidth - nextRight - clusterWidth,
                top: activeViewportHeight - nextBottom - clusterHeight,
                right: activeViewportWidth - nextRight,
                bottom: activeViewportHeight - nextBottom,
            });

            if (contextMenu.isOpen) {
                const contextRect = {
                    left: contextMenu.x - 90,
                    top: contextMenu.y - 90,
                    right: contextMenu.x + 90,
                    bottom: contextMenu.y + 90,
                };
                if (intersects(createClusterRect(right, bottom), contextRect)) {
                    bottom += 96;
                }
            }

            if (panelState.mode === 'floating') {
                const floatingHeight = Math.round(activeViewportHeight * 0.7);
                const floatingRect = {
                    left: panelState.position.x,
                    top: panelState.position.y,
                    right: panelState.position.x + panelState.width,
                    bottom: panelState.position.y + floatingHeight,
                };
                if (intersects(createClusterRect(right, bottom), floatingRect)) {
                    right = Math.max(16, activeViewportWidth - floatingRect.left + 16);
                }
            }
        }

        return {
            right: `${right}px`,
            bottom: `${bottom}px`,
        };
    }, [backgroundJobs.length, contextMenu, panelState, viewportSize]);

    // --- Interactive Tools & Events (Zoom, Gradient, DoubleClick 3D) ---
    const handleZoom = (factor: number) => {
        if (!canvas) return;
        
        // Safeguard: Ensure canvas fills parent container before zooming
        // We use the canvas wrapper element to find the parent container size
        const wrapper = canvas.getElement()?.parentElement?.parentElement; // Adjust traversal if needed, or check logic
        // Actually, canvas wrapper is usually a div inside our container. 
        // Best bet: check canvas.width vs clientWidth of its placeholder? 
        // Let's rely on standard re-check or just setDimensions if we can find parent.
        // Fabric's lower-canvas is usually wrapped in .canvas-container. 
        // We can check .canvas-container's parent.
        if (wrapper && wrapper.clientWidth > 0 && wrapper.clientHeight > 0) {
             const pW = wrapper.clientWidth;
             const pH = wrapper.clientHeight;
             if (canvas.width !== pW || canvas.height !== pH) {
                 canvas.setDimensions({ width: pW, height: pH });
             }
        }

        const currentZoom = canvas.getZoom();
        let newZoom = currentZoom + factor;
        
        // Limits matching DesignCanvas
        newZoom = Math.max(0.05, Math.min(newZoom, 20));
        
        // Zoom to center of the current viewport
        const centerPoint = new fabric.Point(canvas.width! / 2, canvas.height! / 2);
        canvas.zoomToPoint(centerPoint, newZoom);
        
        canvas.requestRenderAll();
        setZoom(newZoom);
    };

    const openPanelModeFromMenu = useCallback((mode: PanelRailMode) => {
        setPropertiesPanelMode(mode);
        setPanelState((prev) => {
            if (prev.mode === 'collapsed-left') return { ...prev, mode: 'docked-left' };
            if (prev.mode === 'collapsed-right') return { ...prev, mode: 'docked-right' };
            return prev;
        });
    }, []);

    const triggerToolbarTool = useCallback((toolName: string) => {
        toolbarRef.current?.triggerTool(toolName);
    }, []);

    const getMenuLayerTarget = useCallback((): (fabric.Object & ExtendedFabricObject) | null => {
        if (!canvas) return null;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject) | null;
        if (!active) return null;
        if (active.type === 'activeSelection' || active.type === 'selection') return null;
        const ext = active as ExtendedFabricObject;
        if (ext.name === 'Artboard') return null;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (canvasWithArtboard.artboardRect && active === canvasWithArtboard.artboardRect) return null;
        return active;
    }, [canvas]);

    const handleLayerDeleteFromMenu = useCallback(() => {
        if (!canvas) return;
        const activeObjects = canvas.getActiveObjects();
        const active = canvas.getActiveObject();
        const selected = activeObjects.length > 0
            ? activeObjects
            : active
                ? [active]
                : [];

        if (selected.length === 0) {
            toast({ title: 'Delete unavailable', description: 'Select a layer first.', variant: 'warning' });
            return;
        }

        const canvasWithArtboard = canvas as CanvasWithArtboard;
        const removable = selected.filter((obj) => {
            const ext = obj as ExtendedFabricObject;
            if (ext.name === 'Artboard') return false;
            if (canvasWithArtboard.artboardRect && obj === canvasWithArtboard.artboardRect) return false;
            return true;
        });

        if (removable.length === 0) {
            toast({ title: 'Delete unavailable', description: 'The selected layer cannot be deleted.', variant: 'warning' });
            return;
        }

        const runtimeCanvas = canvas as fabric.Canvas & {
            fire?: (eventName: string, payload?: Record<string, unknown>) => void;
        };

        canvas.discardActiveObject();
        removable.forEach((obj) => canvas.remove(obj));
        runtimeCanvas.fire?.('object:modified', { target: removable[0] });
        canvas.requestRenderAll();
        setIsDirty(true);
        pushHistory();
    }, [canvas, pushHistory, toast]);

    const handleLayerToggleLockFromMenu = useCallback(() => {
        const target = getMenuLayerTarget();
        if (!target) {
            toast({ title: 'Lock unavailable', description: 'Select a single layer first.', variant: 'warning' });
            return;
        }
        setObjectLockedFromCanvasOverlay(target, !Boolean(target.locked));
        setIsDirty(true);
        pushHistory();
    }, [getMenuLayerTarget, pushHistory, setObjectLockedFromCanvasOverlay, toast]);

    const handleSelectAllFromMenu = useCallback(() => {
        if (!canvas) return;
        const selectable = canvas.getObjects().filter((obj) => {
            const ext = obj as ExtendedFabricObject & {
                isSelectionOverlayHelper?: boolean;
                isPenDraftAnchor?: boolean;
            };
            if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
            if (ext.isSelectionOverlayHelper || ext.isPenDraftAnchor || ext.isRetouchLayer) return false;
            if (ext.name === 'Artboard') return false;
            if (obj.visible === false) return false;
            if (obj.selectable === false || obj.evented === false) return false;
            return true;
        });

        if (selectable.length === 0) {
            toast({ title: 'Select all unavailable', description: 'No selectable layers found.', variant: 'warning' });
            return;
        }

        if (selectionMode === 'layer' || selectable.length === 1) {
            canvas.setActiveObject(selectable[selectable.length - 1]);
        } else {
            canvas.setActiveObject(new fabric.ActiveSelection(selectable, { canvas }));
        }
        canvas.requestRenderAll();
    }, [canvas, selectionMode, toast]);

    const handleDeselectFromMenu = useCallback(() => {
        if (!canvas) return;
        canvas.discardActiveObject();
        canvas.requestRenderAll();
    }, [canvas]);

    const handleResetZoomFromMenu = useCallback(() => {
        if (!canvas) return;
        const centerPoint = new fabric.Point((canvas.width || canvas.getWidth()) / 2, (canvas.height || canvas.getHeight()) / 2);
        canvas.zoomToPoint(centerPoint, 1);
        canvas.requestRenderAll();
        setZoom(1);
    }, [canvas]);

    const handleShowShortcutsFromMenu = useCallback(() => {
        toast({
            title: 'Keyboard shortcuts',
            description: 'V Move, M Marquee, L Lasso, W Wand, J Healing, Y History, B Blur, O Dodge, S Clone, A Path Select.',
            variant: 'success',
        });
    }, [toast]);

    const handleShowAboutFromMenu = useCallback(async () => {
        await dialog.alert('Image Express editor. Build and edit designs with layered tools, retouch workflows, and panel-based controls.', {
            title: 'About Image Express',
        });
    }, [dialog]);

    const handleCaptureVideoFrame = useCallback(() => {
        if (!canvas || !mediaPreview || mediaPreview.type !== 'video') return;
        const video = videoPreviewRef.current;
        if (!video) return;

        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = tempCanvas.toDataURL('image/png');

        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then((img) => {
            if (!img || !canvas) return;
            const artboard = (canvas as CanvasWithArtboard).artboard || { width: canvas.width || 800, height: canvas.height || 600 };
            const viewW = artboard.width;
            const viewH = artboard.height;

            if (img.width! > viewW * 0.8 || img.height! > viewH * 0.8) {
                const scale = Math.min((viewW * 0.8) / img.width!, (viewH * 0.8) / img.height!);
                img.scale(scale);
            }

            canvas.centerObject(img);
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
            setMediaPreview(null);
            setActiveTool('select');
        });
    }, [canvas, mediaPreview, setActiveTool]);

    // Sync UI zoom state with Canvas events (e.g. Mouse Wheel)
    useEffect(() => {
        if (!canvas) return;
        
        const updateZoomState = () => {
            setZoom(canvas.getZoom());
        };
        
        canvas.on('mouse:wheel', updateZoomState);
        // Also sync on touch/pinch gestures if any
        
        return () => {
            canvas.off('mouse:wheel', updateZoomState);
        };
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;
        (canvas as unknown as {
            fire: (eventName: string, payload?: unknown) => void;
        }).fire('hand:mode:set', {
            enabled: activeTool === 'hand' && handTopLockPan,
        });
    }, [canvas, activeTool, handTopLockPan]);

    useEffect(() => {
        if (!canvas) return;
    
                const handleDblClick = (e: fabric.TPointerEventInfo) => {
                    const target = e.target as (ThreeDImage & ExtendedFabricObject) | undefined;
                    if (!target) return;

                    if (target.mediaType && target.mediaSource) {
                        setMediaPreview({ type: target.mediaType as 'video' | 'audio', url: target.mediaSource });
                        return;
                    }

                    if (target.is3DModel || target.modelUrl) {
                        setEditingModelUrl(target.modelUrl || null);
                        setEditingModelObject(target);
                    } else {
                        setActiveTool('select');
                    }
                };
    
        const handleGradientTool = () => {
            let isDown = false;
            let startPoint = { x: 0, y: 0 };
            let activeObj: fabric.Object | null | undefined = null;
    
            return {
                'mouse:down': (opt: fabric.TPointerEventInfo) => {
                    if (activeTool !== 'gradient') return;
                    if (opt.target) {
                        canvas.setActiveObject(opt.target);
                        activeObj = opt.target;
                    } else {
                        activeObj = canvas.getActiveObject();
                    }
                    if (!activeObj) return;
                    isDown = true;
                    const pointer = canvas.getScenePoint(opt.e);
                    startPoint = { x: pointer.x, y: pointer.y };
                },
                'mouse:move': (opt: fabric.TPointerEventInfo) => {
                    if (!isDown || activeTool !== 'gradient' || !activeObj) return;
                    const pointer = canvas.getScenePoint(opt.e);
                    const m = activeObj.calcTransformMatrix();
                    const mInv = fabric.util.invertTransform(m);
                    const p1Local = fabric.util.transformPoint(new fabric.Point(startPoint.x, startPoint.y), mInv);
                    const p2Local = fabric.util.transformPoint(new fabric.Point(pointer.x, pointer.y), mInv);
                    const w = activeObj.width || 1; 
                    const h = activeObj.height || 1;
                    const ox = activeObj.originX === 'center' ? 0.5 : (activeObj.originX === 'right' ? 1 : 0);
                    const oy = activeObj.originY === 'center' ? 0.5 : (activeObj.originY === 'bottom' ? 1 : 0);
                    const n1 = { x: (p1Local.x / w) + ox, y: (p1Local.y / h) + oy };
                    const n2 = { x: (p2Local.x / w) + ox, y: (p2Local.y / h) + oy };

                    const editableGradientObject = activeObj as fabric.Object & ExtendedFabricObject & {
                        get: (key: string) => unknown;
                        set: (props: unknown) => void;
                        setCoords?: () => void;
                    };
                    const currentFill = editableGradientObject.get('fill');
                    const nextStops = resolveGradientStops(currentFill, gradientTopReverse);
                    const nextType = gradientTopType;
                    const nextBlendMode = gradientTopBlendMode;
                    const nextOpacity = Math.max(1, Math.min(100, Math.round(gradientTopOpacity)));
                    const nextDither = gradientTopDither;

                    let newGradient: fabric.Gradient<'linear' | 'radial'>;
                    if (nextType === 'radial') {
                        const radius = Math.max(0.001, Math.hypot(n2.x - n1.x, n2.y - n1.y));
                        newGradient = new fabric.Gradient({
                            type: 'radial',
                            gradientUnits: 'percentage',
                            coords: { x1: n1.x, y1: n1.y, r1: 0, x2: n1.x, y2: n1.y, r2: radius },
                            colorStops: nextStops,
                        });
                    } else {
                        newGradient = new fabric.Gradient({
                            type: 'linear',
                            gradientUnits: 'percentage',
                            coords: { x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y },
                            colorStops: nextStops,
                        });
                    }

                    editableGradientObject.set({
                        fill: newGradient,
                        globalCompositeOperation: nextBlendMode,
                        opacity: nextOpacity / 100,
                        dirty: true,
                    });
                    editableGradientObject.gradientTypeHint = nextType;
                    editableGradientObject.gradientReversed = gradientTopReverse;
                    editableGradientObject.gradientDitherEnabled = nextDither;
                    editableGradientObject.setCoords?.();
                    canvas.requestRenderAll();
                },
                'mouse:up': () => { isDown = false; activeObj = null; }
            };
        };
    
        const gradientHandlers = handleGradientTool();
        canvas.on('mouse:dblclick', handleDblClick);
        canvas.on('mouse:down', gradientHandlers['mouse:down']);
        canvas.on('mouse:move', gradientHandlers['mouse:move']);
        canvas.on('mouse:up', gradientHandlers['mouse:up']);
    
        return () => {
          canvas.off('mouse:dblclick', handleDblClick);
          canvas.off('mouse:down', gradientHandlers['mouse:down']);
          canvas.off('mouse:move', gradientHandlers['mouse:move']);
          canvas.off('mouse:up', gradientHandlers['mouse:up']);
        };
    }, [
        canvas,
        activeTool,
        gradientTopType,
        gradientTopBlendMode,
        gradientTopOpacity,
        gradientTopReverse,
        gradientTopDither,
        resolveGradientStops,
    ]);

    useEffect(() => {
        if (!mediaPreview) return;

        const handleKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMediaPreview(null);
        };

        window.addEventListener('keydown', handleKeydown);
        return () => {
            window.removeEventListener('keydown', handleKeydown);
        };
    }, [mediaPreview]);


    // --- Background Jobs (AI) ---
    const upsertBackgroundJob = useCallback((jobData: Partial<BackgroundJob>) => {
        setBackgroundJobs((prev) => {
            const id = typeof jobData.id === 'string' ? jobData.id.trim() : '';
            if (!id) return prev;

            const normalized: BackgroundJob = {
                id,
                type: (jobData.type || 'image-to-3d') as BackgroundJob['type'],
                status: (jobData.status || 'IN_PROGRESS') as BackgroundJob['status'],
                progress: jobData.progress,
                result: jobData.result,
                resultUrl: jobData.resultUrl,
                thumbnailUrl: jobData.thumbnailUrl,
                error: jobData.error,
                createdAt: jobData.createdAt || Date.now(),
                apiKey: jobData.apiKey,
                provider: jobData.provider,
                stage: jobData.stage,
                prompt: jobData.prompt,
            };

            const existing = prev.find((job) => job.id === id);
            if (!existing) {
                return [...prev, normalized];
            }

            const merged: BackgroundJob = {
                ...existing,
                ...normalized,
                error: normalized.status === 'IN_PROGRESS' || normalized.status === 'PENDING' ? undefined : (normalized.error || existing.error),
            };
            return prev.map((job) => (job.id === id ? merged : job));
        });
    }, []);

    // Check API keys on mount and when settings close
    useEffect(() => {
        setApiKeys({
            meshy: localStorage.getItem('meshy_api_key') || undefined,
            tripo: localStorage.getItem('tripo_api_key') || undefined,
            hitems: localStorage.getItem('hitems_api_key') || undefined,
            stability: localStorage.getItem('stability_api_key') || undefined,
            openai: localStorage.getItem('openai_api_key') || undefined,
            google: localStorage.getItem('google_api_key') || undefined,
            banana: localStorage.getItem('banana_api_key') || undefined,
        });
    }, [settingsOpen]);

    useEffect(() => {
        const syncUiPreferences = () => {
            setExpandToolRailLabelsOnHover(loadUiPreferences().expandToolRailLabelsOnHover);
        };

        syncUiPreferences();
        window.addEventListener(UI_PREFERENCES_CHANGED_EVENT, syncUiPreferences);
        return () => {
            window.removeEventListener(UI_PREFERENCES_CHANGED_EVENT, syncUiPreferences);
        };
    }, [settingsOpen]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem(BACKGROUND_JOBS_STORAGE_KEY);
            if (!raw) {
                setJobsHydrated(true);
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                setJobsHydrated(true);
                return;
            }

            const now = Date.now();
            const restored = parsed
                .filter((entry) => entry && typeof entry === 'object')
                .map((entry) => {
                    const source = entry as Partial<BackgroundJob>;
                    const id = typeof source.id === 'string' ? source.id.trim() : '';
                    if (!id) return null;
                    const createdAt = typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
                        ? source.createdAt
                        : now;
                    if (now - createdAt > MAX_JOB_AGE_MS) return null;

                    const provider = source.provider;
                    let apiKey = source.apiKey;
                    if (!apiKey && provider) {
                        apiKey = localStorage.getItem(`${provider}_api_key`) || undefined;
                    }

                    return {
                        id,
                        type: (source.type || 'image-to-3d') as BackgroundJob['type'],
                        status: (source.status || 'IN_PROGRESS') as BackgroundJob['status'],
                        progress: typeof source.progress === 'number' ? source.progress : undefined,
                        resultUrl: source.resultUrl,
                        thumbnailUrl: source.thumbnailUrl,
                        error: source.error,
                        createdAt,
                        apiKey,
                        provider,
                        stage: source.stage,
                        prompt: source.prompt,
                    } as BackgroundJob;
                })
                .filter((entry): entry is BackgroundJob => Boolean(entry))
                .slice(-MAX_PERSISTED_JOBS);

            if (restored.length > 0) {
                setBackgroundJobs((prev) => (prev.length > 0 ? prev : restored));
            }
        } catch (error) {
            console.error('Failed to restore background jobs', error);
        } finally {
            setJobsHydrated(true);
        }
    }, [BACKGROUND_JOBS_STORAGE_KEY, MAX_JOB_AGE_MS, MAX_PERSISTED_JOBS]);

    useEffect(() => {
        if (typeof window === 'undefined' || !jobsHydrated) return;
        try {
            const compact = backgroundJobs
                .slice(-MAX_PERSISTED_JOBS)
                .map((job) => ({
                    id: job.id,
                    type: job.type,
                    status: job.status,
                    progress: job.progress,
                    resultUrl: job.resultUrl,
                    thumbnailUrl: job.thumbnailUrl,
                    error: job.error,
                    createdAt: job.createdAt,
                    apiKey: job.apiKey,
                    provider: job.provider,
                    stage: job.stage,
                    prompt: job.prompt,
                }));
            localStorage.setItem(BACKGROUND_JOBS_STORAGE_KEY, JSON.stringify(compact));
        } catch (error) {
            console.error('Failed to persist background jobs', error);
        }
    }, [backgroundJobs, jobsHydrated, BACKGROUND_JOBS_STORAGE_KEY, MAX_PERSISTED_JOBS]);
    
    // Connection status check commented out
    /*
    const is3DMode = activeTool === '3d-gen';
    const has2DKey = !!(apiKeys.stability || apiKeys.openai || apiKeys.google || apiKeys.banana);
    const has3DKey = !!(apiKeys.meshy || apiKeys.tripo || apiKeys.hitems);
    // const isConnected = is3DMode ? has3DKey : has2DKey;
    */

    useEffect(() => {
        backgroundJobsRef.current = backgroundJobs;
    }, [backgroundJobs]);

    useEffect(() => {
        const activeJobs = backgroundJobs.filter(j => j.status === 'PENDING' || j.status === 'IN_PROGRESS');
        if (activeJobs.length === 0) return;
    
        const checkJobStatus = async (job: BackgroundJob) => {
            if (!job.id) return;
            if (!job.apiKey) {
                const updatedJob: BackgroundJob = {
                    ...job,
                    status: 'FAILED',
                    error: 'Missing API key for job polling. Re-enter key in Settings and recover this job ID.',
                };
                setBackgroundJobs(prev => prev.map(p => p.id === job.id ? updatedJob : p));
                return { status: 'FAILED', progress: job.progress || 0, progressed: false };
            }
            try {
                type TripoOutput = {
                    model?: string;
                    pbr_model?: string;
                    base_model?: string;
                    rendered_image?: string;
                    render_image?: string;
                };

                type TripoData = {
                    status: string;
                    progress: number;
                    output?: TripoOutput;
                };

                type ApiResponse = {
                    status?: string; progress?: number;
                    model_urls?: { glb: string }; thumbnail_url?: string;
                    data?: TripoData;
                    code?: number; 
                };
                let data: ApiResponse | null = null;
                let status: BackgroundJob['status'] = job.status;
                let progress = job.progress || 0;
                const previousProgress = job.progress || 0;
                let resultUrl = job.resultUrl;
                let thumbnailUrl = job.thumbnailUrl;
                let errorDetail = job.error;
    
                if (job.provider === 'stability') {
                    const res = await fetch(`/api/ai/stability/upscale/poll?id=${job.id}`, { headers: { 'Authorization': `Bearer ${job.apiKey}` } });
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data.status === 'SUCCEEDED') {
                         status = 'SUCCEEDED';
                         resultUrl = `data:image/png;base64,${data.image}`; 
                    } else if (data.status === 'IN_PROGRESS') {
                         status = 'IN_PROGRESS';
                    } else {
                         status = 'FAILED';
                    }
                } else if (job.provider === 'tripo') {
                     const res = await fetch(`/api/ai/tripo/${job.id}`, { headers: { 'Authorization': `Bearer ${job.apiKey}` } });
                     if (!res.ok) {
                        const text = await res.text().catch(() => '');
                        status = 'FAILED';
                        errorDetail = `Tripo poll failed (${res.status}). ${text || res.statusText || 'No details returned.'}`.trim();
                        const updatedJob: BackgroundJob = { ...job, status, error: errorDetail, progress };
                        setBackgroundJobs(prev => prev.map(p => p.id === job.id ? updatedJob : p));
                        return { status, progress, progressed: false };
                     }
                     const json = (await res.json()) as ApiResponse;
                     if (json.data) {
                         const tData = json.data;
                         if (tData.status === 'success') status = 'SUCCEEDED';
                         else if (tData.status === 'failed' || tData.status === 'cancelled') {
                            status = 'FAILED';
                            errorDetail = `Tripo task ${tData.status}.`;
                         }
                         else status = 'IN_PROGRESS';
                         progress = tData.progress;
                         resultUrl = tData.output?.model || tData.output?.pbr_model || tData.output?.base_model;
                         thumbnailUrl = tData.output?.rendered_image || tData.output?.render_image;
                     } else if (json.code !== undefined && json.code !== 0) {
                        status = 'FAILED';
                        errorDetail = `Tripo error code: ${json.code}.`;
                     }
                } else if (job.provider === 'hitems') {
                    const appId = typeof window !== 'undefined' ? localStorage.getItem('hitems_appid') : null;
                    const rawKey = (job.apiKey || '').replace(/Bearer /gi, '').replace(/["']/g, '').trim();
                    const hitemsAuthHeader = rawKey.includes(':') ? rawKey : `Bearer ${rawKey}`;
                    const headers: Record<string, string> = { 'Authorization': hitemsAuthHeader };
                    if (appId) headers.Appid = appId;
                    const res = await fetch(`/api/ai/hitems/${job.id}`, { headers });
                    if (!res.ok) {
                        const payload = await res.json().catch(() => null) as
                            | { message?: string; msg?: string; detail?: string; error?: string }
                            | null;
                        const reason =
                            payload?.message ||
                            payload?.msg ||
                            payload?.detail ||
                            payload?.error ||
                            `Hitem poll failed (${res.status}).`;
                        status = 'FAILED';
                        errorDetail = reason;
                        const updatedJob: BackgroundJob = { ...job, status, error: errorDetail, progress };
                        setBackgroundJobs(prev => prev.map(p => p.id === job.id ? updatedJob : p));
                        return { status, progress, progressed: false };
                    }
                    const json = (await res.json()) as {
                        code?: number | string;
                        message?: string;
                        msg?: string;
                        data?: {
                            task_status?: number;
                            state?: string;
                            task_msg?: string;
                            message?: string;
                            process_pct?: number;
                            progress?: number | string;
                            process?: number | string;
                            percentage?: number | string;
                            percent?: number | string;
                            task_result?: {
                                model_url?: string;
                                render_url?: string;
                                url?: string;
                                cover_url?: string;
                            };
                            url?: string;
                            model_url?: string;
                            cover_url?: string;
                            render_url?: string;
                        };
                    };
                    const hitemMsg =
                        json.data?.task_msg ||
                        json.data?.message ||
                        json.message ||
                        json.msg;
                    const statusCode = json.data?.task_status;
                    const state = typeof json.data?.state === 'string' ? json.data.state.toLowerCase() : '';
                    const codeText = json.code !== undefined ? `${json.code}` : undefined;
                    const isOkCode = codeText === undefined || codeText === '200' || codeText === '0';
                    const parseProgressValue = (value: unknown) => {
                        if (value === null || value === undefined) return null;
                        const numeric = typeof value === 'number' ? value : Number(value);
                        if (!Number.isFinite(numeric)) return null;
                        if (numeric <= 1) return Math.max(0, Math.min(100, Math.round(numeric * 100)));
                        return Math.max(0, Math.min(100, Math.round(numeric)));
                    };
                    const progressCandidates = [
                        json.data?.process_pct,
                        json.data?.progress,
                        json.data?.process,
                        json.data?.percentage,
                        json.data?.percent,
                    ];
                    const parsedProgress = progressCandidates
                        .map(parseProgressValue)
                        .find((value): value is number => value !== null);

                    if (statusCode === 4 || state === 'success') status = 'SUCCEEDED';
                    else if (statusCode === -1 || state === 'failed') {
                        status = 'FAILED';
                        const baseError = hitemMsg || `Hitem task failed${statusCode !== undefined ? ` (status ${statusCode})` : ''}.`;
                        errorDetail = /login expired|token expired|invalid token/i.test(baseError)
                            ? `${baseError} If you are using Bearer token, refresh it. For auto-refresh use ak:sk key format.`
                            : baseError;
                    }
                    else if (typeof hitemMsg === 'string' && /login expired|token expired|invalid token|expired/i.test(hitemMsg)) {
                        status = 'FAILED';
                        errorDetail = `${hitemMsg} If you are using Bearer token, refresh it. For auto-refresh use ak:sk key format.`;
                    }
                    else if (statusCode !== undefined || ['created', 'queueing', 'processing', 'pending', 'running'].includes(state) || isOkCode) {
                        status = 'IN_PROGRESS';
                    }
                    else if (!isOkCode) {
                        status = 'FAILED';
                        errorDetail = hitemMsg || `Hitem response code ${codeText}.`;
                    }
                    else status = 'IN_PROGRESS';
                    if (parsedProgress !== undefined) {
                        progress = parsedProgress;
                    } else if (status === 'IN_PROGRESS') {
                        if (state === 'created') progress = Math.max(progress, 5);
                        else if (state === 'queueing') progress = Math.max(progress, 15);
                        else if (state === 'processing' || state === 'running') progress = Math.max(progress, 30);
                    }
                    if (status === 'SUCCEEDED') progress = 100;
                    const resolvedModelUrl =
                        json.data?.task_result?.model_url ||
                        json.data?.task_result?.url ||
                        json.data?.model_url ||
                        json.data?.url;
                    resultUrl = resolvedModelUrl || resultUrl;
                    thumbnailUrl =
                        json.data?.task_result?.render_url ||
                        json.data?.task_result?.cover_url ||
                        json.data?.render_url ||
                        json.data?.cover_url ||
                        thumbnailUrl;
                    if (status !== 'FAILED' && resolvedModelUrl) {
                        status = 'SUCCEEDED';
                        progress = 100;
                    }
                } else {
                    const endpoint = job.type === 'image-to-3d' ? 'image-to-3d' : 'text-to-3d';
                    const res = await fetch(`/api/ai/meshy?endpoint=${endpoint}/${job.id}`, { headers: { 'Authorization': `Bearer ${job.apiKey}` } });
                    if (!res.ok) {
                        const text = await res.text().catch(() => '');
                        status = 'FAILED';
                        errorDetail = `Meshy poll failed (${res.status}). ${text || res.statusText || 'No details returned.'}`.trim();
                        const updatedJob: BackgroundJob = { ...job, status, error: errorDetail, progress };
                        setBackgroundJobs(prev => prev.map(p => p.id === job.id ? updatedJob : p));
                        return { status, progress, progressed: false };
                    }
                    data = (await res.json()) as ApiResponse;
                    if (data.status === 'SUCCEEDED') status = 'SUCCEEDED';
                    else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
                        status = 'FAILED';
                        errorDetail = `Meshy task ${data.status.toLowerCase()}.`;
                    }
                    else status = 'IN_PROGRESS'; 
                    if (data.progress !== undefined) progress = data.progress;
                    resultUrl = data.model_urls?.glb;
                    thumbnailUrl = data.thumbnail_url;

                    // Handle Meshy V2 Multi-step Refinement (Preview -> Refine)
                    if (status === 'SUCCEEDED' && job.type === 'text-to-3d' && job.provider === 'meshy' && (!job.stage || job.stage === 'preview')) {
                        console.log("Preview finished. Starting refinement for textures...");
                        try {
                             const refineBody = {
                                mode: 'refine',
                                preview_task_id: job.id,
                                enable_pbr: true,
                                ai_model: 'meshy-4' 
                             };
                             const refineRes = await fetch(`/api/ai/meshy?endpoint=text-to-3d`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${job.apiKey}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify(refineBody)
                             });
                             const refineJson = await refineRes.json();
                             const refineId = refineJson.result; 

                             if (refineId) {
                                 // Transition job to Refining state
                                 const updatedJob: BackgroundJob = {
                                     ...job,
                                     id: refineId,
                                     stage: 'refining',
                                     status: 'IN_PROGRESS',
                                     progress: 0
                                 };
                                 setBackgroundJobs(prev => prev.map(p => p.id === job.id ? updatedJob : p));
                                 return; // Exit to avoid marking as SUCCEEDED
                             } else {
                                 console.error("Refine failed to start:", refineJson);
                                 // Fallback: Just let it succeed as untextured? Or Fail? 
                                 // Let's log and let it finish as untextured (better than nothing)
                             }
                        } catch (e) {
                            console.error("Refine launch error", e);
                        }
                    }
                }
    
                if (status === 'SUCCEEDED' || status === 'FAILED') {
                     const updatedJob: BackgroundJob = {
                        ...job,
                        status: status,
                        resultUrl: resultUrl,
                        thumbnailUrl: thumbnailUrl,
                        progress: status === 'SUCCEEDED' ? 100 : progress,
                        error: status === 'FAILED' ? (errorDetail || 'Failed to process.') : undefined,
                     };
                     setBackgroundJobs(prev => prev.map(p => p.id === job.id ? updatedJob : p));
                     if (status === 'SUCCEEDED' && resultUrl) {
                          let filename = (job.prompt || 'generated').slice(0, 15).replace(/[^a-z0-9]/gi, '_');
                          const urlMatch = resultUrl.match(/\.([a-z0-9]+)(?:$|[?#])/i);
                          const extension = (urlMatch?.[1] || 'glb').toLowerCase();
                          if (!filename.toLowerCase().endsWith(`.${extension}`)) filename += `.${extension}`;
                          try {
                            await fetch('/api/assets/save-url', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url: resultUrl, filename: filename, type: 'models', owner: user })
                            });
                          } catch (err) { console.error("Failed to auto-save asset", err); }
    
                          const addFallbackPlaceholder = () => {
                              if (!canvas) return; 
                              const group = new fabric.Group([], { left: 150, top: 150, subTargetCheck: true, interactive: true });
                              const box = new fabric.Rect({ width: 100, height: 100, fill: '#3b82f6', rx: 10, ry: 10 });
                              const text = new fabric.IText('3D', { fontSize: 30, fill: 'white', left: 30, top: 35, fontFamily: 'sans-serif', fontWeight: 'bold' });
                              group.add(box); group.add(text);
                              const threeDGroup = group as ThreeDGroup;
                              threeDGroup.is3DModel = true; threeDGroup.modelUrl = resultUrl;
                              canvas.add(threeDGroup); canvas.setActiveObject(threeDGroup); canvas.requestRenderAll();
                          };
    
                          if (canvas) {
                              if (thumbnailUrl) {
                                fabric.FabricImage.fromURL(thumbnailUrl, { crossOrigin: 'anonymous' })
                                    .then(img => {
                                        if (!img) throw new Error("Image loaded but null");
                                        img.scaleToWidth(200); img.set({ left: 100, top: 100 });
                                        const threeDImg = img as ThreeDImage; threeDImg.is3DModel = true; threeDImg.modelUrl = resultUrl;
                                        canvas.add(threeDImg); canvas.setActiveObject(threeDImg); canvas.requestRenderAll();
                                    }).catch(() => { addFallbackPlaceholder(); });
                              } else { addFallbackPlaceholder(); }
                          }
                      }
                } else {
                     if (progress !== job.progress || status !== job.status) {
                         setBackgroundJobs(prev => prev.map(p => p.id === job.id ? { ...p, progress: progress, status: status, error: status === 'IN_PROGRESS' ? undefined : p.error } : p));
                     }
                }
                return { status, progress, progressed: progress > previousProgress };
            } catch (error) {
                const reason = error instanceof Error ? error.message : 'Unexpected polling error.';
                const updatedJob: BackgroundJob = { ...job, status: 'FAILED', error: reason, progress: job.progress };
                setBackgroundJobs(prev => prev.map(p => p.id === job.id ? updatedJob : p));
                return { status: 'FAILED', progress: job.progress || 0, progressed: false };
            }
        };

        const getJobById = (id: string) => backgroundJobsRef.current.find(j => j.id === id);

        const schedulePoll = (jobId: string) => {
            const currentJob = getJobById(jobId);
            if (!currentJob) return;
            if (currentJob.status !== 'PENDING' && currentJob.status !== 'IN_PROGRESS') return;

            const interval = pollIntervalsRef.current.get(jobId) ?? 2000;
            const timerId = window.setTimeout(async () => {
                const latest = getJobById(jobId);
                if (!latest || (latest.status !== 'PENDING' && latest.status !== 'IN_PROGRESS')) {
                    const existing = pollTimersRef.current.get(jobId);
                    if (existing) window.clearTimeout(existing);
                    pollTimersRef.current.delete(jobId);
                    pollIntervalsRef.current.delete(jobId);
                    return;
                }

                const result = await checkJobStatus(latest);
                if (result?.progressed) {
                    pollIntervalsRef.current.set(jobId, 2000);
                } else {
                    pollIntervalsRef.current.set(jobId, Math.min(interval * 1.5, 10000));
                }

                const after = getJobById(jobId);
                if (after && (after.status === 'PENDING' || after.status === 'IN_PROGRESS')) {
                    schedulePoll(jobId);
                } else {
                    const existing = pollTimersRef.current.get(jobId);
                    if (existing) window.clearTimeout(existing);
                    pollTimersRef.current.delete(jobId);
                    pollIntervalsRef.current.delete(jobId);
                }
            }, interval);

            pollTimersRef.current.set(jobId, timerId);
        };

        activeJobs.forEach(job => {
            if (!pollTimersRef.current.has(job.id)) {
                pollIntervalsRef.current.set(job.id, pollIntervalsRef.current.get(job.id) ?? 2000);
                schedulePoll(job.id);
            }
        });

        for (const [id, timer] of pollTimersRef.current) {
            const job = getJobById(id);
            if (!job || (job.status !== 'PENDING' && job.status !== 'IN_PROGRESS')) {
                window.clearTimeout(timer);
                pollTimersRef.current.delete(id);
                pollIntervalsRef.current.delete(id);
            }
        }
    }, [backgroundJobs, canvas, user]);

    useEffect(() => {
        const pollTimers = pollTimersRef.current;
        const pollIntervals = pollIntervalsRef.current;

        return () => {
            for (const timer of pollTimers.values()) {
                window.clearTimeout(timer);
            }
            pollTimers.clear();
            pollIntervals.clear();
        };
    }, []);

    const withActiveTextObject = useCallback((mutate: (active: fabric.Object & ExtendedFabricObject & {
        set: (props: unknown) => void;
        hiddenTextarea?: HTMLTextAreaElement;
    }) => void) => {
        if (!canvas) return;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject & {
            type?: string;
            set: (props: unknown) => void;
            hiddenTextarea?: HTMLTextAreaElement;
        }) | null;
        if (!active) return;
        const isTextObject = active.type === 'i-text' || active.type === 'text' || active.type === 'textbox';
        if (!isTextObject) return;
        mutate(active);
        canvas.requestRenderAll();
        (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('object:modified', { target: active });
    }, [canvas]);

    const handleTextFontFamilyChange = useCallback((fontFamily: string) => {
        setTextTopFontFamily(fontFamily);
        withActiveTextObject((active) => {
            active.set({ fontFamily });
        });
    }, [withActiveTextObject]);

    const handleTextFontStyleChange = useCallback((fontStyle: string) => {
        setTextTopFontStyle(fontStyle);
        const normalizedWeight = String(fontStyle).toLowerCase();
        const numericWeight = Number(normalizedWeight);
        setTextTopBold(normalizedWeight === 'bold' || (!Number.isNaN(numericWeight) && numericWeight >= 600));
        withActiveTextObject((active) => {
            active.set({ fontWeight: fontStyle });
        });
    }, [withActiveTextObject]);

    const handleTextFontSizeChange = useCallback((fontSize: number) => {
        const normalizedSize = Math.max(8, Math.min(240, Math.round(fontSize)));
        setTextTopFontSize(normalizedSize);
        withActiveTextObject((active) => {
            active.set({ fontSize: normalizedSize });
        });
    }, [withActiveTextObject]);

    const handleTextColorChange = useCallback((color: string) => {
        const normalizedColor = normalizeColorValue(color);
        if (!normalizedColor || !normalizedColor.startsWith('#')) return;
        setTextTopColor(normalizedColor);
        withActiveTextObject((active) => {
            active.set({ fill: normalizedColor });
        });
    }, [withActiveTextObject]);

    const handleTextBoldChange = useCallback((enabled: boolean) => {
        setTextTopBold(enabled);
        const nextWeight = enabled ? 'bold' : 'normal';
        setTextTopFontStyle(nextWeight);
        withActiveTextObject((active) => {
            active.set({ fontWeight: nextWeight });
        });
    }, [withActiveTextObject]);

    const handleTextItalicChange = useCallback((enabled: boolean) => {
        setTextTopItalic(enabled);
        withActiveTextObject((active) => {
            active.set({ fontStyle: enabled ? 'italic' : 'normal' });
        });
    }, [withActiveTextObject]);

    const handleTextUnderlineChange = useCallback((enabled: boolean) => {
        setTextTopUnderline(enabled);
        withActiveTextObject((active) => {
            active.set({ underline: enabled });
        });
    }, [withActiveTextObject]);

    const handleTextAlignChange = useCallback((align: 'left' | 'center' | 'right' | 'justify') => {
        setTextTopAlign(align);
        withActiveTextObject((active) => {
            active.set({ textAlign: align });
        });
    }, [withActiveTextObject]);

    const handleTextSpellcheckChange = useCallback((enabled: boolean) => {
        setTextTopSpellcheck(enabled);
        withActiveTextObject((active) => {
            active.textSpellcheck = enabled;
            active.set({ textSpellcheck: enabled });
            if (active.hiddenTextarea) {
                active.hiddenTextarea.spellcheck = enabled;
            }
        });
    }, [withActiveTextObject]);

    const activeLayerOrderState = getActiveLayerOrderState();
    const menuLayerTarget = getMenuLayerTarget();

    return (
        <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
            {/* Editor Header */}
            <header className="h-16 border-b bg-card/50 backdrop-blur-xl flex items-center px-4 justify-between z-[220] relative shadow-sm overflow-visible">
                 <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <BrandIcon />
                        {isRenamingDesignTitle ? (
                            <input
                                autoFocus
                                value={designTitleDraft}
                                onChange={(event) => setDesignTitleDraft(event.target.value)}
                                onBlur={() => { void commitDesignTitle(); }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void commitDesignTitle();
                                    } else if (event.key === 'Escape') {
                                        event.preventDefault();
                                        cancelDesignTitleEdit();
                                    }
                                }}
                                className="hidden md:block h-8 min-w-[180px] max-w-[360px] rounded-md border border-primary/40 bg-background/90 px-3 text-sm font-semibold outline-none focus:ring-1 focus:ring-primary"
                                placeholder="Untitled Design"
                            />
                        ) : (
                            <button
                                onClick={() => setIsRenamingDesignTitle(true)}
                                className="hidden md:block font-bold text-lg ui-brand-gradient-text max-w-[360px] truncate text-left hover:opacity-90 transition-opacity"
                                title='Click to rename document'
                            >
                                {propDesignName || 'Untitled Design'}
                            </button>
                        )}
                    </div>
                    <nav className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border">
                       <button 
                          onClick={handleBack}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                          title="Back to Hub"
                       >
                         <HomeIcon size={16} />
                         <span>Hub</span>
                       </button>
                       <button
                          onClick={() => {
                              const next = !showTopNavMenus;
                              setShowTopNavMenus(next);
                              if (!next) {
                                  closeEditorMenus();
                              }
                          }}
                          className="h-8 w-8 rounded-full border border-border/60 bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground transition-colors inline-flex items-center justify-center"
                          title={showTopNavMenus ? 'Collapse menus' : 'Expand menus'}
                          aria-label="Toggle top menu bar"
                       >
                          <ChevronRight
                              size={14}
                              className={`transition-transform duration-200 ${showTopNavMenus ? 'rotate-180' : ''}`}
                          />
                       </button>
                    </nav>
                    {showTopNavMenus && (
                    <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border">
                        <div className="relative order-1">
                            <button
                                onClick={() => toggleEditorMenu('file')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showFileMenu}
                            >
                                <span>File</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showFileMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showFileMenu && (
                                <div data-testid="menu-file" className="absolute left-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    <button
                                        onClick={() => {
                                            setShowFileMenu(false);
                                            void handleSave();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => {
                                            openEditorMenu('export');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Export As...
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative order-3">
                            <button
                                onClick={() => toggleEditorMenu('image')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showImageMenu}
                            >
                                <span>Image</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showImageMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showImageMenu && (
                                <div data-testid="menu-image" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    <button
                                        onClick={() => {
                                            setShowImageMenu(false);
                                            triggerToolbarTool('crop');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Crop Tool
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowImageMenu(false);
                                            openPanelModeFromMenu('adjustments');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Adjustments Panel
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowImageMenu(false);
                                            openPanelModeFromMenu('color');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Color Panel
                                    </button>
                                    <div className="my-1 border-t border-border/50" />
                                    <button
                                        onClick={() => {
                                            setShowImageMenu(false);
                                            handleFitToScreen();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Fit to Screen
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowImageMenu(false);
                                            handleResetZoomFromMenu();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Reset Zoom (100%)
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative order-4">
                            <button
                                onClick={() => toggleEditorMenu('layer')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showLayerMenu}
                            >
                                <span>Layer</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showLayerMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showLayerMenu && (
                                <div data-testid="menu-layer" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    <button
                                        onClick={() => {
                                            setShowLayerMenu(false);
                                            void handleDuplicate();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Duplicate Layer
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowLayerMenu(false);
                                            handleLayerDeleteFromMenu();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Delete Layer
                                    </button>
                                    <div className="my-1 border-t border-border/50" />
                                    <button
                                        onClick={() => {
                                            setShowLayerMenu(false);
                                            handleLayerToggleLockFromMenu();
                                        }}
                                        disabled={!menuLayerTarget}
                                        className={`w-full text-left px-4 py-2.5 text-sm ${menuLayerTarget ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                    >
                                        {menuLayerTarget?.locked ? 'Unlock Layer' : 'Lock Layer'}
                                    </button>
                                    <div className="my-1 border-t border-border/50" />
                                    <button
                                        onClick={() => {
                                            setShowLayerMenu(false);
                                            handleContextLayerOrderAction('move-up');
                                        }}
                                        disabled={!activeLayerOrderState.canMoveUp}
                                        className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canMoveUp ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                    >
                                        Bring Forward
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowLayerMenu(false);
                                            handleContextLayerOrderAction('move-down');
                                        }}
                                        disabled={!activeLayerOrderState.canMoveDown}
                                        className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canMoveDown ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                    >
                                        Send Backward
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowLayerMenu(false);
                                            handleContextLayerOrderAction('to-front');
                                        }}
                                        disabled={!activeLayerOrderState.canBringToFront}
                                        className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canBringToFront ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                    >
                                        Bring to Front
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowLayerMenu(false);
                                            handleContextLayerOrderAction('to-back');
                                        }}
                                        disabled={!activeLayerOrderState.canSendToBack}
                                        className={`w-full text-left px-4 py-2.5 text-sm ${activeLayerOrderState.canSendToBack ? 'hover:bg-secondary/50' : 'text-muted-foreground/40 cursor-not-allowed'}`}
                                    >
                                        Send to Back
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative order-5">
                            <button
                                onClick={() => toggleEditorMenu('select')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showSelectMenu}
                            >
                                <span>Select</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showSelectMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showSelectMenu && (
                                <div data-testid="menu-select" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            handleSelectAllFromMenu();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            handleDeselectFromMenu();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Deselect
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            handleSelectionModify('expand');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Expand Selection
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            handleSelectionModify('contract');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Contract Selection
                                    </button>
                                    <div className="my-1 border-t border-border/50" />
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            triggerToolbarTool('select');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Move Tool
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            triggerToolbarTool('marquee');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Marquee Tool
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            triggerToolbarTool('lasso');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Lasso Tool
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            triggerToolbarTool('wand');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Magic Wand Tool
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            triggerToolbarTool('quick-select');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Quick Selection Tool
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSelectMenu(false);
                                            triggerToolbarTool('selection-brush');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Selection Brush Tool
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative order-6">
                            <button
                                onClick={() => toggleEditorMenu('filter')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showFilterMenu}
                            >
                                <span>Filter</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showFilterMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showFilterMenu && (
                                <div data-testid="menu-filter" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    <button
                                        onClick={() => {
                                            setShowFilterMenu(false);
                                            triggerToolbarTool('blur');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Blur Tool
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowFilterMenu(false);
                                            triggerToolbarTool('sharpen');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Sharpen Tool
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowFilterMenu(false);
                                            triggerToolbarTool('dodge');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Dodge Tool
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowFilterMenu(false);
                                            triggerToolbarTool('healing');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Healing Brush
                                    </button>
                                    <div className="my-1 border-t border-border/50" />
                                    <button
                                        onClick={() => {
                                            setShowFilterMenu(false);
                                            openPanelModeFromMenu('adjustments');
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Open Adjustments Panel
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative order-2">
                            <button
                                onClick={() => toggleEditorMenu('edit')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showEditMenu}
                            >
                                <span>Edit</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showEditMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showEditMenu && (
                                <div data-testid="menu-edit" className="absolute left-0 top-full mt-2 w-52 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    <button
                                        onClick={() => {
                                            setShowEditMenu(false);
                                            handleUndo();
                                        }}
                                        disabled={historyState.undo < 2}
                                        className={`w-full text-left px-4 py-2.5 text-sm ${historyState.undo < 2 ? 'text-muted-foreground/40 cursor-not-allowed' : 'hover:bg-secondary/50'}`}
                                    >
                                        Undo
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowEditMenu(false);
                                            handleRedo();
                                        }}
                                        disabled={historyState.redo < 1}
                                        className={`w-full text-left px-4 py-2.5 text-sm ${historyState.redo < 1 ? 'text-muted-foreground/40 cursor-not-allowed' : 'hover:bg-secondary/50'}`}
                                    >
                                        Redo
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowEditMenu(false);
                                            void handleDuplicate();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Duplicate
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative order-7">
                            <button
                                onClick={() => toggleEditorMenu('view')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showViewMenu}
                            >
                                <span>View</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showViewMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showViewMenu && (
                                <div data-testid="menu-view" className="absolute left-0 top-full mt-2 w-52 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    <button
                                        onClick={() => {
                                            setShowViewMenu(false);
                                            handleFitToScreen();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Fit to Screen
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowViewMenu(false);
                                            handleZoom(0.1);
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Zoom In
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowViewMenu(false);
                                            handleZoom(-0.1);
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Zoom Out
                                    </button>
                                    <div className="my-1 border-t border-border/50" />
                                    <button
                                        onClick={() => {
                                            setShowViewMenu(false);
                                            setGridType((prev) => (prev === 'none' ? 'rule-of-thirds' : 'none'));
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        {gridType === 'none' ? 'Show Grid' : 'Hide Grid'}
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative order-8">
                            <button
                                onClick={() => toggleEditorMenu('window')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showWindowMenu}
                            >
                                <span>Window</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showWindowMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showWindowMenu && (
                                <div data-testid="menu-window" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    {WINDOW_PANEL_ITEMS.map((item) => {
                                        const checked = isPropertiesPanelVisible && propertiesPanelMode === item.mode;
                                        return (
                                            <button
                                                key={item.mode}
                                                role="menuitemcheckbox"
                                                aria-checked={checked}
                                                onClick={() => {
                                                    handleWindowPanelToggle(item.mode);
                                                    setShowWindowMenu(false);
                                                }}
                                                className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${checked ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                                            >
                                                <span>{item.label}</span>
                                                <span className={`text-xs ${checked ? 'text-primary' : 'text-transparent'}`}>✓</span>
                                            </button>
                                        );
                                    })}
                                    <div className="my-1 border-t border-border/50" />
                                    <button
                                        role="menuitemcheckbox"
                                        aria-checked={isPropertiesPanelVisible}
                                        onClick={() => {
                                            if (isPropertiesPanelVisible) {
                                                setPanelState((prev) => {
                                                    if (prev.mode === 'docked-left') return { ...prev, mode: 'collapsed-left' };
                                                    if (prev.mode === 'docked-right') return { ...prev, mode: 'collapsed-right' };
                                                    if (prev.mode === 'floating') return { ...prev, mode: 'collapsed-right', position: { x: 0, y: 0 } };
                                                    return prev;
                                                });
                                            } else {
                                                setPanelState((prev) => {
                                                    if (prev.mode === 'collapsed-left') return { ...prev, mode: 'docked-left' };
                                                    if (prev.mode === 'collapsed-right') return { ...prev, mode: 'docked-right' };
                                                    return { ...prev, mode: 'docked-right' };
                                                });
                                            }
                                            setShowWindowMenu(false);
                                        }}
                                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${isPropertiesPanelVisible ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                                    >
                                        <span>Show Properties Panel</span>
                                        <span className={`text-xs ${isPropertiesPanelVisible ? 'text-primary' : 'text-transparent'}`}>✓</span>
                                    </button>
                                    <div className="my-1 border-t border-border/50" />
                                    <button
                                        role="menuitemcheckbox"
                                        aria-checked={panelState.mode === 'docked-left'}
                                        onClick={() => {
                                            handleWindowDockMode('docked-left');
                                            setShowWindowMenu(false);
                                        }}
                                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${(panelState.mode === 'docked-left') ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                                    >
                                        <span>Dock Left</span>
                                        <span className={`text-xs ${(panelState.mode === 'docked-left') ? 'text-primary' : 'text-transparent'}`}>✓</span>
                                    </button>
                                    <button
                                        role="menuitemcheckbox"
                                        aria-checked={panelState.mode === 'docked-right'}
                                        onClick={() => {
                                            handleWindowDockMode('docked-right');
                                            setShowWindowMenu(false);
                                        }}
                                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${(panelState.mode === 'docked-right') ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                                    >
                                        <span>Dock Right</span>
                                        <span className={`text-xs ${(panelState.mode === 'docked-right') ? 'text-primary' : 'text-transparent'}`}>✓</span>
                                    </button>
                                    <button
                                        role="menuitemcheckbox"
                                        aria-checked={panelState.mode === 'floating'}
                                        onClick={() => {
                                            handleWindowDockMode('floating');
                                            setShowWindowMenu(false);
                                        }}
                                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${(panelState.mode === 'floating') ? 'bg-secondary/30' : 'hover:bg-secondary/50'}`}
                                    >
                                        <span>Float Panel</span>
                                        <span className={`text-xs ${(panelState.mode === 'floating') ? 'text-primary' : 'text-transparent'}`}>✓</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative order-9">
                            <button
                                onClick={() => toggleEditorMenu('settings')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showSettingsMenu}
                            >
                                <span>Settings</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showSettingsMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showSettingsMenu && (
                                <div data-testid="menu-settings" className="absolute left-0 top-full mt-2 w-52 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    <button
                                        onClick={() => {
                                            setShowSettingsMenu(false);
                                            onOpenSettings();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Preferences...
                                    </button>
                                    {isAdminUser && (
                                        <button
                                            onClick={() => {
                                                setShowSettingsMenu(false);
                                                onOpenAdminArea?.();
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                        >
                                            Admin Area
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="relative order-10">
                            <button
                                onClick={() => toggleEditorMenu('help')}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                aria-expanded={showHelpMenu}
                            >
                                <span>Help</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showHelpMenu ? 'rotate-180' : ''}`} />
                            </button>
                            {showHelpMenu && (
                                <div data-testid="menu-help" className="absolute left-0 top-full mt-2 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                    <button
                                        onClick={() => {
                                            setShowHelpMenu(false);
                                            onOpenDocumentation?.();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Documentation
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowHelpMenu(false);
                                            handleShowShortcutsFromMenu();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        Keyboard Shortcuts
                                    </button>
                                    <div className="my-1 border-t border-border/50" />
                                    <button
                                        onClick={() => {
                                            setShowHelpMenu(false);
                                            void handleShowAboutFromMenu();
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50"
                                    >
                                        About Image Express
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    )}
                 </div>

                 {/* Actions */}
                      <div className="flex items-center gap-3">
                            {/* Active Palette Bar */}
                            {activePalette && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 rounded-full border border-border/50 animate-in fade-in zoom-in-95 duration-200">
                                    <span className="text-xs font-medium text-muted-foreground mr-1">{activePalette.name}</span>
                                    {activePalette.colors.map((c, i) => (
                                        <button 
                                            key={i} 
                                            className="w-4 h-4 rounded-full border border-border/20 hover:scale-125 transition-transform shadow-sm"
                                            style={{ backgroundColor: c }}
                                            onClick={() => {
                                                const activeObj = canvas?.getActiveObject();
                                                if (activeObj) {
                                                    // Apply to text or shape fill
                                                    if (activeObj instanceof fabric.Group && activeObj.type === 'path_group') {
                                                        // SVG - often complex
                                                        activeObj.set({ fill: c }); // Simple attempt
                                                    } else {
                                                         activeObj.set({ fill: c });
                                                    }
                                                    canvas?.requestRenderAll();
                                                    // If gradient tool active, maybe trigger gradient stop update? 
                                                    // Too complex for centralized logic without more context, defaulting to object fill.
                                                }
                                            }}
                                            title={`Use ${c}`}
                                        />
                                    ))}
                                    <button onClick={() => setActivePalette(null)} className="ml-1 p-0.5 text-muted-foreground hover:text-foreground"><X size={12}/></button>
                                </div>
                            )}

                     {activePalette && <div className="h-6 w-px bg-border mx-1"></div>}
                     
                     {/* Grid Menu */}
                     <div className="relative">
                        <button 
                            onClick={() => toggleEditorMenu('grid')}
                            className={`p-2 hover:bg-secondary rounded-full transition-colors ${gridType !== 'none' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            title="Grid & Guides"
                        >
                            <Grid3x3 size={20} />
                        </button>
                        {showGridMenu && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                <button onClick={() => { setGridType('none'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'none' ? 'bg-secondary/30' : ''}`}>
                                    <X size={16} className="text-muted-foreground"/> <span className="font-medium">None</span>
                                </button>
                                <button onClick={() => { setGridType('rule-of-thirds'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'rule-of-thirds' ? 'bg-secondary/30' : ''}`}>
                                    <Grid3x3 size={16} className="text-blue-500"/> <span className="font-medium">Rule of Thirds</span>
                                </button>
                                <button onClick={() => { setGridType('golden-ratio'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'golden-ratio' ? 'bg-secondary/30' : ''}`}>
                                    <LayoutGrid size={16} className="text-orange-500"/> <span className="font-medium">Golden Ratio</span>
                                </button>
                                <button onClick={() => { setGridType('cross'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'cross' ? 'bg-secondary/30' : ''}`}>
                                    <CrosshairIcon size={16} className="text-red-500"/> <span className="font-medium">Center Cross</span>
                                </button>
                                 <button onClick={() => { setGridType('grid-4x4'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'grid-4x4' ? 'bg-secondary/30' : ''}`}>
                                    <LayoutGrid size={16} className="text-green-500"/> <span className="font-medium">4x4 Grid</span>
                                </button>
                                <button onClick={() => { setGridType('canvas-border'); setShowGridMenu(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 ${gridType === 'canvas-border' ? 'bg-secondary/30' : ''}`}>
                                    <Square size={16} className="text-yellow-500"/> <span className="font-medium">Canvas Border</span>
                                </button>
                            </div>
                        )}
                     </div>

                     <div className="relative" ref={shareRef}>
                        <button 
                          onClick={() => toggleEditorMenu('share')}
                          className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                          title="Share"
                        >
                            <Share2 size={20} />
                        </button>
                         {showShareMenu && (
                              <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                  <button onClick={() => handleShare('facebook')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Facebook size={16} className="text-blue-600"/> <span className="font-medium">Facebook</span></button>
                                  <button onClick={() => handleShare('instagram')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Instagram size={16} className="text-primary"/> <span className="font-medium">Instagram</span></button>
                            </div>
                        )}
                     </div>
                     
                     <div className="relative z-[130]" ref={exportRef}>
                        <button 
                          onClick={() => toggleEditorMenu('export')}
                          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-lg shadow-primary/20 transition-all transform hover:scale-105 active:scale-95"
                        >
                            <Download size={16} />
                            <span>Export</span>
                            <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                        </button>
                        {showExportMenu && (
                            <div className="absolute right-0 top-full mt-2 w-[320px] bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-[170]">
                                  <div className="px-3 py-2 border-b border-border/50 space-y-2">
                                      <div className="flex items-center justify-between">
                                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Media Overlay</span>
                                          <Switch
                                              checked={mediaOverlayEnabled}
                                              onCheckedChange={setMediaOverlayEnabled}
                                              aria-label="Enable media export overlay"
                                          />
                                      </div>
                                      <select
                                          value={mediaOverlayPreset}
                                          onChange={(event) => setMediaOverlayPreset(event.target.value as MediaOverlayPreset)}
                                          className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground"
                                          disabled={!mediaOverlayEnabled}
                                      >
                                          {MEDIA_OVERLAY_PRESETS.map((preset) => (
                                              <option key={preset.id} value={preset.id}>{preset.label}</option>
                                          ))}
                                      </select>
                                      <div className="text-[10px] text-muted-foreground">
                                          Overlay is edited on canvas and applied to PNG/JPG/SVG/PDF exports.
                                      </div>
                                  </div>
                                  <button onClick={() => handleExport('png')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><ImageIcon size={16} className="text-blue-500"/> <span className="font-medium">PNG</span></button>
                                  <button onClick={() => handleExport('jpg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><ImageIcon size={16} className="text-orange-500"/> <span className="font-medium">JPG</span></button>
                                  <button onClick={() => handleExport('svg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileCode size={16} className="text-primary"/> <span className="font-medium">SVG</span></button>
                                  <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileText size={16} className="text-red-500"/> <span className="font-medium">PDF</span></button>
                                  <button onClick={() => handleExport('json')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileCode size={16} className="text-green-500"/> <span className="font-medium">JSON</span></button>
                                  <button onClick={() => handleExport('html')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Archive size={16} className="text-sky-400"/> <span className="font-medium">HTML Bundle</span></button>
                            </div>
                        )}
                     </div>
                     <button
                        onClick={() => setShowProfileModal(true)}
                        className="relative w-9 h-9 rounded-full ui-avatar-gradient ring-2 ring-background ml-2 overflow-hidden flex items-center justify-center"
                        title="User Profile"
                     >
                        {profileSettings?.image ? (
                            <NextImage
                                src={profileSettings.image}
                                alt="Profile"
                                fill
                                sizes="36px"
                                className="object-cover"
                                style={{ transform: `scale(${profileSettings.imageScale || 1})`, transformOrigin: 'center' }}
                                unoptimized
                            />
                        ) : (
                            <User size={16} className="text-white/90" />
                        )}
                     </button>
                 </div>
            </header>

            <TopToolOptionsBar
                activeTool={activeTool}
                toolbarActions={{
                    isDirty,
                    canUndo: historyState.undo >= 2,
                    canRedo: historyState.redo >= 1,
                }}
                onSave={() => {
                    void handleSave();
                }}
                onUndo={handleUndo}
                onRedo={handleRedo}
                selectOptions={{
                    autoSelectEnabled,
                    selectionMode,
                    showTransformControls,
                    feather: selectFeather,
                    antiAlias: selectAntiAlias,
                    modifyPixels: selectionModifyPixels,
                }}
                onAutoSelectChange={setAutoSelectEnabled}
                onSelectionModeChange={(mode) => {
                    setSelectionMode(mode);
                }}
                onTransformControlsChange={setShowTransformControls}
                onSelectFeatherChange={(feather) => {
                    const normalizedFeather = Math.max(0, Math.min(100, Math.round(feather)));
                    setSelectFeather(normalizedFeather);
                    if (!canvas) return;
                    const active = canvas.getActiveObject() as (fabric.Object & { set: (props: unknown) => void }) | null;
                    if (!active) return;
                    active.set({
                        shadow: normalizedFeather > 0
                            ? new fabric.Shadow({
                                color: 'rgba(0, 0, 0, 0.35)',
                                blur: normalizedFeather,
                                offsetX: 0,
                                offsetY: 0,
                            })
                            : null,
                    });
                    canvas.requestRenderAll();
                }}
                onSelectAntiAliasChange={setSelectAntiAlias}
                onSelectionModifyPixelsChange={(pixels) => {
                    setSelectionModifyPixels(Math.max(1, Math.min(120, Math.round(pixels))));
                }}
                onSelectionExpand={() => handleSelectionModify('expand')}
                onSelectionContract={() => handleSelectionModify('contract')}
                onSelectToolChange={(tool) => {
                    toolbarRef.current?.triggerTool(tool);
                }}
                wandOptions={{
                    threshold: wandTopThreshold,
                }}
                onWandThresholdChange={(threshold) => {
                    setWandTopThreshold(Math.max(0, Math.min(180, Math.round(threshold))));
                }}
                healingOptions={{
                    size: healingTopSize,
                    hardness: healingTopHardness,
                    sampleAllLayers: healingTopSampleAllLayers,
                }}
                onHealingSizeChange={(size) => {
                    setHealingTopSize(Math.max(1, Math.min(200, Math.round(size))));
                }}
                onHealingHardnessChange={(hardness) => {
                    setHealingTopHardness(Math.max(0, Math.min(100, Math.round(hardness))));
                }}
                onHealingSampleAllLayersChange={setHealingTopSampleAllLayers}
                historyOptions={{
                    size: historyBrushTopSize,
                    hardness: historyBrushTopHardness,
                    sampleAllLayers: historyBrushTopSampleAllLayers,
                }}
                onHistorySizeChange={(size) => {
                    setHistoryBrushTopSize(Math.max(1, Math.min(200, Math.round(size))));
                }}
                onHistoryHardnessChange={(hardness) => {
                    setHistoryBrushTopHardness(Math.max(0, Math.min(100, Math.round(hardness))));
                }}
                onHistorySampleAllLayersChange={setHistoryBrushTopSampleAllLayers}
                blurOptions={{
                    size: blurTopSize,
                    strength: blurTopStrength,
                    sampleAllLayers: blurTopSampleAllLayers,
                }}
                onBlurSizeChange={(size) => {
                    setBlurTopSize(Math.max(1, Math.min(240, Math.round(size))));
                }}
                onBlurStrengthChange={(strength) => {
                    setBlurTopStrength(Math.max(1, Math.min(100, Math.round(strength))));
                }}
                onBlurSampleAllLayersChange={setBlurTopSampleAllLayers}
                sharpenOptions={{
                    size: sharpenTopSize,
                    strength: sharpenTopStrength,
                    sampleAllLayers: sharpenTopSampleAllLayers,
                }}
                onSharpenSizeChange={(size) => {
                    setSharpenTopSize(Math.max(1, Math.min(240, Math.round(size))));
                }}
                onSharpenStrengthChange={(strength) => {
                    setSharpenTopStrength(Math.max(1, Math.min(100, Math.round(strength))));
                }}
                onSharpenSampleAllLayersChange={setSharpenTopSampleAllLayers}
                dodgeOptions={{
                    size: dodgeTopSize,
                    exposure: dodgeTopExposure,
                    protectTones: dodgeTopProtectTones,
                }}
                onDodgeSizeChange={(size) => {
                    setDodgeTopSize(Math.max(1, Math.min(240, Math.round(size))));
                }}
                onDodgeExposureChange={(exposure) => {
                    setDodgeTopExposure(Math.max(1, Math.min(100, Math.round(exposure))));
                }}
                onDodgeProtectTonesChange={setDodgeTopProtectTones}
                cloneOptions={{
                    size: cloneTopSize,
                    hardness: cloneTopHardness,
                    aligned: cloneTopAligned,
                    sampleAllLayers: cloneTopSampleAllLayers,
                    hasSource: Boolean(cloneSourcePoint),
                }}
                onCloneSizeChange={(size) => {
                    setCloneTopSize(Math.max(1, Math.min(200, Math.round(size))));
                }}
                onCloneHardnessChange={(hardness) => {
                    setCloneTopHardness(Math.max(0, Math.min(100, Math.round(hardness))));
                }}
                onCloneAlignedChange={setCloneTopAligned}
                onCloneSampleAllLayersChange={setCloneTopSampleAllLayers}
                onCloneClearSource={() => setCloneSourcePoint(null)}
                paintOptions={{
                    brushPreset: paintBrushPreset,
                    size: paintBrushSize,
                    hardness: paintBrushHardness,
                    opacity: paintBrushOpacity,
                    flow: paintBrushFlow,
                    smoothing: paintBrushSmoothing,
                    blendMode: paintBlendMode,
                }}
                onPaintPresetChange={setPaintBrushPreset}
                onPaintSizeChange={setPaintBrushSize}
                onPaintHardnessChange={setPaintBrushHardness}
                onPaintOpacityChange={setPaintBrushOpacity}
                onPaintFlowChange={setPaintBrushFlow}
                onPaintSmoothingChange={setPaintBrushSmoothing}
                onPaintBlendModeChange={setPaintBlendMode}
                gradientOptions={{
                    type: gradientTopType,
                    blendMode: gradientTopBlendMode,
                    opacity: gradientTopOpacity,
                    reverse: gradientTopReverse,
                    dither: gradientTopDither,
                }}
                onGradientTypeChange={(type) => {
                    setGradientTopType(type);
                    applyGradientTopConfigToActiveObject({ type });
                }}
                onGradientBlendModeChange={(blendMode) => {
                    setGradientTopBlendMode(blendMode);
                    applyGradientTopConfigToActiveObject({ blendMode });
                }}
                onGradientOpacityChange={(opacity) => {
                    const normalizedOpacity = Math.max(1, Math.min(100, Math.round(opacity)));
                    setGradientTopOpacity(normalizedOpacity);
                    applyGradientTopConfigToActiveObject({ opacity: normalizedOpacity });
                }}
                onGradientReverseChange={(enabled) => {
                    setGradientTopReverse(enabled);
                    applyGradientTopConfigToActiveObject({ reverse: enabled });
                }}
                onGradientDitherChange={(enabled) => {
                    setGradientTopDither(enabled);
                    applyGradientTopConfigToActiveObject({ dither: enabled });
                }}
                penOptions={{
                    mode: penTopMode,
                    pathOperation: penTopPathOperation,
                    autoAddDelete: penTopAutoAddDelete,
                    rubberBand: penTopRubberBand,
                }}
                onPenModeChange={(mode) => {
                    setPenTopMode(mode);
                    if (!canvas) return;
                    (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('pen:config:set', {
                        closure: mode === 'shape' ? 'closed' : 'open',
                    });
                }}
                onPenPathOperationChange={(operation) => {
                    setPenTopPathOperation(operation);
                    if (!canvas) return;
                    (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('pen:config:set', {
                        pathOperation: operation,
                    });
                }}
                onPenAutoAddDeleteChange={(enabled) => {
                    setPenTopAutoAddDelete(enabled);
                    if (!canvas) return;
                    (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('pen:config:set', {
                        autoAddDelete: enabled,
                    });
                }}
                onPenRubberBandChange={(enabled) => {
                    setPenTopRubberBand(enabled);
                    if (!canvas) return;
                    (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('pen:config:set', {
                        rubberBand: enabled,
                    });
                }}
                textOptions={{
                    fontFamily: textTopFontFamily,
                    fontFamilies: TOP_TEXT_FONT_FAMILIES,
                    fontStyle: textTopFontStyle,
                    fontStyles: TOP_TEXT_FONT_STYLES,
                    fontSize: textTopFontSize,
                    color: textTopColor,
                    bold: textTopBold,
                    italic: textTopItalic,
                    underline: textTopUnderline,
                    align: textTopAlign,
                    spellcheck: textTopSpellcheck,
                }}
                onTextFontFamilyChange={handleTextFontFamilyChange}
                onTextFontStyleChange={handleTextFontStyleChange}
                onTextFontSizeChange={handleTextFontSizeChange}
                onTextColorChange={handleTextColorChange}
                onTextBoldChange={handleTextBoldChange}
                onTextItalicChange={handleTextItalicChange}
                onTextUnderlineChange={handleTextUnderlineChange}
                onTextAlignChange={handleTextAlignChange}
                shapeOptions={{
                    mode: shapeTopMode,
                    fillColor: shapeTopFillColor,
                    strokeColor: shapeTopStrokeColor,
                    strokeWidth: shapeTopStrokeWidth,
                    cornerRadius: shapeTopCornerRadius,
                    canSmoothAngles: shapeTopCanSmoothAngles,
                    fixedSize: shapeTopFixedSize,
                }}
                onShapeModeChange={(mode) => {
                    setShapeTopMode(mode);
                    emitShapeTopConfig({ mode });
                    applyShapeTopConfigToActiveObject({ mode });
                }}
                onShapeFillColorChange={(color) => {
                    const normalizedColor = normalizeColorValue(color);
                    if (!normalizedColor || !normalizedColor.startsWith('#')) return;
                    setShapeTopFillColor(normalizedColor);
                    emitShapeTopConfig({ fillColor: normalizedColor });
                    applyShapeTopConfigToActiveObject({ fillColor: normalizedColor });
                }}
                onShapeStrokeColorChange={(color) => {
                    const normalizedColor = normalizeColorValue(color);
                    if (!normalizedColor || !normalizedColor.startsWith('#')) return;
                    setShapeTopStrokeColor(normalizedColor);
                    emitShapeTopConfig({ strokeColor: normalizedColor });
                    applyShapeTopConfigToActiveObject({ strokeColor: normalizedColor });
                }}
                onShapeStrokeWidthChange={(width) => {
                    const normalizedWidth = Math.max(0, Math.min(40, Math.round(width)));
                    setShapeTopStrokeWidth(normalizedWidth);
                    emitShapeTopConfig({ strokeWidth: normalizedWidth });
                    applyShapeTopConfigToActiveObject({ strokeWidth: normalizedWidth });
                }}
                onShapeCornerRadiusChange={(radius) => {
                    const normalizedRadius = Math.max(0, Math.min(100, Math.round(radius)));
                    setShapeTopCornerRadius(normalizedRadius);
                    emitShapeTopConfig({ cornerRadius: normalizedRadius });
                    applyShapeTopConfigToActiveObject({ cornerRadius: normalizedRadius });
                }}
                onShapeFixedSizeChange={(enabled) => {
                    setShapeTopFixedSize(enabled);
                    emitShapeTopConfig({ fixedSize: enabled });
                    applyShapeTopConfigToActiveObject({ fixedSize: enabled });
                }}
                cropOptions={{
                    ratioPreset: cropTopRatioPreset,
                    deleteOutside: cropTopDeleteOutside,
                    useArtboardBounds: cropTopUseArtboardBounds,
                }}
                onCropRatioPresetChange={(preset) => {
                    if (!TOP_CROP_RATIO_PRESETS.includes(preset)) return;
                    setCropTopRatioPreset(preset);
                }}
                onCropDeleteOutsideChange={setCropTopDeleteOutside}
                onCropUseArtboardBoundsChange={setCropTopUseArtboardBounds}
                onCropApply={applyTopCropSettings}
                eyedropperOptions={{
                    sampleSize: eyedropperTopSampleSize,
                    sampleSource: eyedropperTopSampleSource,
                    sampledColor: eyedropperTopSampledColor,
                }}
                onEyedropperSampleSizeChange={(size) => {
                    if (!TOP_EYEDROPPER_SAMPLE_SIZES.includes(size)) return;
                    setEyedropperTopSampleSize(size);
                }}
                onEyedropperSampleSourceChange={setEyedropperTopSampleSource}
                onEyedropperSample={handleEyedropperSample}
                zoomOptions={{
                    mode: zoomTopMode,
                    step: zoomTopStep,
                    zoomPercent: Math.round(zoom * 100),
                }}
                onZoomModeChange={setZoomTopMode}
                onZoomStepChange={(step) => {
                    if (!TOP_ZOOM_STEPS.includes(step)) return;
                    setZoomTopStep(step);
                }}
                onZoomApply={() => {
                    const direction = zoomTopMode === 'in' ? 1 : -1;
                    handleZoom((zoomTopStep / 100) * direction);
                }}
                onZoomFitToScreen={handleFitToScreen}
                onZoomReset={() => {
                    if (!canvas) return;
                    const centerPoint = new fabric.Point((canvas.width || canvas.getWidth()) / 2, (canvas.height || canvas.getHeight()) / 2);
                    canvas.zoomToPoint(centerPoint, 1);
                    canvas.requestRenderAll();
                    setZoom(1);
                }}
                handOptions={{
                    lockPan: handTopLockPan,
                }}
                onHandLockPanChange={setHandTopLockPan}
            />

            {/* Overlays */}
            <GridOverlay canvas={isExporting ? null : canvas} gridType={gridType} />
            <GradientControls canvas={canvas} activeTool={activeTool} />
            <UserProfileModal 
                isOpen={showProfileModal}  
                onClose={() => setShowProfileModal(false)}
                username={user} 
                onLogout={() => {
                    setShowProfileModal(false);
                    onLogout();
                }}
                onProfileUpdate={(profile) => setProfileSettings(profile)}
            />
            
            {showAssetBrowserForMissing && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                     <div className="bg-card w-[800px] h-[600px] rounded-xl shadow-2xl relative flex flex-col overflow-hidden border border-border">
                          <div className="flex-1 overflow-hidden">
                              <AssetLibrary 
                                  currentUser={user}
                                  onSelect={(url) => { if (replacingItemId) { setReplacementMap(prev => ({ ...prev, [replacingItemId]: url })); } setShowAssetBrowserForMissing(false); setReplacingItemId(null); }}
                                  onClose={() => setShowAssetBrowserForMissing(false)}
                              />
                          </div>
                          <button onClick={() => setShowAssetBrowserForMissing(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground bg-background/50 rounded-full p-1 z-50"> <X size={20} /> </button>
                     </div>
                </div>
            )}
            
            <MissingAssetsModal 
                  isOpen={showMissingAssetsModal}
                  missingItems={missingItems}
                  onReplace={(id) => { setReplacingItemId(id); setShowAssetBrowserForMissing(true); }}
                  onIgnore={() => { handleResolveMissing(Object.keys(replacementMap).length > 0 ? replacementMap : null); }}
                  onClose={() => { setShowMissingAssetsModal(false); setPendingTemplateJson(null); }}
            />

            {mediaPreview && (
                <div
                    className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
                    onClick={() => setMediaPreview(null)}
                >
                    <div
                        className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={mediaPreview.type === 'video' ? 'Video player' : 'Audio player'}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-secondary/40">
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-foreground/90">{mediaPreview.type === 'video' ? 'Video Player' : 'Audio Player'}</span>
                                <span className="text-xs text-muted-foreground truncate max-w-[420px]">
                                    {mediaPreview.url}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {mediaPreview.type === 'video' && (
                                    <button
                                        onClick={handleCaptureVideoFrame}
                                        className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow hover:bg-primary/90 transition-colors"
                                    >
                                        Capture Frame
                                    </button>
                                )}
                                <button
                                    onClick={() => setMediaPreview(null)}
                                    className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label="Close media player"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="p-4 bg-background">
                            {mediaPreview.type === 'video' ? (
                                <video
                                    key={mediaPreview.url}
                                    src={mediaPreview.url}
                                    controls
                                    ref={videoPreviewRef}
                                    className="w-full max-h-[70vh] rounded-lg bg-black"
                                />
                            ) : (
                                <audio
                                    key={mediaPreview.url}
                                    src={mediaPreview.url}
                                    controls
                                    className="w-full"
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showExportQualityModal && pendingExportFormat && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 flex flex-col gap-4 mx-4">
                        <div className="flex items-start gap-4">
                            <div className="p-2 rounded-full shrink-0 bg-primary/10 text-primary">
                                <Settings size={24} />
                            </div>
                            <div className="flex-1 space-y-1">
                                <h3 className="font-semibold text-lg leading-none">Export Quality</h3>
                                <p className="text-muted-foreground text-sm">Adjust quality and review estimated size.</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                                <span>Quality: {exportQualityValue}</span>
                                <span>Est. size: {exportQualitySize || '—'}</span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={100}
                                step={1}
                                value={exportQualityValue}
                                onChange={(e) => setExportQualityValue(parseInt(e.target.value))}
                                className="w-full accent-primary"
                            />
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/20 px-3 py-2">
                            <div className="space-y-0.5">
                                <div className="text-xs font-medium">Canvas background</div>
                                <div className="text-[10px] text-muted-foreground">
                                    {pendingExportFormat === 'jpg' ? 'JPG exports always include a background.' : 'Turn off to export transparent PNG.'}
                                </div>
                            </div>
                            <Switch
                                checked={pendingExportFormat === 'jpg' ? true : includeCanvasBackground}
                                onCheckedChange={setIncludeCanvasBackground}
                                disabled={pendingExportFormat === 'jpg'}
                                aria-label="Include canvas background"
                            />
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setShowExportQualityModal(false)}
                                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!canvas || !pendingExportFormat) return;
                                    const cropOptions = pendingExportCropRef.current;
                                    const options: ExportDataUrlOptions = {
                                        format: pendingExportFormat === 'jpg' ? 'jpeg' : 'png',
                                        quality: Math.max(0.1, Math.min(1, exportQualityValue / 100)),
                                        multiplier: 1,
                                        enableRetinaScaling: true
                                    };
                                    const shouldIncludeBackground = pendingExportFormat === 'jpg' ? true : includeCanvasBackground;
                                    if (shouldIncludeBackground) {
                                        options.backgroundColor = getCanvasBackgroundSettings().color;
                                    }
                                    if (cropOptions) {
                                        options.left = cropOptions.left;
                                        options.top = cropOptions.top;
                                        options.width = cropOptions.width;
                                        options.height = cropOptions.height;
                                    }

                                    await withExportOverlays(async () => {
                                        const dataUrl = await withViewportReset(() => safeCanvasToDataURL(options));
                                        downloadFile(dataUrl, pendingExportFilename);
                                    });

                                    setShowExportQualityModal(false);
                                }}
                                className="px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all text-white bg-primary hover:bg-primary/90"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Editor Layout */}
            <div className="flex flex-1 overflow-hidden relative">
                <aside className="w-[60px] bg-card border-r flex flex-col items-center py-2 z-20 shadow-xl relative overflow-visible">
                            <Toolbar 
                                ref={toolbarRef}
                        canvas={canvas} 
                        activeTool={activeTool}
                        currentUser={user}
                        activePalette={activePalette}
                        setActivePalette={setActivePalette}
                        setActiveTool={(tool) => {
                             if (tool === '3d-gen' && canvas) {
                                 const active = canvas.getActiveObject();
                                 if (active) {
                                     // Snapshot the active object to use as 3D source
                                     const dataUrl = active.toDataURL({ format: 'png', multiplier: 2 });
                                     setInitialImageFor3D(dataUrl);
                                     setSourceObjectFor3D(active);
                                 } else {
                                     setInitialImageFor3D(undefined);
                                     setSourceObjectFor3D(null);
                                 }
                             }
                             setActiveTool(tool);
                        }} 
                        onOpen3DEditor={(url) => setEditingModelUrl(url)} 
                        apiKeys={apiKeys} 
                        zoomCursorMode={zoomTopMode}
                        enableHoverLabels={expandToolRailLabelsOnHover}
                     />
                </aside>

                {/* Left Docked Panel */}
                {panelState.mode === 'docked-left' && (
                    <aside style={{ width: panelState.width }} className="bg-card border-r flex flex-col z-10 shadow-xl overflow-hidden shrink-0 relative">
                        <div className="h-8 bg-muted border-b flex items-center justify-between px-2 cursor-move select-none" onMouseDown={handlePanelDragStart}>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><GripHorizontal size={14}/> Properties</div>
                             <div className="flex gap-1">
                                <button onClick={toggleFloat} className="p-0.5 hover:bg-background rounded"><Maximize size={12}/></button>
                                <button onClick={toggleCollapse} className="p-0.5 hover:bg-background rounded"><ChevronLeft size={12}/></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                                <PropertiesPanel 
                                canvas={canvas} 
                                activeTool={activeTool} 
                                panelMode={propertiesPanelMode}
                                onPanelModeChange={setPropertiesPanelMode}
                                onLayerDblClick={(obj) => { 
                                    if(obj && canvas) {
                                        canvas.setActiveObject(obj);
                                        canvas.requestRenderAll();
                                    }
                                }}
                                onMake3D={(imageUrl) => { setInitialImageFor3D(imageUrl); if (canvas) { setSourceObjectFor3D(canvas.getActiveObject() || null); } setActiveTool('3d-gen'); }}
                                onDuplicate={handleDuplicate}
                                onAssetSelect={handleAssetSelect}
                                historyState={historyState}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                zoom={zoom}
                                brushOptions={{
                                    brushPreset: paintBrushPreset,
                                    size: paintBrushSize,
                                    hardness: paintBrushHardness,
                                    opacity: paintBrushOpacity,
                                    flow: paintBrushFlow,
                                    smoothing: paintBrushSmoothing,
                                    blendMode: paintBlendMode,
                                }}
                                onBrushPresetChange={setPaintBrushPreset}
                                onBrushSizeChange={setPaintBrushSize}
                                onBrushHardnessChange={setPaintBrushHardness}
                                onBrushOpacityChange={setPaintBrushOpacity}
                                onBrushFlowChange={setPaintBrushFlow}
                                onBrushSmoothingChange={setPaintBrushSmoothing}
                                onBrushBlendModeChange={setPaintBlendMode}
                                onActivatePaintTool={() => setActiveTool('paint')}
                                enablePanelRailHoverLabels={expandToolRailLabelsOnHover}
                            />
                        </div>
                        <div 
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/50 transition-colors z-50 translation-all delay-75"
                            onMouseDown={startPanelResize}
                        />
                    </aside>
                )}
                 {panelState.mode === 'collapsed-left' && (
                     <div onClick={toggleCollapse} className="w-4 bg-muted border-r hover:bg-primary/10 cursor-pointer flex items-center justify-center transition-colors">
                         <ChevronRight size={14} className="text-muted-foreground" />
                     </div>
                 )}

                <main 
                    className="flex-1 bg-secondary/30 relative flex items-center justify-center overflow-hidden"
                    onDrop={handleFileDrop}
                    onDragOver={(e) => { e.preventDefault(); /* Allow drop */ }}
                >
                   <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                   
                   {/* DOCK ZONES (Visible when Dragging) */}
                   {isDraggingPanel && (
                       <>
                           <div className="absolute left-0 top-0 bottom-0 w-32 bg-primary/10 border-r-2 border-primary z-50 flex items-center justify-center animate-in fade-in">
                               <span className="bg-background/80 px-2 py-1 rounded text-xs font-semibold">Drop to Dock Left</span>
                           </div>
                           <div className="absolute right-0 top-0 bottom-0 w-32 bg-primary/10 border-l-2 border-primary z-50 flex items-center justify-center animate-in fade-in">
                               <span className="bg-background/80 px-2 py-1 rounded text-xs font-semibold">Drop to Dock Right</span>
                           </div>
                       </>
                   )}

                   {/* Main Canvas Area - Full Width/Height */}
                   <div 
                        className="absolute inset-0 z-0 overflow-hidden" 
                        onContextMenu={(e) => { 
                            e.preventDefault(); 
                            setContextMenu({ x: e.clientX, y: e.clientY, isOpen: true });
                        }}
                   >
                        {editingModelUrl && (
                               <ThreeDLayerEditor 
                                   modelUrl={editingModelUrl}
                                   existingObject={editingModelObject ?? undefined}
                                 onClose={() => { setEditingModelUrl(null); setEditingModelObject(null); }}
                                 onSave={(dataUrl, currentModelUrl, settings) => {
                                     if (canvas) {
                                        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then(img => {
                                            if (editingModelObject) {
                                                img.set({ left: editingModelObject.left, top: editingModelObject.top, scaleX: editingModelObject.scaleX, scaleY: editingModelObject.scaleY, angle: editingModelObject.angle, originX: "center", originY: "center" });
                                                canvas.remove(editingModelObject);
                                            } else { img.scaleToWidth(300); img.set({ left: 300, top: 300, originX: 'center', originY: 'center' }); }
                                            const threeDImg = img as ThreeDImage; threeDImg.is3DModel = true; threeDImg.modelUrl = currentModelUrl;
                                            (threeDImg as ExtendedFabricObject).threeDSettings = settings;
                                            const modelName = getDisplayName(currentModelUrl);
                                            if (modelName) (threeDImg as ExtendedFabricObject).name = modelName;
                                            canvas.add(threeDImg); canvas.setActiveObject(threeDImg); canvas.requestRenderAll();
                                            setEditingModelUrl(null); setEditingModelObject(null);
                                        });
                                     }
                                 }}
                            />
                        )}
                        {activeTool === '3d-gen' && (
                            <ThreeDGenerator 
                                initialImage={initialImageFor3D}
                                currentUser={user}
                                onOpenSettings={onOpenSettings}
                                activeJob={backgroundJobs.find(j => j.status === 'IN_PROGRESS' || j.status === 'PENDING')}
                                onStartBackgroundJob={(jobData) => {
                                    upsertBackgroundJob(jobData);
                                    if (sourceObjectFor3D && canvas) { 
                                         // sourceObjectFor3D.set('visible', false); 
                                         // We keep layer visible so user sees it while generating
                                         canvas.requestRenderAll(); 
                                    }
                                    toast({ title: 'Generation Started', description: 'Monitor progress in the bottom status area.' });
                                    // setActiveTool('select'); // Keep panel open or close? User asked to keep layer visible.
                                    // But typically "Layer" refers to canvas object. 
                                    // If we close panel, user gets back to canvas. 
                                    // Let's close panel but ensure progress is visible.
                                    setActiveTool('select'); 
                                    setInitialImageFor3D(undefined); 
                                    setSourceObjectFor3D(null);
                                }}
                                onRecoverBackgroundJob={(jobData) => {
                                    upsertBackgroundJob(jobData);
                                    toast({
                                        title: 'Job recovery started',
                                        description: `Now tracking ${jobData.id}.`,
                                        variant: 'success'
                                    });
                                }}
                                onAddToCanvas={(dataUrl, modelUrl) => {
                                    if (canvas) {
                                        fabric.FabricImage.fromURL(dataUrl).then((img) => {
                                            // Handle resizing to fit viewport/artboard
                                            const artboard = (canvas as CanvasWithArtboard).artboard || { width: canvas.width || 800, height: canvas.height || 600 };
                                            const viewW = artboard.width;
                                            const viewH = artboard.height;
                                            
                                            if (img.width! > viewW * 0.8 || img.height! > viewH * 0.8) {
                                                const scale = Math.min((viewW * 0.8) / img.width!, (viewH * 0.8) / img.height!);
                                                img.scale(scale);
                                            }
                                            
                                            // Center object on canvas instead of hardcoded 100,100
                                            canvas.centerObject(img);
                                            
                                            if (modelUrl) {
                                                const threeDImg = img as ThreeDImage;
                                                threeDImg.is3DModel = true;
                                                threeDImg.modelUrl = modelUrl;
                                                const modelName = getDisplayName(modelUrl);
                                                if (modelName) (threeDImg as ExtendedFabricObject).name = modelName;
                                            }
                                            canvas.add(img); canvas.setActiveObject(img);
                                            if (sourceObjectFor3D) { sourceObjectFor3D.set('visible', false); canvas.requestRenderAll(); }
                                            setActiveTool('select'); setInitialImageFor3D(undefined); setSourceObjectFor3D(null);
                                        });
                                    }
                                }}
                                onClose={() => { setActiveTool('select'); setInitialImageFor3D(undefined); setSourceObjectFor3D(null); }} 
                            />
                        )}
                        <DesignCanvas 
                            onCanvasReady={setCanvas} 
                            onModified={handleCanvasModified}
                            initialWidth={initialSize?.width}
                            initialHeight={initialSize?.height}
                            onRightClick={handleRightClick}
                        />
                        <TextQuickBar
                            visible={textQuickBarPos.visible}
                            left={textQuickBarPos.left}
                            top={textQuickBarPos.top}
                            textOptions={{
                                fontFamily: textTopFontFamily,
                                fontFamilies: TOP_TEXT_FONT_FAMILIES,
                                fontStyle: textTopFontStyle,
                                fontStyles: TOP_TEXT_FONT_STYLES,
                                fontSize: textTopFontSize,
                                color: textTopColor,
                                bold: textTopBold,
                                italic: textTopItalic,
                                underline: textTopUnderline,
                                align: textTopAlign,
                                spellcheck: textTopSpellcheck,
                            }}
                            onTextFontFamilyChange={handleTextFontFamilyChange}
                            onTextFontStyleChange={handleTextFontStyleChange}
                            onTextFontSizeChange={handleTextFontSizeChange}
                            onTextColorChange={handleTextColorChange}
                            onTextBoldChange={handleTextBoldChange}
                            onTextItalicChange={handleTextItalicChange}
                            onTextUnderlineChange={handleTextUnderlineChange}
                            onTextAlignChange={handleTextAlignChange}
                            onTextSpellcheckChange={handleTextSpellcheckChange}
                        />
                        {(lockedLayerOverlayEntries.length > 0 || canvasLockControl) && (
                            <div className="absolute inset-0 z-20 pointer-events-none">
                                {lockedLayerOverlayEntries.map((entry) => {
                                    const isHovered = hoveredLockedLayerId === entry.id;
                                    const isActiveLockTarget = canvasLockControl?.id === entry.id;
                                    if (isActiveLockTarget) return null;

                                    return (
                                        <button
                                            type="button"
                                            key={`locked-layer-overlay-${entry.id}`}
                                            data-testid={`locked-layer-hover-unlock-${entry.id}`}
                                            aria-label={`Unlock layer ${entry.object.name || entry.id}`}
                                            className={`absolute pointer-events-auto flex items-center justify-center cursor-pointer transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.78)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-300/70 rounded-[2px] ${isHovered ? 'text-white' : 'text-slate-200/90 hover:text-white'}`}
                                            style={{
                                                left: `${entry.iconBounds.left}px`,
                                                top: `${entry.iconBounds.top}px`,
                                                width: `${entry.iconBounds.width}px`,
                                                height: `${entry.iconBounds.height}px`,
                                            }}
                                            onMouseEnter={() => setHoveredLockedLayerId(entry.id)}
                                            onMouseLeave={() => setHoveredLockedLayerId((current) => (current === entry.id ? null : current))}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setObjectLockedFromCanvasOverlay(entry.object, false);
                                                setHoveredLockedLayerId(null);
                                            }}
                                        >
                                            <Lock size={Math.max(8, Math.round(entry.iconBounds.width * 0.82))} />
                                        </button>
                                    );
                                })}
                                {canvasLockControl && (
                                    <button
                                        type="button"
                                        data-testid={`transform-lock-toggle-${canvasLockControl.id}`}
                                        aria-label={canvasLockControl.label}
                                        className={`absolute pointer-events-auto flex items-center justify-center cursor-pointer transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.78)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-300/70 rounded-[2px] ${canvasLockControl.locked
                                            ? 'text-slate-100/95 hover:text-white'
                                            : 'text-slate-400/95 hover:text-slate-200'}`}
                                        style={{
                                            left: `${canvasLockControl.buttonBounds.left}px`,
                                            top: `${canvasLockControl.buttonBounds.top}px`,
                                            width: `${canvasLockControl.buttonBounds.width}px`,
                                            height: `${canvasLockControl.buttonBounds.height}px`,
                                        }}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setObjectLockedFromCanvasOverlay(canvasLockControl.object, !canvasLockControl.locked);
                                            setHoveredLockedLayerId(null);
                                        }}
                                    >
                                        {canvasLockControl.locked
                                            ? <Lock size={Math.max(9, Math.round(canvasLockControl.buttonBounds.width * 0.82))} />
                                            : <Unlock size={Math.max(9, Math.round(canvasLockControl.buttonBounds.width * 0.82))} />}
                                    </button>
                                )}
                            </div>
                        )}
                        {cursorPreview && (
                            <div
                                data-testid="canvas-cursor-preview"
                                className="fixed z-30 pointer-events-none"
                                style={{
                                    left: `${cursorPreview.clientX}px`,
                                    top: `${cursorPreview.clientY}px`,
                                    transform: 'translate(-50%, -50%)',
                                }}
                            >
                                {cursorPreview.kind === 'brush' ? (
                                    <div
                                        data-testid="canvas-cursor-preview-brush"
                                        className="relative rounded-full border border-sky-300/95 shadow-[0_0_0_1px_rgba(15,23,42,0.55)]"
                                        style={{
                                            width: `${cursorPreview.diameter}px`,
                                            height: `${cursorPreview.diameter}px`,
                                        }}
                                    >
                                        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200/95 shadow-[0_0_0_1px_rgba(15,23,42,0.6)]" />
                                    </div>
                                ) : (
                                    <div data-testid="canvas-cursor-preview-eyedropper" className="relative h-6 w-6">
                                        <div className="absolute inset-0 rounded-full border border-sky-200/95 bg-slate-950/20 shadow-[0_0_0_1px_rgba(15,23,42,0.65)]" />
                                        <div className="absolute left-1/2 top-[2px] h-[calc(100%-4px)] w-px -translate-x-1/2 bg-sky-100/95" />
                                        <div className="absolute top-1/2 left-[2px] w-[calc(100%-4px)] h-px -translate-y-1/2 bg-sky-100/95" />
                                        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-100/95 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]" />
                                    </div>
                                )}
                            </div>
                        )}
                   </div>
                   
                   <div
                       data-testid="bottom-right-utilities"
                       className="absolute z-30 flex flex-col items-end gap-2 pointer-events-none"
                       style={bottomRightUtilityStyle}
                   >
                       <div className="flex items-center gap-1.5 pointer-events-auto">
                           <span className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide rounded-full border border-border/60 bg-popover/90 backdrop-blur text-muted-foreground">
                               Zoom {Math.round(zoom * 100)}%
                           </span>
                           <span className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide rounded-full border border-border/60 bg-popover/90 backdrop-blur text-muted-foreground">
                               Canvas {utilityCanvasSize.width}x{utilityCanvasSize.height}
                           </span>
                           <span className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide rounded-full border border-border/60 bg-popover/90 backdrop-blur text-muted-foreground">
                               Grid {gridStatusLabel}
                           </span>
                       </div>
                       <div className="flex items-center gap-1 bg-popover/90 backdrop-blur-md px-2 py-1.5 rounded-full shadow-2xl border border-border/50 pointer-events-auto">
                           <button
                               onClick={() => handleZoom(-0.1)}
                               className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
                               title="Zoom Out"
                           >
                               -
                           </button>
                           <span className="text-xs font-mono text-muted-foreground w-12 text-center">
                               {Math.round(zoom * 100)}%
                           </span>
                           <button
                               onClick={() => handleZoom(0.1)}
                               className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
                               title="Zoom In"
                           >
                               +
                           </button>
                           <button
                               onClick={handleFitToScreen}
                               className="px-2.5 py-1.5 text-xs rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                               title="Fit to Screen"
                           >
                               Fit
                           </button>
                           <button
                               onClick={() => {
                                   if (!canvas) return;
                                   const centerPoint = new fabric.Point((canvas.width || canvas.getWidth()) / 2, (canvas.height || canvas.getHeight()) / 2);
                                   canvas.zoomToPoint(centerPoint, 1);
                                   canvas.requestRenderAll();
                                   setZoom(1);
                               }}
                               className="px-2.5 py-1.5 text-xs rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                               title="Reset Zoom"
                           >
                               100
                           </button>
                       </div>
                   </div>
                </main>
                
                {/* Right Docked Panel */}
                {panelState.mode === 'docked-right' && (
                    <aside style={{ width: panelState.width }} className="bg-card border-l flex flex-col z-10 shadow-xl overflow-hidden shrink-0 relative">
                         <div className="h-8 bg-muted border-b flex items-center justify-between px-2 cursor-move select-none" onMouseDown={handlePanelDragStart}>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><GripHorizontal size={14}/> Properties</div>
                             <div className="flex gap-1">
                                <button onClick={toggleFloat} className="p-0.5 hover:bg-background rounded"><Maximize size={12}/></button>
                                <button onClick={toggleCollapse} className="p-0.5 hover:bg-background rounded"><ChevronRight size={12}/></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                            <PropertiesPanel 
                                canvas={canvas} 
                                activeTool={activeTool} 
                                panelMode={propertiesPanelMode}
                                onPanelModeChange={setPropertiesPanelMode}
                                onLayerDblClick={(obj) => { 
                                    if(obj && canvas) {
                                        canvas.setActiveObject(obj);
                                        canvas.requestRenderAll();
                                        if (activeTool === 'layers') setActiveTool('select');
                                    }
                                }}
                                onMake3D={(imageUrl) => { setInitialImageFor3D(imageUrl); if (canvas) { setSourceObjectFor3D(canvas.getActiveObject() || null); } setActiveTool('3d-gen'); }}
                                onDuplicate={handleDuplicate}
                                onAssetSelect={handleAssetSelect}
                                historyState={historyState}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                zoom={zoom}
                                brushOptions={{
                                    brushPreset: paintBrushPreset,
                                    size: paintBrushSize,
                                    hardness: paintBrushHardness,
                                    opacity: paintBrushOpacity,
                                    flow: paintBrushFlow,
                                    smoothing: paintBrushSmoothing,
                                    blendMode: paintBlendMode,
                                }}
                                onBrushPresetChange={setPaintBrushPreset}
                                onBrushSizeChange={setPaintBrushSize}
                                onBrushHardnessChange={setPaintBrushHardness}
                                onBrushOpacityChange={setPaintBrushOpacity}
                                onBrushFlowChange={setPaintBrushFlow}
                                onBrushSmoothingChange={setPaintBrushSmoothing}
                                onBrushBlendModeChange={setPaintBlendMode}
                                onActivatePaintTool={() => setActiveTool('paint')}
                                enablePanelRailHoverLabels={expandToolRailLabelsOnHover}
                            />
                        </div>
                        <div 
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/50 transition-colors z-50"
                            onMouseDown={startPanelResize}
                        />
                    </aside>
                )}
                 {panelState.mode === 'collapsed-right' && (
                     <div onClick={toggleCollapse} className="w-4 bg-muted border-l hover:bg-primary/10 cursor-pointer flex items-center justify-center transition-colors">
                         <ChevronLeft size={14} className="text-muted-foreground" />
                     </div>
                 )}

                {/* Floating Panel Overlay */}
                {panelState.mode === 'floating' && (
                    <div 
                         style={{ 
                             position: 'fixed', 
                             left: panelState.position.x, 
                             top: panelState.position.y, 
                             width: panelState.width,
                             height: '70vh', // Fixed height when floating
                         }} 
                         className="z-50 shadow-2xl border rounded-xl overflow-hidden bg-card flex flex-col animate-in fade-in zoom-in-95 duration-200"
                    >
                         <div className="h-8 bg-secondary border-b flex items-center justify-between px-2 cursor-move select-none" onMouseDown={handlePanelDragStart}>
                             <div className="flex items-center gap-2 text-xs font-semibold"><GripHorizontal size={14}/> Properties (Floating)</div>
                             <div className="flex gap-1">
                                <button onClick={toggleFloat} className="p-0.5 hover:bg-background rounded" title="Dock Right"><Minimize size={12}/></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                             <PropertiesPanel 
                                canvas={canvas} 
                                activeTool={activeTool} 
                                panelMode={propertiesPanelMode}
                                onPanelModeChange={setPropertiesPanelMode}
                                onLayerDblClick={(obj) => { 
                                    if(obj && canvas) {
                                        canvas.setActiveObject(obj);
                                        canvas.requestRenderAll();
                                        if (activeTool === 'layers') setActiveTool('select');
                                    }
                                }}
                                onMake3D={(imageUrl) => { setInitialImageFor3D(imageUrl); if (canvas) { setSourceObjectFor3D(canvas.getActiveObject() || null); } setActiveTool('3d-gen'); }}
                                onDuplicate={handleDuplicate}
                                onAssetSelect={handleAssetSelect}
                                historyState={historyState}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                zoom={zoom}
                                brushOptions={{
                                    brushPreset: paintBrushPreset,
                                    size: paintBrushSize,
                                    hardness: paintBrushHardness,
                                    opacity: paintBrushOpacity,
                                    flow: paintBrushFlow,
                                    smoothing: paintBrushSmoothing,
                                    blendMode: paintBlendMode,
                                }}
                                onBrushPresetChange={setPaintBrushPreset}
                                onBrushSizeChange={setPaintBrushSize}
                                onBrushHardnessChange={setPaintBrushHardness}
                                onBrushOpacityChange={setPaintBrushOpacity}
                                onBrushFlowChange={setPaintBrushFlow}
                                onBrushSmoothingChange={setPaintBrushSmoothing}
                                onBrushBlendModeChange={setPaintBlendMode}
                                onActivatePaintTool={() => setActiveTool('paint')}
                                enablePanelRailHoverLabels={expandToolRailLabelsOnHover}
                            />
                        </div>
                    </div>
                )}
                <JobStatusFooter jobs={backgroundJobs} onClear={(id) => setBackgroundJobs(prev => prev.filter(j => j.id !== id))} />
            </div>
            <CircularContextMenu 
                x={contextMenu.x} 
                y={contextMenu.y} 
                isOpen={contextMenu.isOpen} 
                onClose={() => setContextMenu({ ...contextMenu, isOpen: false })}
                onSelectTool={(tool) => { 
                    toolbarRef.current?.triggerTool(tool);
                }}
                onLayerOrderAction={handleContextLayerOrderAction}
                layerOrderState={activeLayerOrderState}
            />
        </div>
    );
}
