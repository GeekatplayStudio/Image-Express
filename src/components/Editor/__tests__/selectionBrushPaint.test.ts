import {
    collectObjectsUnderBrush,
    mergeUniqueObjects,
    objectIntersectsBrush,
} from '../selectionBrushPaint';

describe('selectionBrushPaint', () => {
    const makeRect = (left: number, top: number, width: number, height: number) => ({
        type: 'rect',
        selectable: true,
        evented: true,
        getBoundingRect: () => ({ left, top, width, height }),
    }) as unknown as import('fabric').Object;

    it('hits objects whose AABB intersects the brush circle', () => {
        const obj = makeRect(100, 100, 40, 40);
        const center = { x: 80, y: 120 } as import('fabric').Point;
        expect(objectIntersectsBrush(obj, center, 24)).toBe(true);
        expect(objectIntersectsBrush(obj, center, 8)).toBe(false);
    });

    it('collects and merges unique painted objects in stroke order', () => {
        const a = makeRect(0, 0, 20, 20);
        const b = makeRect(40, 0, 20, 20);
        const hits = collectObjectsUnderBrush([a, b], { x: 10, y: 10 } as import('fabric').Point, 5);
        expect(hits).toEqual([a]);

        expect(mergeUniqueObjects([a], [a, b])).toEqual([a, b]);
        expect(mergeUniqueObjects([a, b], [b])).toEqual([a, b]);
    });
});
