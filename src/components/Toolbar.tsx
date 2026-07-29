'use client';
import { useEffect, useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import * as fabric from 'fabric';
import { placeAtViewportCenter } from '@/lib/canvas-placement';
import { getArtboardSize, applyArtboardSize } from '@/lib/fabric-utils';
import { useI18n } from '@/providers/I18nProvider';
import {
    Type,
    Square,
    LassoSelect,
    Image as ImageIcon,
    LayoutTemplate,
    Shapes,
    Circle,
    Triangle,
    Star,
    Move,
    Box,
    Wand2,
    SquareMousePointer,
    PaintbrushVertical,
    Pointer,
    PaintBucket,
    Brush,
    ArrowRight,
    CornerDownRight,
    MessageSquare,
    MessageCircle,
    Cloud,
    Hexagon,
    Diamond,
    PenTool,
    ShieldCheck,
    Bot,
    Copy,
    History,
    Blend,
    Sun,
    Sparkles,
    Scan,
    Crop,
    Pipette,
    Search,
    Hand,
    ArrowUpDown,
    SlidersHorizontal,
    Bandage,
    Eraser,
    Flame,
    Droplets,
    Workflow,
    Layers,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExtendedFabricObject, PenNode, ColorPalette, StarPolygon, AdjustmentLayerType, ThreeDGroup } from '@/types';
import useAppTheme from '@/hooks/useAppTheme';
import {
    PenPoint,
    PenModeSetting,
    PEN_DEFAULT_STROKE,
    PEN_DEFAULT_FILL,
    buildAutoBezierNodes,
    buildBezierPathData,
    buildSmoothPathData,
    buildStraightNodes
} from '@/lib/pen-utils';
import AssetLibrary from './AssetLibrary';
import TemplateLibrary from './TemplateLibrary';
import InputModal from './InputModal';
import ImageGeneratorModal from './ImageGeneratorModal';
import ComfyWorkflowsModal from './comfy/ComfyWorkflowsModal';
import AICritiqueModal from './AICritiqueModal';
import BrandManagerModal from './BrandManagerModal';
import SuperAgentModal from './SuperAgentModal';
import { ColorWheelTool } from './ColorWheelTool';
import BodyPortal from '@/components/ui/BodyPortal';
import { useToast } from '@/providers/ToastProvider';
import { loadProfileSettings } from '@/lib/profile-utils';
import { CUSTOM_SERIALIZED_PROPS } from '@/components/Editor/editorViewConfig';
import { TOP_TEXT_FONT_FAMILIES } from '@/lib/typography';
import { ensureDisplayableImage } from '@/lib/imageFormats/universalImageDecoder';
import { buildImageAcceptAttribute, getImageFormatEntry } from '@/lib/imageFormats/supportedFormats';

/**
 * Toolbar
 * Left sidebar providing access to all creation tools.
 * Manages active tool state and sub-menus (Shapes, Assets).
 */
interface ToolbarProps {
    canvas: fabric.Canvas | null;
    activeTool: string;
    setActiveTool: (tool: string) => void;
    onRequestPropertiesPanel?: (mode?: 'properties' | 'layers') => void;
    onOpenSettings?: () => void;
    onOpen3DEditor?: (url: string) => void;
    apiKeys?: { stability?: string };
    activePalette?: ColorPalette | null;
    setActivePalette?: (palette: ColorPalette | null) => void;
    currentUser?: string;
    enableHoverLabels?: boolean;
    onRailExpandedChange?: (expanded: boolean) => void;
    zoomCursorMode?: 'in' | 'out';
}

export type ToolbarHandle = {
    triggerTool: (toolName: string) => void;
};

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number };
};

type ToolCursorConfig = {
    defaultCursor: string;
    hoverCursor: string;
    selection: boolean;
};

const CROSSHAIR_TOOLS = new Set([
    'marquee',
    'lasso',
    'wand',
    'quick-select',
    'selection-brush',
    'spot-healing',
    'remove',
    'healing',
    'clone-stamp',
    'history-brush',
    'blur',
    'sharpen',
    'dodge',
    'burn',
    'sponge',
    'paint',
    'gradient',
    'pen',
    'crop',
    'eyedropper',
]);

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

const resolveToolCursorConfig = (
    tool: string,
    options?: { zoomMode?: 'in' | 'out' }
): ToolCursorConfig | null => {
    if (
        tool === 'select' ||
        tool === 'ai-zone' ||
        tool === 'ai-critique' ||
        tool === 'ai-brand-manager' ||
        tool === 'super-agent'
    ) {
        return {
            defaultCursor: 'default',
            hoverCursor: 'move',
            selection: true,
        };
    }

    if (tool === 'zoom') {
        const zoomCursor = options?.zoomMode === 'out' ? 'zoom-out' : 'zoom-in';
        return {
            defaultCursor: zoomCursor,
            hoverCursor: zoomCursor,
            selection: false,
        };
    }

    if (tool === 'hand') {
        return {
            defaultCursor: 'grab',
            hoverCursor: 'grab',
            selection: false,
        };
    }

    if (CROSSHAIR_TOOLS.has(tool)) {
        return {
            defaultCursor: 'crosshair',
            hoverCursor: 'crosshair',
            selection: false,
        };
    }

    return null;
};

const configureCanvasForTool = (
    canvas: fabric.Canvas,
    tool: string,
    options?: { zoomMode?: 'in' | 'out' }
) => {
    const config = resolveToolCursorConfig(tool, options);
    if (!config) return;

    if (tool === 'select') {
        // canvas.discardActiveObject(); // Don't clear selection when switching to select tool
        canvas.requestRenderAll();
    }

    canvas.defaultCursor = config.defaultCursor;
    canvas.hoverCursor = config.hoverCursor;
    canvas.selection = config.selection;
};

type PenClosure = 'open' | 'closed';
type PenPathOperation = 'add' | 'subtract' | 'intersect';
type BezierPathObject = fabric.Path & ExtendedFabricObject;
type PenDraftLineObject = fabric.Object;
type PenAnchorObject = fabric.Circle & { isPenDraftAnchor?: boolean; penAnchorIndex?: number };
type ShapeTopMode = 'shape' | 'path' | 'pixels';
type ShapeConfigPayload = {
    mode: ShapeTopMode;
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    cornerRadius: number;
    fixedSize: boolean;
};

const TOOL_ALIAS_MAP: Record<string, string> = {
    move: 'select',
    'path-select': 'select',
};

type ToolbarToolDefinition = {
    name: string;
    icon: LucideIcon;
    /** i18n key for the full Title Case name shown on the expanded rail. */
    labelKey: string;
    /** i18n key for the abbreviated name shown when the rail is collapsed. */
    shortLabelKey?: string;
};

type ToolbarToolGroupId = 'selection' | 'retouch' | 'fill';

type ToolbarToolGroupDefinition = {
    id: ToolbarToolGroupId;
    labelKey: string;
    tools: ToolbarToolDefinition[];
    defaultTool: string;
};

const SELECTION_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'selection',
    labelKey: 'toolbar.group.selection',
    defaultTool: 'select',
    tools: [
        { name: 'select', icon: Move, labelKey: 'toolbar.move' },
        { name: 'marquee', icon: Square, labelKey: 'toolbar.marquee' },
        { name: 'lasso', icon: LassoSelect, labelKey: 'toolbar.lasso' },
        { name: 'wand', icon: Wand2, labelKey: 'toolbar.wand', shortLabelKey: 'toolbar.short.wand' },
        { name: 'quick-select', icon: SquareMousePointer, labelKey: 'toolbar.quickSelect', shortLabelKey: 'toolbar.short.quick' },
        { name: 'selection-brush', icon: PaintbrushVertical, labelKey: 'toolbar.selectionBrush', shortLabelKey: 'toolbar.short.selBrush' },
        { name: 'path-select', icon: Pointer, labelKey: 'toolbar.pathSelect', shortLabelKey: 'toolbar.short.path' },
    ],
};

const RETOUCH_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'retouch',
    labelKey: 'toolbar.group.retouch',
    defaultTool: 'healing',
    tools: [
        { name: 'spot-healing', icon: Bandage, labelKey: 'toolbar.spotHealing', shortLabelKey: 'toolbar.short.spot' },
        { name: 'remove', icon: Eraser, labelKey: 'toolbar.removeTool', shortLabelKey: 'toolbar.short.remove' },
        { name: 'healing', icon: ShieldCheck, labelKey: 'toolbar.healingBrush', shortLabelKey: 'toolbar.short.healing' },
        { name: 'clone-stamp', icon: Copy, labelKey: 'toolbar.cloneStamp', shortLabelKey: 'toolbar.short.clone' },
        { name: 'history-brush', icon: History, labelKey: 'toolbar.historyBrush', shortLabelKey: 'toolbar.short.history' },
        { name: 'blur', icon: Blend, labelKey: 'toolbar.blurTool', shortLabelKey: 'toolbar.short.blur' },
        { name: 'sharpen', icon: Scan, labelKey: 'toolbar.sharpenTool', shortLabelKey: 'toolbar.short.sharpen' },
        { name: 'dodge', icon: Sun, labelKey: 'toolbar.dodgeTool', shortLabelKey: 'toolbar.short.dodge' },
        { name: 'burn', icon: Flame, labelKey: 'toolbar.burnTool', shortLabelKey: 'toolbar.short.burn' },
        { name: 'sponge', icon: Droplets, labelKey: 'toolbar.spongeTool', shortLabelKey: 'toolbar.short.sponge' },
    ],
};

const FILL_TOOL_GROUP: ToolbarToolGroupDefinition = {
    id: 'fill',
    labelKey: 'toolbar.group.fill',
    defaultTool: 'gradient',
    tools: [
        { name: 'gradient', icon: PaintBucket, labelKey: 'toolbar.fillGradient', shortLabelKey: 'toolbar.short.fill' },
        { name: 'fill-layer', icon: Layers, labelKey: 'toolbar.fillLayer', shortLabelKey: 'toolbar.short.fillLayer' },
    ],
};

const TOOL_GROUPS: ToolbarToolGroupDefinition[] = [SELECTION_TOOL_GROUP, RETOUCH_TOOL_GROUP, FILL_TOOL_GROUP];

const TOOL_GROUP_BY_ID: Record<ToolbarToolGroupId, ToolbarToolGroupDefinition> = {
    selection: SELECTION_TOOL_GROUP,
    retouch: RETOUCH_TOOL_GROUP,
    fill: FILL_TOOL_GROUP,
};

const CREATION_PRIMARY_TOOLS: ToolbarToolDefinition[] = [
    { name: 'text', icon: Type, labelKey: 'toolbar.text' },
    { name: 'shapes', icon: Shapes, labelKey: 'toolbar.shapes' },
    { name: 'adjustments', icon: SlidersHorizontal, labelKey: 'toolbar.adjustmentLayers', shortLabelKey: 'toolbar.short.adjust' },
    { name: 'pen', icon: PenTool, labelKey: 'toolbar.pen' },
    { name: 'paint', icon: Brush, labelKey: 'toolbar.brushes', shortLabelKey: 'toolbar.short.brush' },
];

const CREATION_LIBRARY_TOOLS: ToolbarToolDefinition[] = [
    { name: 'assets', icon: ImageIcon, labelKey: 'toolbar.gallery' },
    { name: 'templates', icon: LayoutTemplate, labelKey: 'toolbar.library', shortLabelKey: 'toolbar.short.templates' },
    { name: 'ai-zone', icon: Sparkles, labelKey: 'toolbar.aiZone' },
    { name: 'comfy-flows', icon: Workflow, labelKey: 'toolbar.comfyWorkflows', shortLabelKey: 'toolbar.short.comfy' },
    { name: 'ai-critique', icon: MessageSquare, labelKey: 'toolbar.aiCritique', shortLabelKey: 'toolbar.short.critique' },
    { name: 'ai-brand-manager', icon: ShieldCheck, labelKey: 'toolbar.aiBrandManager', shortLabelKey: 'toolbar.short.brand' },
    { name: 'super-agent', icon: Bot, labelKey: 'toolbar.superAgent', shortLabelKey: 'toolbar.short.agent' },
    { name: '3d-gen', icon: Box, labelKey: 'toolbar.ai3d' },
];

