import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Toolbar, { ToolbarHandle } from '../Toolbar';

const mockToast = jest.fn();
const mockImageFromURL = jest.fn();

jest.mock('react-dom', () => {
    const actual = jest.requireActual('react-dom');
    return {
        ...actual,
        createPortal: (node: React.ReactNode) => node,
    };
});

jest.mock('@/providers/ToastProvider', () => ({
    useToast: () => ({
        toast: (...args: unknown[]) => mockToast(...args),
    }),
}));

jest.mock('@/lib/profile-utils', () => ({
    loadProfileSettings: jest.fn(() => null),
}));

jest.mock('../AssetLibrary', () => ({
    __esModule: true,
    default: ({
        onSelect,
    }: {
        onSelect: (path: string, type: string, name?: string) => void;
    }) => (
        <div data-testid="mock-asset-library">
            <button onClick={() => onSelect('https://cdn.example/photo.png', 'images', 'photo.png')}>
                Pick Image
            </button>
            <button onClick={() => onSelect('https://cdn.example/clip.mp4', 'videos', 'clip.mp4')}>
                Pick Video
            </button>
            <button onClick={() => onSelect('https://cdn.example/model.glb', 'models', 'model.glb')}>
                Pick Model
            </button>
        </div>
    ),
}));

jest.mock('../TemplateLibrary', () => ({
    __esModule: true,
    default: () => <div data-testid="mock-template-library">Template Library</div>,
}));

jest.mock('../InputModal', () => ({
    __esModule: true,
    default: () => <div data-testid="mock-input-modal">Input Modal</div>,
}));

jest.mock('../ImageGeneratorModal', () => ({
    __esModule: true,
    default: () => <div data-testid="mock-image-generator-modal">Image Generator</div>,
}));

jest.mock('../ColorWheelTool', () => ({
    ColorWheelTool: ({
        onColorSelect,
        onPaletteSelect,
    }: {
        onColorSelect: (color: string) => void;
        onPaletteSelect: (palette: { id: string; name: string; colors: string[] }) => void;
    }) => (
        <div data-testid="mock-color-wheel-tool">
            <button onClick={() => onColorSelect('#123456')}>Apply Color</button>
            <button
                onClick={() =>
                    onPaletteSelect({
                        id: 'palette-1',
                        name: 'Warm',
                        colors: ['#123456', '#ff9900'],
                    })
                }
            >
                Pick Palette
            </button>
        </div>
    ),
}));

jest.mock('fabric', () => {
    class MockBaseObject {
        [key: string]: unknown;

        constructor(options: Record<string, unknown> = {}) {
            Object.assign(this, options);
        }

        set = jest.fn((patch: Record<string, unknown>) => {
            Object.assign(this, patch);
            return this;
        });

        setCoords = jest.fn();

        getCenterPoint = jest.fn(() => ({ x: 0, y: 0 }));

        setPositionByOrigin = jest.fn();

        calcTransformMatrix = jest.fn(() => [1, 0, 0, 1, 0, 0]);
    }

    class MockPoint {
        x: number;
        y: number;

        constructor(x: number, y: number) {
            this.x = x;
            this.y = y;
        }
    }

    class Rect extends MockBaseObject {
        type = 'rect';
    }

    class Circle extends MockBaseObject {
        type = 'circle';
    }

    class Triangle extends MockBaseObject {
        type = 'triangle';
    }

    class Polygon extends MockBaseObject {
        type = 'polygon';
        points: Array<{ x: number; y: number }>;

        constructor(points: Array<{ x: number; y: number }>, options: Record<string, unknown> = {}) {
            super(options);
            this.points = points;
        }
    }

    class Polyline extends MockBaseObject {
        type = 'polyline';
        points: Array<{ x: number; y: number }>;

        constructor(points: Array<{ x: number; y: number }>, options: Record<string, unknown> = {}) {
            super(options);
            this.points = points;
        }
    }

    class Path extends MockBaseObject {
        type = 'path';
        path: unknown;
        pathOffset = new MockPoint(0, 0);
        width = 100;
        height = 100;

        constructor(path: unknown, options: Record<string, unknown> = {}) {
            super(options);
            this.path = path;
        }
    }

    class IText extends MockBaseObject {
        type = 'i-text';
        text: string;

        constructor(text: string, options: Record<string, unknown> = {}) {
            super(options);
            this.text = text;
        }
    }

    class Text extends IText {
        type = 'text';
    }

    class Textbox extends IText {
        type = 'textbox';
    }

    class Group extends MockBaseObject {
        type = 'group';
        objects: unknown[];

        constructor(objects: unknown[] = [], options: Record<string, unknown> = {}) {
            super(options);
            this.objects = objects;
        }

        add = jest.fn((object: unknown) => {
            this.objects.push(object);
            return this;
        });
    }

    class Shadow extends MockBaseObject {}

    class MockFabricImage extends MockBaseObject {
        width = 1600;
        height = 1000;

        scale = jest.fn((value: number) => {
            this.scaleX = value;
            this.scaleY = value;
            return this;
        });
    }

    class Control extends MockBaseObject {}

    return {
        Rect,
        Circle,
        Triangle,
        Polygon,
        Polyline,
        Path,
        IText,
        Text,
        Textbox,
        Group,
        Shadow,
        Point: MockPoint,
        Control,
        Image: {
            fromURL: (...args: unknown[]) => mockImageFromURL(...args),
        },
        util: {
            transformPoint: (point: { x: number; y: number }) => point,
            invertTransform: (transform: number[]) => transform,
        },
        __MockFabricImage: MockFabricImage,
    };
});

