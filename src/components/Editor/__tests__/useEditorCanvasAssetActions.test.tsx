import { act, renderHook } from '@testing-library/react';
import type * as fabric from 'fabric';

import { useEditorCanvasAssetActions } from '../useEditorCanvasAssetActions';

describe('useEditorCanvasAssetActions asset placement', () => {
    it('places a GLB from the vault as a tagged 3D placeholder, not an image fetch', () => {
        // A .glb cannot load as a FabricImage; that path silently placed
        // nothing and "Add to Canvas" appeared dead for 3D models.
        const added: unknown[] = [];
        const canvas = {
            width: 800,
            height: 600,
            getZoom: () => 1,
            viewportTransform: [1, 0, 0, 1, 0, 0],
            add: jest.fn((object: unknown) => added.push(object)),
            setActiveObject: jest.fn(),
            requestRenderAll: jest.fn(),
        } as unknown as fabric.Canvas;
        const pushHistory = jest.fn();
        const { result } = renderHook(() => useEditorCanvasAssetActions({
            canvas,
            user: 'tester',
            pushHistory,
            setIsDirty: jest.fn(),
            setContextMenu: jest.fn(),
            toast: jest.fn(),
        }));

        act(() => result.current.handleAssetSelect('/uploads/models/can.glb', 'models', 'soda can'));

        expect(added).toHaveLength(1);
        const placed = added[0] as { is3DModel?: boolean; modelUrl?: string; name?: string };
        expect(placed.is3DModel).toBe(true);
        expect(placed.modelUrl).toBe('/uploads/models/can.glb');
        expect(placed.name).toBe('soda can');
        expect(canvas.setActiveObject).toHaveBeenCalledWith(added[0]);
        expect(pushHistory).toHaveBeenCalled();
    });
});

describe('useEditorCanvasAssetActions context menu', () => {
    it('selects the object under a right-click before opening its context menu', () => {
        const target = { is3DModel: true, modelUrl: '/fox.glb' };
        const canvas = {
            findTarget: jest.fn(() => ({ target, subTargets: [], currentSubTargets: [] })),
            setActiveObject: jest.fn(),
            discardActiveObject: jest.fn(),
            requestRenderAll: jest.fn(),
        } as unknown as fabric.Canvas;
        const setContextMenu = jest.fn();
        const { result } = renderHook(() => useEditorCanvasAssetActions({
            canvas,
            user: 'tester',
            pushHistory: jest.fn(),
            setIsDirty: jest.fn(),
            setContextMenu,
            toast: jest.fn(),
        }));
        const event = new MouseEvent('contextmenu', { clientX: 42, clientY: 84 });

        act(() => result.current.handleRightClick(event));

        expect(canvas.setActiveObject).toHaveBeenCalledWith(target);
        expect(setContextMenu).toHaveBeenCalledWith({ x: 42, y: 84, isOpen: true });
    });

    it('selects a model group when the pointer hits one of its children', () => {
        const modelGroup = { is3DModel: true, modelUrl: '/fox.glb' };
        const child = { group: modelGroup };
        const canvas = {
            findTarget: jest.fn(() => ({ target: child, subTargets: [], currentSubTargets: [] })),
            setActiveObject: jest.fn(),
            discardActiveObject: jest.fn(),
            requestRenderAll: jest.fn(),
        } as unknown as fabric.Canvas;
        const { result } = renderHook(() => useEditorCanvasAssetActions({
            canvas,
            user: 'tester',
            pushHistory: jest.fn(),
            setIsDirty: jest.fn(),
            setContextMenu: jest.fn(),
            toast: jest.fn(),
        }));

        act(() => result.current.handleRightClick(new MouseEvent('contextmenu')));

        expect(canvas.setActiveObject).toHaveBeenCalledWith(modelGroup);
    });
});
