import type * as fabric from 'fabric';

import { resolveUtilityCanvasSize } from '@/components/Editor/editorTopCanvasUtils';

/**
 * `resolveUtilityCanvasSize` backs the "Canvas WxH" badge in the editor's
 * bottom-right utility cluster. Its precedence — scaled artboardRect, then
 * artboard, then the fabric canvas element divided by zoom — was previously
 * only exercised indirectly through EditorView. When a shared canvas stub
 * there gained an `artboard`, every caller silently switched branches and the
 * badge assertion went stale without anything explaining why. These tests pin
 * the precedence directly.
 */

type CanvasStub = Partial<{
    width: number;
    height: number;
    artboardRect: unknown;
    artboard: unknown;
    getZoom: () => number;
    getWidth: () => number;
    getHeight: () => number;
}>;

const canvas = (stub: CanvasStub): fabric.Canvas => ({
    getZoom: () => 1,
    getWidth: () => 0,
    getHeight: () => 0,
    ...stub,
} as unknown as fabric.Canvas);

describe('resolveUtilityCanvasSize', () => {
    it('prefers artboardRect over every other source, applying its scale', () => {
        const size = resolveUtilityCanvasSize(canvas({
            width: 1200,
            height: 800,
            artboardRect: { width: 400, height: 300, scaleX: 2, scaleY: 2 },
            artboard: { width: 800, height: 600 },
        }));

        expect(size).toEqual({ width: 800, height: 600 });
    });

    it('treats a missing scale on artboardRect as 1', () => {
        const size = resolveUtilityCanvasSize(canvas({
            width: 1200,
            height: 800,
            artboardRect: { width: 640, height: 480 },
        }));

        expect(size).toEqual({ width: 640, height: 480 });
    });

    it('falls back to the artboard when artboardRect is absent, ignoring the canvas element', () => {
        // This is the case that regressed: the fabric canvas is the viewport
        // (1200x800), while the artboard is the user's actual page (800x600).
        const size = resolveUtilityCanvasSize(canvas({
            width: 1200,
            height: 800,
            artboardRect: null,
            artboard: { left: 0, top: 0, width: 800, height: 600 },
        }));

        expect(size).toEqual({ width: 800, height: 600 });
    });

    it('falls back to the canvas element only when there is no artboard at all', () => {
        const size = resolveUtilityCanvasSize(canvas({
            width: 1200,
            height: 800,
            artboardRect: null,
        }));

        expect(size).toEqual({ width: 1200, height: 800 });
    });

    it('divides the canvas-element fallback by zoom so the badge reports document pixels', () => {
        const size = resolveUtilityCanvasSize(canvas({
            width: 1200,
            height: 800,
            getZoom: () => 2,
        }));

        expect(size).toEqual({ width: 600, height: 400 });
    });

    it('never reports a dimension below 1', () => {
        const size = resolveUtilityCanvasSize(canvas({
            artboardRect: { width: 0, height: 0, scaleX: 1, scaleY: 1 },
        }));

        expect(size).toEqual({ width: 1, height: 1 });
    });
});