type MockCanvas = {
    width: number;
    height: number;
    defaultCursor: string;
    hoverCursor: string;
    selection: boolean;
    add: jest.Mock;
    remove: jest.Mock;
    setActiveObject: jest.Mock;
    getActiveObject: jest.Mock;
    requestRenderAll: jest.Mock;
    bringObjectToFront: jest.Mock;
    centerObject: jest.Mock;
    discardActiveObject: jest.Mock;
    getObjects: jest.Mock;
    fire: jest.Mock;
    on: jest.Mock;
    off: jest.Mock;
    clear: jest.Mock;
    loadFromJSON: jest.Mock;
    toObject: jest.Mock;
    toDataURL: jest.Mock;
    getScenePoint: jest.Mock;
};

const createCanvasStub = (activeObject: { set: jest.Mock } | null = null): MockCanvas => ({
    width: 1200,
    height: 800,
    defaultCursor: 'default',
    hoverCursor: 'move',
    selection: true,
    add: jest.fn(),
    remove: jest.fn(),
    setActiveObject: jest.fn(),
    getActiveObject: jest.fn(() => activeObject),
    requestRenderAll: jest.fn(),
    bringObjectToFront: jest.fn(),
    centerObject: jest.fn(),
    discardActiveObject: jest.fn(),
    getObjects: jest.fn(() => []),
    fire: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    clear: jest.fn(),
    loadFromJSON: jest.fn((_json: unknown, callback: () => void) => callback()),
    toObject: jest.fn(() => ({ objects: [] })),
    toDataURL: jest.fn(() => 'data:image/png;base64,AAAAAA=='),
    getScenePoint: jest.fn(() => ({ x: 321, y: 654 })),
});

const renderToolbar = (options?: {
    initialTool?: string;
    onOpen3DEditor?: (url: string) => void;
    activeObject?: { set: jest.Mock } | null;
}) => {
    const canvas = createCanvasStub(options?.activeObject ?? null);
    const setActiveToolSpy = jest.fn();
    const setActivePaletteSpy = jest.fn();
    const ref = React.createRef<ToolbarHandle>();

    const Harness = () => {
        const [activeTool, setActiveTool] = React.useState(options?.initialTool ?? 'select');

        const handleSetActiveTool = (tool: string) => {
            setActiveToolSpy(tool);
            setActiveTool(tool);
        };

        return (
            <Toolbar
                ref={ref}
                canvas={canvas as unknown as never}
                activeTool={activeTool}
                setActiveTool={handleSetActiveTool}
                onOpen3DEditor={options?.onOpen3DEditor}
                setActivePalette={setActivePaletteSpy}
                currentUser="tester"
            />
        );
    };

    const view = render(<Harness />);
    return {
        ...view,
        canvas,
        ref,
        setActiveToolSpy,
        setActivePaletteSpy,
    };
};

