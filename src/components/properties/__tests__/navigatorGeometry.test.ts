import type * as fabric from 'fabric';
import {
    MAX_NAVIGATOR_OBJECTS,
    getNavigatorObjectRects,
    getNavigatorViewport,
    getNavigatorWorldBounds,
    getObjectSceneRect,
    normalizeNavigatorRect,
} from '@/components/properties/navigatorGeometry';

const box = (left: number, top: number, width: number, height: number, extra: Record<string, unknown> = {}) => ({
    visible: true,
    getCoords: () => [
        { x: left, y: top },
        { x: left + width, y: top },
        { x: left + width, y: top + height },
        { x: left, y: top + height },
    ],
    ...extra,
});

const makeCanvas = (props: Record<string, unknown> = {}) => ({
    getObjects: () => [],
    getZoom: () => 1,
    viewportTransform: [1, 0, 0, 1, 0, 0],
    width: 800,
    height: 600,
    getWidth: () => 800,
    getHeight: () => 600,
    ...props,
}) as unknown as fabric.Canvas;

describe('normalizeNavigatorRect', () => {
    it('replaces non-finite values and never returns a zero size', () => {
        expect(normalizeNavigatorRect({ left: NaN, top: Infinity, width: 0, height: NaN }))
            .toEqual({ left: 0, top: 0, width: 1, height: 1 });
    });

    it('leaves a sound rect alone', () => {
        const rect = { left: -20, top: 5, width: 300, height: 40 };
        expect(normalizeNavigatorRect(rect)).toEqual(rect);
    });
});

describe('getObjectSceneRect', () => {
    it('bounds a rotated layer by its corners, not its unrotated box', () => {
        const diamond = { getCoords: () => [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }] };
        expect(getObjectSceneRect(diamond as unknown as fabric.Object))
            .toEqual({ left: 0, top: 0, width: 100, height: 100 });
    });

    it('falls back to the bounding rect when corners are unusable', () => {
        const layer = {
            getCoords: () => [{ x: NaN, y: NaN }],
            getBoundingRect: () => ({ left: 10, top: 20, width: 30, height: 40 }),
        };
        expect(getObjectSceneRect(layer as unknown as fabric.Object))
            .toEqual({ left: 10, top: 20, width: 30, height: 40 });
    });

    it('returns null for a layer with no measurable position', () => {
        // What a layer created with NaN coordinates looks like.
        const broken = {
            getCoords: () => [{ x: NaN, y: NaN }],
            getBoundingRect: () => ({ left: NaN, top: NaN, width: NaN, height: NaN }),
        };
        expect(getObjectSceneRect(broken as unknown as fabric.Object)).toBeNull();
        expect(getObjectSceneRect(null)).toBeNull();
    });
});

describe('getNavigatorWorldBounds', () => {
    it('uses the given size when there is no canvas', () => {
        expect(getNavigatorWorldBounds(null, 1080, 720)).toEqual({ left: 0, top: 0, width: 1080, height: 720 });
    });

    it('prefers the artboard record', () => {
        const canvas = makeCanvas({ artboard: { left: 10, top: 20, width: 1920, height: 1080 } });
        expect(getNavigatorWorldBounds(canvas, 1, 1)).toEqual({ left: 10, top: 20, width: 1920, height: 1080 });
    });

    it('treats a size-only artboard record as sitting at the origin', () => {
        // The shape a saved page used to leave behind. It must not become NaN.
        const canvas = makeCanvas({ artboard: { width: 1920, height: 1080 } });
        expect(getNavigatorWorldBounds(canvas, 1, 1)).toEqual({ left: 0, top: 0, width: 1920, height: 1080 });
    });

    it('falls back to the page rect, then to the given size', () => {
        expect(getNavigatorWorldBounds(makeCanvas({ artboardRect: box(0, 0, 640, 480) }), 1, 1))
            .toEqual({ left: 0, top: 0, width: 640, height: 480 });
        expect(getNavigatorWorldBounds(makeCanvas(), 300, 200)).toEqual({ left: 0, top: 0, width: 300, height: 200 });
    });
});

describe('getNavigatorObjectRects', () => {
    const world = { left: 0, top: 0, width: 1000, height: 1000 };

    it('leaves out the page rect and hidden layers', () => {
        const page = box(0, 0, 1000, 1000);
        const canvas = makeCanvas({
            artboardRect: page,
            getObjects: () => [page, box(10, 10, 50, 50), box(100, 100, 50, 50, { visible: false })],
        });
        expect(getNavigatorObjectRects(canvas, world)).toEqual([{ left: 10, top: 10, width: 50, height: 50 }]);
    });

    it('clips a layer that hangs off the page', () => {
        const canvas = makeCanvas({ getObjects: () => [box(950, -20, 200, 100)] });
        expect(getNavigatorObjectRects(canvas, world)).toEqual([{ left: 950, top: 0, width: 50, height: 80 }]);
    });

    it('drops a layer entirely outside the page', () => {
        const canvas = makeCanvas({ getObjects: () => [box(2000, 2000, 50, 50)] });
        expect(getNavigatorObjectRects(canvas, world)).toEqual([]);
    });

    it('caps how many outlines it returns', () => {
        const many = Array.from({ length: MAX_NAVIGATOR_OBJECTS + 50 }, (_, index) => box(index, index, 10, 10));
        expect(getNavigatorObjectRects(makeCanvas({ getObjects: () => many }), world)).toHaveLength(MAX_NAVIGATOR_OBJECTS);
    });
});

describe('getNavigatorViewport', () => {
    const world = { left: 0, top: 0, width: 1920, height: 1080 };

    it('reports the visible part of the page at the current pan and zoom', () => {
        // Zoomed to 200% and panned so scene (100, 50) is at the top-left.
        const canvas = makeCanvas({ getZoom: () => 2, viewportTransform: [2, 0, 0, 2, -200, -100] });
        expect(getNavigatorViewport(canvas, world)).toEqual({ left: 100, top: 50, width: 400, height: 300 });
    });

    it('covers the whole page, and no more, when zoomed out past it', () => {
        const canvas = makeCanvas({ getZoom: () => 0.25, viewportTransform: [0.25, 0, 0, 0.25, 100, 100] });
        expect(getNavigatorViewport(canvas, world)).toEqual({ left: 0, top: 0, width: 1920, height: 1080 });
    });

    it('keeps the frame on the page when the view is panned beyond its edge', () => {
        const canvas = makeCanvas({ viewportTransform: [1, 0, 0, 1, -5000, -5000] });
        const viewport = getNavigatorViewport(canvas, world);
        expect(viewport.left + viewport.width).toBe(1920);
        expect(viewport.top + viewport.height).toBe(1080);
    });

    it('survives a zero zoom', () => {
        const viewport = getNavigatorViewport(makeCanvas({ getZoom: () => 0, viewportTransform: null }), world);
        expect(Number.isFinite(viewport.width)).toBe(true);
        expect(viewport.width).toBeGreaterThan(0);
    });
});
