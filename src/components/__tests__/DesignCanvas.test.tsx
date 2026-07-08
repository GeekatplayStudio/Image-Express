import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DesignCanvas from '../DesignCanvas';
import {
    dispatchCanvasWindowKey,
    installDesignCanvasLayoutMocks,
    type ActiveObjectLike,
    type CanvasEventPayload,
    type MockCanvasLike,
} from './designCanvasTestUtils';

let latestCanvas: MockCanvasLike | null = null;
const mockDialogApi = {
    alert: jest.fn(),
    confirm: jest.fn(),
    prompt: jest.fn(),
};
const mockToastApi = {
    toast: jest.fn(),
};

jest.mock('@/providers/DialogProvider', () => ({
    useDialog: () => mockDialogApi,
}));

jest.mock('@/providers/ToastProvider', () => ({
    useToast: () => mockToastApi,
}));

jest.mock('fabric', () => {
    class LocalMockRect {
        left = 0;
        top = 0;
        width = 0;
        height = 0;
        scaleX = 1;
        scaleY = 1;
        shadow: unknown;
        set = jest.fn((patch: Partial<LocalMockRect>) => {
            Object.assign(this, patch);
        });
        on = jest.fn();

        constructor(options: Partial<LocalMockRect> = {}) {
            Object.assign(this, options);
            this.shadow = options.shadow;
        }

        getScaledWidth() {
            return (this.width || 0) * (this.scaleX || 1);
        }

        getScaledHeight() {
            return (this.height || 0) * (this.scaleY || 1);
        }
    }

    class LocalMockPoint {
        x: number;
        y: number;

        constructor(x: number, y: number) {
            this.x = x;
            this.y = y;
        }
    }

    class LocalMockCanvas {
        handlers = new Map<string, Set<(payload?: CanvasEventPayload) => void>>();
        width: number;
        height: number;
        viewportTransform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
        selection = true;
        defaultCursor = 'default';
        zoom = 1;
        lowerCanvasEl: HTMLCanvasElement;
        upperCanvasEl: HTMLCanvasElement;
        activeObject: ActiveObjectLike | null = null;
        activeObjects: ActiveObjectLike[] = [];
        workspaceBackground?: string;
        hostContainer?: HTMLDivElement;
        artboard?: { width: number; height: number; left: number; top: number };
        artboardRect?: LocalMockRect;
        centerArtboard?: () => void;

        constructor(options: { width?: number; height?: number }) {
            this.width = options.width ?? 0;
            this.height = options.height ?? 0;

            const wrapper = document.createElement('div');
            this.lowerCanvasEl = document.createElement('canvas');
            this.lowerCanvasEl.className = 'lower-canvas';
            this.upperCanvasEl = document.createElement('canvas');
            this.upperCanvasEl.className = 'upper-canvas';
            wrapper.appendChild(this.lowerCanvasEl);
            wrapper.appendChild(this.upperCanvasEl);
        }

        emit(eventName: string, payload?: CanvasEventPayload) {
            const listeners = this.handlers.get(eventName);
            if (!listeners) return;
            listeners.forEach((handler) => handler(payload));
        }

        on = jest.fn((eventName: string, handler: (payload?: CanvasEventPayload) => void) => {
            const listeners = this.handlers.get(eventName) ?? new Set<(payload?: CanvasEventPayload) => void>();
            listeners.add(handler);
            this.handlers.set(eventName, listeners);
        });

        off = jest.fn((eventName: string, handler?: (payload?: CanvasEventPayload) => void) => {
            if (!handler) {
                this.handlers.delete(eventName);
                return;
            }
            const listeners = this.handlers.get(eventName);
            if (!listeners) return;
            listeners.delete(handler);
            if (listeners.size === 0) {
                this.handlers.delete(eventName);
            }
        });

        renderAll = jest.fn();
        dispose = jest.fn();
        clear = jest.fn();
        requestRenderAll = jest.fn();
        calcOffset = jest.fn();
        setCursor = jest.fn((cursor: string) => {
            this.defaultCursor = cursor;
        });
        sendObjectToBack = jest.fn();
        findTarget = jest.fn();
        toDataURL = jest.fn(() => 'data:image/png;base64,AAAAAA==');

        setDimensions = jest.fn((size: { width: number; height: number }) => {
            this.width = size.width;
            this.height = size.height;
        });

        setWidth = jest.fn((width: number) => {
            this.width = width;
        });

        setHeight = jest.fn((height: number) => {
            this.height = height;
        });

        getElement = jest.fn(() => this.lowerCanvasEl);

        add = jest.fn((obj: unknown) => {
            if (
                obj &&
                typeof obj === 'object' &&
                'width' in obj &&
                'height' in obj &&
                'left' in obj &&
                'top' in obj
            ) {
                this.artboardRect = obj as LocalMockRect;
            }
            return obj;
        });

        remove = jest.fn();
        getObjects = jest.fn(() => []);

        setActiveObject = jest.fn((obj: ActiveObjectLike) => {
            this.activeObject = obj;
            if (this.activeObjects.length === 0) {
                this.activeObjects = [obj];
            }
        });

        getActiveObject = jest.fn(() => this.activeObject);
        getActiveObjects = jest.fn(() => this.activeObjects);

        discardActiveObject = jest.fn(() => {
            this.activeObject = null;
            this.activeObjects = [];
        });

        getZoom = jest.fn(() => this.zoom);

        setZoom = jest.fn((value: number) => {
            this.zoom = value;
        });

        zoomToPoint = jest.fn((_point: LocalMockPoint, zoom: number) => {
            this.zoom = zoom;
        });

        setViewportTransform = jest.fn((matrix: [number, number, number, number, number, number]) => {
            this.viewportTransform = matrix;
        });

        getPointer = jest.fn(() => ({ x: 0, y: 0 }));

        fire = jest.fn((eventName: string, payload?: Record<string, unknown>) => {
            this.emit(eventName, payload as CanvasEventPayload);
            return this;
        });
    }

    return {
        Canvas: jest.fn().mockImplementation((_el: HTMLCanvasElement, options: { width?: number; height?: number }) => {
            const canvas = new LocalMockCanvas(options);
            latestCanvas = canvas as unknown as MockCanvasLike;
            return canvas;
        }),
        Rect: LocalMockRect,
        Point: LocalMockPoint,
        Shadow: class {},
        Object: class {},
        Group: class {
            addWithUpdate = jest.fn();
            add = jest.fn();
            setCoords = jest.fn();
        },
        Image: class {},
    };
});

