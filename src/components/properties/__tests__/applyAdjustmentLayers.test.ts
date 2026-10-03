/**
 * @jest-environment jsdom
 */

jest.mock('@/lib/fabric-utils', () => ({
    ...jest.requireActual('@/lib/fabric-utils'),
    // Applying filters needs a real 2D/WebGL backend; what matters here is
    // which filters each image was handed, not the pixels.
    applyImageFiltersPreservingGeometry: jest.fn(),
}));

import * as fabric from 'fabric';
import { applyAdjustmentLayersToCanvas } from '@/components/properties/applyAdjustmentLayers';
import { applyImageFiltersPreservingGeometry, getDefaultAdjustmentSettings } from '@/lib/fabric-utils';
import { isAdjustmentGeneratedFilter } from '@/lib/fabric-filters';
import type { AdjustmentLayerType } from '@/types';

type Layer = Record<string, unknown> & { set: (props: Record<string, unknown>) => void };

const withSet = (props: Record<string, unknown>): Layer => {
    const layer = { ...props } as Layer;
    layer.set = (next) => { Object.assign(layer, next); };
    return layer;
};

const image = (name: string, extra: Record<string, unknown> = {}) =>
    withSet({ type: 'image', name, visible: true, filters: [], applyFilters: jest.fn(), ...extra });

const adjustment = (type: AdjustmentLayerType, extra: Record<string, unknown> = {}) =>
    withSet({
        type: 'rect',
        isAdjustmentLayer: true,
        adjustmentType: type,
        adjustmentSettings: getDefaultAdjustmentSettings(type),
        visible: true,
        opacity: 1,
        evented: false,
        selectable: false,
        ...extra,
    });

/** Bottom-to-top, as fabric stores them. */
const run = (...stack: Layer[]) => {
    const canvas = { getObjects: () => stack, requestRenderAll: jest.fn() };
    applyAdjustmentLayersToCanvas(canvas as unknown as fabric.Canvas);
    return canvas;
};

const generated = (layer: Layer) =>
    (layer.filters as Array<{ type: string }>).filter((filter) => isAdjustmentGeneratedFilter(filter as never));

describe('applyAdjustmentLayersToCanvas', () => {
    beforeEach(() => jest.clearAllMocks());

    it('applies an unclipped adjustment to every image beneath it', () => {
        const bottom = image('bottom');
        const middle = image('middle');
        run(bottom, middle, adjustment('brightness-contrast'));
        expect(generated(bottom).length).toBeGreaterThan(0);
        expect(generated(middle).length).toBe(generated(bottom).length);
    });

    it('does not reach images above the adjustment', () => {
        const below = image('below');
        const above = image('above');
        run(below, adjustment('brightness-contrast'), above);
        expect(generated(below).length).toBeGreaterThan(0);
        expect(generated(above)).toEqual([]);
    });

    it('confines a clipped adjustment to the one layer directly beneath it', () => {
        const bottom = image('bottom');
        const target = image('target');
        run(bottom, target, adjustment('brightness-contrast', { clipped: true }));
        expect(generated(target).length).toBeGreaterThan(0);
        expect(generated(bottom)).toEqual([]);
    });

    it('ignores a hidden adjustment layer', () => {
        const target = image('target');
        run(target, adjustment('brightness-contrast', { visible: false }));
        expect(generated(target)).toEqual([]);
    });

    it('lets a clipped adjustment see through a hidden layer to the next visible one', () => {
        const target = image('target');
        const hidden = image('hidden', { visible: false });
        run(target, hidden, adjustment('brightness-contrast', { clipped: true }));
        expect(generated(target).length).toBeGreaterThan(0);
        expect(generated(hidden)).toEqual([]);
    });

    it('keeps the image’s own filters and puts adjustment filters after them', () => {
        const own = { type: 'Blur' };
        const target = image('target', { filters: [own] });
        run(target, adjustment('brightness-contrast'));
        const filters = target.filters as unknown[];
        expect(filters[0]).toBe(own);
        expect(filters.length).toBeGreaterThan(1);
    });

    it('is idempotent: re-running does not stack the same adjustment twice', () => {
        const target = image('target', { filters: [{ type: 'Blur' }] });
        const stack = [target, adjustment('brightness-contrast')];
        run(...stack);
        const once = (target.filters as unknown[]).length;
        run(...stack);
        run(...stack);
        expect((target.filters as unknown[]).length).toBe(once);
    });

    it('removes the filters again when the adjustment layer is deleted', () => {
        const own = { type: 'Blur' };
        const target = image('target', { filters: [own] });
        run(target, adjustment('brightness-contrast'));
        run(target);
        // The stored base filter is revived into a real filter instance, so
        // compare by kind rather than identity.
        expect((target.filters as Array<{ type: string }>).map((filter) => filter.type)).toEqual(['Blur']);
        expect(generated(target)).toEqual([]);
    });

    it('orders stacked adjustments bottom-first, so the upper one acts on the lower one’s result', () => {
        const target = image('target');
        const lower = adjustment('brightness-contrast');
        const upper = adjustment('hue-saturation');
        run(target, lower, upper);
        const lowerOnly = image('a');
        run(lowerOnly, adjustment('brightness-contrast'));
        const lowerTypes = generated(lowerOnly).map((filter) => filter.type);
        const combined = generated(target).map((filter) => filter.type);
        expect(combined.slice(0, lowerTypes.length)).toEqual(lowerTypes);
        expect(combined.length).toBeGreaterThan(lowerTypes.length);
    });

    it('stops adjustment layers from intercepting canvas clicks', () => {
        const layer = adjustment('brightness-contrast', { evented: true, selectable: true });
        run(image('target'), layer);
        expect(layer.evented).toBe(false);
        expect(layer.selectable).toBe(false);
    });

    it('re-applies filters to each image and requests one render', () => {
        const canvas = run(image('a'), image('b'), adjustment('brightness-contrast'));
        expect(applyImageFiltersPreservingGeometry).toHaveBeenCalledTimes(2);
        expect(canvas.requestRenderAll).toHaveBeenCalledTimes(1);
    });
});
