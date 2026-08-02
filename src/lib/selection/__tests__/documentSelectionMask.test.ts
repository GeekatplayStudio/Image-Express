import {
    clearDocumentSelectionMask,
    createDocumentSelectionMask,
    documentSelectionToLuminanceDataUrl,
    featherDocumentSelectionMask,
    getDocumentSelectionTightBounds,
    isDocumentSelectionEmpty,
    morphDocumentSelectionMask,
} from '@/lib/selection/documentSelectionMask';
import { unionPolygonIntoMask, unionRectIntoMask } from '@/lib/selection/selectionMaskRasterize';
import {
    parseHexRgb,
    rgbToHex,
    unionColorMatchIntoMask,
    unionFloodFillIntoMask,
} from '@/lib/selection/selectionWandFloodFill';

describe('documentSelectionMask', () => {
    it('creates an empty artboard-sized mask and unions a rect', () => {
        const mask = createDocumentSelectionMask({ left: 10, top: 20, width: 40, height: 30 });
        expect(mask.data.length).toBe(40 * 30);
        expect(isDocumentSelectionEmpty(mask)).toBe(true);

        unionRectIntoMask(mask, { left: 15, top: 25, width: 10, height: 8 });
        expect(isDocumentSelectionEmpty(mask)).toBe(false);

        const tight = getDocumentSelectionTightBounds(mask);
        expect(tight).toEqual({ left: 15, top: 25, width: 10, height: 8 });
    });

    it('fills a polygon region and clears', () => {
        const mask = createDocumentSelectionMask({ left: 0, top: 0, width: 20, height: 20 });
        unionPolygonIntoMask(mask, [
            { x: 2, y: 2 },
            { x: 10, y: 2 },
            { x: 10, y: 10 },
            { x: 2, y: 10 },
        ]);
        expect(mask.data[(5 * 20) + 5]).toBe(255);
        expect(mask.data[(15 * 20) + 15]).toBe(0);

        clearDocumentSelectionMask(mask);
        expect(isDocumentSelectionEmpty(mask)).toBe(true);
    });

    it('flood-fills contiguous color into the mask', () => {
        const width = 8;
        const height = 8;
        const mask = createDocumentSelectionMask({ left: 0, top: 0, width, height });
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i += 1) {
            const p = i * 4;
            // Left half blue, right half red
            const x = i % width;
            if (x < 4) {
                rgba[p] = 0; rgba[p + 1] = 0; rgba[p + 2] = 200; rgba[p + 3] = 255;
            } else {
                rgba[p] = 200; rgba[p + 1] = 0; rgba[p + 2] = 0; rgba[p + 3] = 255;
            }
        }
        const source = { data: rgba, width, height, colorSpace: 'srgb' } as ImageData;
        unionFloodFillIntoMask(mask, source, 1.5, 1.5, 20);
        expect(mask.data[(2 * width) + 2]).toBe(255);
        expect(mask.data[(2 * width) + 6]).toBe(0);
    });

    it('matches all similar colors non-contiguously', () => {
        const width = 8;
        const height = 2;
        const mask = createDocumentSelectionMask({ left: 0, top: 0, width, height });
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i += 1) {
            const p = i * 4;
            const x = i % width;
            if (x === 0 || x === 7) {
                rgba[p] = 10; rgba[p + 1] = 20; rgba[p + 2] = 200; rgba[p + 3] = 255;
            } else {
                rgba[p] = 200; rgba[p + 1] = 0; rgba[p + 2] = 0; rgba[p + 3] = 255;
            }
        }
        const source = { data: rgba, width, height, colorSpace: 'srgb' } as ImageData;
        unionColorMatchIntoMask(mask, source, { r: 10, g: 20, b: 200 }, 15);
        expect(mask.data[0]).toBe(255);
        expect(mask.data[7]).toBe(255);
        expect(mask.data[3]).toBe(0);
    });

    it('parses hex colors for the wand picker', () => {
        expect(parseHexRgb('#336699')).toEqual({ r: 51, g: 102, b: 153 });
        expect(rgbToHex({ r: 51, g: 102, b: 153 })).toBe('#336699');
    });

    it('feathers and morphs without throwing', () => {
        const mask = createDocumentSelectionMask({ left: 0, top: 0, width: 24, height: 24 });
        unionRectIntoMask(mask, { left: 8, top: 8, width: 8, height: 8 });
        featherDocumentSelectionMask(mask, 2);
        morphDocumentSelectionMask(mask, 'expand', 2);
        morphDocumentSelectionMask(mask, 'contract', 1);
        expect(getDocumentSelectionTightBounds(mask)).not.toBeNull();
    });

    it('exports a luminance data URL when document is available', () => {
        const mask = createDocumentSelectionMask({ left: 0, top: 0, width: 4, height: 4 });
        unionRectIntoMask(mask, { left: 0, top: 0, width: 2, height: 2 });
        const url = documentSelectionToLuminanceDataUrl(mask);
        expect(typeof url === 'string' || url === null).toBe(true);
        if (url) expect(url.startsWith('data:image/png')).toBe(true);
    });
});