describe('DesignCanvas', () => {
    let restoreLayoutMocks: (() => void) | null = null;
    let consoleLogSpy: jest.SpyInstance;

    beforeAll(() => {
        restoreLayoutMocks = installDesignCanvasLayoutMocks();
    });

    afterAll(() => {
        restoreLayoutMocks?.();
    });

    beforeEach(() => {
        latestCanvas = null;
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    it('initializes canvas and exposes workspace background helpers', () => {
        const onCanvasReady = jest.fn();
        render(<DesignCanvas onCanvasReady={onCanvasReady} />);

        expect(onCanvasReady).toHaveBeenCalledTimes(1);
        const exposedCanvas = onCanvasReady.mock.calls[0]?.[0] as {
            setWorkspaceBackground?: (color: string) => void;
            getWorkspaceBackground?: () => string;
            workspaceBackground?: string;
            fire: jest.Mock;
            requestRenderAll: jest.Mock;
        };
        expect(exposedCanvas.workspaceBackground).toBe('#1E1E1E');
        expect(exposedCanvas.getWorkspaceBackground?.()).toBe('#1E1E1E');

        act(() => {
            exposedCanvas.setWorkspaceBackground?.('#112233');
        });

        expect(exposedCanvas.getWorkspaceBackground?.()).toBe('#112233');
        expect(exposedCanvas.fire).toHaveBeenCalledWith('workspace:color', { color: '#112233' });
        expect(exposedCanvas.requestRenderAll).toHaveBeenCalled();
    });

    it('forwards context menu events to onRightClick', () => {
        const onRightClick = jest.fn();
        render(<DesignCanvas onCanvasReady={jest.fn()} onRightClick={onRightClick} />);

        const upperCanvas = latestCanvas?.upperCanvasEl;
        expect(upperCanvas).toBeDefined();

        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        upperCanvas?.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(onRightClick).toHaveBeenCalledTimes(1);
    });

    it('updates selection dimension badge and calls onModified hooks', () => {
        const onModified = jest.fn();
        render(<DesignCanvas onCanvasReady={jest.fn()} onModified={onModified} />);

        expect(screen.getByText(/Space \+ Click & Drag to Pan/i)).toBeInTheDocument();

        const selectedObject = {
            getScaledWidth: () => 123.4,
            getScaledHeight: () => 56.6,
        };
        if (!latestCanvas) {
            throw new Error('Canvas was not initialized');
        }
        latestCanvas.activeObject = selectedObject;
        latestCanvas.activeObjects = [selectedObject];

        act(() => {
            latestCanvas?.emit('selection:created', { selected: [selectedObject] });
        });

        expect(screen.getByText('123px × 57px')).toBeInTheDocument();

        act(() => {
            latestCanvas?.emit('object:added', { target: {} });
            latestCanvas?.emit('object:modified', { target: {} });
            latestCanvas?.emit('object:removed', { target: {} });
        });

        expect(onModified).toHaveBeenCalledTimes(3);

        act(() => {
            latestCanvas?.emit('selection:cleared', {});
        });

        expect(screen.getByText(/Space \+ Click & Drag to Pan/i)).toBeInTheDocument();
    });

    it('deletes selected objects on Delete when not editing text', () => {
        render(<DesignCanvas onCanvasReady={jest.fn()} />);

        if (!latestCanvas) {
            throw new Error('Canvas was not initialized');
        }

        const a = { isEditing: false };
        const b = { isEditing: false };
        latestCanvas.activeObject = a;
        latestCanvas.activeObjects = [a, b];

        dispatchCanvasWindowKey('Delete', latestCanvas.upperCanvasEl);

        expect(latestCanvas.discardActiveObject).toHaveBeenCalledTimes(1);
        expect(latestCanvas.remove).toHaveBeenCalledTimes(2);
        expect(latestCanvas.requestRenderAll).toHaveBeenCalled();
    });

    it('does not delete when text is editing or when input has focus', () => {
        render(<DesignCanvas onCanvasReady={jest.fn()} />);

        if (!latestCanvas) {
            throw new Error('Canvas was not initialized');
        }

        latestCanvas.activeObject = { isEditing: true };
        latestCanvas.activeObjects = [{ isEditing: true }];
        dispatchCanvasWindowKey('Backspace', latestCanvas.upperCanvasEl);
        expect(latestCanvas.remove).not.toHaveBeenCalled();

        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();

        latestCanvas.activeObject = { isEditing: false };
        latestCanvas.activeObjects = [{ isEditing: false }];
        dispatchCanvasWindowKey('Delete', latestCanvas.upperCanvasEl);
        expect(latestCanvas.remove).not.toHaveBeenCalled();

        const contentEditable = document.createElement('div');
        contentEditable.contentEditable = 'true';
        contentEditable.tabIndex = -1;
        document.body.appendChild(contentEditable);
        latestCanvas.activeObject = { isEditing: false };
        latestCanvas.activeObjects = [{ isEditing: false }];
        fireEvent.keyDown(contentEditable, { key: 'Backspace' });
        expect(latestCanvas.remove).not.toHaveBeenCalled();

        contentEditable.remove();
        input.remove();
    });

    it('handles zoom, panning, and double-click recenter interactions', () => {
        render(<DesignCanvas onCanvasReady={jest.fn()} />);

        if (!latestCanvas) {
            throw new Error('Canvas was not initialized');
        }

        const wheelEvent = {
            deltaY: -120,
            offsetX: 100,
            offsetY: 200,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent & {
            deltaY: number;
            offsetX: number;
            offsetY: number;
            preventDefault: () => void;
            stopPropagation: () => void;
        };

        act(() => {
            latestCanvas?.emit('mouse:wheel', { e: wheelEvent });
        });

        expect(latestCanvas.zoomToPoint).toHaveBeenCalled();
        expect(wheelEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(wheelEvent.stopPropagation).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        act(() => {
            latestCanvas?.emit('mouse:down', {
                e: { button: 0, clientX: 10, clientY: 20 } as unknown as MouseEvent,
                target: undefined,
            });
            latestCanvas?.emit('mouse:move', {
                e: { clientX: 30, clientY: 45 } as unknown as MouseEvent,
                target: undefined,
            });
            latestCanvas?.emit('mouse:up', {});
        });

        expect(latestCanvas.setCursor).toHaveBeenCalledWith('grabbing');
        expect(latestCanvas.setCursor).toHaveBeenCalledWith('default');

        const currentZoom = latestCanvas.getZoom();
        act(() => {
            latestCanvas?.emit('mouse:dblclick', {
                target: undefined,
                e: { offsetX: 250, offsetY: 260 } as unknown as MouseEvent,
            });
        });

        const lastViewportCall = latestCanvas.setViewportTransform.mock.calls.at(-1)?.[0] as number[];
        expect(lastViewportCall?.[0]).toBe(currentZoom);
        expect(lastViewportCall?.[3]).toBe(currentZoom);
        expect(lastViewportCall?.[4]).toBeCloseTo(250 - (540 * currentZoom), 6);
        expect(lastViewportCall?.[5]).toBeCloseTo(260 - (540 * currentZoom), 6);
    });

    it('disposes fabric canvas on unmount', () => {
        const view = render(<DesignCanvas onCanvasReady={jest.fn()} />);
        if (!latestCanvas) {
            throw new Error('Canvas was not initialized');
        }

        view.unmount();
        expect(latestCanvas.dispose).toHaveBeenCalledTimes(1);
    });
});
