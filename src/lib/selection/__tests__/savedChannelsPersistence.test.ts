import type * as fabric from 'fabric';

import { loadCanvasJson } from '@/lib/fabric-utils';
import { loadPageJson, withSavedChannels } from '@/lib/pageChannels';
import {
    addSavedChannel,
    getSavedChannels,
    restoreSavedChannels,
    serializeSavedChannels,
    type SavedChannel,
} from '@/lib/selection/savedChannels';

const makeCanvas = () => ({
    loadFromJSON: jest.fn(async () => undefined),
    requestRenderAll: jest.fn(),
    getObjects: () => [],
}) as unknown as fabric.Canvas;

const channel = (name: string, values: number[], width = values.length, height = 1): SavedChannel => ({
    id: `id-${name}`,
    name,
    source: 'selection',
    left: 3,
    top: 4,
    width,
    height,
    data: Uint8ClampedArray.from(values),
});

describe('saved channels travel with the page', () => {
    it('round-trips a hard-edged selection as runs and a soft mask as bytes', () => {
        const canvas = makeCanvas();
        const soft = Array.from({ length: 64 }, (_, index) => (index * 37) % 256);
        addSavedChannel(canvas, channel('Sky', [255, 255, 255, 0, 0, 0, 0, 0]));
        addSavedChannel(canvas, channel('Glow', soft));

        const stored = JSON.parse(JSON.stringify(serializeSavedChannels(canvas)));
        const byName = Object.fromEntries(stored.map((entry: { name: string }) => [entry.name, entry]));
        expect(byName.Sky.runs).toEqual([255, 3, 0, 5]);
        expect(byName.Sky.bytes).toBeUndefined();
        expect(typeof byName.Glow.bytes).toBe('string');

        const reopened = makeCanvas();
        expect(restoreSavedChannels(reopened, stored)).toBe(2);
        const restored = getSavedChannels(reopened);
        expect(restored.map((entry) => entry.name)).toEqual(getSavedChannels(canvas).map((entry) => entry.name));
        expect(Array.from(restored.find((entry) => entry.name === 'Sky')!.data)).toEqual([255, 255, 255, 0, 0, 0, 0, 0]);
        expect(Array.from(restored.find((entry) => entry.name === 'Glow')!.data)).toEqual(soft);
        expect(restored.find((entry) => entry.name === 'Sky')).toMatchObject({ left: 3, top: 4, width: 8, height: 1 });
    });

    it('adds channels to a serialized page only when there are some', () => {
        const canvas = makeCanvas();
        const json = { objects: [] };
        expect(withSavedChannels(canvas, json)).toBe(json);
        addSavedChannel(canvas, channel('A', [255, 0]));
        expect(withSavedChannels(canvas, json)).toMatchObject({ objects: [], savedChannels: [{ name: 'A' }] });
    });

    it('restores channels when a page is opened and never hands them to fabric', async () => {
        const source = makeCanvas();
        addSavedChannel(source, channel('A', [255, 0]));
        const page = withSavedChannels(source, { objects: [] });

        const canvas = makeCanvas();
        await loadPageJson(canvas, JSON.parse(JSON.stringify(page)));

        expect(getSavedChannels(canvas).map((entry) => entry.name)).toEqual(['A']);
        const handed = (canvas.loadFromJSON as jest.Mock).mock.calls[0][0];
        expect(handed).not.toHaveProperty('savedChannels');
    });

    it('clears the previous page’s channels when a page without any is opened', async () => {
        const canvas = makeCanvas();
        addSavedChannel(canvas, channel('Old', [255]));
        await loadPageJson(canvas, { objects: [] });
        expect(getSavedChannels(canvas)).toHaveLength(0);
    });

    it('leaves channels alone on undo, whose snapshots carry none', async () => {
        const canvas = makeCanvas();
        addSavedChannel(canvas, channel('Keep', [255]));
        await loadCanvasJson(canvas, { objects: [] });
        expect(getSavedChannels(canvas).map((entry) => entry.name)).toEqual(['Keep']);
    });

    it('drops entries from a file that do not hold together', () => {
        const canvas = makeCanvas();
        const count = restoreSavedChannels(canvas, [
            { name: 'ok', source: 'alpha', width: 2, height: 1, runs: [255, 2] },
            { name: 'short', width: 4, height: 1, runs: [255, 2] },
            { name: 'huge', width: 100000, height: 100000, runs: [0, 1] },
            { name: 'negative', width: -2, height: 1, runs: [0, 2] },
            { name: 'bad bytes', width: 2, height: 1, bytes: '!!not base64!!' },
            { name: 'wrong length', width: 9, height: 1, bytes: 'AAAA' },
            'not an object',
            null,
        ]);
        expect(count).toBe(1);
        expect(getSavedChannels(canvas)[0]).toMatchObject({ name: 'ok', source: 'alpha', left: 0, top: 0 });

        expect(restoreSavedChannels(canvas, { not: 'a list' })).toBe(0);
        expect(getSavedChannels(canvas)).toHaveLength(0);
    });
});
