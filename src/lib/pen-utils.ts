import * as fabric from 'fabric';
import { ExtendedFabricObject, PenNode } from '@/types';

export type PenModeSetting = 'straight' | 'smooth' | 'bezier';
export type PenPoint = { x: number; y: number };

export const PEN_DEFAULT_FILL = '#cccccc';
export const PEN_DEFAULT_STROKE = '#3b82f6';

export const nearlyEqual = (a: number, b: number, epsilon = 0.001) => Math.abs(a - b) < epsilon;

export const toScenePoint = (obj: fabric.Object, point: PenPoint, pathOffset?: fabric.Point): PenPoint => {
    const transformPoint = (fabric.util as unknown as { transformPoint: (p: fabric.Point, m: number[]) => fabric.Point }).transformPoint;
    const offset = pathOffset || new fabric.Point(0, 0);
    const localPoint = new fabric.Point(point.x - offset.x, point.y - offset.y);
    const scenePoint = transformPoint(localPoint, obj.calcTransformMatrix());
    return { x: scenePoint.x, y: scenePoint.y };
};

export const buildOpenTwoPointCurveNodes = (points: PenPoint[]): PenNode[] => {
    const [start, end] = points;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length < 0.001) {
        return [
            { x: start.x, y: start.y, handleIn: { x: start.x, y: start.y }, handleOut: { x: start.x, y: start.y } },
            { x: end.x, y: end.y, handleIn: { x: end.x, y: end.y }, handleOut: { x: end.x, y: end.y } }
        ];
    }

    // Make open 2-point smooth/bezier visibly curved instead of identical to straight mode.
    const normalX = -dy / length;
    const normalY = dx / length;
    const bend = Math.min(120, Math.max(24, length * 0.28));
    const controlX = (start.x + end.x) / 2 + (normalX * bend);
    const controlY = (start.y + end.y) / 2 + (normalY * bend);

    return [
        {
            x: start.x,
            y: start.y,
            handleIn: { x: start.x, y: start.y },
            handleOut: {
                x: ((2 * start.x) + controlX) / 3,
                y: ((2 * start.y) + controlY) / 3
            }
        },
        {
            x: end.x,
            y: end.y,
            handleIn: {
                x: ((2 * end.x) + controlX) / 3,
                y: ((2 * end.y) + controlY) / 3
            },
            handleOut: { x: end.x, y: end.y }
        }
    ];
};

export const buildStraightNodes = (points: PenPoint[]): PenNode[] => {
    return points.map(p => ({
        x: p.x,
        y: p.y,
        handleIn: { x: p.x, y: p.y },
        handleOut: { x: p.x, y: p.y }
    }));
};

export const buildAutoBezierNodes = (points: PenPoint[], closed: boolean): PenNode[] => {
    const len = points.length;
    if (len === 0) return [];
    if (!closed && len === 2) {
        return buildOpenTwoPointCurveNodes(points);
    }

    return points.map((point, index) => {
        const prev = closed ? points[(index - 1 + len) % len] : points[Math.max(index - 1, 0)];
        const next = closed ? points[(index + 1) % len] : points[Math.min(index + 1, len - 1)];
        const tangentX = (next.x - prev.x) / 6;
        const tangentY = (next.y - prev.y) / 6;

        const handleIn = { x: point.x - tangentX, y: point.y - tangentY };
        const handleOut = { x: point.x + tangentX, y: point.y + tangentY };

        if (!closed && index === 0) {
            handleIn.x = point.x;
            handleIn.y = point.y;
        }
        if (!closed && index === len - 1) {
            handleOut.x = point.x;
            handleOut.y = point.y;
        }

        return {
            x: point.x,
            y: point.y,
            handleIn,
            handleOut
        };
    });
};

export const buildBezierPathData = (nodes: PenNode[], closed: boolean): string => {
    if (nodes.length === 0) return '';
    if (nodes.length === 1) return `M ${nodes[0].x} ${nodes[0].y}`;

    let pathData = `M ${nodes[0].x} ${nodes[0].y}`;
    const segmentCount = closed ? nodes.length : (nodes.length - 1);

    for (let i = 0; i < segmentCount; i++) {
        const current = nodes[i];
        const next = nodes[(i + 1) % nodes.length];
        pathData += ` C ${current.handleOut.x} ${current.handleOut.y} ${next.handleIn.x} ${next.handleIn.y} ${next.x} ${next.y}`;
    }

    if (closed) pathData += ' Z';
    return pathData;
};

export const buildSmoothPathData = (points: PenPoint[], closed: boolean): string => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) {
        if (!closed) {
            return buildBezierPathData(buildAutoBezierNodes(points, false), false);
        }
        const base = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
        return `${base} Z`;
    }
    return buildBezierPathData(buildAutoBezierNodes(points, closed), closed);
};

