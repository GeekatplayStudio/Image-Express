import { pointInPolygon, type RectBounds } from '@/components/Editor/selectionGeometry';
import {
    clampRectToMask,
    type DocumentSelectionMask,
} from '@/lib/selection/documentSelectionMask';

type PointLike = { x: number; y: number };

/** OR a filled axis-aligned rect into the mask (scene coordinates). */
export function unionRectIntoMask(
    mask: DocumentSelectionMask,
    rect: RectBounds,
    value = 255,
) {
    const clipped = clampRectToMask(mask, rect);
    if (!clipped) return;

    const x0 = Math.floor(clipped.left - mask.left);
    const y0 = Math.floor(clipped.top - mask.top);
    const x1 = Math.ceil(clipped.left + clipped.width - mask.left);
    const y1 = Math.ceil(clipped.top + clipped.height - mask.top);

    for (let y = Math.max(0, y0); y < Math.min(mask.height, y1); y += 1) {
        const row = y * mask.width;
        for (let x = Math.max(0, x0); x < Math.min(mask.width, x1); x += 1) {
            mask.data[row + x] = Math.max(mask.data[row + x], value);
        }
    }
}

/** OR a filled polygon into the mask (scene coordinates). */
export function unionPolygonIntoMask(
    mask: DocumentSelectionMask,
    points: PointLike[],
    value = 255,
) {
    if (points.length < 3) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    });

    const clipped = clampRectToMask(mask, {
        left: minX,
        top: minY,
        width: Math.max(0, maxX - minX),
        height: Math.max(0, maxY - minY),
    });
    if (!clipped) return;

    const x0 = Math.floor(clipped.left - mask.left);
    const y0 = Math.floor(clipped.top - mask.top);
    const x1 = Math.ceil(clipped.left + clipped.width - mask.left);
    const y1 = Math.ceil(clipped.top + clipped.height - mask.top);

    const fabricPoints = points as import('fabric').Point[];

    for (let y = Math.max(0, y0); y < Math.min(mask.height, y1); y += 1) {
        const row = y * mask.width;
        const sceneY = mask.top + y + 0.5;
        for (let x = Math.max(0, x0); x < Math.min(mask.width, x1); x += 1) {
            const sceneX = mask.left + x + 0.5;
            if (!pointInPolygon({ x: sceneX, y: sceneY } as import('fabric').Point, fabricPoints)) {
                continue;
            }
            mask.data[row + x] = Math.max(mask.data[row + x], value);
        }
    }
}

/** Clip helper: intersect selection write with target layer AABB. */
export function intersectRect(a: RectBounds, b: RectBounds): RectBounds | null {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.left + a.width, b.left + b.width);
    const bottom = Math.min(a.top + a.height, b.top + b.height);
    if (right <= left || bottom <= top) return null;
    return { left, top, width: right - left, height: bottom - top };
}
