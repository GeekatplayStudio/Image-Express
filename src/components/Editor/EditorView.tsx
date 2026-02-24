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
import { loadProfileSettings, UserProfileSettings } from '@/lib/profile-utils';
import AssetLibrary from '@/components/AssetLibrary';
import MissingAssetsModal from '@/components/MissingAssetsModal';
import * as fabric from 'fabric';
import { GridOverlay, GridType } from '@/components/GridOverlay';
import { GradientControls } from '@/components/GradientControls';
import { Download, Share2, Home as HomeIcon, ChevronDown, Image as ImageIcon, FileText, FileCode, Settings, Box, User, Save, X, Maximize, Minimize, ChevronLeft, ChevronRight, GripHorizontal, Grid3x3, LayoutGrid, Crosshair as CrosshairIcon, Archive, Undo2, Redo2, Square, Move, Brush, PenTool, Shapes, Type, PaintBucket, Wand2, LayoutTemplate, Blend, Layers, Palette, Facebook, Instagram, ShieldCheck } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { BackgroundJob, ThreeDImage, ThreeDGroup, ExtendedFabricObject, ColorPalette } from '@/types';
import JSZip from 'jszip';
import { loadDriveConfig, uploadBackup } from '@/lib/googleDrive';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import CircularContextMenu from '@/components/CircularContextMenu';
import BrandIcon from '@/components/BrandIcon';
import { Switch } from '@/components/ui/switch';
import { applyAlphaToColor, normalizeColorValue, parseColorWithAlpha } from '@/lib/fabric-utils';

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

type PanelMode = 'docked-left' | 'docked-right' | 'floating' | 'collapsed-left' | 'collapsed-right';

type ArtboardRectWithBackground = fabric.Rect & {
    canvasBackgroundColor?: string;
    canvasBackgroundEnabled?: boolean;
};

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number; left: number; top: number };
    artboardRect?: ArtboardRectWithBackground;
};

