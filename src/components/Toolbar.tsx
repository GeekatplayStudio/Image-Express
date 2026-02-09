'use client';
import { useEffect, useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import * as fabric from 'fabric';
import { Type, Square, Image as ImageIcon, LayoutTemplate, Shapes, Circle, Triangle, Star, Move, Layers, Box, Wand2, PaintBucket, Brush, Blend, ArrowRight, MessageSquare, PenTool, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExtendedFabricObject, PenNode, ColorPalette, StarPolygon, AdjustmentLayerType, ThreeDGroup } from '@/types';
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
import { ColorWheelTool } from './ColorWheelTool';
import { useToast } from '@/providers/ToastProvider';
import { loadProfileSettings } from '@/lib/profile-utils';

/**
 * Toolbar
 * Left sidebar providing access to all creation tools.
 * Manages active tool state and sub-menus (Shapes, Assets).
 */
interface ToolbarProps {
    canvas: fabric.Canvas | null;
    activeTool: string;
    setActiveTool: (tool: string) => void;
    onOpen3DEditor?: (url: string) => void;
    apiKeys?: { stability?: string };
    activePalette?: ColorPalette | null;
    setActivePalette?: (palette: ColorPalette | null) => void;
}

export type ToolbarHandle = {
    triggerTool: (toolName: string) => void;
};

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number };
};

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

const configureCanvasForTool = (canvas: fabric.Canvas, tool: string) => {
    if (tool === 'select') {
        // canvas.discardActiveObject(); // Don't clear selection when switching to select tool
        canvas.requestRenderAll();
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        canvas.selection = true;
    } else if (tool === 'gradient') {
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        canvas.selection = false;
    } else if (tool === 'pen') {
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        canvas.selection = false;
    }
};

type PenClosure = 'open' | 'closed';
type BezierPathObject = fabric.Path & ExtendedFabricObject;
type PenDraftLineObject = fabric.Object;
type PenAnchorObject = fabric.Circle & { isPenDraftAnchor?: boolean; penAnchorIndex?: number };

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

const distanceBetween = (a: PenPoint, b: PenPoint) => Math.hypot(a.x - b.x, a.y - b.y);

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

const getScenePointFromPathPoint = (pathObj: fabric.Path, point: PenPoint): fabric.Point => {
    const transformPoint = (fabric.util as unknown as { transformPoint: (point: fabric.Point, transform: number[]) => fabric.Point }).transformPoint;
    const pathOffset = pathObj.pathOffset || new fabric.Point(0, 0);
    const localPoint = new fabric.Point(point.x - pathOffset.x, point.y - pathOffset.y);
    return transformPoint(localPoint, pathObj.calcTransformMatrix());
};