export const extractSceneBezierNodesFromPath = (pathObj: fabric.Path): PenNode[] => {
    const pathData = pathObj.path as unknown[][];
    if (!Array.isArray(pathData) || pathData.length === 0) return [];

    const localNodes: PenNode[] = [];
    for (const rawCommand of pathData) {
        if (!Array.isArray(rawCommand) || rawCommand.length === 0) continue;
        const command = String(rawCommand[0]).toUpperCase();

        if (command === 'M' && rawCommand.length >= 3) {
            const x = Number(rawCommand[1]);
            const y = Number(rawCommand[2]);
            localNodes.length = 0;
            localNodes.push({
                x,
                y,
                handleIn: { x, y },
                handleOut: { x, y }
            });
            continue;
        }

        if (command === 'C' && rawCommand.length >= 7 && localNodes.length > 0) {
            const prev = localNodes[localNodes.length - 1];
            const c1 = { x: Number(rawCommand[1]), y: Number(rawCommand[2]) };
            const c2 = { x: Number(rawCommand[3]), y: Number(rawCommand[4]) };
            const end = { x: Number(rawCommand[5]), y: Number(rawCommand[6]) };
            prev.handleOut = c1;

            const first = localNodes[0];
            if (localNodes.length > 1 && nearlyEqual(end.x, first.x) && nearlyEqual(end.y, first.y)) {
                first.handleIn = c2;
                continue;
            }

            localNodes.push({
                x: end.x,
                y: end.y,
                handleIn: c2,
                handleOut: { x: end.x, y: end.y }
            });
            continue;
        }

        if (command === 'L' && rawCommand.length >= 3 && localNodes.length > 0) {
            const prev = localNodes[localNodes.length - 1];
            prev.handleOut = { x: prev.x, y: prev.y };
            const x = Number(rawCommand[1]);
            const y = Number(rawCommand[2]);
            localNodes.push({
                x,
                y,
                handleIn: { x, y },
                handleOut: { x, y }
            });
        }
    }

    const pathOffset = pathObj.pathOffset || new fabric.Point(0, 0);
    return localNodes.map((node) => ({
        x: toScenePoint(pathObj, { x: node.x, y: node.y }, pathOffset).x,
        y: toScenePoint(pathObj, { x: node.x, y: node.y }, pathOffset).y,
        handleIn: toScenePoint(pathObj, node.handleIn, pathOffset),
        handleOut: toScenePoint(pathObj, node.handleOut, pathOffset)
    }));
};

export const extractScenePenPoints = (obj: ExtendedFabricObject): PenPoint[] => {
    if (obj.type === 'path') {
        if (Array.isArray(obj.penNodes) && obj.penNodes.length > 0) {
            const pathObj = obj as fabric.Path;
            const pathOffset = pathObj.pathOffset || new fabric.Point(0, 0);
            return obj.penNodes.map((node) => toScenePoint(pathObj, { x: node.x, y: node.y }, pathOffset));
        }
        const parsed = extractSceneBezierNodesFromPath(obj as fabric.Path);
        if (parsed.length > 0) return parsed.map((node) => ({ x: node.x, y: node.y }));
    }

    if (obj.type === 'polygon' || obj.type === 'polyline') {
        const polyObj = obj as unknown as { points?: PenPoint[]; pathOffset?: fabric.Point };
        const points = Array.isArray(polyObj.points) ? polyObj.points : [];
        const pathOffset = polyObj.pathOffset || new fabric.Point(0, 0);
        return points.map((point) => toScenePoint(obj, point, pathOffset));
    }

    if (Array.isArray(obj.penSourcePoints)) return obj.penSourcePoints.map((point) => ({ ...point }));
    return [];
};

export const extractSceneBezierNodes = (obj: ExtendedFabricObject, closed: boolean): PenNode[] => {
    if (obj.type === 'path') {
        if (Array.isArray(obj.penNodes) && obj.penNodes.length > 0) {
            const pathObj = obj as fabric.Path;
            const pathOffset = pathObj.pathOffset || new fabric.Point(0, 0);
            return obj.penNodes.map((node) => ({
                x: toScenePoint(pathObj, { x: node.x, y: node.y }, pathOffset).x,
                y: toScenePoint(pathObj, { x: node.x, y: node.y }, pathOffset).y,
                handleIn: toScenePoint(pathObj, node.handleIn, pathOffset),
                handleOut: toScenePoint(pathObj, node.handleOut, pathOffset)
            }));
        }
        const parsed = extractSceneBezierNodesFromPath(obj as fabric.Path);
        if (parsed.length > 0) return parsed;
    }

    const points = extractScenePenPoints(obj);
    return buildAutoBezierNodes(points, closed);
};
