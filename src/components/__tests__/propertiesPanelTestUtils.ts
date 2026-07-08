export type MockCanvas = {
    width: number;
    height: number;
    viewportTransform?: [number, number, number, number, number, number];
    on: jest.Mock;
    off: jest.Mock;
    add: jest.Mock;
    remove: jest.Mock;
    getObjects: jest.Mock;
    getActiveObject: jest.Mock;
    getActiveObjects: jest.Mock;
    getZoom: jest.Mock;
    getWidth: jest.Mock;
    getHeight: jest.Mock;
    setActiveObject: jest.Mock;
    discardActiveObject: jest.Mock;
    requestRenderAll: jest.Mock;
    renderAll: jest.Mock;
    fire: jest.Mock;
    emit: (eventName: string, payload?: unknown) => void;
};

export type MockCanvasObject = {
    id?: string;
    type: string;
    fill?: string;
    opacity?: number;
    visible?: boolean;
    stroke?: string;
    strokeWidth?: number;
    paintFirst?: string;
    shadow?: unknown;
    skewX?: number;
    skewY?: number;
    skewZ?: number;
    taperDirection?: number;
    flipX?: boolean;
    scaleX?: number;
    scaleY?: number;
    backsideBaseFlipX?: boolean;
    pseudoBacksidePreset?: 'front' | 'back';
    filters?: Array<{ type: string; [key: string]: number }>;
    isAdjustmentLayer?: boolean;
    adjustmentType?: string;
    adjustmentSettings?: Record<string, unknown>;
    name?: string;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    getCenterPoint?: jest.Mock;
    setPositionByOrigin?: jest.Mock;
    set: jest.Mock;
    setCoords: jest.Mock;
};

export const createMockObject = (overrides: Partial<MockCanvasObject> = {}): MockCanvasObject => {
    const target: MockCanvasObject = {
        type: 'rect',
        fill: '#000000',
        opacity: 1,
        visible: true,
        stroke: undefined,
        strokeWidth: 0,
        paintFirst: 'fill',
        shadow: undefined,
        skewX: 0,
        skewY: 0,
        skewZ: 0,
        taperDirection: 0,
        flipX: false,
        scaleX: 1,
        scaleY: 1,
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        filters: [],
        getCenterPoint: jest.fn(() => ({ x: 50, y: 50 })),
        setPositionByOrigin: jest.fn(),
        setCoords: jest.fn(),
        set: jest.fn((key: string | Record<string, unknown>, value?: unknown) => {
            if (typeof key === 'string') {
                (target as unknown as Record<string, unknown>)[key] = value;
                return;
            }

            Object.assign(target, key);
        }),
        ...overrides,
    };

    return target;
};

export const createMockCanvas = (initialObjects: MockCanvasObject[] = [], initialActiveObjects: MockCanvasObject[] = initialObjects): MockCanvas => {
    const handlers = new Map<string, Set<(payload?: unknown) => void>>();
    const objects = [...initialObjects];
    let activeObjects = [...initialActiveObjects];

    const canvas: MockCanvas = {
        width: 640,
        height: 480,
        viewportTransform: [1, 0, 0, 1, 0, 0],
        on: jest.fn((eventName: string, handler: (payload?: unknown) => void) => {
            const listeners = handlers.get(eventName) ?? new Set<(payload?: unknown) => void>();
            listeners.add(handler);
            handlers.set(eventName, listeners);
        }),
        off: jest.fn((eventName: string, handler?: (payload?: unknown) => void) => {
            if (!handler) {
                handlers.delete(eventName);
                return;
            }
            handlers.get(eventName)?.delete(handler);
        }),
        add: jest.fn((object: MockCanvasObject) => {
            objects.push(object);
            return canvas;
        }),
        remove: jest.fn((object: MockCanvasObject) => {
            const index = objects.indexOf(object);
            if (index >= 0) {
                objects.splice(index, 1);
            }
            activeObjects = activeObjects.filter((item) => item !== object);
            return canvas;
        }),
        getObjects: jest.fn(() => objects),
        getActiveObject: jest.fn(() => activeObjects[0] ?? null),
        getActiveObjects: jest.fn(() => activeObjects),
        getZoom: jest.fn(() => 1),
        getWidth: jest.fn(() => canvas.width),
        getHeight: jest.fn(() => canvas.height),
        setActiveObject: jest.fn((object: MockCanvasObject) => {
            activeObjects = [object];
            return canvas;
        }),
        discardActiveObject: jest.fn(() => {
            activeObjects = [];
            return canvas;
        }),
        requestRenderAll: jest.fn(),
        renderAll: jest.fn(),
        fire: jest.fn((eventName: string, payload?: unknown) => {
            handlers.get(eventName)?.forEach((listener) => listener(payload));
            return canvas;
        }),
        emit: (eventName: string, payload?: unknown) => {
            handlers.get(eventName)?.forEach((listener) => listener(payload));
        },
    };

    return canvas;
};
