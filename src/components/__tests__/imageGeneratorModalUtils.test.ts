import * as fabric from 'fabric';
import { captureComfySourceImageFromCanvas, inspectCapturedSourcePixels } from '../imageGeneratorModalUtils';

describe('captureComfySourceImageFromCanvas', () => {
    it('hides the AI zone overlay while exporting the zone contents', () => {
        const zone = {
            type: 'rect',
            left: 40,
            top: 50,
            width: 300,
            height: 200,
            scaleX: 1,
            scaleY: 1,
            visible: true,
            set: jest.fn((key: string, value: unknown) => {
                (zone as Record<string, unknown>)[key] = value;
                return zone;
            }),
        } as unknown as fabric.Rect;

        const canvas = {
            viewportTransform: [2, 0, 0, 2, 25, 30],
            getActiveObject: jest.fn(() => zone),
            contains: jest.fn(() => true),
            requestRenderAll: jest.fn(),
            setViewportTransform: jest.fn(),
            toDataURL: jest.fn(() => 'data:image/png;base64,zone-source'),
        } as unknown as fabric.Canvas;

        const result = captureComfySourceImageFromCanvas(
            canvas as fabric.Canvas,
            zone,
            512,
            512
        );

        expect(result).toBe('data:image/png;base64,zone-source');
        expect(zone.set).toHaveBeenCalledWith('visible', false);
        expect(zone.set).toHaveBeenCalledWith('visible', true);
        expect(canvas.toDataURL).toHaveBeenCalledWith(expect.objectContaining({
            format: 'png',
            multiplier: 1,
            left: 40,
            top: 50,
            width: 300,
            height: 200,
        }));
        expect((canvas as unknown as { setViewportTransform: jest.Mock }).setViewportTransform).toHaveBeenCalledWith([2, 0, 0, 2, 25, 30]);
    });

    it('detects nearly blank captured source images', () => {
        const pixels = new Uint8ClampedArray(16 * 4).fill(255);
        pixels[3] = 255;
        pixels[7] = 255;
        pixels[11] = 255;
        pixels[15] = 255;

        const inspection = inspectCapturedSourcePixels(pixels);

        expect(inspection.sampleCount).toBe(16);
        expect(inspection.looksBlank).toBe(true);
        expect(inspection.nearWhiteRatio).toBe(1);
    });

    it('does not flag clearly non-blank captured source images', () => {
        const pixels = new Uint8ClampedArray([
            255, 255, 255, 255,
            10, 40, 90, 255,
            255, 255, 255, 255,
            120, 80, 60, 255,
        ]);

        const inspection = inspectCapturedSourcePixels(pixels);

        expect(inspection.sampleCount).toBe(4);
        expect(inspection.looksBlank).toBe(false);
        expect(inspection.nearWhiteRatio).toBe(0.5);
    });
});