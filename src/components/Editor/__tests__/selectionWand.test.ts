import {
    findTopObjectAtPointer,
    isSelectionChromeObject,
    resolveWandSelection,
    toRgbColor,
} from '../selectionWand';

const point = (x: number, y: number) => ({ x, y }) as import('fabric').Point;

const makeObj = (overrides: Record<string, unknown>) => ({
    type: 'rect',
    selectable: true,
    evented: true,
    fill: '#336699',
    stroke: null,
    containsPoint: jest.fn((p: { x: number; y: number }) => {
        const bounds = (overrides.getBoundingRect as () => { left: number; top: number; width: number; height: number })();
        return (
            p.x >= bounds.left
            && p.x <= bounds.left + bounds.width
            && p.y >= bounds.top
            && p.y <= bounds.top + bounds.height
        );
    }),
    getBoundingRect: jest.fn(() => ({ left: 100, top: 100, width: 80, height: 80 })),
    ...overrides,
}) as unknown as import('fabric').Object;

describe('selectionWand', () => {
    it('parses hex fills', () => {
        expect(toRgbColor('#336699')).toEqual({ r: 51, g: 102, b: 153 });
    });

    it('treats artboard chrome as non-selectable', () => {
        expect(isSelectionChromeObject(makeObj({ selectable: false, evented: false }))).toBe(true);
        expect(isSelectionChromeObject(makeObj({ name: 'Artboard' }))).toBe(true);
        expect(isSelectionChromeObject(makeObj({}))).toBe(false);
    });

    it('finds the top-most object under the pointer', () => {
        const back = makeObj({
            fill: '#111111',
            getBoundingRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
        });
        const front = makeObj({
            fill: '#eeeeee',
            getBoundingRect: () => ({ left: 50, top: 50, width: 40, height: 40 }),
        });
        // Rebind containsPoint after overrides
        (back as { containsPoint: (p: { x: number; y: number }) => boolean }).containsPoint = (p) => (
            p.x >= 0 && p.x <= 200 && p.y >= 0 && p.y <= 200
        );
        (front as { containsPoint: (p: { x: number; y: number }) => boolean }).containsPoint = (p) => (
            p.x >= 50 && p.x <= 90 && p.y >= 50 && p.y <= 90
        );

        expect(findTopObjectAtPointer([back, front], point(60, 60))).toBe(front);
        expect(findTopObjectAtPointer([back, front], point(10, 10))).toBe(back);
    });

    it('selects image-like seeds without fill as a single object', () => {
        const photo = makeObj({
            type: 'image',
            fill: null,
            stroke: null,
            getBoundingRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
        });
        (photo as { containsPoint: (p: { x: number; y: number }) => boolean }).containsPoint = () => true;

        expect(resolveWandSelection([photo], point(20, 20), 48)).toEqual([photo]);
    });

    it('matches similarly colored shapes by threshold', () => {
        const seed = makeObj({
            fill: '#336699',
            getBoundingRect: () => ({ left: 0, top: 0, width: 40, height: 40 }),
        });
        const near = makeObj({
            fill: '#3a6ea4',
            getBoundingRect: () => ({ left: 200, top: 0, width: 40, height: 40 }),
        });
        const far = makeObj({
            fill: '#e11d48',
            getBoundingRect: () => ({ left: 400, top: 0, width: 40, height: 40 }),
        });
        (seed as { containsPoint: (p: { x: number; y: number }) => boolean }).containsPoint = (p) => (
            p.x >= 0 && p.x <= 40 && p.y >= 0 && p.y <= 40
        );
        (near as { containsPoint: () => boolean }).containsPoint = () => false;
        (far as { containsPoint: () => boolean }).containsPoint = () => false;

        const matched = resolveWandSelection([seed, near, far], point(10, 10), 20);
        expect(matched).toContain(seed);
        expect(matched).toContain(near);
        expect(matched).not.toContain(far);
    });
});
