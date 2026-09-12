/**
 * 3D Stamp Tool - Canvas Layer Capture Unit Tests
 */

import * as fabric from 'fabric';
import {
    isCanvasSystemObject,
    getVisibleCanvasLayers,
    computeCombinedLayerBounds,
    captureVisibleCanvasLayers,
} from '../ui/stampCanvasCapture';

describe('stampCanvasCapture', () => {
    describe('isCanvasSystemObject', () => {
        it('identifies artboard and background pages as system objects', () => {
            const artboardObj = new fabric.Rect({ width: 800, height: 600 });
            (artboardObj as unknown as { name?: string }).name = 'Artboard';
            expect(isCanvasSystemObject(artboardObj)).toBe(true);

            const artboardWithFlag = new fabric.Rect({ width: 800, height: 600 });
            (artboardWithFlag as unknown as { isArtboard?: boolean }).isArtboard = true;
            expect(isCanvasSystemObject(artboardWithFlag)).toBe(true);

            const mockCanvas = {
                artboardRect: artboardObj,
            } as unknown as fabric.Canvas;
            expect(isCanvasSystemObject(artboardObj, mockCanvas)).toBe(true);
        });

        it('identifies helper overlays and guides as system objects', () => {
            const helper = new fabric.Rect({ width: 10, height: 10 });
            (helper as unknown as { isSelectionOverlayHelper?: boolean }).isSelectionOverlayHelper = true;
            expect(isCanvasSystemObject(helper)).toBe(true);

            const excluded = new fabric.Rect({ width: 20, height: 20 });
            (excluded as unknown as { excludeFromExport?: boolean }).excludeFromExport = true;
            expect(isCanvasSystemObject(excluded)).toBe(true);

            const guide = new fabric.Line([0, 0, 100, 0]);
            (guide as unknown as { isGuide?: boolean }).isGuide = true;
            expect(isCanvasSystemObject(guide)).toBe(true);
        });

        it('identifies normal user content as non-system objects', () => {
            const userRect = new fabric.Rect({ left: 10, top: 10, width: 50, height: 50 });
            const userText = new fabric.IText('Stamp Logo', { left: 20, top: 20 });
            expect(isCanvasSystemObject(userRect)).toBe(false);
            expect(isCanvasSystemObject(userText)).toBe(false);
        });
    });

    describe('getVisibleCanvasLayers', () => {
        it('filters out system objects and hidden layers', () => {
            const artboard = new fabric.Rect({ width: 800, height: 600 });
            (artboard as unknown as { isArtboard?: boolean }).isArtboard = true;

            const visibleLayer1 = new fabric.Rect({ left: 50, top: 50, width: 100, height: 100 });
            const visibleLayer2 = new fabric.IText('Hello', { left: 80, top: 80 });

            const hiddenLayer = new fabric.Rect({ left: 200, top: 200, width: 50, height: 50 });
            hiddenLayer.visible = false;

            const mockCanvas = {
                artboardRect: artboard,
                getObjects: jest.fn(() => [artboard, visibleLayer1, visibleLayer2, hiddenLayer]),
            } as unknown as fabric.Canvas;

            const visible = getVisibleCanvasLayers(mockCanvas);
            expect(visible).toHaveLength(2);
            expect(visible).toContain(visibleLayer1);
            expect(visible).toContain(visibleLayer2);
            expect(visible).not.toContain(artboard);
            expect(visible).not.toContain(hiddenLayer);
        });

        it('returns empty array when canvas has no objects or is null', () => {
            expect(getVisibleCanvasLayers(null)).toEqual([]);
            const emptyCanvas = { getObjects: () => [] } as unknown as fabric.Canvas;
            expect(getVisibleCanvasLayers(emptyCanvas)).toEqual([]);
        });
    });

    describe('computeCombinedLayerBounds', () => {
        it('calculates the tight bounding box encompassing multiple layers', () => {
            const obj1 = new fabric.Rect({
                left: 100,
                top: 50,
                width: 100,
                height: 80,
                originX: 'left',
                originY: 'top',
                strokeWidth: 0,
            });
            const obj2 = new fabric.Rect({
                left: 150,
                top: 100,
                width: 120,
                height: 90,
                originX: 'left',
                originY: 'top',
                strokeWidth: 0,
            });

            const bounds = computeCombinedLayerBounds([obj1, obj2]);
            expect(bounds).not.toBeNull();
            expect(bounds!.left).toBeCloseTo(100, 0);
            expect(bounds!.top).toBeCloseTo(50, 0);
            expect(bounds!.width).toBeCloseTo(170, 0); // 150 + 120 = 270; 270 - 100 = 170
            expect(bounds!.height).toBeCloseTo(140, 0); // 100 + 90 = 190; 190 - 50 = 140
        });

        it('returns null for empty array', () => {
            expect(computeCombinedLayerBounds([])).toBeNull();
        });
    });

    describe('captureVisibleCanvasLayers', () => {
        it('returns null when no visible user content exists', () => {
            const artboard = new fabric.Rect({ width: 800, height: 600 });
            (artboard as unknown as { isArtboard?: boolean }).isArtboard = true;
            const mockCanvas = {
                artboardRect: artboard,
                getObjects: jest.fn(() => [artboard]),
            } as unknown as fabric.Canvas;

            const result = captureVisibleCanvasLayers(mockCanvas);
            expect(result).toBeNull();
        });

        it('captures a single visible layer directly and fast', () => {
            const singleObj = new fabric.Rect({ left: 50, top: 50, width: 100, height: 100 });
            singleObj.toDataURL = jest.fn(() => 'data:image/png;base64,mockSingleObject');

            const mockCanvas = {
                getObjects: jest.fn(() => [singleObj]),
            } as unknown as fabric.Canvas;

            const result = captureVisibleCanvasLayers(mockCanvas);
            expect(result).not.toBeNull();
            expect(result!.layerCount).toBe(1);
            expect(result!.dataUrl).toBe('data:image/png;base64,mockSingleObject');
            expect(singleObj.toDataURL).toHaveBeenCalled();
        });

        it('captures composite artwork across multiple layers and restores canvas state', () => {
            const layer1 = new fabric.Rect({ left: 40, top: 40, width: 80, height: 80 });
            const layer2 = new fabric.IText('Stamp', { left: 100, top: 60 });
            const artboard = new fabric.Rect({ width: 800, height: 600 });
            (artboard as unknown as { isArtboard?: boolean }).isArtboard = true;

            const allObjects = [artboard, layer1, layer2];
            const setViewportTransform = jest.fn();
            const renderAll = jest.fn();
            const toDataURL = jest.fn(() => 'data:image/png;base64,mockCompositeLayers');

            const mockCanvas = {
                getObjects: jest.fn(() => allObjects),
                artboardRect: artboard,
                backgroundColor: '#ffffff',
                viewportTransform: [1.5, 0, 0, 1.5, 50, 50] as fabric.TMat2D,
                setViewportTransform,
                renderAll,
                toDataURL,
            } as unknown as fabric.Canvas;

            const result = captureVisibleCanvasLayers(mockCanvas);
            expect(result).not.toBeNull();
            expect(result!.layerCount).toBe(2);
            expect(result!.dataUrl).toBe('data:image/png;base64,mockCompositeLayers');

            // Verify canvas was restored
            expect(mockCanvas.backgroundColor).toBe('#ffffff');
            expect(setViewportTransform).toHaveBeenCalledWith([1.5, 0, 0, 1.5, 50, 50]);
            expect(artboard.visible).toBe(true);
        });
    });
});
