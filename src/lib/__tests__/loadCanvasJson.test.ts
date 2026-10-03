/**
 * @jest-environment jsdom
 */

import * as fabric from 'fabric';
import { loadCanvasJson } from '@/lib/fabric-utils';
import { placeAtViewportCenter } from '@/lib/canvas-placement';

type Artboard = { width: number; height: number; left?: number; top?: number };

/**
 * A canvas double that reproduces the three fabric 7 behaviours the bug came
 * from: loading clears every object, copies top-level JSON keys onto the
 * canvas, and resolves a promise instead of calling a completion callback.
 * The page rect keeps the live `artboard` record in step through
 * `object:modified`, exactly as DesignCanvas wires it.
 */
const makeCanvas = (rectSize = { width: 1080, height: 1080 }) => {
    const rect = { ...rectSize, left: 0, top: 0, set(next: Partial<typeof rectSize>) { Object.assign(this, next); }, setCoords: jest.fn() };
    const objects: unknown[] = [rect];
    const loadCalls: Array<Record<string, unknown>> = [];
    const canvas = {
        artboardRect: rect,
        artboard: { ...rectSize, left: 0, top: 0 } as Artboard,
        centerArtboard: jest.fn(),
        requestRenderAll: jest.fn(),
        getObjects: () => objects,
        add: (...added: unknown[]) => { objects.push(...added); },
        sendObjectToBack: (target: unknown) => {
            objects.splice(objects.indexOf(target), 1);
            objects.unshift(target);
        },
        fire: (event: string, payload: { target?: unknown }) => {
            if (event === 'object:modified' && payload.target === rect) {
                canvas.artboard = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
            }
        },
        loadFromJSON: jest.fn(async (json: Record<string, unknown>) => {
            loadCalls.push(json);
            const { objects: loaded = [], ...serialized } = json as { objects?: unknown[] };
            objects.length = 0;
            objects.push(...loaded);
            Object.assign(canvas, serialized);
            return canvas;
        }),
    };
    return { canvas: canvas as unknown as fabric.Canvas, raw: canvas, rect, objects, loadCalls };
};

describe('loadCanvasJson', () => {
    it('puts the page rect back after the load cleared it', async () => {
        const { canvas, rect, objects } = makeCanvas();
        await loadCanvasJson(canvas, { objects: [{ type: 'rect' }, { type: 'i-text' }] });
        expect(objects).toContain(rect);
        expect(objects[0]).toBe(rect);
    });

    it('restores the page rect even for a page with no layers', async () => {
        // The old code did its post-load work in a per-object reviver, which is
        // never called when there are no objects.
        const { canvas, rect, objects } = makeCanvas();
        await loadCanvasJson(canvas, { objects: [], artboard: { width: 1920, height: 1080 } });
        expect(objects).toEqual([rect]);
        expect(rect.width).toBe(1920);
        expect(rect.height).toBe(1080);
    });

    it('opens a saved page at its saved size', async () => {
        const { canvas, rect } = makeCanvas();
        await loadCanvasJson(canvas, { objects: [], artboard: { width: 1920, height: 1080 } });
        expect({ width: rect.width, height: rect.height }).toEqual({ width: 1920, height: 1080 });
    });

    it('keeps the artboard record whole, so placement stays finite', async () => {
        const { canvas, raw } = makeCanvas();
        await loadCanvasJson(canvas, { objects: [], artboard: { width: 1920, height: 1080 } });
        expect(raw.artboard).toEqual({ width: 1920, height: 1080, left: 0, top: 0 });
    });

    it('never hands the saved artboard to fabric to copy onto the canvas', async () => {
        const { canvas, loadCalls } = makeCanvas();
        await loadCanvasJson(canvas, { objects: [], background: '#fff', artboard: { width: 1920, height: 1080 } });
        expect(loadCalls[0]).not.toHaveProperty('artboard');
        expect(loadCalls[0]).toHaveProperty('background', '#fff');
    });

    it('accepts a JSON string, as history snapshots are stored', async () => {
        const { canvas, rect } = makeCanvas();
        await loadCanvasJson(canvas, JSON.stringify({ objects: [], artboard: { width: 800, height: 600 } }));
        expect(rect.width).toBe(800);
    });

    it('refits the view only when the page size actually changed', async () => {
        const { canvas, raw } = makeCanvas();
        // Same size: an undo or redo. The user's pan and zoom must survive it.
        await loadCanvasJson(canvas, { objects: [], artboard: { width: 1080, height: 1080 } });
        expect(raw.centerArtboard).not.toHaveBeenCalled();
        await loadCanvasJson(canvas, { objects: [] });
        expect(raw.centerArtboard).not.toHaveBeenCalled();

        await loadCanvasJson(canvas, { objects: [], artboard: { width: 1920, height: 1080 } });
        expect(raw.centerArtboard).toHaveBeenCalledTimes(1);
    });

    it('resolves only after the content is on the canvas', async () => {
        const { canvas, objects } = makeCanvas();
        let seenAfter = -1;
        await loadCanvasJson(canvas, { objects: [{ type: 'rect' }, { type: 'rect' }] }).then(() => {
            seenAfter = objects.length;
        });
        // Two layers plus the page rect: the caller's post-load work sees them.
        expect(seenAfter).toBe(3);
    });
});

describe('placeAtViewportCenter with a size-only artboard record', () => {
    it('places the layer at a real position instead of NaN', () => {
        // What a saved page used to leave on the canvas: no left/top.
        const canvas = {
            viewportTransform: [0.5, 0, 0, 0.5, 50, 108],
            getZoom: () => 0.5,
            width: 1060,
            height: 750,
            artboard: { width: 1920, height: 1080 },
        } as unknown as fabric.Canvas;
        const layer = new fabric.Rect({ width: 100, height: 40 });

        placeAtViewportCenter(canvas, layer);

        const center = layer.getCenterPoint();
        expect(Number.isFinite(center.x)).toBe(true);
        expect(Number.isFinite(center.y)).toBe(true);
        expect(center.x).toBeCloseTo(960);
        expect(center.y).toBeCloseTo(534);
    });
});
