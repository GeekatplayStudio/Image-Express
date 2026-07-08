import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import DesignCanvas from '../DesignCanvas';
import {
    installDesignCanvasLayoutMocks,
    type CanvasEventPayload,
    type MockCanvasLike,
} from './designCanvasTestUtils';

let latestCanvas: MockCanvasLike | null = null;

jest.mock('@/providers/DialogProvider', () => ({
    useDialog: () => ({
        alert: jest.fn(),
        confirm: jest.fn(),
        prompt: jest.fn(),
    }),
}));

jest.mock('@/providers/ToastProvider', () => ({
    useToast: () => ({
        toast: jest.fn(),
    }),
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
        hoverCursor = 'move';
        zoom = 1;
        lowerCanvasEl: HTMLCanvasElement;
        upperCanvasEl: HTMLCanvasElement;
        activeObject = null;
        activeObjects: unknown[] = [];
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
            listeners?.forEach((handler) => handler(payload));
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
            listeners?.delete(handler);
            if (listeners && listeners.size === 0) {
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
            if (obj instanceof LocalMockRect) {
                this.artboardRect = obj;
            }
            return obj;
        });
        remove = jest.fn();
        getObjects = jest.fn(() => []);
        setActiveObject = jest.fn();
        getActiveObject = jest.fn(() => this.activeObject);
        getActiveObjects = jest.fn(() => this.activeObjects);
        discardActiveObject = jest.fn();
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
        IText: { prototype: { controls: {} } },
        Textbox: { prototype: { controls: {} } },
        Text: { prototype: { controls: {} } },
    };
});

describe('DesignCanvas interactions', () => {
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

    it('supports locked hand mode panning without holding space', () => {
        render(<DesignCanvas onCanvasReady={jest.fn()} />);

        if (!latestCanvas) {
            throw new Error('Canvas was not initialized');
        }

        const startPanX = latestCanvas.viewportTransform[4];
        const startPanY = latestCanvas.viewportTransform[5];

        act(() => {
            latestCanvas?.fire('hand:mode:set', { enabled: true });
        });

        expect(latestCanvas.selection).toBe(false);
        expect(latestCanvas.defaultCursor).toBe('grab');
        expect(latestCanvas.setCursor).toHaveBeenCalledWith('grab');

        act(() => {
            latestCanvas?.emit('mouse:down', {
                e: { button: 0, clientX: 10, clientY: 20 } as MouseEvent,
                target: undefined,
            });
            latestCanvas?.emit('mouse:move', {
                e: { clientX: 40, clientY: 60 } as MouseEvent,
                target: undefined,
            });
            latestCanvas?.emit('mouse:up', {});
            latestCanvas?.fire('hand:mode:set', { enabled: false });
        });

        expect(latestCanvas.viewportTransform[4]).toBe(startPanX + 30);
        expect(latestCanvas.viewportTransform[5]).toBe(startPanY + 40);
        expect(latestCanvas.setCursor).toHaveBeenCalledWith('grabbing');
        expect(latestCanvas.setCursor).toHaveBeenCalledWith('default');
        expect(latestCanvas.selection).toBe(true);
        expect(latestCanvas.defaultCursor).toBe('default');
    });

    it('syncs artboard metrics and emits artboard resize for artboard modifications only', () => {
        const onCanvasReady = jest.fn();
        render(<DesignCanvas onCanvasReady={onCanvasReady} />);

        const exposedCanvas = onCanvasReady.mock.calls[0]?.[0] as MockCanvasLike;
        if (!latestCanvas || !latestCanvas.artboardRect) {
            throw new Error('Canvas artboard was not initialized');
        }

        latestCanvas.fire.mockClear();
        Object.assign(latestCanvas.artboardRect, {
            width: 720,
            height: 405,
            left: 12,
            top: 18,
        });

        act(() => {
            latestCanvas?.emit('object:modified', { target: latestCanvas?.artboardRect });
            latestCanvas?.emit('object:modified', { target: { left: 99 } });
        });

        expect(exposedCanvas.artboard).toEqual({ width: 720, height: 405, left: 12, top: 18 });
        expect(latestCanvas.fire).toHaveBeenCalledWith('artboard:resize', {
            width: 720,
            height: 405,
            left: 12,
            top: 18,
        });
        expect(latestCanvas.fire).toHaveBeenCalledTimes(1);
    });

    it('enables spellcheck defaults when text editing starts', () => {
        render(<DesignCanvas onCanvasReady={jest.fn()} />);

        if (!latestCanvas) {
            throw new Error('Canvas was not initialized');
        }

        const textarea = document.createElement('textarea');
        textarea.spellcheck = false;
        textarea.autocapitalize = 'off';
        textarea.autocomplete = 'on';
        textarea.autocorrect = 'off';

        act(() => {
            latestCanvas?.emit('text:editing:entered', {
                target: {
                    type: 'textbox',
                    hiddenTextarea: textarea,
                },
            });
        });

        expect(textarea.spellcheck).toBe(true);
        expect(textarea.autocapitalize).toBe('sentences');
        expect(textarea.autocomplete).toBe('off');
        expect(textarea.autocorrect).toBe(true);
    });

    it('duplicates the selected layer when Alt/Option drag starts on an object', async () => {
        render(<DesignCanvas onCanvasReady={jest.fn()} />);

        if (!latestCanvas) {
            throw new Error('Canvas was not initialized');
        }

        const clone = {
            left: 120,
            top: 160,
            set: jest.fn(function set(patch: Record<string, unknown>) {
                Object.assign(this, patch);
            }),
        };
        const source = {
            selectable: true,
            evented: true,
            name: 'Logo',
            clone: jest.fn().mockResolvedValue(clone),
        };

        latestCanvas.activeObjects = [source as unknown as never];
        latestCanvas.getActiveObjects.mockReturnValue([source]);

        const preventDefault = jest.fn();
        const stopPropagation = jest.fn();

        act(() => {
            latestCanvas?.emit('mouse:down:before', {
                e: {
                    button: 0,
                    altKey: true,
                    preventDefault,
                    stopPropagation,
                } as unknown as MouseEvent,
                target: source,
            });
        });

        await waitFor(() => {
            expect(latestCanvas?.add).toHaveBeenCalledWith(clone);
        });

        expect(source.clone).toHaveBeenCalledTimes(1);
        expect(clone.set).toHaveBeenCalledWith(expect.objectContaining({
            left: 120,
            top: 160,
            evented: true,
        }));
        expect(latestCanvas.setActiveObject).toHaveBeenCalledWith(clone);
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(stopPropagation).toHaveBeenCalledTimes(1);
    });
});