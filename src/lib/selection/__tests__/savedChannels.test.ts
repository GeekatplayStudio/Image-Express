import type * as fabric from 'fabric';
import {
    addSavedChannel,
    applyChannelToMask,
    blankMaskFor,
    channelCoveragePercent,
    channelFromMask,
    channelFromPixels,
    decodeChannelData,
    deleteSavedChannel,
    encodeChannelData,
    getSavedChannels,
    loadChannelAsSelection,
    moveSavedChannel,
    renameSavedChannel,
    saveSelectionAsChannel,
    subscribeSavedChannels,
    uniqueChannelName,
    type SavedChannel,
} from '@/lib/selection/savedChannels';
import { createDocumentSelectionMask } from '@/lib/selection/documentSelectionMask';
import {
    commitDocumentSelection,
    getDocumentSelectionMask,
    hasDocumentSelection,
} from '@/lib/selection/documentSelectionStore';

/** A 4×2 page at the origin; enough to see every pixel in an assertion. */
const makeCanvas = (width = 4, height = 2) => ({
    artboard: { left: 0, top: 0, width, height },
    getWidth: () => width,
    getHeight: () => height,
    requestRenderAll: jest.fn(),
}) as unknown as fabric.Canvas;

const maskOf = (values: number[], width = 4, left = 0, top = 0) => {
    const mask = createDocumentSelectionMask({ left, top, width, height: values.length / width });
    mask.data.set(values);
    return mask;
};

const names = (canvas: fabric.Canvas) => getSavedChannels(canvas).map((channel) => channel.name);

describe('building channels', () => {
    it('copies the mask, so later selection edits do not change the channel', () => {
        const mask = maskOf([255, 255, 0, 0, 0, 0, 0, 0]);
        const channel = channelFromMask(mask, 'Sky');
        mask.data.fill(0);
        expect(Array.from(channel.data)).toEqual([255, 255, 0, 0, 0, 0, 0, 0]);
    });

    it('builds an alpha channel from transparency', () => {
        const pixels = { width: 2, height: 1, data: [10, 20, 30, 255, 200, 200, 200, 64] };
        const channel = channelFromPixels(pixels, { left: 5, top: 7 }, 'alpha', 'Alpha');
        expect(Array.from(channel.data)).toEqual([255, 64]);
        expect(channel).toMatchObject({ source: 'alpha', left: 5, top: 7, width: 2, height: 1 });
    });

    it('builds a luma channel from brightness, with transparent pixels unselected', () => {
        const pixels = {
            width: 4,
            height: 1,
            data: [255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 0, 0, 255, 0, 255],
        };
        const [white, black, clearWhite, green] = Array.from(channelFromPixels(pixels, { left: 0, top: 0 }, 'luma', 'Luma').data);
        expect(white).toBe(255);
        expect(black).toBe(0);
        // Bright but fully transparent: nothing there to select.
        expect(clearWhite).toBe(0);
        // Green carries most of perceived brightness.
        expect(green).toBe(182);
    });

    it('reports how much of the area a channel selects', () => {
        expect(channelCoveragePercent(channelFromMask(maskOf([255, 255, 0, 0, 0, 0, 0, 0]), 'x'))).toBe(25);
        expect(channelCoveragePercent(channelFromMask(maskOf([0, 0, 0, 0]), 'x'))).toBe(0);
    });
});

describe('applyChannelToMask', () => {
    const channel = channelFromMask(maskOf([255, 255, 0, 0, 0, 0, 0, 0]), 'left half of top row');

    it('replaces, adds, subtracts and intersects', () => {
        const start = () => maskOf([0, 255, 255, 0, 0, 0, 0, 0]);
        const run = (mode: Parameters<typeof applyChannelToMask>[2]) => {
            const mask = start();
            applyChannelToMask(mask, channel, mode);
            return Array.from(mask.data).slice(0, 4);
        };
        expect(run('replace')).toEqual([255, 255, 0, 0]);
        expect(run('add')).toEqual([255, 255, 255, 0]);
        expect(run('subtract')).toEqual([0, 0, 255, 0]);
        expect(run('intersect')).toEqual([0, 255, 0, 0]);
    });

    it('keeps soft edges when combining', () => {
        const soft = channelFromMask(maskOf([128, 0, 0, 0]), 'soft');
        const mask = maskOf([200, 0, 0, 0]);
        applyChannelToMask(mask, soft, 'subtract');
        expect(mask.data[0]).toBe(72);
        applyChannelToMask(mask, soft, 'add');
        expect(mask.data[0]).toBe(128);
    });

    it('lands a channel where it was made when the mask covers a different area', () => {
        // Channel saved over x 2..3; the mask now starts at x 0 and is wider.
        const offset = channelFromMask(maskOf([255, 255], 2, 2, 0), 'offset');
        const mask = maskOf([0, 0, 0, 0]);
        applyChannelToMask(mask, offset, 'replace');
        expect(Array.from(mask.data)).toEqual([0, 0, 255, 255]);
    });

    it('treats the area a channel does not cover as unselected', () => {
        const small = channelFromMask(maskOf([255], 1, 0, 0), 'one pixel');
        const mask = maskOf([255, 255, 255, 255]);
        applyChannelToMask(mask, small, 'intersect');
        expect(Array.from(mask.data)).toEqual([255, 0, 0, 0]);
    });
});

