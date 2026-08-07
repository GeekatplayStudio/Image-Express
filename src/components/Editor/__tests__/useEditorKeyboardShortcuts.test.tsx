import React from 'react';
import { render } from '@testing-library/react';

import { useEditorKeyboardShortcuts } from '../useEditorKeyboardShortcuts';

jest.mock('fabric', () => ({
    ActiveSelection: class MockActiveSelection {
        objects: unknown[];
        constructor(objects: unknown[]) {
            this.objects = objects;
        }
    },
}));

type MockObject = {
    left: number;
    top: number;
    visible: boolean;
    name?: string;
    isAdjustmentLayer?: boolean;
    is3DModel?: boolean;
    modelUrl?: string;
    group?: { remove: jest.Mock };
    set: (props: Record<string, unknown>) => void;
    clone: (propertiesToInclude?: string[]) => Promise<MockObject>;
};

/** Props Fabric carries on its own, without a propertiesToInclude whitelist. */
const STANDARD_PROPS = ['left', 'top', 'visible'];

const makeObject = (left = 100, top = 100, extra: Partial<MockObject> = {}): MockObject => {
    const object: MockObject = {
        left,
        top,
        visible: true,
        set(props: Record<string, unknown>) {
            Object.assign(this, props);
        },
        // Mirrors Fabric v6: clone() round-trips via toObject(), so a custom
        // prop only survives when named in propertiesToInclude.
        async clone(propertiesToInclude?: string[]) {
            const next = makeObject(this.left, this.top);
            const carried = [...STANDARD_PROPS, ...(propertiesToInclude ?? [])];
            for (const prop of carried) {
                const value = (this as unknown as Record<string, unknown>)[prop];
                if (value !== undefined) {
                    (next as unknown as Record<string, unknown>)[prop] = value;
                }
            }
            return next;
        },
        ...extra,
    };
    return object;
};

const makeCanvas = (objects: MockObject[]) => {
    let activeObjects: MockObject[] = [];
    const canvas = {
        _objects: objects,
        getObjects: jest.fn(() => [...canvas._objects]),
        getActiveObjects: jest.fn(() => [...activeObjects]),
        getActiveObject: jest.fn(() => activeObjects[0] || null),
        setActiveObject: jest.fn((obj: MockObject | { objects?: MockObject[] }) => {
            activeObjects = Array.isArray((obj as { objects?: MockObject[] }).objects)
                ? [...((obj as { objects: MockObject[] }).objects)]
                : [obj as MockObject];
        }),
        discardActiveObject: jest.fn(() => {
            activeObjects = [];
        }),
        add: jest.fn((obj: MockObject) => {
            canvas._objects.push(obj);
        }),
        remove: jest.fn((obj: MockObject) => {
            canvas._objects = canvas._objects.filter((o) => o !== obj);
        }),
        requestRenderAll: jest.fn(),
        fire: jest.fn(),
        setSelection: (objs: MockObject[]) => {
            activeObjects = [...objs];
        },
    };
    return canvas;
};

type HarnessProps = {
    canvas: ReturnType<typeof makeCanvas>;
    onUndo?: () => void;
    onRedo?: () => void;
    onDuplicate?: () => void;
};

function Harness({ canvas, onUndo = jest.fn(), onRedo = jest.fn(), onDuplicate = jest.fn() }: HarnessProps) {
    useEditorKeyboardShortcuts({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvas: canvas as any,
        toolbarRef: { current: null },
        showExportQualityModal: false,
        hasOpenMenu: false,
        closeExportQualityModal: jest.fn(),
        closeEditorMenus: jest.fn(),
        onUndo,
        onRedo,
        onDuplicate,
    });
    return null;
}

const pressCtrl = (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true }));
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useEditorKeyboardShortcuts', () => {
    it('Ctrl+J triggers duplicate', () => {
        const canvas = makeCanvas([makeObject()]);
        const onDuplicate = jest.fn();
        render(<Harness canvas={canvas} onDuplicate={onDuplicate} />);

        pressCtrl('j');
        expect(onDuplicate).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+C then Ctrl+V pastes an offset copy and selects it', async () => {
        const original = makeObject(100, 100);
        const canvas = makeCanvas([original]);
        canvas.setSelection([original]);
        render(<Harness canvas={canvas} />);

        pressCtrl('c');
        await flush();

        pressCtrl('v');
        await flush();

        expect(canvas.add).toHaveBeenCalledTimes(1);
        const pasted = canvas.add.mock.calls[0][0] as MockObject;
        expect(pasted.left).toBe(116);
        expect(pasted.top).toBe(116);
        expect(canvas.setActiveObject).toHaveBeenCalled();
        expect(canvas._objects).toHaveLength(2);
    });

    it('keeps a 3D layer 3D through copy and paste', async () => {
        // Regression: clone() was called without the custom prop whitelist, so
        // is3DModel/modelUrl were dropped and the pasted layer came back as an
        // inert 2D copy that no longer opened the 3D editor.
        const original = makeObject(100, 100, {
            name: 'Dragon',
            is3DModel: true,
            modelUrl: 'https://example.com/dragon.glb',
        });
        const canvas = makeCanvas([original]);
        canvas.setSelection([original]);
        render(<Harness canvas={canvas} />);

        pressCtrl('c');
        await flush();
        pressCtrl('v');
        await flush();

        const pasted = canvas.add.mock.calls[0][0] as MockObject;
        expect(pasted.is3DModel).toBe(true);
        expect(pasted.modelUrl).toBe('https://example.com/dragon.glb');
        expect(pasted.name).toBe('Dragon');
    });

    it('Ctrl+V without a prior copy does nothing', () => {
        const canvas = makeCanvas([makeObject()]);
        render(<Harness canvas={canvas} />);

        pressCtrl('v');
        expect(canvas.add).not.toHaveBeenCalled();
    });

    it('Ctrl+X removes the selection and Ctrl+V restores a copy', async () => {
        const original = makeObject(50, 60);
        const canvas = makeCanvas([original]);
        canvas.setSelection([original]);
        render(<Harness canvas={canvas} />);

        pressCtrl('x');
        await flush();
        expect(canvas.remove).toHaveBeenCalledWith(original);
        expect(canvas._objects).toHaveLength(0);

        pressCtrl('v');
        await flush();
        expect(canvas._objects).toHaveLength(1);
        expect((canvas._objects[0] as MockObject).left).toBe(66);
    });

    it('Ctrl+A selects all layers but skips the artboard and adjustment layers', () => {
        const artboard = makeObject();
        artboard.name = 'Artboard';
        const adjustment = makeObject();
        adjustment.isAdjustmentLayer = true;
        const normalA = makeObject();
        const normalB = makeObject();
        const canvas = makeCanvas([artboard, adjustment, normalA, normalB]);
        render(<Harness canvas={canvas} />);

        pressCtrl('a');
        expect(canvas.setActiveObject).toHaveBeenCalledTimes(1);
        const selection = canvas.setActiveObject.mock.calls[0][0] as { objects: MockObject[] };
        expect(selection.objects).toEqual([normalA, normalB]);
    });

    it('ignores shortcuts while typing in an input', () => {
        const canvas = makeCanvas([makeObject()]);
        const onDuplicate = jest.fn();
        render(<Harness canvas={canvas} onDuplicate={onDuplicate} />);

        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true }));

        expect(onDuplicate).not.toHaveBeenCalled();
        input.remove();
    });
});
