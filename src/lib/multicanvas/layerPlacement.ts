// Geometry helpers for drawing an album's real content in the 3D stack view.
//
// The stack used to represent each page as a fixed-size plane with a name
// label per layer, which told you nothing about what the page actually looks
// like. These map a serialized layer's own box onto its page plane so the
// view can draw the artwork where it really sits, at the size it really is.

import type { ProjectCanvas, SerializedLayer } from '@/lib/multicanvas/projectStore';

export type Point2 = { x: number; y: number };
/** Corners in canvas pixel space, clockwise from the object's top-left. */
export type Quad = [Point2, Point2, Point2, Point2];

const num = (value: unknown, fallback = 0): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

/**
 * The four corners of a serialized layer in canvas pixel space.
 *
 * Honours fabric's origin, scale and rotation: `left`/`top` are the object's
 * origin point (top-left by default, but 'center' is common on shapes), and
 * `angle` rotates about that same origin.
 */
export const layerCorners = (layer: SerializedLayer): Quad => {
    const width = num(layer.width) * num(layer.scaleX, 1);
    const height = num(layer.height) * num(layer.scaleY, 1);
    const originX = layer.originX === 'center' ? 0.5 : layer.originX === 'right' ? 1 : 0;
    const originY = layer.originY === 'center' ? 0.5 : layer.originY === 'bottom' ? 1 : 0;

    // Untranslated box relative to the origin point.
    const x0 = -originX * width;
    const y0 = -originY * height;
    const local: Quad = [
        { x: x0, y: y0 },
        { x: x0 + width, y: y0 },
        { x: x0 + width, y: y0 + height },
        { x: x0, y: y0 + height },
    ];

    const angle = (num(layer.angle) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const left = num(layer.left);
    const top = num(layer.top);
    return local.map((p) => ({
        x: left + p.x * cos - p.y * sin,
        y: top + p.x * sin + p.y * cos,
    })) as Quad;
};

/** Map a canvas-space point to the page's normalized (0..1) plane space. */
export const normalizeToCanvas = (point: Point2, canvasWidth: number, canvasHeight: number): Point2 => ({
    x: canvasWidth > 0 ? point.x / canvasWidth : 0.5,
    y: canvasHeight > 0 ? point.y / canvasHeight : 0.5,
});

/** Centre of a layer in normalized page space, used for the bridge anchors. */
export const layerCenterNormalized = (
    layer: SerializedLayer,
    canvasWidth: number,
    canvasHeight: number,
): Point2 => {
    const corners = layerCorners(layer);
    const cx = (corners[0].x + corners[2].x) / 2;
    const cy = (corners[0].y + corners[2].y) / 2;
    return normalizeToCanvas({ x: cx, y: cy }, canvasWidth, canvasHeight);
};

export type PlaneExtent = { width: number; depth: number };

/**
 * World-space footprint for each page, scaled against the largest page in the
 * album so relative size is readable: a 1920x600 banner renders as a wide,
 * shallow plane next to a square 1080x1080 one, rather than both filling the
 * same rectangle. `maxSpan` is the world size the album's longest edge maps to.
 */
export const planeExtentFor = (
    canvases: Pick<ProjectCanvas, 'width' | 'height'>[],
    maxSpan: number,
    minSpan = maxSpan * 0.18,
): ((width: number, height: number) => PlaneExtent) => {
    const longest = canvases.reduce(
        (acc, c) => Math.max(acc, num(c.width), num(c.height)),
        0,
    );
    return (width: number, height: number): PlaneExtent => {
        const w = num(width);
        const h = num(height);
        if (!w || !h || !longest) return { width: maxSpan, depth: maxSpan * 0.6 };
        const scale = maxSpan / longest;
        return {
            width: Math.max(minSpan, w * scale),
            depth: Math.max(minSpan, h * scale),
        };
    };
};

/** Fill to draw for a layer that has no bitmap of its own. */
export const layerFill = (layer: SerializedLayer): string => {
    const fill = layer.fill;
    if (typeof fill === 'string' && fill && fill !== 'transparent') return fill;
    return '#8BA8AD';
};

/** True when the layer has a self-contained bitmap the view can draw directly. */
export const hasDrawableSource = (layer: SerializedLayer): boolean => (
    typeof layer.src === 'string' && layer.src.length > 0 && !layer.src.startsWith('blob:')
);
