import * as fabric from 'fabric';

import { buildNavigatorPreviewDataUrl } from '../navigatorPreview';

describe('buildNavigatorPreviewDataUrl', () => {
    it('captures the logical artboard crop and restores the viewport transform', () => {
        const setViewportTransform = jest.fn();
        const requestRenderAll = jest.fn();
        const toDataURL = jest.fn(() => 'data:image/png;base64,navigator-preview');

        const canvas = {
            viewportTransform: [2, 0, 0, 2, -120, -80] as fabric.TMat2D,
            setViewportTransform,
            requestRenderAll,
            toDataURL,
        } as unknown as fabric.Canvas;

        const result = buildNavigatorPreviewDataUrl({
            canvas,
            world: { left: 40, top: 60, width: 640, height: 360 },
            backgroundColor: '#ffffff',
            maxDimension: 180,
        });

        expect(result).toBe('data:image/png;base64,navigator-preview');
        expect(setViewportTransform).toHaveBeenNthCalledWith(1, [1, 0, 0, 1, 0, 0]);
        expect(toDataURL).toHaveBeenCalledWith({
            format: 'png',
            left: 40,
            top: 60,
            width: 640,
            height: 360,
            multiplier: 0.28125,
            enableRetinaScaling: false,
        });
        expect(setViewportTransform).toHaveBeenLastCalledWith([2, 0, 0, 2, -120, -80]);
        expect(requestRenderAll).toHaveBeenCalledTimes(2);
    });

    it('returns null when canvas or world bounds are unavailable', () => {
        expect(buildNavigatorPreviewDataUrl({
            canvas: null,
            world: { left: 0, top: 0, width: 10, height: 10 },
        })).toBeNull();

        expect(buildNavigatorPreviewDataUrl({
            canvas: {} as fabric.Canvas,
            world: { left: 0, top: 0, width: 0, height: 10 },
        })).toBeNull();
    });
});