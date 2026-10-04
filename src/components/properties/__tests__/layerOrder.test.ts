import type * as fabric from 'fabric';
import { getLayerOrderState, moveLayerInOrder } from '@/components/properties/layerOrder';

type Layer = Record<string, unknown>;

const layer = (name: string, extra: Layer = {}): Layer => ({ name, type: 'rect', ...extra });

const makeCanvas = (stack: Layer[], page?: Layer) => {
    const objects = [...stack];
    const canvas = {
        artboardRect: page,
        getObjects: () => objects,
        moveObjectTo: (target: Layer, index: number) => {
            objects.splice(objects.indexOf(target), 1);
            objects.splice(index, 0, target);
        },
    };
    return { canvas: canvas as unknown as fabric.Canvas, names: () => objects.map((object) => object.name) };
};

const makeGroup = (children: Layer[]) => {
    const members = [...children];
    const group = {
        getObjects: () => members,
        remove: (target: Layer) => { members.splice(members.indexOf(target), 1); },
        insertAt: (index: number, target: Layer) => { members.splice(index, 0, target); },
        setCoords: jest.fn(),
        set: jest.fn(),
    };
    children.forEach((child) => { child.group = group; });
    return { group, names: () => members.map((member) => member.name) };
};

const asObject = (value: Layer) => value as unknown as fabric.Object;

const NONE = { canMoveUp: false, canMoveDown: false, canBringToFront: false, canSendToBack: false };

describe('getLayerOrderState', () => {
    it('offers nothing without a canvas or a layer', () => {
        expect(getLayerOrderState(null, asObject(layer('a')))).toEqual(NONE);
        expect(getLayerOrderState(makeCanvas([]).canvas, null)).toEqual(NONE);
    });

    it('lets a middle layer go either way', () => {
        const [a, b, c] = [layer('a'), layer('b'), layer('c')];
        expect(getLayerOrderState(makeCanvas([a, b, c]).canvas, asObject(b)))
            .toEqual({ canMoveUp: true, canMoveDown: true, canBringToFront: true, canSendToBack: true });
    });

    it('stops the top layer rising and the bottom layer sinking', () => {
        const [a, b] = [layer('a'), layer('b')];
        const { canvas } = makeCanvas([a, b]);
        expect(getLayerOrderState(canvas, asObject(b)).canMoveUp).toBe(false);
        expect(getLayerOrderState(canvas, asObject(a)).canMoveDown).toBe(false);
    });

    it('treats the layer just above the page as the bottom', () => {
        const page = layer('page');
        const [a, b] = [layer('a'), layer('b')];
        const { canvas } = makeCanvas([page, a, b], page);
        expect(getLayerOrderState(canvas, asObject(a)))
            .toEqual({ canMoveUp: true, canMoveDown: false, canBringToFront: true, canSendToBack: false });
    });

    it('never offers to move the page, a multi-selection or a retouch layer', () => {
        const page = layer('page');
        const retouch = layer('retouch', { isRetouchLayer: true });
        const selection = layer('selection', { type: 'activeSelection' });
        const { canvas } = makeCanvas([page, retouch, selection, layer('z')], page);
        expect(getLayerOrderState(canvas, asObject(page))).toEqual(NONE);
        expect(getLayerOrderState(canvas, asObject(retouch))).toEqual(NONE);
        expect(getLayerOrderState(canvas, asObject(selection))).toEqual(NONE);
    });

    it('measures a grouped layer against its siblings, not the canvas', () => {
        const [a, b] = [layer('a'), layer('b')];
        makeGroup([a, b]);
        const { canvas } = makeCanvas([layer('page'), layer('other')]);
        expect(getLayerOrderState(canvas, asObject(a)).canMoveUp).toBe(true);
        expect(getLayerOrderState(canvas, asObject(b)).canMoveUp).toBe(false);
    });

    it('offers nothing for a layer that is not on the canvas', () => {
        expect(getLayerOrderState(makeCanvas([layer('a')]).canvas, asObject(layer('stray')))).toEqual(NONE);
    });
});

describe('moveLayerInOrder', () => {
    it('moves one step or all the way', () => {
        const [a, b, c, d] = [layer('a'), layer('b'), layer('c'), layer('d')];
        const { canvas, names } = makeCanvas([a, b, c, d]);
        expect(moveLayerInOrder(canvas, asObject(b), 'move-up')).toBe(true);
        expect(names()).toEqual(['a', 'c', 'b', 'd']);
        expect(moveLayerInOrder(canvas, asObject(a), 'to-front')).toBe(true);
        expect(names()).toEqual(['c', 'b', 'd', 'a']);
        expect(moveLayerInOrder(canvas, asObject(d), 'to-back')).toBe(true);
        expect(names()).toEqual(['d', 'c', 'b', 'a']);
    });

    it('never puts a layer beneath the page', () => {
        const page = layer('page');
        const [a, b] = [layer('a'), layer('b')];
        const { canvas, names } = makeCanvas([page, a, b], page);
        expect(moveLayerInOrder(canvas, asObject(b), 'to-back')).toBe(true);
        expect(names()).toEqual(['page', 'b', 'a']);
        expect(moveLayerInOrder(canvas, asObject(b), 'move-down')).toBe(false);
        expect(names()).toEqual(['page', 'b', 'a']);
    });

    it('reports no move when the layer is already there', () => {
        const [a, b] = [layer('a'), layer('b')];
        const { canvas, names } = makeCanvas([a, b]);
        expect(moveLayerInOrder(canvas, asObject(b), 'to-front')).toBe(false);
        expect(names()).toEqual(['a', 'b']);
    });

    it('refuses to move the page itself', () => {
        const page = layer('page');
        const { canvas, names } = makeCanvas([page, layer('a')], page);
        expect(moveLayerInOrder(canvas, asObject(page), 'to-front')).toBe(false);
        expect(names()).toEqual(['page', 'a']);
    });

    it('reorders within a group and leaves the canvas stack alone', () => {
        const [a, b, c] = [layer('a'), layer('b'), layer('c')];
        const { group, names: groupNames } = makeGroup([a, b, c]);
        const { canvas, names } = makeCanvas([layer('page'), layer('other')]);
        expect(moveLayerInOrder(canvas, asObject(a), 'to-front')).toBe(true);
        expect(groupNames()).toEqual(['b', 'c', 'a']);
        expect(names()).toEqual(['page', 'other']);
        expect(group.set).toHaveBeenCalledWith('dirty', true);
    });
});
