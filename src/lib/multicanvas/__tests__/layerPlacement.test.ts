import {
    layerCorners, layerCenterNormalized, normalizeToCanvas, planeExtentFor,
    layerFill, hasDrawableSource,
} from '@/lib/multicanvas/layerPlacement';

describe('layerCorners', () => {
    it('uses the top-left origin fabric serializes by default', () => {
        const corners = layerCorners({ left: 100, top: 50, width: 200, height: 80 });
        expect(corners[0]).toEqual({ x: 100, y: 50 });
        expect(corners[2]).toEqual({ x: 300, y: 130 });
    });

    it('applies scale to the drawn box', () => {
        const corners = layerCorners({ left: 0, top: 0, width: 100, height: 100, scaleX: 2, scaleY: 0.5 });
        expect(corners[2]).toEqual({ x: 200, y: 50 });
    });

    it('centres the box when the origin is centre', () => {
        const corners = layerCorners({
            left: 100, top: 100, width: 40, height: 20, originX: 'center', originY: 'center',
        });
        expect(corners[0]).toEqual({ x: 80, y: 90 });
        expect(corners[2]).toEqual({ x: 120, y: 110 });
    });

    it('rotates about the origin point', () => {
        const corners = layerCorners({ left: 0, top: 0, width: 100, height: 50, angle: 90 });
        // The box swings down: the far x corner ends up on +y.
        expect(corners[1].x).toBeCloseTo(0);
        expect(corners[1].y).toBeCloseTo(100);
    });

    it('treats missing geometry as a zero box rather than NaN', () => {
        const corners = layerCorners({});
        expect(corners.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))).toBe(true);
    });
});

describe('normalizeToCanvas', () => {
    it('maps canvas pixels to 0..1 page space', () => {
        expect(normalizeToCanvas({ x: 540, y: 270 }, 1080, 1080)).toEqual({ x: 0.5, y: 0.25 });
    });

    it('does not divide by a zero canvas size', () => {
        expect(normalizeToCanvas({ x: 10, y: 10 }, 0, 0)).toEqual({ x: 0.5, y: 0.5 });
    });

    it('keeps off-canvas layers outside the unit square', () => {
        // Clamping here would pin overflowing layers to the page edge and hide
        // the fact that they hang off it.
        expect(normalizeToCanvas({ x: 1200, y: -60 }, 1080, 1080).x).toBeGreaterThan(1);
        expect(normalizeToCanvas({ x: 1200, y: -60 }, 1080, 1080).y).toBeLessThan(0);
    });
});

describe('layerCenterNormalized', () => {
    it('anchors bridges at the middle of the layer box', () => {
        const c = layerCenterNormalized({ left: 0, top: 0, width: 540, height: 540 }, 1080, 1080);
        expect(c).toEqual({ x: 0.25, y: 0.25 });
    });
});

describe('planeExtentFor', () => {
    const pages = [
        { width: 1080, height: 1080 },
        { width: 1920, height: 600 },
        { width: 400, height: 400 },
    ];

    it('maps the album’s longest edge to the full span', () => {
        const extent = planeExtentFor(pages, 860);
        expect(extent(1920, 600).width).toBeCloseTo(860);
    });

    it('shows pages at their real size relative to each other', () => {
        const extent = planeExtentFor(pages, 860);
        const square = extent(1080, 1080);
        const banner = extent(1920, 600);
        // A banner is wider and much shallower than the square page.
        expect(banner.width).toBeGreaterThan(square.width);
        expect(banner.depth).toBeLessThan(square.depth);
    });

    it('preserves each page’s aspect ratio', () => {
        const extent = planeExtentFor(pages, 860);
        const banner = extent(1920, 600);
        expect(banner.width / banner.depth).toBeCloseTo(1920 / 600);
    });

    it('keeps a small page visible instead of collapsing it', () => {
        const extent = planeExtentFor([{ width: 8000, height: 8000 }, { width: 20, height: 20 }], 860);
        expect(extent(20, 20).width).toBeGreaterThan(0);
    });

    it('falls back to a default footprint for a page with no size', () => {
        const extent = planeExtentFor(pages, 860);
        expect(extent(0, 0).width).toBe(860);
    });
});

describe('layer paint hints', () => {
    it('uses the layer fill when it has one', () => {
        expect(layerFill({ fill: '#ff0000' })).toBe('#ff0000');
    });

    it('falls back for transparent or gradient fills', () => {
        expect(layerFill({ fill: 'transparent' })).toBe('#8BA8AD');
        expect(layerFill({ fill: { type: 'linear' } as unknown as string })).toBe('#8BA8AD');
    });

    it('only treats self-contained sources as drawable', () => {
        expect(hasDrawableSource({ src: 'data:image/png;base64,AAA' })).toBe(true);
        expect(hasDrawableSource({ src: '/assets/a.png' })).toBe(true);
        // blob: URLs die with the session that made them, so they would render
        // as a broken image in a reloaded album.
        expect(hasDrawableSource({ src: 'blob:http://localhost/abc' })).toBe(false);
        expect(hasDrawableSource({})).toBe(false);
    });
});