const WORKSPACE_UTILITY_TOOLS: ToolbarToolDefinition[] = [
    { name: 'crop', icon: Crop, labelKey: 'toolbar.crop' },
    { name: 'eyedropper', icon: Pipette, labelKey: 'toolbar.eyedropper', shortLabelKey: 'toolbar.short.picker' },
    { name: 'zoom', icon: Search, labelKey: 'toolbar.zoom' },
    { name: 'hand', icon: Hand, labelKey: 'toolbar.hand' },
];

const PEN_STROKE = PEN_DEFAULT_STROKE;
const PEN_FILL = PEN_DEFAULT_FILL;
const PEN_ANCHOR_COLOR = '#2563eb';
const PEN_HANDLE_COLOR = '#ffffff';
let isPenSpacePressed = false;

const isPenDraftAnchor = (obj?: fabric.Object | null): obj is PenAnchorObject => !!obj && (obj as PenAnchorObject).isPenDraftAnchor === true;

const clonePenNodes = (nodes: PenNode[]) => nodes.map((node) => ({
    x: node.x,
    y: node.y,
    handleIn: { ...node.handleIn },
    handleOut: { ...node.handleOut }
}));

const getPenNodeBounds = (nodes: PenNode[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((node) => {
        const points = [node, node.handleIn, node.handleOut];
        points.forEach((point) => {
            if (point.x < minX) minX = point.x;
            if (point.y < minY) minY = point.y;
            if (point.x > maxX) maxX = point.x;
            if (point.y > maxY) maxY = point.y;
        });
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return { minX, minY, maxX, maxY };
};

const distanceBetween = (a: PenPoint, b: PenPoint) => Math.hypot(a.x - b.x, a.y - b.y);

const penPathOperationToComposite: Record<PenPathOperation, GlobalCompositeOperation> = {
    add: 'source-over',
    subtract: 'destination-out',
    intersect: 'source-atop',
};

/* 
 * Duplicated logic moved to @/lib/pen-utils 
 */

const createPenDraftLine = (points: PenPoint[], mode: PenModeSetting, closure: PenClosure): PenDraftLineObject | null => {
    if (points.length === 0) return null;
    const isClosed = closure === 'closed' && points.length > 2;
    const baseProps = {
        stroke: PEN_STROKE,
        strokeWidth: 2,
        fill: isClosed ? 'rgba(59,130,246,0.08)' : 'transparent',
        objectCaching: false,
        selectable: false,
        evented: false,
        originX: 'left' as const,
        originY: 'top' as const
    };

    if (mode === 'straight') {
        if (isClosed) {
            return new fabric.Polygon(points, baseProps);
        }
        const polyPoints = points.length === 1 ? [points[0], points[0]] : points;
        return new fabric.Polyline(polyPoints, baseProps);
    }

    if (points.length === 1) {
        return new fabric.Polyline([points[0], points[0]], baseProps);
    }

    if (mode === 'smooth') {
        return new fabric.Path(buildSmoothPathData(points, isClosed), baseProps);
    }

    const nodes = buildAutoBezierNodes(points, isClosed);
    return new fabric.Path(buildBezierPathData(nodes, isClosed), baseProps);
};

const getViewportPointFromPathPoint = (pathObj: fabric.Path, point: PenPoint): fabric.Point => {
    const transformPoint = (fabric.util as unknown as { transformPoint: (point: fabric.Point, transform: number[]) => fabric.Point }).transformPoint;
    const multiplyTransformMatrices = (fabric.util as unknown as { multiplyTransformMatrices: (a: number[], b: number[]) => number[] }).multiplyTransformMatrices;
    const pathOffset = pathObj.pathOffset || new fabric.Point(0, 0);
    const localPoint = new fabric.Point(point.x - pathOffset.x, point.y - pathOffset.y);
    const viewportTransform = pathObj.getViewportTransform();
    return transformPoint(localPoint, multiplyTransformMatrices(viewportTransform, pathObj.calcTransformMatrix()));
};

const getPathPointFromScenePoint = (pathObj: fabric.Path, point: PenPoint): PenPoint => {
    const transformPoint = (fabric.util as unknown as { transformPoint: (point: fabric.Point, transform: number[]) => fabric.Point }).transformPoint;
    const invertTransform = (fabric.util as unknown as { invertTransform: (transform: number[]) => number[] }).invertTransform;
    const inverse = invertTransform(pathObj.calcOwnMatrix());
    const localPoint = transformPoint(new fabric.Point(point.x, point.y), inverse);
    const pathOffset = pathObj.pathOffset || new fabric.Point(0, 0);
    return {
        x: localPoint.x + pathOffset.x,
        y: localPoint.y + pathOffset.y
    };
};

const applyBezierNodesToPath = (pathObj: BezierPathObject, nodes: PenNode[], closed: boolean) => {
    const pathData = buildBezierPathData(nodes, closed);
    const nextPath = new fabric.Path(pathData);
    const center = pathObj.getCenterPoint();

    pathObj.set({
        path: nextPath.path,
        width: nextPath.width,
        height: nextPath.height,
        pathOffset: nextPath.pathOffset,
        dirty: true,
        penNodes: nodes,
        penSourcePoints: nodes.map((node) => ({ x: node.x, y: node.y })),
        penClosed: closed,
        penMode: 'bezier',
        isPenPath: true
    });
    pathObj.setPositionByOrigin(center, 'center', 'center');
    pathObj.setCoords();
    pathObj.canvas?.requestRenderAll();
};

const attachBezierControls = (pathObj: BezierPathObject) => {
    const nodes = pathObj.penNodes;
    if (!nodes || nodes.length < 2) return;

    const renderAnchor: fabric.Control['render'] = (ctx, left, top, styleOverride, fabricObject) => {
        const size = styleOverride?.cornerSize ?? fabricObject.cornerSize ?? 10;
        ctx.save();
        ctx.fillStyle = PEN_ANCHOR_COLOR;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(left, top, size / 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    };

    const renderHandle = (nodeIndex: number): fabric.Control['render'] => {
        return (ctx, left, top, styleOverride, fabricObject) => {
            const target = fabricObject as BezierPathObject;
            const currentNodes = target.penNodes || [];
            const node = currentNodes[nodeIndex];
            if (!node) return;
            const anchorPoint = getViewportPointFromPathPoint(target, { x: node.x, y: node.y });
            const size = styleOverride?.cornerSize ?? fabricObject.cornerSize ?? 10;

            ctx.save();
            ctx.strokeStyle = 'rgba(37,99,235,0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(anchorPoint.x, anchorPoint.y);
            ctx.lineTo(left, top);
            ctx.stroke();

            ctx.fillStyle = PEN_HANDLE_COLOR;
            ctx.strokeStyle = PEN_ANCHOR_COLOR;
            ctx.beginPath();
            ctx.arc(left, top, size / 2.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        };
    };

    const controls: Record<string, fabric.Control> = {};

    nodes.forEach((_, index) => {
        controls[`anchor_${index}`] = new fabric.Control({
            cursorStyle: 'move',
            positionHandler: (_dim, _finalMatrix, fabricObject) => {
                const target = fabricObject as BezierPathObject;
                const currentNodes = target.penNodes || [];
                const node = currentNodes[index];
                if (!node) return new fabric.Point(0, 0);
                return getViewportPointFromPathPoint(target, { x: node.x, y: node.y });
            },
            actionHandler: (_eventData, transform, x, y) => {
                const target = transform.target as BezierPathObject;
                const currentNodes = target.penNodes || [];
                const nextNodes = clonePenNodes(currentNodes);
                const node = nextNodes[index];
                if (!node) return false;

                const nextPoint = getPathPointFromScenePoint(target, { x, y });
                const dx = nextPoint.x - node.x;
                const dy = nextPoint.y - node.y;

                node.x = nextPoint.x;
                node.y = nextPoint.y;
                node.handleIn.x += dx;
                node.handleIn.y += dy;
                node.handleOut.x += dx;
                node.handleOut.y += dy;

                applyBezierNodesToPath(target, nextNodes, !!target.penClosed);
                return true;
            },
            render: renderAnchor
        });

        (['handleIn', 'handleOut'] as const).forEach((handleKey) => {
            controls[`${handleKey}_${index}`] = new fabric.Control({
                cursorStyle: 'crosshair',
                positionHandler: (_dim, _finalMatrix, fabricObject) => {
                    const target = fabricObject as BezierPathObject;
                    const currentNodes = target.penNodes || [];
                    const node = currentNodes[index];
                    if (!node) return new fabric.Point(0, 0);
                    return getViewportPointFromPathPoint(target, node[handleKey]);
                },
                actionHandler: (eventData, transform, x, y) => {
                    const target = transform.target as BezierPathObject;
                    const currentNodes = target.penNodes || [];
                    const nextNodes = clonePenNodes(currentNodes);
                    const node = nextNodes[index];
                    if (!node) return false;

                    const nextPoint = getPathPointFromScenePoint(target, { x, y });
                    node[handleKey] = nextPoint;

                    const oppositeKey = handleKey === 'handleIn' ? 'handleOut' : 'handleIn';
                    void eventData;
                    if (!isPenSpacePressed) {
                        const dx = nextPoint.x - node.x;
                        const dy = nextPoint.y - node.y;
                        node[oppositeKey] = { x: node.x - dx, y: node.y - dy };
                    }

                    applyBezierNodesToPath(target, nextNodes, !!target.penClosed);
                    return true;
                },
                render: renderHandle(index)
            });
        });
    });

    pathObj.set({
        controls,
        hasBorders: false,
        cornerColor: PEN_ANCHOR_COLOR,
        transparentCorners: false
    });
    pathObj.setCoords();
};

const Toolbar = forwardRef<ToolbarHandle, ToolbarProps>(({
    canvas,
    activeTool,
    setActiveTool,
    onRequestPropertiesPanel,
    onOpenSettings,
    onOpen3DEditor,
    apiKeys,
    activePalette,
    setActivePalette,
    currentUser,
    enableHoverLabels = false,
    onRailExpandedChange,
    zoomCursorMode = 'in',
}, ref) => {
    const { toast } = useToast();
    const { t } = useI18n();
    const appTheme = useAppTheme();
    const [showShapesMenu, setShowShapesMenu] = useState(false);
    const [showAdjustmentMenu, setShowAdjustmentMenu] = useState(false);
    const [showExtraMenu, setShowExtraMenu] = useState(false);
    const [refreshTemplatesTrigger, setRefreshTemplatesTrigger] = useState(0);
    const shapesMenuRef = useRef<HTMLDivElement>(null);
    const adjustmentMenuRef = useRef<HTMLDivElement>(null);
    const extraMenuRef = useRef<HTMLDivElement>(null);
    const shapesButtonRef = useRef<HTMLButtonElement>(null);
    const adjustmentsButtonRef = useRef<HTMLButtonElement>(null);
    const extraButtonRef = useRef<HTMLButtonElement>(null);
    const [shapesMenuPos, setShapesMenuPos] = useState<{ left: number; top: number } | null>(null);
    const [adjustmentMenuPos, setAdjustmentMenuPos] = useState<{ left: number; top: number } | null>(null);
    const [extraMenuPos, setExtraMenuPos] = useState<{ left: number; top: number } | null>(null);
    const [draggingMenu, setDraggingMenu] = useState<'shapes' | 'adjustments' | 'extra' | null>(null);
    const dragOffsetRef = useRef({ x: 0, y: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showSaveModal, setShowSaveModal] = useState(false);

    const openPropertiesPanel = useCallback(() => {
        onRequestPropertiesPanel?.('properties');
    }, [onRequestPropertiesPanel]);

    const focusInsertedObject = useCallback((object: fabric.Object | null | undefined, options?: { center?: boolean }) => {
        if (!canvas || !object) {
            return;
        }

        // Center new layers in the visible viewport by default so they never
        // spawn off-screen or in the artboard's top-left corner.
        if (options?.center !== false) {
            placeAtViewportCenter(canvas, object);
        }
        canvas.setActiveObject(object);
        canvas.requestRenderAll();
        openPropertiesPanel();
    }, [canvas, openPropertiesPanel]);
    const [shapeConfig, setShapeConfig] = useState<ShapeConfigPayload>({
        mode: 'shape',
        fillColor: appTheme.shapeDefaultFillHex,
        strokeColor: '#111827',
        strokeWidth: 0,
        cornerRadius: 0,
        fixedSize: false,
    });
    const previousThemeFillRef = useRef(appTheme.shapeDefaultFillHex);
    const toolGroupMenuRef = useRef<HTMLDivElement>(null);
    const selectionGroupButtonRef = useRef<HTMLButtonElement>(null);
    const retouchGroupButtonRef = useRef<HTMLButtonElement>(null);
    const fillGroupButtonRef = useRef<HTMLButtonElement>(null);
    const [openToolGroup, setOpenToolGroup] = useState<ToolbarToolGroupId | null>(null);
    const [toolGroupMenuPos, setToolGroupMenuPos] = useState<{ left: number; top: number } | null>(null);
    const [toolGroupPrimaryTool, setToolGroupPrimaryTool] = useState<Record<ToolbarToolGroupId, string>>({
        selection: SELECTION_TOOL_GROUP.defaultTool,
        retouch: RETOUCH_TOOL_GROUP.defaultTool,
        fill: FILL_TOOL_GROUP.defaultTool,
    });
    const [isRailHovered, setIsRailHovered] = useState(false);
    const normalizedActiveTool = TOOL_ALIAS_MAP[activeTool] || activeTool;
    const isRailExpanded = enableHoverLabels && isRailHovered;
    const [foregroundColor, setForegroundColor] = useState('#000000');
    const [backgroundColor, setBackgroundColor] = useState('#ffffff');
    const foregroundColorInputRef = useRef<HTMLInputElement>(null);
    const backgroundColorInputRef = useRef<HTMLInputElement>(null);

    const [penPoints, setPenPoints] = useState<PenPoint[]>([]);
    const [penAnchors, setPenAnchors] = useState<PenAnchorObject[]>([]);
    const penActiveLineRef = useRef<PenDraftLineObject | null>(null);
    const penAnchorsRef = useRef<PenAnchorObject[]>([]);
    const [penMode, setPenMode] = useState<PenModeSetting>('straight');
    const [penClosure, setPenClosure] = useState<PenClosure>('open');
    const [penPathOperation, setPenPathOperation] = useState<PenPathOperation>('add');
    const [penAutoAddDelete, setPenAutoAddDelete] = useState(true);
    const [penRubberBand, setPenRubberBand] = useState(true);
    const [penCursorPoint, setPenCursorPoint] = useState<PenPoint | null>(null);
    const railButtonLayoutClass = 'h-8 w-full items-center justify-start gap-2 px-2';
    const railLabelClass = cn(
        'truncate whitespace-nowrap text-[11px] font-medium transition-[max-width,opacity] duration-150 ease-out',
        isRailExpanded ? 'max-w-[140px] opacity-100' : 'max-w-0 overflow-hidden opacity-0'
    );
    const railMetaLabelClass = cn(
        'ml-1 truncate whitespace-nowrap text-[10px] text-muted-foreground transition-[max-width,opacity] duration-150 ease-out',
        isRailExpanded ? 'max-w-[56px] opacity-100' : 'max-w-0 overflow-hidden opacity-0'
    );

    useEffect(() => {
        penAnchorsRef.current = penAnchors;
    }, [penAnchors]);

    useEffect(() => {
        setShapeConfig((prev) => {
            if (prev.fillColor !== previousThemeFillRef.current) {
                previousThemeFillRef.current = appTheme.shapeDefaultFillHex;
                return prev;
            }

            previousThemeFillRef.current = appTheme.shapeDefaultFillHex;
            return {
                ...prev,
                fillColor: appTheme.shapeDefaultFillHex,
            };
        });
    }, [appTheme.shapeDefaultFillHex]);

    useEffect(() => {
        onRailExpandedChange?.(isRailExpanded);
    }, [isRailExpanded, onRailExpandedChange]);

    useEffect(() => {
        if (!canvas) return;
        configureCanvasForTool(canvas, normalizedActiveTool, { zoomMode: zoomCursorMode });
    }, [canvas, normalizedActiveTool, zoomCursorMode]);

    useEffect(() => {
        if (!canvas || activeTool !== 'pen') return;

        const currentLine = penActiveLineRef.current;
        if (currentLine) {
            canvas.remove(currentLine);
            penActiveLineRef.current = null;
        }

        const previewPoints = penRubberBand && penCursorPoint && penPoints.length > 0
            ? [...penPoints, penCursorPoint]
            : penPoints;
        const nextLine = createPenDraftLine(previewPoints, penMode, penClosure);
        if (!nextLine) {
            canvas.requestRenderAll();
            return;
        }

        canvas.add(nextLine);
        penActiveLineRef.current = nextLine;
        penAnchorsRef.current.forEach((anchor) => canvas.bringObjectToFront(anchor));
        canvas.requestRenderAll();
    }, [activeTool, canvas, penClosure, penCursorPoint, penMode, penPoints, penRubberBand]);

    useEffect(() => {
        const isTypingTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            if (target.isContentEditable) return true;
            const tag = target.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'Space') return;
            if (isTypingTarget(event.target)) return;
            isPenSpacePressed = true;
            if (activeTool === 'pen') {
                event.preventDefault();
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code !== 'Space') return;
            isPenSpacePressed = false;
        };

        const handleBlur = () => {
            isPenSpacePressed = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, [activeTool]);

    const clearPenDraft = useCallback(() => {
        if (canvas) {
            if (penActiveLineRef.current) {
                canvas.remove(penActiveLineRef.current);
            }
            penAnchorsRef.current.forEach((anchor) => canvas.remove(anchor));
            canvas.discardActiveObject();
            canvas.requestRenderAll();
        }
        penActiveLineRef.current = null;
        penAnchorsRef.current = [];
        setPenPoints((prev) => (prev.length > 0 ? [] : prev));
        setPenAnchors((prev) => (prev.length > 0 ? [] : prev));
        setPenCursorPoint(null);
    }, [canvas]);

    const finishPenPath = useCallback((forceClosed = false) => {
        if (!canvas) {
            clearPenDraft();
            return;
        }
        const isClosed = forceClosed || penClosure === 'closed';
        const minPoints = isClosed ? 3 : 2;
        if (penPoints.length < minPoints) {
            clearPenDraft();
            return;
        }

        const finalPoints = [...penPoints];
        if (penActiveLineRef.current) {
            canvas.remove(penActiveLineRef.current);
        }
        penActiveLineRef.current = null;
        penAnchors.forEach((anchor) => canvas.remove(anchor));
        penAnchorsRef.current = [];
        setPenAnchors([]);

        const objectBaseProps = {
            fill: isClosed ? PEN_FILL : 'transparent',
            stroke: PEN_STROKE,
            strokeWidth: 2,
            objectCaching: false,
            globalCompositeOperation: penPathOperationToComposite[penPathOperation]
        };

        // Build nodes in scene space first, then normalize by full bezier bounds
        // (anchors + handles) so path placement stays stable after Fabric recomputes pathOffset.
        const sceneNodes = penMode === 'straight'
            ? buildStraightNodes(finalPoints)
            : buildAutoBezierNodes(finalPoints, isClosed);
        const { minX, minY } = getPenNodeBounds(sceneNodes);
        const nodes = sceneNodes.map((node) => ({
            x: node.x - minX,
            y: node.y - minY,
            handleIn: {
                x: node.handleIn.x - minX,
                y: node.handleIn.y - minY
            },
            handleOut: {
                x: node.handleOut.x - minX,
                y: node.handleOut.y - minY
            }
        }));

        const pathData = buildBezierPathData(nodes, isClosed);
        const bezierPath = new fabric.Path(pathData, {
            ...objectBaseProps,
            left: minX,
            top: minY,
            originX: 'left',
            originY: 'top'
        }) as BezierPathObject;

        bezierPath.set({
            isPenPath: true,
            penMode: 'bezier',
            penClosed: isClosed,
            penNodes: nodes, // Stored as relative
            penSourcePoints: nodes.map((node) => ({ x: node.x, y: node.y }))
        });

        attachBezierControls(bezierPath);
        const createdObject = bezierPath;

        if (!createdObject) {
            clearPenDraft();
            return;
        }

        const namedObject = createdObject as ExtendedFabricObject;
        namedObject.name = isClosed ? 'Vector Shape' : 'Vector Path';
        namedObject.id = `shape-${Date.now()}`;
        // Set properties redundant with bezierPath set call but ensuring extended object compliance
        namedObject.penClosed = isClosed;
        namedObject.penMode = 'bezier'; // Converted
        namedObject.isPenPath = true;

        canvas.add(createdObject);
        focusInsertedObject(createdObject, { center: false });

        // Ensure new layer is clearly visible and editable
        canvas.requestRenderAll();

        setPenPoints([]);
        setPenCursorPoint(null);
        penActiveLineRef.current = null;
        // Stay in Pen Tool for continuous drawing
    }, [canvas, clearPenDraft, focusInsertedObject, penAnchors, penClosure, penMode, penPathOperation, penPoints]);

    useEffect(() => {
        if (activeTool === 'pen') return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        clearPenDraft();
    }, [activeTool, clearPenDraft]);

    useEffect(() => {
        if (!canvas) return;
        (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('pen:draft:update', {
            mode: penMode,
            closure: penClosure,
            pathOperation: penPathOperation,
            autoAddDelete: penAutoAddDelete,
            rubberBand: penRubberBand,
            points: penPoints.length
        });
    }, [canvas, penAutoAddDelete, penClosure, penMode, penPathOperation, penPoints.length, penRubberBand]);

    // Pen Tool Logic (Interactive Polyline)
    useEffect(() => {
        if (!canvas) return;

        const createAnchor = (point: PenPoint, index: number) => {
            // Keep anchors at a roughly constant screen size (~10px radius)
            // so the start anchor stays easy to click when zoomed out.
            const zoom = canvas.getZoom() || 1;
            const radius = Math.min(12, Math.max(5, 5 / zoom));
            const anchor = new fabric.Circle({
                left: point.x,
                top: point.y,
                radius,
                fill: PEN_HANDLE_COLOR,
                stroke: PEN_ANCHOR_COLOR,
                strokeWidth: Math.min(4, Math.max(2, 2 / zoom)),
                originX: 'center',
                originY: 'center',
                hasControls: false,
                hasBorders: false,
                selectable: true,
                evented: true,
                objectCaching: false,
                hoverCursor: 'move'
            }) as PenAnchorObject;
            anchor.isPenDraftAnchor = true;
            anchor.penAnchorIndex = index;
            return anchor;
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleMouseDown = (opt: any) => {
            if (activeTool !== 'pen') return;
            if (isPenSpacePressed) return;

            const pointer = opt.scenePoint
                ?? (opt.e ? (canvas as unknown as { getScenePoint: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point }).getScenePoint(opt.e) : null);
            if (!pointer) return;
            const target = opt.target as fabric.Object | null | undefined;
            if (isPenDraftAnchor(target)) {
                // Clicking back on the start anchor always closes the path —
                // this is the standard pen-tool gesture and shouldn't depend
                // on the Open/Closed toggle (which only sets the default
                // outcome when finishing via Enter/double-click instead).
                if (target.penAnchorIndex === 0 && penPoints.length > 2) {
                    finishPenPath(true);
                } else if (penAutoAddDelete && typeof target.penAnchorIndex === 'number') {
                    const anchorIndex = target.penAnchorIndex;
                    const minPoints = penClosure === 'closed' ? 3 : 2;
                    if (penPoints.length > minPoints) {
                        canvas.remove(target);
                        setPenPoints((prev) => prev.filter((_, index) => index !== anchorIndex));
                        setPenAnchors((prev) => {
                            const next = prev
                                .filter((_, index) => index !== anchorIndex)
                                .map((anchor, index) => {
                                    anchor.penAnchorIndex = index;
                                    return anchor;
                                });
                            penAnchorsRef.current = next;
                            return next;
                        });
                        canvas.requestRenderAll();
                    }
                }
                return;
            }
            const pointerPoint = { x: pointer.x, y: pointer.y };

            // Fallback close check: the start anchor can be tiny on screen
            // when zoomed out, so a click that misses the anchor object
            // itself (no Fabric target hit) still closes the path if the
            // pointer landed within a zoom-adjusted radius of the start
            // point. Threshold is scene units for ~14 screen px at any zoom.
            if (penPoints.length > 2) {
                const first = penPoints[0];
                const dist = distanceBetween(pointerPoint, first);
                const zoom = canvas.getZoom() || 1;
                const closeThreshold = 14 / zoom;
                if (dist < closeThreshold) {
                    finishPenPath(true);
                    return;
                }
            }

            // START or CONTINUE
            const points = [...penPoints, pointerPoint];
            setPenPoints(points);
            setPenCursorPoint(pointerPoint);
            const newAnchor = createAnchor(pointerPoint, points.length - 1);
            canvas.add(newAnchor);
            canvas.bringObjectToFront(newAnchor);
            setPenAnchors((prev) => {
                const next = [...prev, newAnchor];
                penAnchorsRef.current = next;
                return next;
            });

            canvas.bringObjectToFront(newAnchor);
            canvas.requestRenderAll();
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleMouseMove = (opt: any) => {
            if (activeTool !== 'pen' || !penRubberBand || penPoints.length === 0) return;
            const pointer = opt.scenePoint
                ?? (opt.e ? (canvas as unknown as { getScenePoint: (e: MouseEvent | PointerEvent | TouchEvent) => fabric.Point }).getScenePoint(opt.e) : null);
            if (!pointer) return;
            setPenCursorPoint({ x: pointer.x, y: pointer.y });
        };

        const handleDblClick = () => {
            if (activeTool !== 'pen') return;
            finishPenPath();
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleObjectMoving = (opt: any) => {
            if (activeTool !== 'pen') return;
            const target = opt.target as fabric.Object | undefined;
            if (!isPenDraftAnchor(target)) return;
            const index = target.penAnchorIndex;
            if (index === undefined || index < 0) return;

            const center = typeof target.getCenterPoint === 'function' ? target.getCenterPoint() : null;
            const x = center?.x ?? target.left ?? 0;
            const y = center?.y ?? target.top ?? 0;
            setPenPoints((prev) => {
                if (index >= prev.length) return prev;
                const next = [...prev];
                next[index] = { x, y };
                return next;
            });
            canvas.requestRenderAll();
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleSelection = (opt: any) => {
            const selected = ((opt as unknown as { selected?: fabric.Object[] }).selected || []) as fabric.Object[];
            selected.forEach((object) => {
                const pathObject = object as BezierPathObject;
                if (pathObject.type !== 'path') return;
                if (!pathObject.isPenPath || pathObject.penMode !== 'bezier' || !Array.isArray(pathObject.penNodes)) return;
                attachBezierControls(pathObject);
            });
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleObjectAdded = (opt: any) => {
            const object = (opt as unknown as { target?: fabric.Object }).target;
            if (!object) return;
            const pathObject = object as BezierPathObject;
            if (pathObject.type !== 'path') return;
            if (!pathObject.isPenPath || pathObject.penMode !== 'bezier' || !Array.isArray(pathObject.penNodes)) return;
            attachBezierControls(pathObject);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (activeTool !== 'pen') return;
            if (event.key === 'Enter') {
                event.preventDefault();
                finishPenPath();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                clearPenDraft();
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handlePenConfigSet = (opt: any) => {
            const mode = opt?.mode as PenModeSetting | undefined;
            const closure = opt?.closure as PenClosure | undefined;
            const pathOperation = opt?.pathOperation as PenPathOperation | undefined;
            const autoAddDelete = opt?.autoAddDelete as boolean | undefined;
            const rubberBand = opt?.rubberBand as boolean | undefined;
            if (mode && (mode === 'straight' || mode === 'smooth' || mode === 'bezier')) {
                setPenMode(mode);
            }
            if (closure && (closure === 'open' || closure === 'closed')) {
                setPenClosure(closure);
            }
            if (pathOperation && (pathOperation === 'add' || pathOperation === 'subtract' || pathOperation === 'intersect')) {
                setPenPathOperation(pathOperation);
            }
            if (typeof autoAddDelete === 'boolean') {
                setPenAutoAddDelete(autoAddDelete);
            }
            if (typeof rubberBand === 'boolean') {
                setPenRubberBand(rubberBand);
            }
        };

        const handlePenFinishRequest = () => {
            if (activeTool !== 'pen') return;
            finishPenPath();
        };

        const handlePenClearRequest = () => {
            if (activeTool !== 'pen') return;
            clearPenDraft();
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:dblclick', handleDblClick);
        canvas.on('object:moving', handleObjectMoving);
        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('object:added', handleObjectAdded);
        (canvas as unknown as { on: (eventName: string, cb: (...args: unknown[]) => void) => void }).on('pen:config:set', handlePenConfigSet);
        (canvas as unknown as { on: (eventName: string, cb: (...args: unknown[]) => void) => void }).on('pen:finish-request', handlePenFinishRequest);
        (canvas as unknown as { on: (eventName: string, cb: (...args: unknown[]) => void) => void }).on('pen:clear-request', handlePenClearRequest);
        window.addEventListener('keydown', handleKeyDown);

        canvas.getObjects().forEach((object) => {
            const pathObject = object as BezierPathObject;
            if (pathObject.type !== 'path') return;
            if (!pathObject.isPenPath || pathObject.penMode !== 'bezier' || !Array.isArray(pathObject.penNodes)) return;
            attachBezierControls(pathObject);
        });

        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:dblclick', handleDblClick);
            canvas.off('object:moving', handleObjectMoving);
            canvas.off('selection:created', handleSelection);
            canvas.off('selection:updated', handleSelection);
            canvas.off('object:added', handleObjectAdded);
            (canvas as unknown as { off: (eventName: string, cb: (...args: unknown[]) => void) => void }).off('pen:config:set', handlePenConfigSet);
            (canvas as unknown as { off: (eventName: string, cb: (...args: unknown[]) => void) => void }).off('pen:finish-request', handlePenFinishRequest);
            (canvas as unknown as { off: (eventName: string, cb: (...args: unknown[]) => void) => void }).off('pen:clear-request', handlePenClearRequest);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeTool, canvas, clearPenDraft, finishPenPath, penAutoAddDelete, penClosure, penPoints, penRubberBand]);

    useEffect(() => {
        if (!canvas) return;

        const handleShapeConfigSet = (payload?: Partial<ShapeConfigPayload>) => {
            setShapeConfig((prev) => {
                const nextMode = payload?.mode && ['shape', 'path', 'pixels'].includes(payload.mode)
                    ? payload.mode
                    : prev.mode;
                const nextFillColor = typeof payload?.fillColor === 'string' && payload.fillColor.trim().length > 0
                    ? payload.fillColor
                    : prev.fillColor;
                const nextStrokeColor = typeof payload?.strokeColor === 'string' && payload.strokeColor.trim().length > 0
                    ? payload.strokeColor
                    : prev.strokeColor;
                const nextStrokeWidth = typeof payload?.strokeWidth === 'number'
                    ? Math.max(0, Math.min(40, Math.round(payload.strokeWidth)))
                    : prev.strokeWidth;
                const nextCornerRadius = typeof payload?.cornerRadius === 'number'
                    ? Math.max(0, Math.min(100, Math.round(payload.cornerRadius)))
                    : prev.cornerRadius;
                const nextFixedSize = typeof payload?.fixedSize === 'boolean'
                    ? payload.fixedSize
                    : prev.fixedSize;

                return {
                    mode: nextMode,
                    fillColor: nextFillColor,
                    strokeColor: nextStrokeColor,
                    strokeWidth: nextStrokeWidth,
                    cornerRadius: nextCornerRadius,
                    fixedSize: nextFixedSize,
                };
            });
        };

        (canvas as unknown as { on: (eventName: string, cb: (payload?: Partial<ShapeConfigPayload>) => void) => void }).on('shape:config:set', handleShapeConfigSet);
        return () => {
            (canvas as unknown as { off: (eventName: string, cb: (payload?: Partial<ShapeConfigPayload>) => void) => void }).off('shape:config:set', handleShapeConfigSet);
        };
    }, [canvas]);

    // Close shapes menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const targetNode = event.target as Node;
            if (shapesMenuRef.current && !shapesMenuRef.current.contains(targetNode)) {
                setShowShapesMenu(false);
            }
            if (adjustmentMenuRef.current && !adjustmentMenuRef.current.contains(targetNode)) {
                setShowAdjustmentMenu(false);
            }
            if (extraMenuRef.current && !extraMenuRef.current.contains(targetNode)) {
                setShowExtraMenu(false);
            }

            const clickedGroupButton = (
                selectionGroupButtonRef.current?.contains(targetNode)
                || retouchGroupButtonRef.current?.contains(targetNode)
            );
            if (toolGroupMenuRef.current && !toolGroupMenuRef.current.contains(targetNode) && !clickedGroupButton) {
                setOpenToolGroup(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const clampMenuPosition = useCallback((left: number, top: number, width: number, height: number) => {
        if (typeof window === 'undefined') return { left, top };
        const padding = 8;
        const maxLeft = Math.max(padding, window.innerWidth - width - padding);
        const maxTop = Math.max(padding, window.innerHeight - height - padding);
        return {
            left: Math.min(Math.max(padding, left), maxLeft),
            top: Math.min(Math.max(padding, top), maxTop)
        };
    }, []);

    const positionMenu = (
        buttonRef: React.RefObject<HTMLButtonElement | null>,
        estimatedWidth = 176,
        estimatedHeight = 260
    ) => {
        const el = buttonRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        let left = rect.right + 12;
        const top = rect.top + 10;
        if (typeof window !== 'undefined' && left + estimatedWidth > window.innerWidth - 8) {
            left = rect.left - estimatedWidth - 12;
        }
        return clampMenuPosition(left, top, estimatedWidth, estimatedHeight);
    };

    const beginMenuDrag = (menu: 'shapes' | 'adjustments' | 'extra') => (event: React.MouseEvent) => {
        event.preventDefault();
        const pos = menu === 'shapes' ? shapesMenuPos : adjustmentMenuPos;
        if (!pos) return;
        dragOffsetRef.current = {
            x: event.clientX - pos.left,
            y: event.clientY - pos.top
        };
        setDraggingMenu(menu);
    };

    useEffect(() => {
        if (!draggingMenu) return;

        const handleMouseMove = (event: MouseEvent) => {
            const menuEl = draggingMenu === 'shapes' ? shapesMenuRef.current : adjustmentMenuRef.current;
            const width = menuEl?.offsetWidth ?? 176;
            const height = menuEl?.offsetHeight ?? 240;
            const next = clampMenuPosition(
                event.clientX - dragOffsetRef.current.x,
                event.clientY - dragOffsetRef.current.y,
                width,
                height
            );

            if (draggingMenu === 'shapes') setShapesMenuPos(next);
            else setAdjustmentMenuPos(next);
        };

        const handleMouseUp = () => {
            setDraggingMenu(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [clampMenuPosition, draggingMenu]);

    useEffect(() => {
        if (!showShapesMenu || !shapesMenuPos || !shapesMenuRef.current) return;
        const rect = shapesMenuRef.current.getBoundingClientRect();
        const clamped = clampMenuPosition(shapesMenuPos.left, shapesMenuPos.top, rect.width, rect.height);
        if (clamped.left !== shapesMenuPos.left || clamped.top !== shapesMenuPos.top) {
            setShapesMenuPos(clamped);
        }
    }, [clampMenuPosition, shapesMenuPos, showShapesMenu]);

    useEffect(() => {
        if (!showAdjustmentMenu || !adjustmentMenuPos || !adjustmentMenuRef.current) return;
        const rect = adjustmentMenuRef.current.getBoundingClientRect();
        const clamped = clampMenuPosition(adjustmentMenuPos.left, adjustmentMenuPos.top, rect.width, rect.height);
        if (clamped.left !== adjustmentMenuPos.left || clamped.top !== adjustmentMenuPos.top) {
            setAdjustmentMenuPos(clamped);
        }
    }, [adjustmentMenuPos, clampMenuPosition, showAdjustmentMenu]);

    useEffect(() => {
        const handleResize = () => {
            if (showShapesMenu && shapesMenuPos && shapesMenuRef.current) {
                const rect = shapesMenuRef.current.getBoundingClientRect();
                setShapesMenuPos((prev) => {
                    if (!prev) return prev;
                    return clampMenuPosition(prev.left, prev.top, rect.width, rect.height);
                });
            }
            if (showAdjustmentMenu && adjustmentMenuPos && adjustmentMenuRef.current) {
                const rect = adjustmentMenuRef.current.getBoundingClientRect();
                setAdjustmentMenuPos((prev) => {
                    if (!prev) return prev;
                    return clampMenuPosition(prev.left, prev.top, rect.width, rect.height);
                });
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [adjustmentMenuPos, clampMenuPosition, shapesMenuPos, showAdjustmentMenu, showShapesMenu]);

    const addText = () => {
        if (!canvas) return;
        const text = new fabric.IText('Tap to edit', {
            left: 100,
            top: 250,
            fontFamily: TOP_TEXT_FONT_FAMILIES[0],
            fill: '#1f2937',
            fontSize: 40,
            fontWeight: 'bold',
        });
        (text as ExtendedFabricObject).textSpellcheck = true;
        canvas.add(text);
        focusInsertedObject(text);
    };

    const syncToolbarColorsToCanvas = useCallback((
        nextForeground: string,
        nextBackground: string,
        options?: { applyToActiveObject?: boolean }
    ) => {
        if (!canvas) return;

        const applyToActiveObject = options?.applyToActiveObject ?? true;
        const activeObject = canvas.getActiveObject() as (fabric.Object & { fill?: unknown }) | null;
        // Some color updates (eyedropper sampling) should update toolbar state only,
        // not mutate the currently selected layer fill.
        if (applyToActiveObject && activeObject && 'fill' in activeObject) {
            activeObject.set({ fill: nextForeground as never });
            activeObject.setCoords();
            canvas.requestRenderAll();
            canvas.fire('object:modified', { target: activeObject });
        }
        const canvasEventBus = canvas as unknown as {
            fire: (eventName: string, payload?: unknown) => void;
        };
        canvasEventBus.fire('toolbar:color:change', {
            foregroundColor: nextForeground,
            backgroundColor: nextBackground,
        });
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;
        const canvasEventBus = canvas as unknown as {
            on: (eventName: string, cb: (payload?: { color?: string }) => void) => void;
            off: (eventName: string, cb: (payload?: { color?: string }) => void) => void;
        };

        // Keep wheel/toolbar color in sync with sampled canvas pixels while eyedropper is active.
        const handleEyedropperSample = (payload?: { color?: string }) => {
            if (!payload?.color) return;
            setForegroundColor(payload.color);
            syncToolbarColorsToCanvas(payload.color, backgroundColor, { applyToActiveObject: false });
        };

        canvasEventBus.on('eyedropper:sample', handleEyedropperSample);
        return () => {
            canvasEventBus.off('eyedropper:sample', handleEyedropperSample);
        };
    }, [backgroundColor, canvas, syncToolbarColorsToCanvas]);

    const handleForegroundColorChange = (nextColor: string) => {
        if (!nextColor) return;
        setForegroundColor(nextColor);
        syncToolbarColorsToCanvas(nextColor, backgroundColor);
    };

    const handleBackgroundColorChange = (nextColor: string) => {
        if (!nextColor) return;
        setBackgroundColor(nextColor);
        syncToolbarColorsToCanvas(foregroundColor, nextColor);
    };

    const handleSwapToolbarColors = () => {
        const nextForeground = backgroundColor;
        const nextBackground = foregroundColor;
        setForegroundColor(nextForeground);
        setBackgroundColor(nextBackground);
        syncToolbarColorsToCanvas(nextForeground, nextBackground);
    };

    const handleToolClick = (toolName: string) => {
        const normalizedToolName = TOOL_ALIAS_MAP[toolName] || toolName;
        if (toolName === 'extra') {
            setShowExtraMenu((prev) => {
                const next = !prev;
                if (next) {
                    setExtraMenuPos(positionMenu(extraButtonRef, 176, 120));
                }
                return next;
            });
            setShowShapesMenu(false);
            setShowAdjustmentMenu(false);
            setOpenToolGroup(null);
            setToolGroupMenuPos(null);
            setActiveTool('extra');
            return;
        }
        if (toolName === 'shapes') {
            setShowShapesMenu((prev) => {
                const next = !prev;
                if (next) {
                    setShapesMenuPos(positionMenu(shapesButtonRef, 176, 240));
                }
                return next;
            });
            setShowAdjustmentMenu(false);
            setOpenToolGroup(null);
            setToolGroupMenuPos(null);
            setActiveTool('shapes');
            return;
        }
        if (toolName === 'adjustments') {
            setShowAdjustmentMenu((prev) => {
                const next = !prev;
                if (next) {
                    setAdjustmentMenuPos(positionMenu(adjustmentsButtonRef, 176, 320));
                }
                return next;
            });
            setShowShapesMenu(false);
            setOpenToolGroup(null);
            setToolGroupMenuPos(null);
            setActiveTool('layers');
            return;
        }

        // Toggle behavior: Close tool if clicking standard panel icons again
        if (activeTool === normalizedToolName) {
            // Exceptions: 'text' (add new text), 'select' (deselect all)
            const nonTogglingTools = ['select', 'text'];
            if (!nonTogglingTools.includes(normalizedToolName)) {
                setActiveTool('select');
                return;
            }
        }

        setActiveTool(normalizedToolName);
        setShowShapesMenu(false);
        setShowAdjustmentMenu(false);
        setShowExtraMenu(false);
        setOpenToolGroup(null);
        setToolGroupMenuPos(null);

        const resolvedPrimaryTool = TOOL_GROUPS.some((group) => group.tools.some((tool) => tool.name === toolName))
            ? toolName
            : normalizedToolName;
        const owningGroup = TOOL_GROUPS.find((group) => group.tools.some((tool) => tool.name === resolvedPrimaryTool));
        if (owningGroup) {
            setToolGroupPrimaryTool((prev) => (
                prev[owningGroup.id] === resolvedPrimaryTool
                    ? prev
                    : { ...prev, [owningGroup.id]: resolvedPrimaryTool }
            ));
        }

        // Handle single-action tools
        switch (normalizedToolName) {
            case 'select':
                if (canvas) {
                    configureCanvasForTool(canvas, 'select');
                }
                break;
            case 'marquee':
                if (canvas) {
                    configureCanvasForTool(canvas, 'marquee');
                }
                break;
            case 'lasso':
                if (canvas) {
                    configureCanvasForTool(canvas, 'lasso');
                }
                break;
            case 'wand':
                if (canvas) {
                    configureCanvasForTool(canvas, 'wand');
                }
                break;
            case 'quick-select':
                if (canvas) {
                    configureCanvasForTool(canvas, 'quick-select');
                }
                break;
            case 'selection-brush':
                if (canvas) {
                    configureCanvasForTool(canvas, 'selection-brush');
                }
                break;
            case 'gradient':
                if (canvas) {
                    // Enable gradient mode
                    // Disable normal selection for canvas (but allow object selection? No, usually tool takes over)
                    // We'll handle this in a useEffect in parent or separate interactive component
                    configureCanvasForTool(canvas, 'gradient');
                }
                break;
            case 'fill-layer':
                if (canvas) {
                    // Create a page-sized fill/gradient layer seeded from the current
                    // foreground → background colors, then hand editing over to the
                    // gradient tool so its options bar adjusts the new layer.
                    const artboard = getArtboardSize(canvas);
                    const layerWidth = artboard?.width || canvas.getWidth();
                    const layerHeight = artboard?.height || canvas.getHeight();
                    const artboardOrigin = (canvas as CanvasWithArtboard & { artboardRect?: fabric.Rect }).artboardRect;
                    const fillLayer = new fabric.Rect({
                        left: artboardOrigin?.left ?? 0,
                        top: artboardOrigin?.top ?? 0,
                        // The editor defaults objects to center origins; pin to the
                        // artboard's top-left so the layer covers the page exactly.
                        originX: 'left',
                        originY: 'top',
                        width: layerWidth,
                        height: layerHeight,
                        strokeWidth: 0,
                        fill: new fabric.Gradient({
                            type: 'linear',
                            gradientUnits: 'percentage',
                            coords: { x1: 0, y1: 0, x2: 0, y2: 1 },
                            colorStops: [
                                { offset: 0, color: foregroundColor },
                                { offset: 1, color: backgroundColor },
                            ],
                        }),
                    });
                    (fillLayer as fabric.Rect & ExtendedFabricObject).gradientTypeHint = 'linear';
                    canvas.add(fillLayer);
                    focusInsertedObject(fillLayer, { center: false });
                    setActiveTool('gradient');
                    configureCanvasForTool(canvas, 'gradient');
                }
                break;
            case 'pen':
                if (canvas) {
                    configureCanvasForTool(canvas, 'pen');
                }
                break;
            case 'paint':
                if (canvas) {
                    configureCanvasForTool(canvas, 'paint');
                }
                break;
            case 'healing':
                if (canvas) {
                    configureCanvasForTool(canvas, 'healing');
                }
                break;
            case 'clone-stamp':
                if (canvas) {
                    configureCanvasForTool(canvas, 'clone-stamp');
                }
                break;
            case 'history-brush':
                if (canvas) {
                    configureCanvasForTool(canvas, 'history-brush');
                }
                break;
            case 'blur':
                if (canvas) {
                    configureCanvasForTool(canvas, 'blur');
                }
                break;
            case 'sharpen':
                if (canvas) {
                    configureCanvasForTool(canvas, 'sharpen');
                }
                break;
            case 'dodge':
                if (canvas) {
                    configureCanvasForTool(canvas, 'dodge');
                }
                break;
            case 'crop':
                if (canvas) {
                    configureCanvasForTool(canvas, 'crop');
                }
                break;
            case 'eyedropper':
                if (canvas) {
                    configureCanvasForTool(canvas, 'eyedropper');
                }
                break;
            case 'zoom':
                if (canvas) {
                    configureCanvasForTool(canvas, 'zoom', { zoomMode: zoomCursorMode });
                }
                break;
            case 'hand':
                if (canvas) {
                    configureCanvasForTool(canvas, 'hand');
                }
                break;
            case 'text':
                addText();
                break;
            case 'assets':
                // Toggle asset library (merged functionality for media/upload)
                break;
            case 'ai-zone':
                // logic handled by tool activation
                break;
            case 'ai-critique':
                if (canvas) {
                    configureCanvasForTool(canvas, 'select');
                }
                break;
            case 'layers':
                // Properties Panel handles the view reset, we just set activeTool
                break;
        }
    };

    const getToolGroupButtonRef = (groupId: ToolbarToolGroupId) => (
        groupId === 'selection'
            ? selectionGroupButtonRef
            : groupId === 'retouch'
                ? retouchGroupButtonRef
                : fillGroupButtonRef
    );

    const openToolGroupMenuFor = (groupId: ToolbarToolGroupId) => {
        const group = TOOL_GROUP_BY_ID[groupId];
        const estimatedHeight = Math.max(180, 44 + (group.tools.length * 36));
        setToolGroupMenuPos(positionMenu(getToolGroupButtonRef(groupId), 212, estimatedHeight));
        setOpenToolGroup(groupId);
    };

    const handleToolGroupMenuSelect = (groupId: ToolbarToolGroupId, toolName: string) => {
        setToolGroupPrimaryTool((prev) => (
            prev[groupId] === toolName
                ? prev
                : { ...prev, [groupId]: toolName }
        ));
        setOpenToolGroup(null);
        setToolGroupMenuPos(null);
        handleToolClick(toolName);
    };

    const handleToolGroupButtonClick = (groupId: ToolbarToolGroupId) => {
        const group = TOOL_GROUP_BY_ID[groupId];
        const isGroupActive = group.tools.some((tool) => (TOOL_ALIAS_MAP[tool.name] || tool.name) === normalizedActiveTool);
        if (isGroupActive) {
            if (openToolGroup === groupId) {
                setOpenToolGroup(null);
                setToolGroupMenuPos(null);
            } else {
                openToolGroupMenuFor(groupId);
            }
            return;
        }

        const preferredTool = group.tools.find((tool) => tool.name === toolGroupPrimaryTool[groupId])?.name
            || group.defaultTool;
        handleToolClick(preferredTool);
    };

    useImperativeHandle(ref, () => ({
        triggerTool: (toolName: string) => handleToolClick(toolName)
    }));

    const applyShapeConfig = useCallback((obj: fabric.Object) => {
        const resolvedStrokeWidth = shapeConfig.mode === 'path'
            ? Math.max(1, shapeConfig.strokeWidth)
            : shapeConfig.strokeWidth;
        const normalizedCornerRadius = Math.max(0, Math.min(100, Math.round(shapeConfig.cornerRadius)));

        if (obj.type === 'rect') {
            (obj as fabric.Rect).set({
                rx: normalizedCornerRadius,
                ry: normalizedCornerRadius,
            });
        }

        if (['triangle', 'polygon', 'polyline', 'path', 'line'].includes(obj.type || '')) {
            obj.set({
                strokeLineJoin: normalizedCornerRadius > 0 ? 'round' : 'miter',
                strokeLineCap: normalizedCornerRadius > 0 ? 'round' : 'butt',
            });
        }

        obj.set({
            fill: shapeConfig.mode === 'path' ? 'transparent' : shapeConfig.fillColor,
            stroke: shapeConfig.strokeColor,
            strokeWidth: resolvedStrokeWidth,
            lockScalingX: shapeConfig.fixedSize,
            lockScalingY: shapeConfig.fixedSize,
            dirty: true,
        });
        (obj as ExtendedFabricObject).shapeDrawMode = shapeConfig.mode;
        (obj as ExtendedFabricObject).shapeCornerRadius = normalizedCornerRadius;
        obj.setCoords();
    }, [shapeConfig]);

    const addRectangle = () => {
        if (!canvas) return;
        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            width: 100,
            height: 100,
            rx: 0,
            ry: 0,
        });
        applyShapeConfig(rect);
        canvas.add(rect);
        focusInsertedObject(rect);
    };

    const addCircle = () => {
        if (!canvas) return;
        const circle = new fabric.Circle({
            left: 150,
            top: 150,
            radius: 50,
        });
        applyShapeConfig(circle);
        canvas.add(circle);
        focusInsertedObject(circle);
    };

    const addTriangle = () => {
        if (!canvas) return;
        const triangle = new fabric.Triangle({
            left: 200,
            top: 200,
            width: 100,
            height: 100,
        });
        applyShapeConfig(triangle);
        canvas.add(triangle);
        focusInsertedObject(triangle);
    };

    const addStar = () => {
        if (!canvas) return;

        const points = getStarPoints(5, 25, 50);
        const star = new fabric.Polygon(points, {
            left: 250,
            top: 250,
            objectCaching: false,
        }) as StarPolygon;

        // Attach custom properties for the star
        star.isStar = true;
        star.starPoints = 5;
        star.starInnerRadius = 0.5; // ratio
        applyShapeConfig(star);

        canvas.add(star);
        focusInsertedObject(star);
    };

    const addArrow = () => {
        if (!canvas) return;
        const points = [
            { x: 0, y: 20 },
            { x: 60, y: 20 },
            { x: 60, y: 0 },
            { x: 110, y: 40 },
            { x: 60, y: 80 },
            { x: 60, y: 60 },
            { x: 0, y: 60 }
        ];
        const arrow = new fabric.Polygon(points, {
            left: 120,
            top: 120,
            objectCaching: false
        });
        applyShapeConfig(arrow);
        canvas.add(arrow);
        focusInsertedObject(arrow);
    };

    const addBentArrow = () => {
        if (!canvas) return;
        const shaftThickness = 28;
        const bendX = 120;
        const shaftHeight = 110;
        const headWidth = 72;
        const headLength = 48;
        const halfThickness = shaftThickness / 2;
        const headHalf = headWidth / 2;
        const outerX = bendX + halfThickness;
        const innerX = bendX - halfThickness;
        const outerCornerRadius = 32;
        const innerCornerRadius = 10;

        const pathData = [
            'M 0 0',
            `L ${outerX - outerCornerRadius} 0`,
            `Q ${outerX} 0 ${outerX} ${outerCornerRadius}`,
            `L ${outerX} ${shaftHeight}`,
            `L ${bendX + headHalf} ${shaftHeight}`,
            `L ${bendX} ${shaftHeight + headLength}`,
            `L ${bendX - headHalf} ${shaftHeight}`,
            `L ${innerX} ${shaftHeight}`,
            `L ${innerX} ${shaftThickness + innerCornerRadius}`,
            `Q ${innerX} ${shaftThickness} ${innerX - innerCornerRadius} ${shaftThickness}`,
            `L 0 ${shaftThickness}`,
            'Z'
        ].join(' ');

        const bentArrow = new fabric.Path(pathData, {
            left: 140,
            top: 140,
            objectCaching: false
        });
        applyShapeConfig(bentArrow);
        canvas.add(bentArrow);
        focusInsertedObject(bentArrow);
    };

    const addSpeechBubble = () => {
        if (!canvas) return;
        const pathData = 'M 20 0 H 140 A 20 20 0 0 1 160 20 V 80 A 20 20 0 0 1 140 100 H 70 L 50 120 L 50 100 H 20 A 20 20 0 0 1 0 80 V 20 A 20 20 0 0 1 20 0 Z';
        const bubble = new fabric.Path(pathData, {
            left: 140,
            top: 140,
            objectCaching: false
        });
        applyShapeConfig(bubble);
        canvas.add(bubble);
        focusInsertedObject(bubble);
    };

    const addCloud = () => {
        if (!canvas) return;
        const pathData = [
            'M 34 86',
            'C 12 86 4 60 22 48',
            'C 22 28 42 14 60 26',
            'C 72 8 102 14 108 38',
            'C 128 38 136 64 118 76',
            'C 114 88 100 96 84 94',
            'H 34',
            'Z'
        ].join(' ');
        const cloud = new fabric.Path(pathData, {
            left: 150,
            top: 150,
            objectCaching: false,
        });
        applyShapeConfig(cloud);
        canvas.add(cloud);
        focusInsertedObject(cloud);
    };

    const addThoughtBubble = () => {
        if (!canvas) return;
        const pathData = [
            'M 20 54',
            'C 20 28 42 10 72 10',
            'C 102 10 126 28 126 54',
            'C 126 80 102 98 72 98',
            'C 58 98 46 94 36 88',
            'C 30 90 26 98 24 106',
            'C 22 98 20 92 16 86',
            'C 16 86 20 78 20 54',
            'Z',
            'M 16 116 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 Z',
            'M 4 132 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 Z'
        ].join(' ');
        const thoughtBubble = new fabric.Path(pathData, {
            left: 150,
            top: 140,
            objectCaching: false,
        });
        applyShapeConfig(thoughtBubble);
        canvas.add(thoughtBubble);
        focusInsertedObject(thoughtBubble);
    };

    const addHexagon = () => {
        if (!canvas) return;
        const points = [
            { x: 50, y: 0 },
            { x: 100, y: 28 },
            { x: 100, y: 84 },
            { x: 50, y: 112 },
            { x: 0, y: 84 },
            { x: 0, y: 28 }
        ];
        const hexagon = new fabric.Polygon(points, {
            left: 130,
            top: 130,
            objectCaching: false,
        });
        applyShapeConfig(hexagon);
        canvas.add(hexagon);
        focusInsertedObject(hexagon);
    };

    const addDiamond = () => {
        if (!canvas) return;
        const points = [
            { x: 56, y: 0 },
            { x: 112, y: 56 },
            { x: 56, y: 112 },
            { x: 0, y: 56 }
        ];
        const diamond = new fabric.Polygon(points, {
            left: 130,
            top: 130,
            objectCaching: false,
        });
        applyShapeConfig(diamond);
        canvas.add(diamond);
        focusInsertedObject(diamond);
    };

    const createAdjustmentLayer = (type: AdjustmentLayerType) => {
        if (!canvas) return;
        (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('adjustment:create', { type });
        setShowAdjustmentMenu(false);
        openPropertiesPanel();
    };

    const add3DPlaceholder = (url: string, nameOverride?: string) => {
        if (!canvas) return;

        const group = new fabric.Group([], {
            left: 150,
            top: 150,
            subTargetCheck: true,
            interactive: true
        });

        const box = new fabric.Rect({
            width: 80,
            height: 80,
            fill: '#3b82f6',
            rx: 10,
            ry: 10,
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 5, offsetY: 5 })
        });

        const text = new fabric.IText('3D', {
            fontSize: 30,
            fill: 'white',
            left: 20,
            top: 25,
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            selectable: false
        });

        group.add(box);
        group.add(text);

        // Attach metadata
        (group as ThreeDGroup).is3DModel = true;
        (group as ThreeDGroup).modelUrl = url;
        const displayName = nameOverride || getFileDisplayName(url);
        if (displayName) {
            (group as ExtendedFabricObject).name = displayName;
        }

        canvas.add(group);
        focusInsertedObject(group);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !canvas) return;

        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';

        // If 'media' tool button was used, we assume it's a direct upload.
        // User asked: "when i select add asset it should have check box ask if i want store on server"
        // The Asset Library component handles this best.
        // But if we stick to the old 'media' button just putting it on canvas, we miss the feature.
        // Let's rely on the new Asset Library for uploading with options.
        // The old media button behavior is preserved here for quick ephemeral access.

        const looksLikeImage = file.type.startsWith('image/') || !!getImageFormatEntry(file.name);
        if (!looksLikeImage) {
            toast({
                title: t('toolbar.unsupportedFile'),
                description: t('toolbar.unsupportedFileBody'),
                variant: 'warning'
            });
            return;
        }

        void (async () => {
            let blob: Blob = file;
            try {
                const decoded = await ensureDisplayableImage(file);
                blob = decoded.blob;
                if (decoded.convertedFromLabel) {
                    toast({
                        title: `Converted from ${decoded.convertedFromLabel}`,
                        description: decoded.isPreviewOnly
                            ? 'Placed the embedded preview image on the canvas.'
                            : 'Converted to PNG for editing.',
                        variant: 'default'
                    });
                }
            } catch (error) {
                toast({
                    title: t('toolbar.unsupportedFile'),
                    description: error instanceof Error ? error.message : 'Could not open this file.',
                    variant: 'warning'
                });
                return;
            }

            const reader = new FileReader();
            reader.onload = (f) => {
                const data = f.target?.result as string;
                loadDataUrlToCanvas(data, file.name);
            };
            reader.readAsDataURL(blob);
        })();
    };

    const loadDataUrlToCanvas = (data: string, nameOverride?: string) => {
        if (!canvas) return;
        fabric.Image.fromURL(data, {
            crossOrigin: 'anonymous'
        }).then((img) => {
            const isDataUrl = data.startsWith('data:');
            const displayName = nameOverride || (!isDataUrl ? getFileDisplayName(data) : undefined);
            const ext = img as ExtendedFabricObject;
            if (displayName) {
                ext.name = displayName;
            }
            if (!isDataUrl && data.includes('/assets/generated/')) {
                ext.aiGenerated = true;
            }
            // Use Artboard dimensions if available, else fallback to canvas or default
            const artboard = (canvas as CanvasWithArtboard).artboard || { width: canvas.width || 800, height: canvas.height || 600 };
            const targetWidth = artboard.width;
            const targetHeight = artboard.height;

            // Scale down if larger than 80% of canvas/artboard to ensure visibility
            if (img.width! > targetWidth * 0.8 || img.height! > targetHeight * 0.8) {
                const scaleX = (targetWidth * 0.8) / img.width!;
                const scaleY = (targetHeight * 0.8) / img.height!;
                const finalScale = Math.min(scaleX, scaleY);
                img.scale(finalScale);
            }

            canvas.add(img);
            focusInsertedObject(img);
        }).catch((err) => {
            console.error("Error loading image:", err);
        });
    }

    const getFileDisplayName = (url: string) => {
        try {
            const cleanUrl = url.split('?')[0];
            const segments = cleanUrl.split('/');
            return decodeURIComponent(segments[segments.length - 1] || url);
        } catch {
            return url;
        }
    };

    const addMediaPlaceholder = (mediaType: 'video' | 'audio', url: string) => {
        if (!canvas) return;

        const isVideo = mediaType === 'video';
        const width = isVideo ? 320 : 280;
        const height = isVideo ? 180 : 90;
        const accent = isVideo ? '#38bdf8' : '#22c55e';
        const baseFill = isVideo ? '#101827' : '#11211c';
        const symbol = isVideo ? '▶' : '♪';
        const labelText = isVideo ? 'VIDEO' : 'AUDIO';
        const fileName = getFileDisplayName(url);

        const background = new fabric.Rect({
            width,
            height,
            rx: 16,
            ry: 16,
            fill: baseFill,
            stroke: `${accent}55`,
            strokeWidth: 2,
            originX: 'center',
            originY: 'center'
        });

        const symbolText = new fabric.Text(symbol, {
            fontSize: isVideo ? 52 : 40,
            fill: accent,
            fontWeight: 'bold',
            fontFamily: 'Inter, system-ui, sans-serif',
            originX: 'center',
            originY: 'center',
            top: isVideo ? -6 : -4
        });

        const mediaLabel = new fabric.Text(labelText, {
            fontSize: 14,
            fontWeight: 'bold',
            fill: '#e2e8f0',
            fontFamily: 'Inter, system-ui, sans-serif',
            originX: 'center',
            originY: 'center',
            top: -height / 2 + 24
        });

        const fileLabel = new fabric.Textbox(fileName, {
            fontSize: 12,
            fill: '#e0f2f1',
            fontFamily: 'Inter, system-ui, sans-serif',
            originX: 'center',
            originY: 'center',
            width: width - 40,
            textAlign: 'center',
            top: height / 2 - 28,
            splitByGrapheme: true
        });

        const group = new fabric.Group([background, symbolText, mediaLabel, fileLabel], {
            originX: 'center',
            originY: 'center',
            padding: 12
        });

        (group as ExtendedFabricObject).mediaType = mediaType;
        (group as ExtendedFabricObject).mediaSource = url;
        (group as ExtendedFabricObject).name = `${labelText}: ${fileName}`;

        canvas.add(group);
        focusInsertedObject(group);
    };

    const addVideoPlaceholder = (url: string) => addMediaPlaceholder('video', url);
    const addAudioPlaceholder = (url: string) => addMediaPlaceholder('audio', url);

    const handleSaveTemplateTrigger = () => {
        if (!canvas) return;
        setShowSaveModal(true);
    };

    const handleSaveTemplateConfirm = async (name: string) => {
        if (!canvas) return;
        setShowSaveModal(false);

        try {
            // Include custom properties in serialization
            const json = canvas.toObject(CUSTOM_SERIALIZED_PROPS);
            const artboardSize = getArtboardSize(canvas);
            if (artboardSize) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (json as any).artboard = artboardSize;
            }
            const profile = loadProfileSettings();
            if (profile?.embedInfo) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (json as any).meta = { ...(json as any).meta, profileInfo: profile };
            }

            let overlay: fabric.Textbox | null = null;
            if (profile?.embedInfo) {
                const lines: string[] = [];
                if (profile.displayName) lines.push(profile.displayName);
                if (profile.username) lines.push(`@${profile.username}`);
                if (profile.email) lines.push(profile.email);
                if (profile.info) lines.push(profile.info);
                const text = lines.join('\n');

                if (text) {
                    const padding = 12;
                    const width = Math.min(320, Math.max(160, (canvas.width || 0) * 0.35));
                    overlay = new fabric.Textbox(text, {
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
                    canvas.requestRenderAll();
                }
            }

            const dataUrl = canvas.toDataURL({
                format: 'png',
                multiplier: 0.5,
                quality: 0.8
            });

            if (overlay) {
                canvas.remove(overlay);
                canvas.requestRenderAll();
            }

            const res = await fetch('/api/templates/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    canvasData: json,
                    thumbnailDataUrl: dataUrl
                })
            });

            const data = await res.json();
            if (data.success) {
                // Trigger refresh
                setRefreshTemplatesTrigger(prev => prev + 1);
            } else {
                toast({
                    title: t('toolbar.saveFailed'),
                    description: data.message || 'Unable to save template.',
                    variant: 'destructive'
                });
            }
        } catch (err) {
            console.error(err);
            toast({ title: t('toolbar.saveFailed'), description: t('toolbar.saveTemplateError'), variant: 'destructive' });
        }
    };

    const handleLoadTemplate = (url: string) => {
        if (!canvas) return;
        fetch(url)
            .then(res => res.json())
            .then(json => {
                // Note: canvas.loadFromJSON() already clears existing objects
                // internally; calling canvas.clear() first would also remove
                // the (excludeFromExport) artboard rect before load, leaving
                // the page with no visible artboard afterward.
                const artboardSize = (json as { artboard?: { width?: number; height?: number } })?.artboard;
                canvas.loadFromJSON(json, () => {
                    if (artboardSize?.width && artboardSize?.height) {
                        applyArtboardSize(canvas, artboardSize.width, artboardSize.height);
                    }
                    canvas.requestRenderAll();
                    setActiveTool('select');
                });
            })
            .catch(err => {
                console.error("Error loading template", err);
                toast({ title: t('toolbar.loadFailed'), description: t('toolbar.loadTemplateError'), variant: 'destructive' });
            });
    }

    return (
        <div
            className="relative self-stretch origin-left flex min-h-0 w-full flex-col items-start pt-2"
            data-testid="toolbar-rail-host"
            onMouseEnter={enableHoverLabels ? () => setIsRailHovered(true) : undefined}
            onMouseLeave={enableHoverLabels ? () => setIsRailHovered(false) : undefined}
        >
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={buildImageAcceptAttribute()}
                onChange={handleFileChange}
            />
            <input
                type="color"
                ref={foregroundColorInputRef}
                className="hidden"
                value={foregroundColor}
                onChange={(event) => handleForegroundColorChange(event.target.value)}
                aria-label={t('toolbar.fgPicker')}
            />
            <input
                type="color"
                ref={backgroundColorInputRef}
                className="hidden"
                value={backgroundColor}
                onChange={(event) => handleBackgroundColorChange(event.target.value)}
                aria-label={t('toolbar.bgPicker')}
            />
            <div
                className={cn(
                    'ml-[10px] flex min-h-0 flex-1 max-h-full overflow-y-auto flex-col items-stretch gap-1 rounded-md border border-border/60 bg-card/90 p-1 backdrop-blur-sm scrollbar-thin transition-[width] duration-200 ease-out',
                    isRailExpanded ? 'w-56 shadow-xl' : 'w-10'
                )}
                data-testid="toolbar-rail"
            >
                {TOOL_GROUPS.map((group) => {
                    const isGroupActive = group.tools.some((tool) => (TOOL_ALIAS_MAP[tool.name] || tool.name) === normalizedActiveTool);
                    const activeGroupTool = group.tools.find((tool) => (TOOL_ALIAS_MAP[tool.name] || tool.name) === normalizedActiveTool);
                    const primaryTool = activeGroupTool
                        || group.tools.find((tool) => tool.name === toolGroupPrimaryTool[group.id])
                        || group.tools[0];
                    const groupButtonRef = getToolGroupButtonRef(group.id);
                    return (
                        <button
                            key={group.id}
                            onClick={() => handleToolGroupButtonClick(group.id)}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                openToolGroupMenuFor(group.id);
                            }}
                            ref={groupButtonRef}
                            className={cn(
                                'relative rounded-sm flex transition-colors z-20',
                                railButtonLayoutClass,
                                (isGroupActive || openToolGroup === group.id)
                                    ? "bg-tool-accent text-tool-accent-foreground"
                                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            )}
                            title={`${t(group.labelKey)} (${t(primaryTool.labelKey)})`}
                            aria-label={`${t(group.labelKey)} (${t(primaryTool.labelKey)})`}
                        >
                            <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
                                <primaryTool.icon size={16} />
                            </span>
                            {isRailExpanded && (
                                <span className={railLabelClass}>
                                    {t(primaryTool.shortLabelKey ?? primaryTool.labelKey)}
                                </span>
                            )}
                            <span className="pointer-events-none absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                        </button>
                    );
                })}

                <div className="my-0.5 h-px w-full bg-border/60" />

                {CREATION_PRIMARY_TOOLS.map((tool) => {
                    const isToolActive = (TOOL_ALIAS_MAP[tool.name] || tool.name) === normalizedActiveTool;
                    return (
                        <button
                            key={tool.name}
                            onClick={() => handleToolClick(tool.name)}
                            ref={tool.name === 'shapes' ? shapesButtonRef : tool.name === 'adjustments' ? adjustmentsButtonRef : undefined}
                            className={cn(
                                'rounded-sm flex transition-colors z-20',
                                railButtonLayoutClass,
                                isToolActive
                                    ? "bg-tool-accent text-tool-accent-foreground"
                                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            )}
                            title={t(tool.labelKey)}
                            aria-label={t(tool.labelKey)}
                        >
                            <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
                                <tool.icon size={16} />
                            </span>
                            {isRailExpanded && (
                                <span className={railLabelClass}>
                                    {t(tool.shortLabelKey ?? tool.labelKey)}
                                </span>
                            )}
                        </button>
                    );
                })}

                <div className="my-0.5 h-px w-full bg-border/60" />

                {CREATION_LIBRARY_TOOLS.map((tool) => {
                    const isToolActive = (TOOL_ALIAS_MAP[tool.name] || tool.name) === normalizedActiveTool;
                    return (
                        <button
                            key={tool.name}
                            onClick={() => handleToolClick(tool.name)}
                            className={cn(
                                'rounded-sm flex transition-colors z-20',
                                railButtonLayoutClass,
                                isToolActive
                                    ? "bg-tool-accent text-tool-accent-foreground"
                                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            )}
                            title={t(tool.labelKey)}
                            aria-label={t(tool.labelKey)}
                        >
                            <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
                                <tool.icon size={16} />
                            </span>
                            {isRailExpanded && (
                                <span className={railLabelClass}>
                                    {t(tool.shortLabelKey ?? tool.labelKey)}
                                </span>
                            )}
                        </button>
                    );
                })}

                <div className="my-0.5 h-px w-full bg-border/60" />

                {WORKSPACE_UTILITY_TOOLS.map((tool) => {
                    const isToolActive = (TOOL_ALIAS_MAP[tool.name] || tool.name) === normalizedActiveTool;
                    return (
                        <button
                            key={tool.name}
                            onClick={() => handleToolClick(tool.name)}
                            className={cn(
                                'rounded-sm flex transition-colors z-20',
                                railButtonLayoutClass,
                                isToolActive
                                    ? "bg-tool-accent text-tool-accent-foreground"
                                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            )}
                            title={t(tool.labelKey)}
                            aria-label={t(tool.labelKey)}
                        >
                            <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
                                <tool.icon size={16} />
                            </span>
                            {isRailExpanded && (
                                <span className={railLabelClass}>
                                    {t(tool.shortLabelKey ?? tool.labelKey)}
                                </span>
                            )}
                        </button>
                    );
                })}

                <div className="my-0.5 h-px w-full bg-border/60" />

                <div
                    className={cn(
                        'flex w-full rounded-sm',
                        isRailExpanded ? 'items-center gap-2 px-2 py-1' : 'flex-col items-center gap-1 py-1'
                    )}
                >
                    <button
                        type="button"
                        title={t('toolbar.foregroundColor')}
                        aria-label={t('toolbar.foregroundColor')}
                        onClick={() => foregroundColorInputRef.current?.click()}
                        className={cn(
                            'relative shrink-0 overflow-hidden rounded-full border border-border/70 shadow-sm',
                            isRailExpanded ? 'h-7 w-7' : 'h-6 w-6'
                        )}
                        style={{ backgroundColor: foregroundColor }}
                    />
                    <button
                        type="button"
                        title={t('toolbar.swapColors')}
                        aria-label={t('toolbar.swapColors')}
                        onClick={handleSwapToolbarColors}
                        className={cn(
                            'inline-flex items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-colors',
                            isRailExpanded ? 'h-7 w-7' : 'h-6 w-6'
                        )}
                    >
                        <ArrowUpDown size={14} />
                    </button>
                    <button
                        type="button"
                        title={t('toolbar.backgroundColor')}
                        aria-label={t('toolbar.backgroundColor')}
                        onClick={() => backgroundColorInputRef.current?.click()}
                        className={cn(
                            'relative shrink-0 overflow-hidden rounded-full border border-border/70 shadow-sm',
                            isRailExpanded ? 'h-7 w-7' : 'h-6 w-6'
                        )}
                        style={{ backgroundColor: backgroundColor }}
                    />
                    {isRailExpanded && <span className={railMetaLabelClass}>{t('toolbar.fgbg')}</span>}
                </div>
            </div>

            {/* Pen Options now moved to PropertiesPanel (Right Sidebar) to avoid squishing */}

            {openToolGroup && toolGroupMenuPos && typeof document !== 'undefined' && createPortal(
                <div
                    ref={toolGroupMenuRef}
                    style={{ left: toolGroupMenuPos.left, top: toolGroupMenuPos.top }}
                    className="fixed bg-card border border-border rounded-lg shadow-xl p-2 grid grid-cols-1 gap-1 z-[2000] w-52 animate-in fade-in slide-in-from-left-2 duration-150"
                >
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                        {t(TOOL_GROUP_BY_ID[openToolGroup].labelKey)}
                    </div>
                    {TOOL_GROUP_BY_ID[openToolGroup].tools.map((tool) => {
                        const isToolActive = (TOOL_ALIAS_MAP[tool.name] || tool.name) === normalizedActiveTool;
                        return (
                            <button
                                key={tool.name}
                                onClick={() => handleToolGroupMenuSelect(openToolGroup, tool.name)}
                                className={cn(
                                    "flex items-center gap-2 p-2 rounded transition-colors text-[11px]",
                                    isToolActive
                                        ? "bg-tool-accent text-tool-accent-foreground"
                                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                )}
                            >
                                <tool.icon size={15} />
                                <span>{t(tool.labelKey)}</span>
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}

            {/* Template Library */}
            {activeTool === 'templates' && (
                <TemplateLibrary
                    key={refreshTemplatesTrigger}
                    onClose={() => setActiveTool('select')}
                    onSelect={handleLoadTemplate}
                    onSaveCurrent={handleSaveTemplateTrigger}
                />
            )}

            {(activeTool === 'color-wheel' || activeTool === 'eyedropper') && (
                <BodyPortal>
                    <ColorWheelTool
                        onColorSelect={(color) => {
                            setForegroundColor(color);
                            syncToolbarColorsToCanvas(color, backgroundColor);
                        }}
                        currentPalette={activePalette || null}
                        onPaletteSelect={(palette) => {
                            if (setActivePalette) setActivePalette(palette);
                        }}
                        selectedColor={foregroundColor}
                    />
                </BodyPortal>
            )}

            {/* AI Image Generation (Zone Selector Overlay) */}
            {activeTool === 'ai-zone' && canvas && (
                <ImageGeneratorModal
                    canvas={canvas}
                    onClose={() => setActiveTool('select')}
                    onOpenSettings={onOpenSettings}
                    apiKey={apiKeys?.stability}
                    currentUser={currentUser}
                />
            )}

            {activeTool === 'ai-critique' && canvas && (
                <BodyPortal>
                    <AICritiqueModal
                        canvas={canvas}
                        onClose={() => setActiveTool('select')}
                    />
                </BodyPortal>
            )}

            {activeTool === 'ai-brand-manager' && canvas && (
                <BodyPortal>
                    <BrandManagerModal
                        canvas={canvas}
                        onClose={() => setActiveTool('select')}
                    />
                </BodyPortal>
            )}

            {activeTool === 'super-agent' && canvas && (
                <BodyPortal>
                    <SuperAgentModal
                        canvas={canvas}
                        onClose={() => setActiveTool('select')}
                    />
                </BodyPortal>
            )}

            {/* ComfyUI Workflow Browser & Runner */}
            {activeTool === 'comfy-flows' && canvas && (
                <BodyPortal>
                    <ComfyWorkflowsModal
                        canvas={canvas}
                        onClose={() => setActiveTool('select')}
                        onOpenSettings={onOpenSettings}
                    />
                </BodyPortal>
            )}

            {showSaveModal && (
                <InputModal
                    isOpen={showSaveModal}
                    title={t('toolbar.saveTemplate')}
                    description={t('toolbar.saveTemplateDescription')}
                    placeholder={t('toolbar.saveTemplatePlaceholder')}
                    confirmLabel={t('toolbar.saveTemplate')}
                    onConfirm={handleSaveTemplateConfirm}
                    onCancel={() => setShowSaveModal(false)}
                />
            )}

            {/* Asset Library */}
            {activeTool === 'assets' && (
                <AssetLibrary
                    currentUser={currentUser}
                    onClose={() => setActiveTool('select')}
                    onSelect={(path, type, name) => {
                        if (type === 'models') {
                            if (onOpen3DEditor) {
                                onOpen3DEditor(path);
                                setActiveTool('select');
                            } else {
                                add3DPlaceholder(path, name);
                            }
                        } else if (type === 'videos') {
                            addVideoPlaceholder(path);
                            setActiveTool('select');
                        } else if (type === 'audio') {
                            addAudioPlaceholder(path);
                            setActiveTool('select');
                        } else {
                            loadDataUrlToCanvas(path, name || getFileDisplayName(path));
                        }
                    }}
                />
            )}

            {showShapesMenu && shapesMenuPos && typeof document !== 'undefined' && createPortal(
                <div
                    ref={shapesMenuRef}
                    style={{ left: shapesMenuPos.left, top: shapesMenuPos.top }}
                    className="fixed bg-card border border-border rounded-lg shadow-xl p-3 grid grid-cols-2 gap-2 z-[2000] w-44 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                    <div
                        className="col-span-2 -mx-1 px-1 pb-2 mb-1 border-b border-border/60 flex items-center justify-between cursor-move select-none"
                        onMouseDown={beginMenuDrag('shapes')}
                    >
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('toolbar.shapes')}</span>
                        <span className="text-[10px] text-muted-foreground/80">{t('toolbar.drag')}</span>
                    </div>
                    <button onClick={addRectangle} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Square size={20} />
                        <span className="text-[10px]">{t('shape.rect')}</span>
                    </button>
                    <button onClick={addCircle} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Circle size={20} />
                        <span className="text-[10px]">{t('shape.circle')}</span>
                    </button>
                    <button onClick={addTriangle} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Triangle size={20} />
                        <span className="text-[10px]">{t('shape.triangle')}</span>
                    </button>
                    <button onClick={addStar} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Star size={20} />
                        <span className="text-[10px]">{t('shape.star')}</span>
                    </button>
                    <button onClick={addArrow} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <ArrowRight size={20} />
                        <span className="text-[10px]">{t('shape.arrow')}</span>
                    </button>
                    <button onClick={addBentArrow} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <CornerDownRight size={20} />
                        <span className="text-[10px]">{t('shape.bentArrow')}</span>
                    </button>
                    <button onClick={addSpeechBubble} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <MessageSquare size={20} />
                        <span className="text-[10px]">{t('shape.bubble')}</span>
                    </button>
                    <button onClick={addThoughtBubble} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <MessageCircle size={20} />
                        <span className="text-[10px]">{t('shape.thought')}</span>
                    </button>
                    <button onClick={addCloud} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Cloud size={20} />
                        <span className="text-[10px]">{t('shape.cloud')}</span>
                    </button>
                    <button onClick={addHexagon} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Hexagon size={20} />
                        <span className="text-[10px]">{t('shape.hexagon')}</span>
                    </button>
                    <button onClick={addDiamond} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Diamond size={20} />
                        <span className="text-[10px]">{t('shape.diamond')}</span>
                    </button>
                </div>,
                document.body
            )}

            {showAdjustmentMenu && adjustmentMenuPos && typeof document !== 'undefined' && createPortal(
                <div
                    ref={adjustmentMenuRef}
                    style={{ left: adjustmentMenuPos.left, top: adjustmentMenuPos.top }}
                    className="fixed bg-card border border-border rounded-lg shadow-xl p-3 grid grid-cols-1 gap-2 z-[2000] w-56 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                    <div
                        className="-mx-1 px-1 pb-2 mb-1 border-b border-border/60 flex items-center justify-between cursor-move select-none"
                        onMouseDown={beginMenuDrag('adjustments')}
                    >
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('toolbar.adjustmentLayers')}</span>
                        <span className="text-[10px] text-muted-foreground/80">{t('toolbar.drag')}</span>
                    </div>
                    <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">{t('adjust.group.basic')}</div>
                        <button onClick={() => createAdjustmentLayer('brightness-contrast')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.brightness-contrast')}
                        </button>
                        <button onClick={() => createAdjustmentLayer('hue-saturation')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.hue-saturation')}
                        </button>
                        <button onClick={() => createAdjustmentLayer('exposure')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.exposure')}
                        </button>
                        <button onClick={() => createAdjustmentLayer('saturation-vibrance')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.saturation-vibrance')}
                        </button>
                    </div>
                    <div className="space-y-2 pt-1 border-t border-border/50">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">{t('adjust.group.tonal')}</div>
                        <button onClick={() => createAdjustmentLayer('levels')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.levels')}
                        </button>
                        <button onClick={() => createAdjustmentLayer('curves')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.curves')}
                        </button>
                        <button onClick={() => createAdjustmentLayer('black-white')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.black-white')}
                        </button>
                    </div>
                    <div className="space-y-2 pt-1 border-t border-border/50">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">{t('adjust.group.color')}</div>
                        <button onClick={() => createAdjustmentLayer('color-balance')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.color-balance')}
                        </button>
                        <button onClick={() => createAdjustmentLayer('light-and-color')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.light-and-color')}
                        </button>
                        <button onClick={() => createAdjustmentLayer('solid-color')} className="w-full flex items-center justify-start px-2.5 py-1.5 hover:bg-secondary rounded border border-border/40 bg-background/60 transition-colors text-foreground text-[11px]">
                            {t('adjust.solid-color')}
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {showExtraMenu && extraMenuPos && typeof document !== 'undefined' && createPortal(
                <div
                    ref={extraMenuRef}
                    style={{ left: extraMenuPos.left, top: extraMenuPos.top }}
                    className="fixed bg-card border border-border rounded-lg shadow-xl p-3 grid grid-cols-1 gap-2 z-[2000] w-44 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                    <div
                        className="-mx-1 px-1 pb-2 mb-1 border-b border-border/60 flex items-center justify-between cursor-move select-none"
                        onMouseDown={beginMenuDrag('extra')}
                    >
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('toolbar.add')}</span>
                        <span className="text-[10px] text-muted-foreground/80">{t('toolbar.drag')}</span>
                    </div>
                    <button onClick={() => { setActiveTool('ai-zone'); setShowExtraMenu(false); }} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        <Wand2 size={16} />
                        {t('toolbar.aiZone')}
                    </button>
                    <button onClick={() => { setActiveTool('3d-gen'); setShowExtraMenu(false); }} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        <Box size={16} />
                        {t('toolbar.ai3d')}
                    </button>
                </div>,
                document.body
            )}
        </div>
    );
});

Toolbar.displayName = 'Toolbar';

export default Toolbar;
