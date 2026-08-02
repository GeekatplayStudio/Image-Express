import type * as fabric from 'fabric';
import { isSelectionChromeObject, objectContainsPointer } from '@/components/Editor/selectionWand';

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

/** Circle↔AABB hit used by Selection Brush stamps. */
export function objectIntersectsBrush(
    obj: fabric.Object,
    center: fabric.Point,
    radius: number,
): boolean {
    if (isSelectionChromeObject(obj)) return false;
    if (objectContainsPointer(obj, center)) return true;

    const withBounds = obj as fabric.Object & { getBoundingRect?: () => {
        left: number; top: number; width: number; height: number;
    } };
    if (typeof withBounds.getBoundingRect !== 'function') return false;

    const bounds = withBounds.getBoundingRect();
    const closestX = clamp(center.x, bounds.left, bounds.left + bounds.width);
    const closestY = clamp(center.y, bounds.top, bounds.top + bounds.height);
    const dx = center.x - closestX;
    const dy = center.y - closestY;
    return (dx * dx) + (dy * dy) <= radius * radius;
}

export function collectObjectsUnderBrush(
    objects: fabric.Object[],
    center: fabric.Point,
    radius: number,
): fabric.Object[] {
    return objects.filter((obj) => objectIntersectsBrush(obj, center, radius));
}

export function mergeUniqueObjects(
    existing: fabric.Object[],
    additions: fabric.Object[],
): fabric.Object[] {
    const seen = new Set(existing);
    const next = [...existing];
    additions.forEach((obj) => {
        if (seen.has(obj)) return;
        seen.add(obj);
        next.push(obj);
    });
    return next;
}
