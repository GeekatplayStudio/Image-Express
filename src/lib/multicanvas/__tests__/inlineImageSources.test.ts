import { inlineVolatileImageSources } from '@/lib/multicanvas/inlineImageSources';
import type { SerializedCanvasJson } from '@/lib/multicanvas/projectStore';

// jsdom doesn't implement canvas rendering; stub just enough of the 2D
// context + toDataURL for the rasterization path under test.
function mockCanvasRendering() {
    const drawImageCalls: unknown[][] = [];
    const getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
        return {
            drawImage: (...args: unknown[]) => { drawImageCalls.push(args); },
        } as unknown as CanvasRenderingContext2D;
    });
    const toDataURLSpy = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
        return `data:image/png;base64,W${this.width}xH${this.height}`;
    });
    return { drawImageCalls, restore: () => { getContextSpy.mockRestore(); toDataURLSpy.mockRestore(); } };
}

const makeFakeImage = (id: string, naturalWidth: number, naturalHeight: number) => {
    const element = { naturalWidth, naturalHeight, width: naturalWidth, height: naturalHeight } as HTMLImageElement;
    return {
        type: 'image',
        id,
        getElement: () => element,
    } as unknown as import('fabric').Object & { id: string };
};

const makeFakeCanvas = (objects: ReturnType<typeof makeFakeImage>[]) => ({
    getObjects: () => objects,
} as unknown as import('fabric').Canvas);

describe('inlineVolatileImageSources', () => {
    let rendering: ReturnType<typeof mockCanvasRendering>;

    beforeEach(() => {
        rendering = mockCanvasRendering();
    });

    afterEach(() => {
        rendering.restore();
    });

    it('leaves non-blob sources untouched', () => {
        const canvas = makeFakeCanvas([makeFakeImage('a', 100, 100)]);
        const json: SerializedCanvasJson = { objects: [{ id: 'a', src: 'https://example.com/x.png' }] };
        const result = inlineVolatileImageSources(canvas, json);
        expect(result.objects![0].src).toBe('https://example.com/x.png');
    });

    it('inlines a small uncropped blob image as-is (no downscale needed)', () => {
        const canvas = makeFakeCanvas([makeFakeImage('a', 400, 300)]);
        const json: SerializedCanvasJson = {
            objects: [{ id: 'a', src: 'blob:http://x/1', width: 400, height: 300, scaleX: 0.5, scaleY: 0.5 }],
        };
        const result = inlineVolatileImageSources(canvas, json);
        const entry = result.objects![0];
        expect(entry.src).toBe('data:image/png;base64,W400xH300');
        expect(entry.width).toBe(400);
        expect(entry.scaleX).toBe(0.5);
    });

    it('downscales a large uncropped blob image and rescales width/height/scale to preserve displayed size', () => {
        const canvas = makeFakeCanvas([makeFakeImage('big', 6000, 4000)]);
        const json: SerializedCanvasJson = {
            objects: [{ id: 'big', src: 'blob:http://x/2', width: 6000, height: 4000, scaleX: 0.1, scaleY: 0.1 }],
        };
        const result = inlineVolatileImageSources(canvas, json);
        const entry = result.objects![0];

        // Longest side capped at 2048; scale factor = 2048/6000
        const scale = 2048 / 6000;
        expect(entry.width).toBeCloseTo(6000 * scale);
        expect(entry.height).toBeCloseTo(4000 * scale);
        // Displayed size (width * scaleX) must be unchanged.
        expect((entry.width as number) * (entry.scaleX as number)).toBeCloseTo(6000 * 0.1);
        expect((entry.height as number) * (entry.scaleY as number)).toBeCloseTo(4000 * 0.1);
    });

    it('does not downscale a cropped image (crop rect is in source-pixel space)', () => {
        const canvas = makeFakeCanvas([makeFakeImage('cropped', 6000, 4000)]);
        const json: SerializedCanvasJson = {
            objects: [{ id: 'cropped', src: 'blob:http://x/3', width: 3000, height: 2000, cropX: 500, cropY: 500, scaleX: 0.2, scaleY: 0.2 }],
        };
        const result = inlineVolatileImageSources(canvas, json);
        const entry = result.objects![0];
        // Unscaled — width/scale must be exactly as provided.
        expect(entry.width).toBe(3000);
        expect(entry.scaleX).toBe(0.2);
        expect(entry.src).toBe('data:image/png;base64,W6000xH4000');
    });

    it('inlines nested images inside groups', () => {
        const child = makeFakeImage('child', 5000, 5000);
        const canvas = makeFakeCanvas([child]);
        const json: SerializedCanvasJson = {
            objects: [{
                id: 'group1',
                type: 'group',
                objects: [{ id: 'child', src: 'blob:http://x/4', width: 5000, height: 5000, scaleX: 1, scaleY: 1 }],
            } as never],
        };
        const result = inlineVolatileImageSources(canvas, json);
        const nested = (result.objects![0] as unknown as { objects: Array<{ src: string }> }).objects[0];
        expect(nested.src).toMatch(/^data:image\/png/);
    });
});
