/**
 * @jest-environment jsdom
 */

import * as fabric from 'fabric';
import { installPanZoomNavigation } from '@/components/canvas/designCanvasInteractions';

/**
 * Space-drag must pan the viewport, never move whatever happens to be under the
 * cursor.
 *
 * The bug these pin: panning bailed out when `opt.target` was set, which left
 * Fabric to handle the mouse-down normally — so holding Space and dragging over
 * a layer dragged the layer instead of the canvas.
 */

type Handler = (payload?: unknown) => void;

function makeCanvas() {
    const handlers = new Map<string, Set<Handler>>();
    const canvas = {
        viewportTransform: [1, 0, 0, 1, 0, 0] as number[],
        defaultCursor: 'default',
        hoverCursor: 'move',
        selection: true,
        skipTargetFind: false,
        width: 800,
        height: 600,
        // Set by applyEditorCanvasToolConfig; 'select' is the ordinary move tool.
        __ieActiveTool: 'select',
        on(name: string, handler: Handler) {
            if (!handlers.has(name)) handlers.set(name, new Set());
            handlers.get(name)!.add(handler);
        },
        off(name: string, handler: Handler) {
            handlers.get(name)?.delete(handler);
        },
        setViewportTransform(next: number[]) {
            canvas.viewportTransform = next;
        },
        setDimensions() {},
        calcOffset() {},
        setCursor() {},
        requestRenderAll() {},
        getActiveObjects: () => [],
        emit(name: string, payload?: unknown) {
            for (const handler of handlers.get(name) ?? []) handler(payload);
        },
    };
    return canvas;
}

const mouse = (clientX: number, clientY: number, over?: unknown) => ({
    e: { clientX, clientY, button: 0, altKey: false } as unknown as MouseEvent,
    target: over,
});

const pressSpace = () => window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'Space', bubbles: true }),
);
const releaseSpace = () => window.dispatchEvent(
    new KeyboardEvent('keyup', { code: 'Space', bubbles: true }),
);

describe('space-drag panning', () => {
    let canvas: ReturnType<typeof makeCanvas>;
    let dispose: () => void;
    let navigated: number;

    beforeEach(() => {
        canvas = makeCanvas();
        navigated = 0;
        dispose = installPanZoomNavigation(
            canvas as unknown as fabric.Canvas,
            document.createElement('div'),
            () => { navigated += 1; },
        );
    });

    afterEach(() => dispose());

    it('pans when the drag starts over empty canvas', () => {
        pressSpace();
        canvas.emit('mouse:down', mouse(100, 100));
        canvas.emit('mouse:move', mouse(140, 125));

        expect(canvas.viewportTransform[4]).toBe(40);
        expect(canvas.viewportTransform[5]).toBe(25);
    });

    it('pans when the drag starts on top of a layer', () => {
        // The reported bug: this moved the layer instead of the canvas.
        pressSpace();
        canvas.emit('mouse:down', mouse(100, 100, { type: 'image' }));
        canvas.emit('mouse:move', mouse(160, 100));

        expect(canvas.viewportTransform[4]).toBe(60);
    });

    it('stops Fabric finding a target at all while Space is held', () => {
        // Belt and braces: even if the pan handler were bypassed, Fabric must
        // not pick up an object to drag.
        pressSpace();
        expect(canvas.skipTargetFind).toBe(true);
        expect(canvas.selection).toBe(false);
    });

    it('does not pan without Space', () => {
        canvas.emit('mouse:down', mouse(100, 100));
        canvas.emit('mouse:move', mouse(180, 180));
        expect(canvas.viewportTransform[4]).toBe(0);
    });

    it('accumulates across a multi-step drag', () => {
        pressSpace();
        canvas.emit('mouse:down', mouse(0, 0));
        canvas.emit('mouse:move', mouse(10, 10));
        canvas.emit('mouse:move', mouse(25, 30));

        expect(canvas.viewportTransform[4]).toBe(25);
        expect(canvas.viewportTransform[5]).toBe(30);
    });

    it('restores selection when Space is released', () => {
        pressSpace();
        canvas.emit('mouse:down', mouse(50, 50));
        canvas.emit('mouse:up');
        releaseSpace();

        // A canvas left with skipTargetFind on can never select anything again.
        expect(canvas.skipTargetFind).toBe(false);
        expect(canvas.defaultCursor).not.toBe('grabbing');
    });

    it('recovers when focus is lost mid-drag instead of sticking in pan mode', () => {
        // Alt-tab never delivers the keyup.
        pressSpace();
        canvas.emit('mouse:down', mouse(50, 50));
        window.dispatchEvent(new Event('blur'));

        expect(canvas.skipTargetFind).toBe(false);
    });

    it('ignores Space typed into an input', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));

        expect(canvas.skipTargetFind).toBe(false);
        canvas.emit('mouse:down', mouse(0, 0));
        canvas.emit('mouse:move', mouse(40, 0));
        expect(canvas.viewportTransform[4]).toBe(0);
        input.remove();
    });

    it('reports that the user took control of the viewport', () => {
        pressSpace();
        canvas.emit('mouse:down', mouse(10, 10));
        expect(navigated).toBeGreaterThan(0);
    });

    it('stops panning on mouse up, so later moves do not drift the canvas', () => {
        pressSpace();
        canvas.emit('mouse:down', mouse(0, 0));
        canvas.emit('mouse:move', mouse(20, 0));
        canvas.emit('mouse:up');
        canvas.emit('mouse:move', mouse(500, 500));

        expect(canvas.viewportTransform[4]).toBe(20);
    });

    it('detaches every listener on cleanup', () => {
        dispose();
        pressSpace();
        canvas.emit('mouse:down', mouse(0, 0));
        canvas.emit('mouse:move', mouse(90, 90));

        expect(canvas.viewportTransform[4]).toBe(0);
        dispose = () => {};
    });
});
