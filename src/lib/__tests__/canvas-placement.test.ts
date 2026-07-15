import * as fabric from 'fabric';
import { getViewportCenterPoint, placeAtViewportCenter } from '@/lib/canvas-placement';

type MockCanvas = {
    viewportTransform: number[] | null;
    getZoom: () => number;
    width: number;
    height: number;
    artboard?: { width: number; height: number; left: number; top: number };
};

const makeCanvas = (overrides: Partial<MockCanvas> = {}): fabric.Canvas => ({
    viewportTransform: [1, 0, 0, 1, 0, 0],
    getZoom: () => 1,
    width: 800,
    height: 600,
    artboard: { width: 1080, height: 1080, left: 0, top: 0 },
    ...overrides,
} as unknown as fabric.Canvas);

describe('canvas-placement', () => {
    it('returns the world point under the canvas element center', () => {
        const canvas = makeCanvas();
        expect(getViewportCenterPoint(canvas)).toEqual({ x: 400, y: 300 });
    });

    it('accounts for pan and zoom', () => {
        const canvas = makeCanvas({
            viewportTransform: [2, 0, 0, 2, -100, -50],
            getZoom: () => 2,
        });
        // screen center (400,300) -> world ((400+100)/2, (300+50)/2)
        expect(getViewportCenterPoint(canvas)).toEqual({ x: 250, y: 175 });
    });

    it('falls back to the artboard center without a viewport transform', () => {
        const canvas = makeCanvas({ viewportTransform: null });
        expect(getViewportCenterPoint(canvas)).toEqual({ x: 540, y: 540 });
    });

    it('places an object centered at the visible center', () => {
        const canvas = makeCanvas();
        const rect = new fabric.Rect({ width: 100, height: 60, left: 0, top: 0 });
        placeAtViewportCenter(canvas, rect);
        expect(rect.getCenterPoint().x).toBeCloseTo(400);
        expect(rect.getCenterPoint().y).toBeCloseTo(300);
    });

    it('clamps placement to the artboard when the view is panned far away', () => {
        const canvas = makeCanvas({
            viewportTransform: [1, 0, 0, 1, 99999, 99999],
        });
        const rect = new fabric.Rect({ width: 100, height: 60 });
        placeAtViewportCenter(canvas, rect);
        const center = rect.getCenterPoint();
        expect(center.x).toBeGreaterThanOrEqual(0);
        expect(center.x).toBeLessThanOrEqual(1080);
        expect(center.y).toBeGreaterThanOrEqual(0);
        expect(center.y).toBeLessThanOrEqual(1080);
    });
});