type ExportDataUrlOptions = fabric.TDataUrlOptions & {
    backgroundColor?: string;
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

const TOP_TEXT_FONT_FAMILIES = [
    'Arial',
    'Times New Roman',
    'Courier New',
    'Georgia',
    'Verdana',
    'Impact',
    'Comic Sans MS',
    'Trebuchet MS',
    'Tahoma',
    'Century Gothic',
];

const TOP_TEXT_FONT_STYLES = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

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
        'textPathSourceId'
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

    // Panel State
    const [panelState, setPanelState] = useState<{
        mode: PanelMode;
        position: { x: number; y: number };
        width: number;
    }>({
        mode: 'docked-right', // Default like original
        position: { x: 100, y: 100 },
        width: 320
    });
    
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
    
    // UI States
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const shareRef = useRef<HTMLDivElement>(null);
    const [showGridMenu, setShowGridMenu] = useState(false);
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const [gridType, setGridType] = useState<GridType>('none');
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
    const [paintBrushPreset, setPaintBrushPreset] = useState<'Pencil' | 'Spray' | 'Oil' | 'Watercolor'>('Pencil');
    const [paintBrushSize, setPaintBrushSize] = useState(10);
    const [paintBrushHardness, setPaintBrushHardness] = useState(80);
    const [paintBrushOpacity, setPaintBrushOpacity] = useState(100);
    const [paintBrushFlow, setPaintBrushFlow] = useState(100);
    const [paintBrushSmoothing, setPaintBrushSmoothing] = useState(50);
    const [paintBlendMode, setPaintBlendMode] = useState<'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'>('source-over');
    const [penTopMode, setPenTopMode] = useState<'path' | 'shape'>('path');
    const [penTopPathOperation, setPenTopPathOperation] = useState<'add' | 'subtract' | 'intersect'>('add');
    const [penTopAutoAddDelete, setPenTopAutoAddDelete] = useState(true);
    const [penTopRubberBand, setPenTopRubberBand] = useState(true);
    const [textTopFontFamily, setTextTopFontFamily] = useState(TOP_TEXT_FONT_FAMILIES[0]);
    const [textTopFontStyle, setTextTopFontStyle] = useState(TOP_TEXT_FONT_STYLES[0]);
    const [profileSettings, setProfileSettings] = useState<UserProfileSettings | null>(null);
    const undoStackRef = useRef<string[]>([]);
    const redoStackRef = useRef<string[]>([]);
    const isRestoringRef = useRef(false);
    const historyReadyRef = useRef(false);
    const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
    
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
            const creationTools = ['pen', 'paint', 'text', 'shapes', '3d-gen', 'ai-zone'];
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
        if (!canvas || activeTool !== 'paint') return;

        const drawingCanvas = canvas as fabric.Canvas & {
            set: (key: string, value: unknown) => void;
            freeDrawingBrush?: fabric.BaseBrush;
            isDrawingMode?: boolean;
        };

        if (typeof drawingCanvas.set === 'function') {
            drawingCanvas.set('isDrawingMode', true);
        } else {
            drawingCanvas.isDrawingMode = true;
        }

        let brush: fabric.BaseBrush;
        try {
            if (paintBrushPreset === 'Spray' || paintBrushPreset === 'Oil') {
                const sprayBrush = new fabric.SprayBrush(canvas);
                sprayBrush.density = Math.max(5, Math.round((paintBrushFlow / 100) * 100));
                if (paintBrushPreset === 'Oil') {
                    sprayBrush.dotWidth = Math.max(1, paintBrushSize / 8);
                    sprayBrush.dotWidthVariance = Math.max(1, paintBrushSize / 10);
                    sprayBrush.randomOpacity = false;
                    sprayBrush.optimizeOverlapping = false;
                }
                brush = sprayBrush;
            } else {
                const pencilBrush = new fabric.PencilBrush(canvas);
                pencilBrush.decimate = Math.max(0, Number((((100 - paintBrushSmoothing) / 100) * 8).toFixed(2)));
                const blurAmount = Math.max(0, Math.round(((100 - paintBrushHardness) / 100) * 50));
                pencilBrush.shadow = blurAmount > 0
                    ? new fabric.Shadow({
                        blur: blurAmount,
                        offsetX: 0,
                        offsetY: 0,
                        color: '#000000',
                    })
                    : null;
                brush = pencilBrush;
            }
        } catch {
            return;
        }

        brush.width = paintBrushSize;
        const combinedOpacity = Math.max(0.01, Math.min(1, (paintBrushOpacity / 100) * (paintBrushFlow / 100)));
        brush.color = applyAlphaToColor('#000000', combinedOpacity);

        if (typeof drawingCanvas.set === 'function') {
            drawingCanvas.set('freeDrawingBrush', brush);
        } else {
            drawingCanvas.freeDrawingBrush = brush;
        }
        canvas.requestRenderAll();
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
            const active = canvas.getActiveObject() as (fabric.Object & { type?: string; fontFamily?: string; fontWeight?: string | number }) | null;
            if (!active) {
                setTextTopFontFamily(TOP_TEXT_FONT_FAMILIES[0]);
                setTextTopFontStyle(TOP_TEXT_FONT_STYLES[0]);
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
            }
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
                 'ai': 'ai-zone'
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
        const originalTransform = canvas.viewportTransform ? ([...canvas.viewportTransform] as fabric.TMat2D) : undefined;
        if (originalTransform) {
            canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as fabric.TMat2D);
            canvas.requestRenderAll();
        }
        try {
            return await action();
        } finally {
            if (originalTransform) {
                canvas.setViewportTransform(originalTransform);
                canvas.requestRenderAll();
            }
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
            const dataUrl = await withViewportReset(() => canvas.toDataURL(options));
            const base64Index = dataUrl.indexOf(',');
            const base64Length = base64Index >= 0 ? dataUrl.length - base64Index - 1 : dataUrl.length;
            const bytes = Math.floor((base64Length * 3) / 4);
            setExportQualitySize(formatBytes(bytes));
        } catch {
            setExportQualitySize('Unavailable');
        }
    }, [canvas, getCanvasBackgroundSettings, withViewportReset]);

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
            if (showExportMenu) {
                event.preventDefault();
                setShowExportMenu(false);
                return;
            }
            if (showShareMenu) {
                event.preventDefault();
                setShowShareMenu(false);
                return;
            }
            if (showGridMenu) {
                event.preventDefault();
                setShowGridMenu(false);
                return;
            }
            if (showToolsMenu) {
                event.preventDefault();
                setShowToolsMenu(false);
                return;
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showExportMenu, showExportQualityModal, showGridMenu, showShareMenu, showToolsMenu]);

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
                thumbnailDataUrl = await withViewportReset(() => canvas.toDataURL({ format: 'png', multiplier: 0.5, enableRetinaScaling: true, quality: 1 }));
            } catch (e) {
                console.warn('Thumbnail generation with multiplier failed, retrying without:', e);
                try {
                     // Fallback without multiplier
                    thumbnailDataUrl = await withViewportReset(() => canvas.toDataURL({ format: 'png', multiplier: 1, enableRetinaScaling: true, quality: 1 }));
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
        
        try {
            const profile = profileSettings;
            const overlays: fabric.Object[] = [];
            const aiUsed = isAIGeneratedUsed();

            const profileText = profile?.embedInfo ? buildProfileOverlayText(profile, user) : '';
            const active = canvas.getActiveObject();
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

            overlays.forEach((o) => canvas.remove(o));
            if (active) {
                canvas.setActiveObject(active);
            }
            canvas.requestRenderAll();
        } finally {
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

             if (rect) {
                 const rectWidth = rect.getScaledWidth?.() ?? ((rect.width || 0) * (rect.scaleX || 1));
                 const rectHeight = rect.getScaledHeight?.() ?? ((rect.height || 0) * (rect.scaleY || 1));
                 cropOptions = {
                     left: rect.left || 0,
                     top: rect.top || 0,
                     width: rectWidth,
                     height: rectHeight
                 };
             } else if (artboard) {
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
                                                const imgData = canvas.toDataURL({
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

        const customProps = ['id', 'gradient', 'pattern', 'is3DModel', 'modelUrl', 'isStar', 'starPoints', 'starInnerRadius', 'mediaType', 'mediaSource', 'layerTagColor', 'isPenPath', 'penMode', 'penClosed', 'penNodes', 'penSourcePoints', 'textPathSourceId'];
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
    
        const handleWheel = (opt: fabric.TPointerEventInfo<WheelEvent>) => {
            const evt = opt.e;
            evt.preventDefault();
            evt.stopPropagation();
            const delta = evt.deltaY;
            const currentZoom = canvas.getZoom();
            let newZoom = currentZoom * (0.999 ** delta);
            if (newZoom > 5) newZoom = 5;
            if (newZoom < 0.1) newZoom = 0.1;
            
            const width = canvas.width!;
            const height = canvas.height!;
            const baseWidth = width / currentZoom;
            const baseHeight = height / currentZoom;
    
            canvas.setZoom(newZoom);
            canvas.setDimensions({ width: baseWidth * newZoom, height: baseHeight * newZoom });
            canvas.requestRenderAll();
            setZoom(newZoom);
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
    
                    const newGradient = new fabric.Gradient({
                        type: 'linear', gradientUnits: 'percentage',
                        coords: { x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y },
                        colorStops: [ { offset: 0, color: 'blue' }, { offset: 1, color: 'red' } ]
                    });
                    const currentFill = activeObj.get('fill');
                    if (currentFill && (currentFill as fabric.Gradient<'linear'>).type === 'linear') {
                         newGradient.colorStops = (currentFill as fabric.Gradient<'linear'>).colorStops;
                    }
                    activeObj.set('fill', newGradient);
                    canvas.requestRenderAll();
                },
                'mouse:up': () => { isDown = false; activeObj = null; }
            };
        };
    
        const gradientHandlers = handleGradientTool();
        canvas.on('mouse:wheel', handleWheel);
        canvas.on('mouse:dblclick', handleDblClick);
        canvas.on('mouse:down', gradientHandlers['mouse:down']);
        canvas.on('mouse:move', gradientHandlers['mouse:move']);
        canvas.on('mouse:up', gradientHandlers['mouse:up']);
    
        return () => {
          canvas.off('mouse:wheel', handleWheel);
          canvas.off('mouse:dblclick', handleDblClick);
          canvas.off('mouse:down', gradientHandlers['mouse:down']);
          canvas.off('mouse:move', gradientHandlers['mouse:move']);
          canvas.off('mouse:up', gradientHandlers['mouse:up']);
        };
    }, [canvas, activeTool]);

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

    return (
        <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
            {/* Editor Header */}
            <header className="h-16 border-b bg-card/50 backdrop-blur-xl flex items-center px-4 justify-between z-20 relative shadow-sm">
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
                                className="hidden md:block font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-pink-500 max-w-[360px] truncate text-left hover:opacity-90 transition-opacity"
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
                    </nav>
                    <div className="relative">
                        <button
                            onClick={() => {
                                setShowExportMenu(false);
                                setShowGridMenu(false);
                                setShowToolsMenu((prev) => !prev);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                        >
                            <span>Tools</span>
                            <ChevronDown size={14} />
                        </button>
                        {showToolsMenu && (
                            <div className="absolute left-0 top-full mt-2 w-64 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 z-50">
                                
                                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Selection & Layers</div>
                                <button onClick={() => { toolbarRef.current?.triggerTool('select'); setShowToolsMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                                    <Move size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/> 
                                    <span className="flex-1">Select</span>
                                    <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">V</span>
                                </button>
                                <button onClick={() => { toolbarRef.current?.triggerTool('layers'); setShowToolsMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                                    <Layers size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/> 
                                    <span className="flex-1">Layers</span>
                                    <span className="text-xs text-muted-foreground border border-border px-1.5 rounded">L</span>
                                </button>
                                <button onClick={() => { toolbarRef.current?.triggerTool('adjustments'); setShowToolsMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                                    <Blend size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/> <span>Adjustments</span>
                                </button>

                                <div className="my-1 border-t border-border/50" />
                                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Creation</div>
                                <div className="grid grid-cols-2 gap-1 px-2">
                                    <button onClick={() => { toolbarRef.current?.triggerTool('text'); setShowToolsMenu(false); }} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                                        <Type size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Text</span>
                                    </button>
                                    <button onClick={() => { toolbarRef.current?.triggerTool('shapes'); setShowToolsMenu(false); }} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                                        <Shapes size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Shapes</span>
                                    </button>
                                    <button onClick={() => { toolbarRef.current?.triggerTool('paint'); setShowToolsMenu(false); }} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                                        <Brush size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Brush</span>
                                    </button>
                                    <button onClick={() => { toolbarRef.current?.triggerTool('pen'); setShowToolsMenu(false); }} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group">
                                        <PenTool size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Pen</span>
                                    </button>
                                   <button onClick={() => { toolbarRef.current?.triggerTool('gradient'); setShowToolsMenu(false); }} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group col-span-2">
                                        <PaintBucket size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Fill / Gradient</span>
                                    </button>
                                    <button onClick={() => { toolbarRef.current?.triggerTool('color-wheel'); setShowToolsMenu(false); }} className="text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2 rounded-lg group col-span-2">
                                        <Palette size={16} className="text-muted-foreground group-hover:text-primary"/> <span>Color Wheel</span>
                                    </button>
                                </div>

                                <div className="my-1 border-t border-border/50" />
                                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Libraries</div>
                                <button onClick={() => { toolbarRef.current?.triggerTool('assets'); setShowToolsMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                                    <ImageIcon size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/> <span>Gallery</span>
                                </button>
                                <button onClick={() => { toolbarRef.current?.triggerTool('templates'); setShowToolsMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                                    <LayoutTemplate size={16} className="text-muted-foreground group-hover:text-primary transition-colors"/> <span>Library</span>
                                </button>

                                <div className="my-1 border-t border-border/50" />
                                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">AI & 3D</div>
                                <button onClick={() => { toolbarRef.current?.triggerTool('ai-zone'); setShowToolsMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                                    <Wand2 size={16} className="text-purple-500 group-hover:text-purple-600 transition-colors"/> <span>AI Zone</span>
                                </button>
                                <button onClick={() => { toolbarRef.current?.triggerTool('3d-gen'); setShowToolsMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-secondary/50 flex items-center gap-3 group">
                                    <Box size={16} className="text-indigo-500 group-hover:text-indigo-600 transition-colors"/> <span>AI 3D</span>
                                </button>
                            </div>
                        )}
                    </div>
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

                            <button 
                                onClick={() => onOpenDocumentation?.()}
                                className="w-9 h-9 flex items-center justify-center rounded-full border border-border/60 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                title="How to use Image Express"
                            >
                                ?
                            </button>
                     <button 
                        onClick={() => handleSave()}
                        className={`p-2 hover:bg-secondary rounded-full transition-colors ${isDirty ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
                        title="Save Design"
                     >
                        <Save size={20} />
                     </button>
                                         <button
                                                onClick={handleUndo}
                                                disabled={historyState.undo < 2}
                                                className={`p-2 rounded-full transition-colors ${historyState.undo < 2 ? 'text-muted-foreground/40 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
                                                title="Undo"
                                            >
                                                <Undo2 size={18} />
                                            </button>
                                         <button
                                                onClick={handleRedo}
                                                disabled={historyState.redo < 1}
                                                className={`p-2 rounded-full transition-colors ${historyState.redo < 1 ? 'text-muted-foreground/40 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
                                                title="Redo"
                                            >
                                                <Redo2 size={18} />
                                            </button>
        
                            <button 
                                onClick={onOpenSettings}
                                className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                                title="Settings"
                            >
                                <Settings size={20} />
                            </button>
                            {isAdminUser && (
                                <button
                                    onClick={() => onOpenAdminArea?.()}
                                    className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                                    title="Admin Area"
                                >
                                    <ShieldCheck size={20} />
                                </button>
                            )}
        
                     <div className="h-6 w-px bg-border mx-1"></div>
                     
                     {/* Grid Menu */}
                     <div className="relative">
                        <button 
                            onClick={() => setShowGridMenu(!showGridMenu)}
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
                          onClick={() => setShowShareMenu(!showShareMenu)}
                          className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                          title="Share"
                        >
                            <Share2 size={20} />
                        </button>
                         {showShareMenu && (
                              <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                  <button onClick={() => handleShare('facebook')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Facebook size={16} className="text-blue-600"/> <span className="font-medium">Facebook</span></button>
                                  <button onClick={() => handleShare('instagram')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Instagram size={16} className="text-pink-600"/> <span className="font-medium">Instagram</span></button>
                            </div>
                        )}
                     </div>
                     
                     <div className="relative" ref={exportRef}>
                        <button 
                          onClick={() => setShowExportMenu(!showExportMenu)}
                          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-lg shadow-primary/20 transition-all transform hover:scale-105 active:scale-95"
                        >
                            <Download size={16} />
                            <span>Export</span>
                            <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                        </button>
                        {showExportMenu && (
                              <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                  <button onClick={() => handleExport('png')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><ImageIcon size={16} className="text-blue-500"/> <span className="font-medium">PNG</span></button>
                                  <button onClick={() => handleExport('jpg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><ImageIcon size={16} className="text-orange-500"/> <span className="font-medium">JPG</span></button>
                                  <button onClick={() => handleExport('svg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileCode size={16} className="text-purple-500"/> <span className="font-medium">SVG</span></button>
                                  <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileText size={16} className="text-red-500"/> <span className="font-medium">PDF</span></button>
                                  <button onClick={() => handleExport('json')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileCode size={16} className="text-green-500"/> <span className="font-medium">JSON</span></button>
                                  <button onClick={() => handleExport('html')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><Archive size={16} className="text-sky-400"/> <span className="font-medium">HTML Bundle</span></button>
                            </div>
                        )}
                     </div>
                     <button
                        onClick={() => setShowProfileModal(true)}
                        className="relative w-9 h-9 rounded-full bg-gradient-to-tr from-blue-400 to-cyan-300 ring-2 ring-background ml-2 overflow-hidden flex items-center justify-center"
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
                onTriggerTool={(tool) => {
                    toolbarRef.current?.triggerTool(tool);
                }}
                selectOptions={{
                    autoSelectEnabled,
                    selectionMode,
                    showTransformControls,
                }}
                onAutoSelectChange={setAutoSelectEnabled}
                onSelectionModeChange={(mode) => {
                    setSelectionMode(mode);
                    toolbarRef.current?.triggerTool(mode === 'group' ? 'layers' : 'select');
                }}
                onTransformControlsChange={setShowTransformControls}
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
                }}
                onTextFontFamilyChange={(fontFamily) => {
                    setTextTopFontFamily(fontFamily);
                    if (!canvas) return;
                    const active = canvas.getActiveObject() as (fabric.Object & { type?: string; set: (props: unknown) => void }) | null;
                    if (!active) return;
                    const activeType = active.type;
                    const isTextObject = activeType === 'i-text' || activeType === 'text' || activeType === 'textbox';
                    if (!isTextObject) return;
                    active.set({ fontFamily });
                    canvas.requestRenderAll();
                }}
                onTextFontStyleChange={(fontStyle) => {
                    setTextTopFontStyle(fontStyle);
                    if (!canvas) return;
                    const active = canvas.getActiveObject() as (fabric.Object & { type?: string; set: (props: unknown) => void }) | null;
                    if (!active) return;
                    const activeType = active.type;
                    const isTextObject = activeType === 'i-text' || activeType === 'text' || activeType === 'textbox';
                    if (!isTextObject) return;
                    active.set({ fontWeight: fontStyle });
                    canvas.requestRenderAll();
                }}
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
                                        const dataUrl = await withViewportReset(() => canvas.toDataURL(options));
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
                <aside className="w-[60px] bg-card border-r flex flex-col items-center py-4 z-20 shadow-xl gap-4 relative overflow-y-auto">
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
                                onLayerDblClick={(obj) => { 
                                    if(obj && canvas) {
                                        canvas.setActiveObject(obj);
                                        canvas.requestRenderAll();
                                    }
                                }}
                                onMake3D={(imageUrl) => { setInitialImageFor3D(imageUrl); if (canvas) { setSourceObjectFor3D(canvas.getActiveObject() || null); } setActiveTool('3d-gen'); }}
                                onDuplicate={handleDuplicate}
                                onAssetSelect={handleAssetSelect}
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
                   </div>
                   
                   <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-popover/90 backdrop-blur-md px-2 py-1.5 rounded-full shadow-2xl border border-border/50 z-20 transform hover:-translate-y-1 transition-transform duration-300">
                       <button onClick={() => handleZoom(0.1)} className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors" title="Zoom In">+</button>
                       <span className="text-xs font-mono text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
                       <button onClick={() => handleZoom(-0.1)} className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors" title="Zoom Out">-</button>
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
            />
        </div>
    );
}
