import * as fabric from 'fabric';
import type { ExtendedFabricObject, PenNode } from '@/types';
import {
    PenPoint,
    PenModeSetting,
    PEN_DEFAULT_STROKE,
    PEN_DEFAULT_FILL,
    buildAutoBezierNodes,
    buildBezierPathData,
    buildSmoothPathData,
    clonePenNodes,
} from '@/lib/pen-utils';

/**
 * The fabric half of the pen tool: draft-line objects, the path/viewport
 * coordinate mapping, and the on-canvas anchor and handle controls of a bezier
 * path. The pure geometry lives in `pen-utils`.
 */

export type PenClosure = 'open' | 'closed';
export type PenPathOperation = 'add' | 'subtract' | 'intersect';
export type BezierPathObject = fabric.Path & ExtendedFabricObject;
export type PenDraftLineObject = fabric.Object;
export type PenAnchorObject = fabric.Circle & { isPenDraftAnchor?: boolean; penAnchorIndex?: number };

export const PEN_STROKE = PEN_DEFAULT_STROKE;
export const PEN_FILL = PEN_DEFAULT_FILL;
export const PEN_ANCHOR_COLOR = '#2563eb';
export const PEN_HANDLE_COLOR = '#ffffff';
// Space held while dragging a handle breaks the mirror with its opposite
// handle. Module state rather than React state: the fabric control handlers
// below run outside render and read it mid-drag.
let isPenSpacePressed = false;
export const setPenSpacePressed = (pressed: boolean) => { isPenSpacePressed = pressed; };
export const isPenSpaceHeld = () => isPenSpacePressed;

export const isPenDraftAnchor = (obj?: fabric.Object | null): obj is PenAnchorObject => !!obj && (obj as PenAnchorObject).isPenDraftAnchor === true;

export const penPathOperationToComposite: Record<PenPathOperation, GlobalCompositeOperation> = {
    add: 'source-over',
    subtract: 'destination-out',
    intersect: 'source-atop',
};

export const createPenDraftLine = (points: PenPoint[], mode: PenModeSetting, closure: PenClosure): PenDraftLineObject | null => {
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

export const getViewportPointFromPathPoint = (pathObj: fabric.Path, point: PenPoint): fabric.Point => {
    const transformPoint = (fabric.util as unknown as { transformPoint: (point: fabric.Point, transform: number[]) => fabric.Point }).transformPoint;
    const multiplyTransformMatrices = (fabric.util as unknown as { multiplyTransformMatrices: (a: number[], b: number[]) => number[] }).multiplyTransformMatrices;
    const pathOffset = pathObj.pathOffset || new fabric.Point(0, 0);
    const localPoint = new fabric.Point(point.x - pathOffset.x, point.y - pathOffset.y);
    const viewportTransform = pathObj.getViewportTransform();
    return transformPoint(localPoint, multiplyTransformMatrices(viewportTransform, pathObj.calcTransformMatrix()));
};

export const getPathPointFromScenePoint = (pathObj: fabric.Path, point: PenPoint): PenPoint => {
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

export const applyBezierNodesToPath = (pathObj: BezierPathObject, nodes: PenNode[], closed: boolean) => {
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

export const attachBezierControls = (pathObj: BezierPathObject) => {
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
