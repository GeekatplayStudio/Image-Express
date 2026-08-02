import type * as fabric from 'fabric';

export type RectBounds = {
    left: number;
    top: number;
    width: number;
    height: number;
};

export function intersectsBounds(a: RectBounds, b: RectBounds) {
    return !(
        a.left + a.width < b.left
        || b.left + b.width < a.left
        || a.top + a.height < b.top
        || b.top + b.height < a.top
    );
}

export function pointInPolygon(point: fabric.Point, polygon: fabric.Point[]) {
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
}

export function getPolygonBounds(points: fabric.Point[]): RectBounds {
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
}

export function buildLassoPathData(points: fabric.Point[], closed = false) {
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
}

export function isPointInsideBounds(point: fabric.Point, bounds: RectBounds) {
    return (
        point.x >= bounds.left
        && point.x <= bounds.left + bounds.width
        && point.y >= bounds.top
        && point.y <= bounds.top + bounds.height
    );
}

/** Tools that draw a region / pick without moving canvas objects. */
export const OBJECT_PICK_SELECTION_TOOLS = new Set([
    'marquee',
    'lasso',
    'wand',
    'quick-select',
    'selection-brush',
]);

export type SelectionInteractionTool =
    | 'marquee'
    | 'lasso'
    | 'wand'
    | 'quick-select'
    | 'selection-brush';

/**
 * Map toolbar ids to interaction engines.
 * Quick Select and Selection Brush are first-class drag tools (not silent aliases).
 */
export function resolveSelectionInteractionTool(activeTool: string): SelectionInteractionTool | null {
    if (activeTool === 'marquee') return 'marquee';
    if (activeTool === 'lasso') return 'lasso';
    if (activeTool === 'wand') return 'wand';
    if (activeTool === 'quick-select') return 'quick-select';
    if (activeTool === 'selection-brush') return 'selection-brush';
    return null;
}
