type CanvasEventPayload = {
    e?: MouseEvent & {
        deltaY?: number;
        offsetX?: number;
        offsetY?: number;
        preventDefault: () => void;
        stopPropagation: () => void;
    };
    target?: unknown;
    selected?: unknown[];
};

type ActiveObjectLike = {
    isEditing?: boolean;
    getScaledWidth?: () => number;
    getScaledHeight?: () => number;
};

type MockCanvasLike = {
    width: number;
    height: number;
    viewportTransform: [number, number, number, number, number, number];
    selection: boolean;
    defaultCursor: string;
    zoom: number;
    lowerCanvasEl: HTMLCanvasElement;
    upperCanvasEl: HTMLCanvasElement;
    activeObject: ActiveObjectLike | null;
    activeObjects: ActiveObjectLike[];
    workspaceBackground?: string;
    hostContainer?: HTMLDivElement;
    artboard?: { width: number; height: number; left: number; top: number };
    artboardRect?: { width?: number; height?: number; left?: number; top?: number };
    centerArtboard?: () => void;
    on: jest.Mock;
    off: jest.Mock;
    renderAll: jest.Mock;
    dispose: jest.Mock;
    clear: jest.Mock;
    requestRenderAll: jest.Mock;
    calcOffset: jest.Mock;
    setCursor: jest.Mock;
    sendObjectToBack: jest.Mock;
    findTarget: jest.Mock;
    toDataURL: jest.Mock;
    setDimensions: jest.Mock;
    setWidth: jest.Mock;
    setHeight: jest.Mock;
    getElement: jest.Mock;
    add: jest.Mock;
    remove: jest.Mock;
    getObjects: jest.Mock;
    setActiveObject: jest.Mock;
    getActiveObject: jest.Mock;
    getActiveObjects: jest.Mock;
    discardActiveObject: jest.Mock;
    getZoom: jest.Mock;
    setZoom: jest.Mock;
    zoomToPoint: jest.Mock;
    setViewportTransform: jest.Mock;
    getPointer: jest.Mock;
    fire: jest.Mock;
    emit: (eventName: string, payload?: CanvasEventPayload) => void;
};

const dispatchCanvasWindowKey = (key: string, canvasTarget: EventTarget) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true });
    Object.defineProperty(event, 'composedPath', {
        value: () => [canvasTarget, window],
    });
    window.dispatchEvent(event);
};

const installDesignCanvasLayoutMocks = () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get() {
            return 800;
        },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() {
            return 600;
        },
    });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
        return {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            top: 0,
            left: 0,
            right: 800,
            bottom: 600,
            toJSON: () => ({}),
        } as DOMRect;
    };

    return () => {
        if (originalClientWidth) {
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
        if (originalClientHeight) {
            Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
        }
        HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    };
};

export type { ActiveObjectLike, CanvasEventPayload, MockCanvasLike };
export { dispatchCanvasWindowKey, installDesignCanvasLayoutMocks };