/**
 * @jest-environment jsdom
 */

import * as fabric from 'fabric';
import {
    applyBezierNodesToPath,
    attachBezierControls,
    createPenDraftLine,
    isPenDraftAnchor,
    setPenSpacePressed,
    type BezierPathObject,
} from '@/lib/pen-fabric';
import { buildAutoBezierNodes, buildBezierPathData } from '@/lib/pen-utils';
import type { PenNode } from '@/types';

const POINTS = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }];

const makeBezierPath = (closed = false): BezierPathObject => {
    const nodes = buildAutoBezierNodes(POINTS, closed);
    const path = new fabric.Path(buildBezierPathData(nodes, closed)) as BezierPathObject;
    path.penNodes = nodes;
    path.penClosed = closed;
    return path;
};

/** Drive a control the way fabric does mid-drag. */
const drag = (path: BezierPathObject, key: string, x: number, y: number) => {
    const control = path.controls[key];
    return control.actionHandler(
        {} as fabric.TPointerEvent,
        { target: path } as unknown as fabric.Transform,
        x,
        y,
    );
};

describe('createPenDraftLine', () => {
    it('returns nothing for no points', () => {
        expect(createPenDraftLine([], 'straight', 'open')).toBeNull();
    });

    it('draws a single point as a degenerate polyline in every mode', () => {
        for (const mode of ['straight', 'smooth', 'bezier'] as const) {
            expect(createPenDraftLine([POINTS[0]], mode, 'open')).toBeInstanceOf(fabric.Polyline);
        }
    });

    it('uses a polygon only when a straight draft is closed and has an area', () => {
        expect(createPenDraftLine(POINTS, 'straight', 'closed')).toBeInstanceOf(fabric.Polygon);
        expect(createPenDraftLine(POINTS, 'straight', 'open')).not.toBeInstanceOf(fabric.Polygon);
        // Two points cannot enclose anything, so "closed" is ignored.
        const twoPoint = createPenDraftLine(POINTS.slice(0, 2), 'straight', 'closed');
        expect(twoPoint).not.toBeInstanceOf(fabric.Polygon);
        expect(twoPoint?.fill).toBe('transparent');
    });

    it('draws smooth and bezier drafts as paths', () => {
        expect(createPenDraftLine(POINTS, 'smooth', 'open')).toBeInstanceOf(fabric.Path);
        expect(createPenDraftLine(POINTS, 'bezier', 'closed')).toBeInstanceOf(fabric.Path);
    });

    it('never lets the draft intercept the pointer events that place the next anchor', () => {
        const draft = createPenDraftLine(POINTS, 'bezier', 'open');
        expect(draft?.selectable).toBe(false);
        expect(draft?.evented).toBe(false);
    });
});

describe('isPenDraftAnchor', () => {
    it('recognises only flagged objects', () => {
        const circle = new fabric.Circle({ radius: 3 });
        expect(isPenDraftAnchor(circle)).toBe(false);
        (circle as fabric.Circle & { isPenDraftAnchor?: boolean }).isPenDraftAnchor = true;
        expect(isPenDraftAnchor(circle)).toBe(true);
        expect(isPenDraftAnchor(null)).toBe(false);
    });
});

describe('applyBezierNodesToPath', () => {
    it('rewrites the geometry and records what it was built from', () => {
        const path = makeBezierPath();
        const nodes = buildAutoBezierNodes([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 120 }], true);
        applyBezierNodesToPath(path, nodes, true);

        expect(path.penNodes).toBe(nodes);
        expect(path.penClosed).toBe(true);
        expect(path.penMode).toBe('bezier');
        expect(path.isPenPath).toBe(true);
        expect(path.penSourcePoints).toEqual(nodes.map(({ x, y }) => ({ x, y })));
        expect(path.path).toEqual(new fabric.Path(buildBezierPathData(nodes, true)).path);
    });

    it('keeps the object centred where it was, so an edit does not make it jump', () => {
        const path = makeBezierPath();
        path.set({ left: 300, top: 200 });
        path.setCoords();
        const before = path.getCenterPoint();
        applyBezierNodesToPath(path, buildAutoBezierNodes([{ x: 0, y: 0 }, { x: 400, y: 10 }], false), false);
        const after = path.getCenterPoint();
        expect(after.x).toBeCloseTo(before.x);
        expect(after.y).toBeCloseTo(before.y);
    });
});

describe('attachBezierControls', () => {
    afterEach(() => setPenSpacePressed(false));

    it('leaves a path without bezier nodes alone', () => {
        const plain = new fabric.Path('M 0 0 L 10 10') as BezierPathObject;
        const before = plain.controls;
        attachBezierControls(plain);
        expect(plain.controls).toBe(before);
    });

    it('adds an anchor and two handles per node, replacing the resize controls', () => {
        const path = makeBezierPath();
        attachBezierControls(path);
        expect(Object.keys(path.controls).sort()).toEqual([
            'anchor_0', 'anchor_1', 'anchor_2',
            'handleIn_0', 'handleIn_1', 'handleIn_2',
            'handleOut_0', 'handleOut_1', 'handleOut_2',
        ]);
        expect(path.hasBorders).toBe(false);
    });

    it('dragging an anchor carries both of its handles with it', () => {
        const path = makeBezierPath();
        attachBezierControls(path);
        const before = path.penNodes![1];
        const offsetIn = { x: before.handleIn.x - before.x, y: before.handleIn.y - before.y };
        const offsetOut = { x: before.handleOut.x - before.x, y: before.handleOut.y - before.y };

        expect(drag(path, 'anchor_1', 140, 30)).toBe(true);

        const after = path.penNodes![1];
        expect(after).not.toBe(before);
        expect(after.x === before.x && after.y === before.y).toBe(false);
        expect(after.handleIn.x - after.x).toBeCloseTo(offsetIn.x);
        expect(after.handleIn.y - after.y).toBeCloseTo(offsetIn.y);
        expect(after.handleOut.x - after.x).toBeCloseTo(offsetOut.x);
        expect(after.handleOut.y - after.y).toBeCloseTo(offsetOut.y);
    });

    it('does not mutate the previous node array, which undo history may still hold', () => {
        const path = makeBezierPath();
        attachBezierControls(path);
        const snapshot: PenNode[] = JSON.parse(JSON.stringify(path.penNodes));
        const original = path.penNodes!;
        drag(path, 'anchor_0', 55, 66);
        expect(original).toEqual(snapshot);
    });

    it('dragging a handle mirrors the opposite one through the anchor', () => {
        const path = makeBezierPath();
        attachBezierControls(path);
        drag(path, 'handleOut_1', 160, 20);
        const node = path.penNodes![1];
        expect(node.handleIn.x).toBeCloseTo(2 * node.x - node.handleOut.x);
        expect(node.handleIn.y).toBeCloseTo(2 * node.y - node.handleOut.y);
    });

    it('holding Space breaks the mirror so a corner can be made', () => {
        const path = makeBezierPath();
        attachBezierControls(path);
        const handleInBefore = { ...path.penNodes![1].handleIn };
        setPenSpacePressed(true);
        drag(path, 'handleOut_1', 160, 20);
        expect(path.penNodes![1].handleIn).toEqual(handleInBefore);
    });
});