const getPathPointFromScenePoint = (pathObj: fabric.Path, point: PenPoint): PenPoint => {
    const transformPoint = (fabric.util as unknown as { transformPoint: (point: fabric.Point, transform: number[]) => fabric.Point }).transformPoint;
    const invertTransform = (fabric.util as unknown as { invertTransform: (transform: number[]) => number[] }).invertTransform;
    const inverse = invertTransform(pathObj.calcTransformMatrix());
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
            const anchorPoint = getScenePointFromPathPoint(target, { x: node.x, y: node.y });
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
                return getScenePointFromPathPoint(target, { x: node.x, y: node.y });
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
                    return getScenePointFromPathPoint(target, node[handleKey]);
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

const Toolbar = forwardRef<ToolbarHandle, ToolbarProps>(({ canvas, activeTool, setActiveTool, onOpen3DEditor, apiKeys, activePalette, setActivePalette }, ref) => {
    const { toast } = useToast();
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

    // Reordered tools based on standard workflows
    const tools = [
        { name: 'select', icon: Move, label: 'Select' },
        { name: 'paint', icon: Brush, label: 'Brush' },
        { name: 'pen', icon: PenTool, label: 'Pen' },
        { name: 'shapes', icon: Shapes, label: 'Shapes' },
        { name: 'text', icon: Type, label: 'Text' },
        { name: 'gradient', icon: PaintBucket, label: 'Fill / Gradient' },
        { name: 'assets', icon: ImageIcon, label: 'Gallery' },
        { name: 'templates', icon: LayoutTemplate, label: 'Library' },
        { name: 'adjustments', icon: Blend, label: 'Adjustments' },
        { name: 'layers', icon: Layers, label: 'Layers' },
        { name: 'ai-zone', icon: Wand2, label: 'AI Zone' },
        { name: '3d-gen', icon: Box, label: 'AI 3D' },
        { name: 'color-wheel', icon: Palette, label: 'Color' },
    ];

    const [penPoints, setPenPoints] = useState<PenPoint[]>([]);
    const [penAnchors, setPenAnchors] = useState<PenAnchorObject[]>([]);
    const penActiveLineRef = useRef<PenDraftLineObject | null>(null);
    const penAnchorsRef = useRef<PenAnchorObject[]>([]);
    const [penMode, setPenMode] = useState<PenModeSetting>('straight');
    const [penClosure, setPenClosure] = useState<PenClosure>('open');

    useEffect(() => {
        penAnchorsRef.current = penAnchors;
    }, [penAnchors]);

    useEffect(() => {
        if (!canvas || activeTool !== 'pen') return;

        const currentLine = penActiveLineRef.current;
        if (currentLine) {
            canvas.remove(currentLine);
            penActiveLineRef.current = null;
        }

        const nextLine = createPenDraftLine(penPoints, penMode, penClosure);
        if (!nextLine) {
            canvas.requestRenderAll();
            return;
        }

        canvas.add(nextLine);
        penActiveLineRef.current = nextLine;
        penAnchorsRef.current.forEach((anchor) => canvas.bringObjectToFront(anchor));
        canvas.requestRenderAll();
    }, [activeTool, canvas, penClosure, penMode, penPoints]);

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
    }, [canvas]);

    const finishPenPath = useCallback(() => {
        if (!canvas) {
            clearPenDraft();
            return;
        }
        const isClosed = penClosure === 'closed';
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
            objectCaching: false
        };

        // Normalize points to be relative to bounding box top-left
        // This ensures controls stay valid even if object is moved/transformed
        const minX = Math.min(...finalPoints.map(p => p.x));
        const minY = Math.min(...finalPoints.map(p => p.y));
        const normalizedPoints = finalPoints.map(p => ({ x: p.x - minX, y: p.y - minY }));

        // Always create a BezierPathObject to ensure it's editable
        let nodes: PenNode[] = [];
        if (penMode === 'straight') {
             nodes = buildStraightNodes(normalizedPoints);
        } else {
             nodes = buildAutoBezierNodes(normalizedPoints, isClosed);
        }

        const pathData = buildBezierPathData(nodes, isClosed);
        const bezierPath = new fabric.Path(pathData, {
            ...objectBaseProps,
            left: minX,
            top: minY
        }) as BezierPathObject;

        bezierPath.set({
            isPenPath: true,
            penMode: 'bezier',
            penClosed: isClosed,
            penNodes: nodes, // Stored as relative
            penSourcePoints: finalPoints.map((point) => ({ ...point })) // Keep original source if needed, or update? Better to keep source as relative too if we reload?
            // Actually, penSourcePoints (raw clicks) are less critical than penNodes (bezier state).
            // Let's store relative source points too to be consistent.
            // penSourcePoints: normalizedPoints
        });
        // We actually want penSourcePoints to be relative so we can rebuild from them if needed.
        bezierPath.penSourcePoints = normalizedPoints;
        
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
        canvas.setActiveObject(createdObject);
        
        // Ensure new layer is clearly visible and editable
        canvas.requestRenderAll();

        setPenPoints([]);
        penActiveLineRef.current = null;
        // Stay in Pen Tool for continuous drawing
    }, [canvas, clearPenDraft, penAnchors, penClosure, penMode, penPoints]);

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
            points: penPoints.length
        });
    }, [canvas, penClosure, penMode, penPoints.length]);

    // Pen Tool Logic (Interactive Polyline)
    useEffect(() => {
        if (!canvas) return;

        const createAnchor = (point: PenPoint, index: number) => {
            const anchor = new fabric.Circle({
                left: point.x,
                top: point.y,
                radius: 5,
                fill: PEN_HANDLE_COLOR,
                stroke: PEN_ANCHOR_COLOR,
                strokeWidth: 2,
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
            if (!opt.scenePoint) return;
            const target = opt.target as fabric.Object | null | undefined;
            if (isPenDraftAnchor(target)) {
                if (penClosure === 'closed' && target.penAnchorIndex === 0 && penPoints.length > 2) {
                    finishPenPath();
                }
                return;
            }
            const pointer = opt.scenePoint;
            const pointerPoint = { x: pointer.x, y: pointer.y };

            // Check validity of closing loop
            if (penClosure === 'closed' && penPoints.length > 2) {
                const first = penPoints[0];
                const dist = distanceBetween(pointerPoint, first);
                if (dist < 20) {
                    finishPenPath();
                    return;
                }
            }

            // START or CONTINUE
            const points = [...penPoints, pointerPoint];
            setPenPoints(points);
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

        const handleMouseMove = () => {
            if (activeTool !== 'pen' || penPoints.length === 0) return;
            // Draw temp line from last point to cursor? 
            // Currently simplified: just click click
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

            const x = target.left ?? 0;
            const y = target.top ?? 0;
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
            if (mode && (mode === 'straight' || mode === 'smooth' || mode === 'bezier')) {
                setPenMode(mode);
            }
            if (closure && (closure === 'open' || closure === 'closed')) {
                setPenClosure(closure);
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
    }, [activeTool, canvas, clearPenDraft, finishPenPath, penClosure, penPoints]);

    // Close shapes menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (shapesMenuRef.current && !shapesMenuRef.current.contains(event.target as Node)) {
                setShowShapesMenu(false);
            }
            if (adjustmentMenuRef.current && !adjustmentMenuRef.current.contains(event.target as Node)) {
                setShowAdjustmentMenu(false);
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
            fontFamily: 'Arial',
            fill: '#1f2937',
            fontSize: 40,
            fontWeight: 'bold'
        });
        canvas.add(text);
        canvas.setActiveObject(text);
    };

    const handleToolClick = (toolName: string) => {
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
                setActiveTool('layers');
                return;
           }

        // Toggle behavior: Close tool if clicking standard panel icons again
        if (activeTool === toolName) {
            // Exceptions: 'text' (add new text), 'select' (deselect all)
            const nonTogglingTools = ['select', 'text'];
            if (!nonTogglingTools.includes(toolName)) {
                setActiveTool('select');
                return;
            }
        }

        setActiveTool(toolName);
        setShowShapesMenu(false);
        setShowAdjustmentMenu(false);
        
        // Handle single-action tools
        switch(toolName) {
            case 'select':
                if (canvas) {
                    configureCanvasForTool(canvas, 'select');
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
            case 'pen':
                if (canvas) {
                    configureCanvasForTool(canvas, 'pen');
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
            case 'layers':
                // Properties Panel handles the view reset, we just set activeTool
                break;
        }
    };

    useImperativeHandle(ref, () => ({
        triggerTool: (toolName: string) => handleToolClick(toolName)
    }));

    const addRectangle = () => {
        if (!canvas) return;
        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            fill: '#8b5cf6',
            width: 100,
            height: 100,
            rx: 0, 
            ry: 0,
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);
    };

    const addCircle = () => {
        if (!canvas) return;
        const circle = new fabric.Circle({
            left: 150,
            top: 150,
            fill: '#ec4899', // Pink
            radius: 50,
        });
        canvas.add(circle);
        canvas.setActiveObject(circle);
    };

    const addTriangle = () => {
        if (!canvas) return;
        const triangle = new fabric.Triangle({
            left: 200,
            top: 200,
            fill: '#06b6d4', // Cyan
            width: 100,
            height: 100,
        });
        canvas.add(triangle);
        canvas.setActiveObject(triangle);
    };

    const addStar = () => {
        if (!canvas) return;
        
        const points = getStarPoints(5, 25, 50);
        const star = new fabric.Polygon(points, {
            left: 250,
            top: 250,
            fill: '#eab308', // Yellow
            objectCaching: false,
        }) as StarPolygon;
        
        // Attach custom properties for the star
        star.isStar = true;
        star.starPoints = 5;
        star.starInnerRadius = 0.5; // ratio

        canvas.add(star);
        canvas.setActiveObject(star);
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
            fill: '#22c55e',
            objectCaching: false
        });
        canvas.add(arrow);
        canvas.setActiveObject(arrow);
    };

    const addSpeechBubble = () => {
        if (!canvas) return;
        const pathData = 'M 20 0 H 140 A 20 20 0 0 1 160 20 V 80 A 20 20 0 0 1 140 100 H 70 L 50 120 L 50 100 H 20 A 20 20 0 0 1 0 80 V 20 A 20 20 0 0 1 20 0 Z';
        const bubble = new fabric.Path(pathData, {
            left: 140,
            top: 140,
            fill: '#f97316',
            objectCaching: false
        });
        canvas.add(bubble);
        canvas.setActiveObject(bubble);
    };

    const createAdjustmentLayer = (type: AdjustmentLayerType) => {
        if (!canvas) return;
        (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('adjustment:create', { type });
        setShowAdjustmentMenu(false);
        setActiveTool('layers');
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
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
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

        const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        if (!supportedTypes.includes(file.type)) {
            toast({
                title: 'Unsupported file',
                description: 'Please upload JPEG, PNG, WEBP, or SVG.',
                variant: 'warning'
            });
            return;
        }

        const reader = new FileReader();
        reader.onload = (f) => {
            const data = f.target?.result as string;
            loadDataUrlToCanvas(data, file.name);
        };
        reader.readAsDataURL(file);
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
             
             // Center it (this centers in the Viewport, which is aligned with Artboard center)
             canvas.centerObject(img);
             
             canvas.add(img);
             canvas.setActiveObject(img);
             canvas.requestRenderAll();
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
        canvas.centerObject(group);
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
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
            const json = canvas.toObject(['id', 'gradient', 'pattern', 'is3DModel', 'modelUrl', 'isStar', 'starPoints', 'starInnerRadius', 'mediaType', 'mediaSource', 'layerTagColor', 'isAdjustmentLayer', 'adjustmentType', 'adjustmentSettings', 'isPenPath', 'penMode', 'penClosed', 'penNodes', 'penSourcePoints']); 
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
                    title: 'Save failed',
                    description: data.message || 'Unable to save template.',
                    variant: 'destructive'
                });
            }
        } catch (err) {
            console.error(err);
            toast({ title: 'Save failed', description: 'Error saving template.', variant: 'destructive' });
        }
    };

    const handleLoadTemplate = (url: string) => {
         if (!canvas) return;
         fetch(url)
            .then(res => res.json())
            .then(json => {
                canvas.clear();
                canvas.loadFromJSON(json, () => {
                    canvas.requestRenderAll();
                    setActiveTool('select');
                });
            })
            .catch(err => {
                console.error("Error loading template", err);
                toast({ title: 'Load failed', description: 'Failed to load template.', variant: 'destructive' });
            });
    }

    return (
        <div className="flex flex-col gap-3 w-full items-center pt-2 relative">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={handleFileChange}
            />
            {tools.map((tool) => (
                <button 
                    key={tool.name}
                    onClick={() => handleToolClick(tool.name)}
                    ref={tool.name === 'shapes' ? shapesButtonRef : tool.name === 'adjustments' ? adjustmentsButtonRef : tool.name === 'extra' ? extraButtonRef : undefined}
                    className={cn(
                        "flex flex-col items-center justify-center gap-1 group relative w-10 h-10 rounded-xl transition-all duration-200 z-20",
                        activeTool === tool.name || (tool.name === 'adjustments' && showAdjustmentMenu)
                            ? "bg-primary/20 text-primary shadow-sm"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                    title={tool.label}
                >
                    <tool.icon size={20} strokeWidth={1.5} className="group-hover:scale-110 transition-transform duration-200"/>
                    <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 absolute -bottom-4 transition-opacity duration-200 pointer-events-none whitespace-nowrap bg-popover text-popover-foreground px-2 py-0.5 rounded shadow-md border z-50">
                        {tool.label}
                    </span>
                </button>
            ))}

            {/* Pen Options now moved to PropertiesPanel (Right Sidebar) to avoid squishing */}

            {/* Template Library */}
            {activeTool === 'templates' && (
                <TemplateLibrary 
                    key={refreshTemplatesTrigger}
                    onClose={() => setActiveTool('select')}
                    onSelect={handleLoadTemplate}
                    onSaveCurrent={handleSaveTemplateTrigger}
                />
            )}

            {activeTool === 'color-wheel' && (
                <ColorWheelTool 
                    onColorSelect={(color) => {
                         if (!canvas) return;
                         const active = canvas.getActiveObject();
                         if (active) {
                             active.set({ fill: color });
                             canvas.requestRenderAll();
                         }
                    }}
                    currentPalette={activePalette || null}
                    onPaletteSelect={(palette) => {
                         if (setActivePalette) setActivePalette(palette);
                    }}
                />
            )}

            {/* AI Image Generation (Zone Selector Overlay) */}
            {activeTool === 'ai-zone' && canvas && (
                 <ImageGeneratorModal 
                    canvas={canvas}
                    onClose={() => setActiveTool('select')}
                    apiKey={apiKeys?.stability}
                 />
            )}

            {showSaveModal && (
                <InputModal  
                    isOpen={showSaveModal}
                    title="Save Template"
                    description="Enter a name for your custom template."
                    placeholder="My Awesome Template"
                    confirmLabel="Save Template"
                    onConfirm={handleSaveTemplateConfirm}
                    onCancel={() => setShowSaveModal(false)}
                />
            )}

            {/* Asset Library */}
            {activeTool === 'assets' && (
                <AssetLibrary 
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
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Shapes</span>
                        <span className="text-[10px] text-muted-foreground/80">Drag</span>
                    </div>
                    <button onClick={addRectangle} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Square size={20} />
                        <span className="text-[10px]">Rect</span>
                    </button>
                    <button onClick={addCircle} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Circle size={20} />
                        <span className="text-[10px]">Circle</span>
                    </button>
                    <button onClick={addTriangle} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Triangle size={20} />
                        <span className="text-[10px]">Triangle</span>
                    </button>
                    <button onClick={addStar} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Star size={20} />
                        <span className="text-[10px]">Star</span>
                    </button>
                    <button onClick={addArrow} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <ArrowRight size={20} />
                        <span className="text-[10px]">Arrow</span>
                    </button>
                    <button onClick={addSpeechBubble} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <MessageSquare size={20} />
                        <span className="text-[10px]">Bubble</span>
                    </button>
                </div>,
                document.body
            )}

            {showAdjustmentMenu && adjustmentMenuPos && typeof document !== 'undefined' && createPortal(
                <div
                    ref={adjustmentMenuRef}
                    style={{ left: adjustmentMenuPos.left, top: adjustmentMenuPos.top }}
                    className="fixed bg-card border border-border rounded-lg shadow-xl p-3 grid grid-cols-1 gap-2 z-[2000] w-44 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                    <div
                        className="-mx-1 px-1 pb-2 mb-1 border-b border-border/60 flex items-center justify-between cursor-move select-none"
                        onMouseDown={beginMenuDrag('adjustments')}
                    >
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Adjustments</span>
                        <span className="text-[10px] text-muted-foreground/80">Drag</span>
                    </div>
                    <button onClick={() => createAdjustmentLayer('curves')} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        Curves
                    </button>
                    <button onClick={() => createAdjustmentLayer('levels')} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        Levels
                    </button>
                    <button onClick={() => createAdjustmentLayer('saturation-vibrance')} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        Saturation / Vibrance
                    </button>
                    <button onClick={() => createAdjustmentLayer('hue-saturation')} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        Hue / Saturation
                    </button>
                    <button onClick={() => createAdjustmentLayer('exposure')} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        Exposure
                    </button>
                    <button onClick={() => createAdjustmentLayer('brightness-contrast')} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        Brightness / Contrast
                    </button>
                    <button onClick={() => createAdjustmentLayer('color-balance')} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        Color Balance
                    </button>
                    <button onClick={() => createAdjustmentLayer('black-white')} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        Black & White
                    </button>
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
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Add</span>
                        <span className="text-[10px] text-muted-foreground/80">Drag</span>
                    </div>
                    <button onClick={() => { setActiveTool('ai-zone'); setShowExtraMenu(false); }} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                        <Wand2 size={16} />
                        AI Zone
                    </button>
                    <button onClick={() => { setActiveTool('3d-gen'); setShowExtraMenu(false); }} className="flex items-center gap-2 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground text-[11px]">
                         <Box size={16} />
                         AI 3D
                    </button>
                </div>,
                document.body
            )}
        </div>
    );
});

Toolbar.displayName = 'Toolbar';

export default Toolbar;