describe('Toolbar', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const fabricModule = jest.requireMock('fabric') as {
            __MockFabricImage: new () => unknown;
        };
        mockImageFromURL.mockResolvedValue(new fabricModule.__MockFabricImage());
    });

    it('switches to gradient tool and updates cursor behavior', () => {
        const { canvas, setActiveToolSpy } = renderToolbar();

        fireEvent.click(screen.getByTitle('Fill / Gradient'));

        expect(setActiveToolSpy).toHaveBeenCalledWith('gradient');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('adds text to the canvas from the text tool', () => {
        const { canvas } = renderToolbar();

        fireEvent.click(screen.getByTitle('Text'));

        expect(canvas.add).toHaveBeenCalledTimes(1);
        expect(canvas.setActiveObject).toHaveBeenCalledTimes(1);
        expect(canvas.add.mock.calls[0][0]).toEqual(expect.objectContaining({ type: 'i-text', text: 'Tap to edit' }));
    });

    it('opens shapes menu and adds a rectangle', () => {
        const { canvas } = renderToolbar();

        fireEvent.click(screen.getByTitle('Shapes'));
        fireEvent.click(screen.getByRole('button', { name: 'Rect' }));

        expect(canvas.add).toHaveBeenCalled();
        expect(canvas.setActiveObject).toHaveBeenCalled();
        expect(canvas.add.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ type: 'rect' }));
    });

    it('adds a bent arrow from the shapes menu', () => {
        const { canvas } = renderToolbar();

        fireEvent.click(screen.getByTitle('Shapes'));
        fireEvent.click(screen.getByRole('button', { name: 'Bent Arrow' }));

        expect(canvas.add).toHaveBeenCalled();
        expect(canvas.setActiveObject).toHaveBeenCalled();
        expect(canvas.add.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ type: 'path' }));
    });

    it('creates an adjustment layer from the adjustments menu', () => {
        const { canvas, setActiveToolSpy } = renderToolbar();

        fireEvent.click(screen.getByTitle('Adjustments'));
        fireEvent.click(screen.getByRole('button', { name: 'Curves' }));

        expect(canvas.fire).toHaveBeenCalledWith('adjustment:create', { type: 'curves' });
        expect(setActiveToolSpy).toHaveBeenCalledWith('layers');
    });

    it('loads selected image assets onto the canvas', async () => {
        const { canvas } = renderToolbar();

        fireEvent.click(screen.getByTitle('Gallery'));
        fireEvent.click(screen.getByRole('button', { name: 'Pick Image' }));

        await waitFor(() => {
            expect(mockImageFromURL).toHaveBeenCalledWith('https://cdn.example/photo.png', {
                crossOrigin: 'anonymous',
            });
            expect(canvas.add).toHaveBeenCalled();
            expect(canvas.centerObject).toHaveBeenCalled();
        });
    });

    it('routes selected 3D models through the 3D editor callback', () => {
        const onOpen3DEditor = jest.fn();
        const { setActiveToolSpy } = renderToolbar({ onOpen3DEditor });

        fireEvent.click(screen.getByTitle('Gallery'));
        fireEvent.click(screen.getByRole('button', { name: 'Pick Model' }));

        expect(onOpen3DEditor).toHaveBeenCalledWith('https://cdn.example/model.glb');
        expect(setActiveToolSpy).toHaveBeenCalledWith('select');
    });

    it('applies a selected color and palette from color wheel tool', () => {
        const activeObject = { set: jest.fn() };
        const { canvas, setActivePaletteSpy } = renderToolbar({ activeObject });

        fireEvent.click(screen.getByTitle('Color'));
        fireEvent.click(screen.getByRole('button', { name: 'Apply Color' }));
        fireEvent.click(screen.getByRole('button', { name: 'Pick Palette' }));

        expect(activeObject.set).toHaveBeenCalledWith({ fill: '#123456' });
        expect(canvas.requestRenderAll).toHaveBeenCalled();
        expect(setActivePaletteSpy).toHaveBeenCalledWith({
            id: 'palette-1',
            name: 'Warm',
            colors: ['#123456', '#ff9900'],
        });
    });

    it('shows warning toast for unsupported file uploads', () => {
        const { container } = renderToolbar();
        const input = container.querySelector('input[type="file"]');
        expect(input).not.toBeNull();

        const badFile = new File(['bad'], 'clip.mov', { type: 'video/quicktime' });
        fireEvent.change(input as HTMLInputElement, { target: { files: [badFile] } });

        expect(mockToast).toHaveBeenCalledWith({
            title: 'Unsupported file',
            description: 'Please upload JPEG, PNG, WEBP, or SVG.',
            variant: 'warning',
        });
    });

    it('supports imperative tool switching through ref handle', () => {
        const { ref, canvas } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('pen');
        });

        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('does not place pen anchors while holding space for pan', () => {
        const { canvas } = renderToolbar();
        fireEvent.click(screen.getByTitle('Pen'));

        const mouseDownHandler = [...canvas.on.mock.calls]
            .reverse()
            .find((call) => call[0] === 'mouse:down')?.[1] as ((opt: unknown) => void) | undefined;
        expect(mouseDownHandler).toBeDefined();

        fireEvent.keyDown(window, { code: 'Space' });
        act(() => {
            mouseDownHandler?.({
                scenePoint: { x: 120, y: 140 },
                target: null,
                e: { button: 0 },
            });
        });
        fireEvent.keyUp(window, { code: 'Space' });

        expect(canvas.add).not.toHaveBeenCalled();
    });

    it('falls back to canvas.getScenePoint when mouse event lacks scenePoint', () => {
        const { canvas } = renderToolbar();
        fireEvent.click(screen.getByTitle('Pen'));

        const mouseDownHandler = [...canvas.on.mock.calls]
            .reverse()
            .find((call) => call[0] === 'mouse:down')?.[1] as ((opt: unknown) => void) | undefined;
        expect(mouseDownHandler).toBeDefined();

        act(() => {
            mouseDownHandler?.({
                target: null,
                e: { button: 0 },
            });
        });

        expect(canvas.getScenePoint).toHaveBeenCalled();
        expect(canvas.add).toHaveBeenCalledWith(expect.objectContaining({ type: 'circle', left: 321, top: 654 }));
    });
});
