import { act, renderHook } from '@testing-library/react';
import type * as fabric from 'fabric';

import { useEditorCanvasInteractionEffects } from '../useEditorCanvasInteractionEffects';

describe('useEditorCanvasInteractionEffects', () => {
    it('routes model double-clicks through durable-source recovery before opening', () => {
        const handlers = new Map<string, (event: unknown) => void>();
        const canvas = {
            on: jest.fn((eventName: string, handler: (event: unknown) => void) => {
                handlers.set(eventName, handler);
            }),
            off: jest.fn(),
        } as unknown as fabric.Canvas;
        const setEditingModelUrl = jest.fn();
        const setEditingModelObject = jest.fn();
        const onOpenThreeDModel = jest.fn();
        const target = { is3DModel: true, modelUrl: 'blob:http://localhost/model' };

        renderHook(() => useEditorCanvasInteractionEffects({
            canvas,
            activeTool: 'select',
            gradientTopType: 'linear',
            gradientTopBlendMode: 'source-over',
            gradientTopOpacity: 100,
            gradientTopReverse: false,
            gradientTopDither: false,
            resolveGradientStops: jest.fn(() => []),
            setMediaPreview: jest.fn(),
            setEditingModelUrl,
            setEditingModelObject,
            onOpenThreeDModel,
            setActiveTool: jest.fn(),
        }));

        act(() => handlers.get('mouse:dblclick')?.({ target }));

        expect(onOpenThreeDModel).toHaveBeenCalledWith(target);
        expect(setEditingModelUrl).not.toHaveBeenCalled();
        expect(setEditingModelObject).not.toHaveBeenCalled();
    });
});