describe('the channel stack', () => {
    it('saves the current selection, and refuses when nothing is selected', () => {
        const canvas = makeCanvas();
        expect(saveSelectionAsChannel(canvas, 'Selection')).toBeNull();

        commitDocumentSelection(canvas, maskOf([255, 0, 0, 0, 0, 0, 0, 0]), null);
        const saved = saveSelectionAsChannel(canvas, 'Selection');
        expect(saved?.name).toBe('Selection');
        expect(names(canvas)).toEqual(['Selection']);
    });

    it('never gives two channels the same name', () => {
        const canvas = makeCanvas();
        commitDocumentSelection(canvas, maskOf([255, 0, 0, 0, 0, 0, 0, 0]), null);
        saveSelectionAsChannel(canvas, 'Selection');
        saveSelectionAsChannel(canvas, 'Selection');
        saveSelectionAsChannel(canvas, 'selection');
        // Compared without regard to case; the user's own spelling is kept.
        expect(names(canvas)).toEqual(['selection 3', 'Selection 2', 'Selection']);
        expect(uniqueChannelName('  ', [])).toBe('Channel');
    });

    it('loads a channel back as the active selection', () => {
        const canvas = makeCanvas();
        commitDocumentSelection(canvas, maskOf([255, 255, 0, 0, 0, 0, 0, 0]), 'layer-1');
        const saved = saveSelectionAsChannel(canvas, 'Sky')!;

        // The selection moves on to something else entirely.
        commitDocumentSelection(canvas, maskOf([0, 0, 0, 0, 0, 0, 0, 255]), 'layer-2');

        expect(loadChannelAsSelection(canvas, saved.id)).toBe(true);
        expect(Array.from(getDocumentSelectionMask(canvas)!.data)).toEqual([255, 255, 0, 0, 0, 0, 0, 0]);
        expect(hasDocumentSelection(canvas)).toBe(true);
        expect(loadChannelAsSelection(canvas, 'no-such-channel')).toBe(false);
    });

    it('renames, keeping names unique and ignoring an empty name', () => {
        const canvas = makeCanvas();
        const a = addSavedChannel(canvas, channelFromMask(maskOf([255, 0, 0, 0]), 'A'));
        const b = addSavedChannel(canvas, channelFromMask(maskOf([0, 255, 0, 0]), 'B'));

        renameSavedChannel(canvas, b.id, 'A');
        expect(names(canvas)).toEqual(['A 2', 'A']);
        renameSavedChannel(canvas, a.id, '   ');
        expect(names(canvas)).toEqual(['A 2', 'A']);
        // Renaming a channel to its own name is not a clash with itself.
        renameSavedChannel(canvas, a.id, 'A');
        expect(names(canvas)).toEqual(['A 2', 'A']);
    });

    it('reorders and deletes', () => {
        const canvas = makeCanvas();
        const ids = ['one', 'two', 'three'].map((name) => addSavedChannel(canvas, channelFromMask(maskOf([255, 0, 0, 0]), name)).id);
        expect(names(canvas)).toEqual(['three', 'two', 'one']);

        moveSavedChannel(canvas, ids[0], -1);
        expect(names(canvas)).toEqual(['three', 'one', 'two']);
        // Already at the top: nothing happens.
        moveSavedChannel(canvas, ids[2], -1);
        expect(names(canvas)).toEqual(['three', 'one', 'two']);

        deleteSavedChannel(canvas, ids[0]);
        expect(names(canvas)).toEqual(['three', 'two']);
    });

    it('notifies subscribers only when something actually changes', () => {
        const canvas = makeCanvas();
        const heard = jest.fn();
        const unsubscribe = subscribeSavedChannels(canvas, heard);
        const channel = addSavedChannel(canvas, channelFromMask(maskOf([255, 0, 0, 0]), 'A'));
        expect(heard).toHaveBeenCalledTimes(1);

        deleteSavedChannel(canvas, 'missing');
        moveSavedChannel(canvas, channel.id, 1);
        expect(heard).toHaveBeenCalledTimes(1);

        unsubscribe();
        deleteSavedChannel(canvas, channel.id);
        expect(heard).toHaveBeenCalledTimes(1);
    });

    it('keeps each page’s channels separate', () => {
        const first = makeCanvas();
        const second = makeCanvas();
        addSavedChannel(first, channelFromMask(maskOf([255, 0, 0, 0]), 'A'));
        expect(getSavedChannels(second)).toEqual([]);
        expect(getSavedChannels(null)).toEqual([]);
    });
});

describe('channel data encoding', () => {
    it('round-trips a mask', () => {
        const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 128, 0, 0]);
        const runs = encodeChannelData(data);
        expect(runs).toEqual([0, 3, 255, 2, 128, 1, 0, 2]);
        expect(Array.from(decodeChannelData(runs, data.length)!)).toEqual(Array.from(data));
    });

    it('makes a typical mask far smaller than its raw bytes', () => {
        // A full-HD mask with a rectangle selected.
        const data = new Uint8ClampedArray(1920 * 1080);
        for (let y = 200; y < 800; y += 1) data.fill(255, y * 1920 + 300, y * 1920 + 1500);
        expect(encodeChannelData(data).length).toBeLessThan(data.length / 500);
    });

    it('refuses runs that do not describe a mask of the stated size', () => {
        expect(decodeChannelData([0, 3], 4)).toBeNull();
        expect(decodeChannelData([0, 5], 4)).toBeNull();
        expect(decodeChannelData([0, 2, 255], 2)).toBeNull();
        expect(decodeChannelData([0, -1], 0)).toBeNull();
        expect(Array.from(decodeChannelData([], 0)!)).toEqual([]);
    });

    it('offers a blank mask over a channel’s own area', () => {
        const channel: SavedChannel = channelFromMask(maskOf([255, 255], 2, 10, 20), 'x');
        const blank = blankMaskFor(channel);
        expect(blank).toMatchObject({ left: 10, top: 20, width: 2, height: 1 });
        expect(Array.from(blank.data)).toEqual([0, 0]);
    });
});
