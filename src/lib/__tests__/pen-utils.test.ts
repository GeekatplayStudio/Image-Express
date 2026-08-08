/**
 * @jest-environment jsdom
 */

import {
    buildAutoBezierNodes,
    buildBezierPathData,
    buildSmoothPathData,
    buildStraightNodes,
    clonePenNodes,
    distanceBetween,
    getPenNodeBounds,
    nearlyEqual,
} from '@/lib/pen-utils';
import type { PenNode } from '@/types';

const node = (x: number, y: number, handleIn = { x, y }, handleOut = { x, y }): PenNode => ({
    x, y, handleIn, handleOut,
} as PenNode);

describe('nearlyEqual', () => {
    it('treats values inside the epsilon as equal', () => {
        expect(nearlyEqual(1, 1.0005)).toBe(true);
        expect(nearlyEqual(1, 1.01)).toBe(false);
    });

    it('honours an explicit epsilon', () => {
        expect(nearlyEqual(1, 1.01, 0.05)).toBe(true);
    });

    it('is symmetric and handles negatives', () => {
        expect(nearlyEqual(-5, -5.0001)).toBe(true);
        expect(nearlyEqual(-5.0001, -5)).toBe(true);
    });
});

describe('distanceBetween', () => {
    it('measures a 3-4-5 triangle', () => {
        expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it('is zero for the same point and never negative', () => {
        expect(distanceBetween({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
        expect(distanceBetween({ x: 5, y: 5 }, { x: -5, y: -5 })).toBeGreaterThan(0);
    });
});

describe('clonePenNodes', () => {
    it('copies handles rather than sharing them', () => {
        // The reason this function exists: an undo snapshot that aliased handles
        // would mutate with the live path and make the history useless.
        const original = [node(1, 2, { x: 0, y: 0 }, { x: 3, y: 3 })];
        const copy = clonePenNodes(original);

        copy[0].handleIn.x = 99;
        copy[0].handleOut.y = 99;

        expect(original[0].handleIn.x).toBe(0);
        expect(original[0].handleOut.y).toBe(3);
    });

    it('preserves values and length', () => {
        const original = [node(1, 2), node(3, 4)];
        expect(clonePenNodes(original)).toEqual(original);
    });

    it('handles an empty set', () => {
        expect(clonePenNodes([])).toEqual([]);
    });
});

describe('getPenNodeBounds', () => {
    it('includes handles, not just anchors', () => {
        // A curve bulges outside its anchors; bounds from anchors alone would
        // clip the very shape they are meant to contain.
        const nodes = [node(0, 0, { x: -50, y: -10 }, { x: 10, y: 60 })];
        expect(getPenNodeBounds(nodes)).toEqual({ minX: -50, minY: -10, maxX: 10, maxY: 60 });
    });

    it('spans every node', () => {
        const nodes = [node(0, 0), node(10, 20), node(-5, 7)];
        expect(getPenNodeBounds(nodes)).toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 20 });
    });

    it('returns a zero box for an empty set rather than infinities', () => {
        // Infinity would propagate into layout maths and produce NaN geometry.
        expect(getPenNodeBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    });

    it('handles a single point as a zero-area box at that point', () => {
        expect(getPenNodeBounds([node(4, 6)])).toEqual({ minX: 4, minY: 6, maxX: 4, maxY: 6 });
    });
});

describe('buildStraightNodes', () => {
    it('places handles on the anchor, so segments stay straight', () => {
        const nodes = buildStraightNodes([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
        expect(nodes).toHaveLength(2);
        for (const entry of nodes) {
            expect(entry.handleIn).toEqual({ x: entry.x, y: entry.y });
            expect(entry.handleOut).toEqual({ x: entry.x, y: entry.y });
        }
    });

    it('handles empty input', () => {
        expect(buildStraightNodes([])).toEqual([]);
    });
});

describe('buildAutoBezierNodes', () => {
    it('gives interior nodes handles that leave the anchor', () => {
        const nodes = buildAutoBezierNodes([
            { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 },
        ], false);

        const middle = nodes[1];
        const movedIn = middle.handleIn.x !== middle.x || middle.handleIn.y !== middle.y;
        const movedOut = middle.handleOut.x !== middle.x || middle.handleOut.y !== middle.y;
        expect(movedIn || movedOut).toBe(true);
    });

    it('produces one node per point, open or closed', () => {
        const points = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
        expect(buildAutoBezierNodes(points, false)).toHaveLength(3);
        expect(buildAutoBezierNodes(points, true)).toHaveLength(3);
    });

    it('produces only finite coordinates for duplicate points', () => {
        // Coincident points make the tangent direction undefined; a NaN here
        // renders as an invisible path with no error.
        const nodes = buildAutoBezierNodes([{ x: 5, y: 5 }, { x: 5, y: 5 }], false);
        for (const entry of nodes) {
            expect(Number.isFinite(entry.handleIn.x)).toBe(true);
            expect(Number.isFinite(entry.handleIn.y)).toBe(true);
            expect(Number.isFinite(entry.handleOut.x)).toBe(true);
            expect(Number.isFinite(entry.handleOut.y)).toBe(true);
        }
    });
});

describe('buildBezierPathData', () => {
    it('starts with a move and uses cubic segments', () => {
        const data = buildBezierPathData([node(0, 0), node(10, 10)], false);
        expect(data.startsWith('M ')).toBe(true);
        expect(data).toContain('C ');
        expect(data).not.toContain('Z');
    });

    it('closes the path when asked', () => {
        const data = buildBezierPathData([node(0, 0), node(10, 0), node(10, 10)], true);
        expect(data.trim().endsWith('Z')).toBe(true);
    });

    it('returns an empty string for no nodes', () => {
        expect(buildBezierPathData([], false)).toBe('');
    });

    it('emits no NaN for handles sitting on their anchors', () => {
        expect(buildBezierPathData([node(0, 0), node(5, 5)], false)).not.toContain('NaN');
    });
});

describe('buildSmoothPathData', () => {
    it('starts with a move command', () => {
        expect(buildSmoothPathData([{ x: 0, y: 0 }, { x: 10, y: 10 }], false).startsWith('M ')).toBe(true);
    });

    it('closes when asked', () => {
        const data = buildSmoothPathData([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 9 }], true);
        expect(data.trim().endsWith('Z')).toBe(true);
    });

    it('returns an empty string for no points', () => {
        expect(buildSmoothPathData([], false)).toBe('');
    });

    it('emits no NaN for a single point', () => {
        expect(buildSmoothPathData([{ x: 1, y: 1 }], false)).not.toContain('NaN');
    });
});
