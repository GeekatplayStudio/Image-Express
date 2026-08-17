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

jest.mock('../AICritiqueModal', () => ({
    __esModule: true,
    default: () => <div data-testid="mock-ai-critique-modal">AI Critique</div>,
}));

jest.mock('../ColorConstellation/ColorPickerModeHost', () => ({
    __esModule: true,
    default: ({
        onColorSelect,
        onPaletteSelect,
        selectedColor,
    }: {
        onColorSelect: (color: string) => void;
        onPaletteSelect: (palette: { id: string; name: string; colors: string[] }) => void;
        selectedColor?: string;
    }) => (
        <div data-testid="mock-color-wheel-tool">
            <div data-testid="mock-wheel-selected-color">{selectedColor}</div>
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

jest.mock('../ColorWheelTool', () => ({
    ColorWheelTool: ({
        onColorSelect,
        onPaletteSelect,
        selectedColor,
    }: {
        onColorSelect: (color: string) => void;
        onPaletteSelect: (palette: { id: string; name: string; colors: string[] }) => void;
        selectedColor?: string;
    }) => (
        <div data-testid="mock-color-wheel-tool">
            <div data-testid="mock-wheel-selected-color">{selectedColor}</div>
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

        calcOwnMatrix = jest.fn(() => [1, 0, 0, 1, 0, 0]);

        getViewportTransform = jest.fn(() => [1, 0, 0, 1, 0, 0]);
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
    getZoom: jest.Mock;
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
    getZoom: jest.fn(() => 1),
});

const renderToolbar = (options?: {
    initialTool?: string;
    onOpen3DEditor?: (url: string) => void;
    onRequestPropertiesPanel?: (mode?: 'properties' | 'layers') => void;
    activeObject?: { set: jest.Mock } | null;
    enableHoverLabels?: boolean;
    zoomCursorMode?: 'in' | 'out';
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
                onRequestPropertiesPanel={options?.onRequestPropertiesPanel}
                onOpen3DEditor={options?.onOpen3DEditor}
                setActivePalette={setActivePaletteSpy}
                currentUser="tester"
                enableHoverLabels={options?.enableHoverLabels}
                zoomCursorMode={options?.zoomCursorMode}
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

        fireEvent.click(screen.getByTitle('Fill / Gradient Tools (Fill / Gradient)'));

        expect(setActiveToolSpy).toHaveBeenCalledWith('gradient');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('shows persistent workspace utility tools on the rail', () => {
        renderToolbar();

        expect(screen.getByTitle('Crop')).toBeInTheDocument();
        expect(screen.getByTitle('Eyedropper')).toBeInTheDocument();
        expect(screen.getByTitle('Zoom')).toBeInTheDocument();
        expect(screen.getByTitle('Hand')).toBeInTheDocument();
    });

    it('opens the AI Critique modal from the creation rail and restores selection mode', () => {
        const { canvas, setActiveToolSpy } = renderToolbar();

        fireEvent.click(screen.getByTitle('AI Critique'));

        expect(setActiveToolSpy).toHaveBeenCalledWith('ai-critique');
        expect(canvas.defaultCursor).toBe('default');
        expect(canvas.hoverCursor).toBe('move');
        expect(canvas.selection).toBe(true);
        expect(screen.getByTestId('mock-ai-critique-modal')).toBeInTheDocument();
    });

    it('opens AI Zone from the creation rail and restores selection mode', () => {
        const { canvas, setActiveToolSpy } = renderToolbar();

        fireEvent.click(screen.getByTitle('AI Zone'));

        expect(setActiveToolSpy).toHaveBeenCalledWith('ai-zone');
        expect(canvas.defaultCursor).toBe('default');
        expect(canvas.hoverCursor).toBe('move');
        expect(canvas.selection).toBe(true);
        expect(screen.getByTestId('mock-image-generator-modal')).toBeInTheDocument();
    });

    it('opens color wheel when eyedropper is selected and applies wheel colors as foreground', () => {
        const { canvas, setActiveToolSpy } = renderToolbar();

        fireEvent.click(screen.getByTitle('Eyedropper'));
        expect(setActiveToolSpy).toHaveBeenCalledWith('eyedropper');
        expect(screen.getByTestId('mock-color-wheel-tool')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Apply Color' }));
        expect(canvas.fire).toHaveBeenCalledWith(
            'toolbar:color:change',
            expect.objectContaining({
                foregroundColor: '#123456',
                backgroundColor: '#ffffff',
            })
        );
    });

    it('syncs eyedropper sampled color into the wheel selected color', () => {
        const { canvas, setActiveToolSpy } = renderToolbar();

        fireEvent.click(screen.getByTitle('Eyedropper'));
        expect(setActiveToolSpy).toHaveBeenCalledWith('eyedropper');
        expect(screen.getByTestId('mock-color-wheel-tool')).toBeInTheDocument();

        const eyedropperSampleHandler = canvas.on.mock.calls
            .find((call) => call[0] === 'eyedropper:sample')?.[1] as ((payload?: { color?: string }) => void) | undefined;
        expect(eyedropperSampleHandler).toBeDefined();

        act(() => {
            eyedropperSampleHandler?.({ color: '#abcdef' });
        });

        expect(screen.getByTestId('mock-wheel-selected-color')).toHaveTextContent('#abcdef');
        expect(canvas.fire).toHaveBeenCalledWith(
            'toolbar:color:change',
            expect.objectContaining({
                foregroundColor: '#abcdef',
                backgroundColor: '#ffffff',
            })
        );
    });

    it('applies zoom out cursor when zoom mode is out', () => {
        const { canvas, setActiveToolSpy } = renderToolbar({ zoomCursorMode: 'out' });

        fireEvent.click(screen.getByTitle('Zoom'));

        expect(setActiveToolSpy).toHaveBeenCalledWith('zoom');
        expect(canvas.defaultCursor).toBe('zoom-out');
        expect(canvas.hoverCursor).toBe('zoom-out');
    });

    it('swaps foreground and background utility colors and syncs canvas event', () => {
        const { canvas } = renderToolbar();

        fireEvent.click(screen.getByTitle('Swap colors'));

        expect(canvas.fire).toHaveBeenCalledWith(
            'toolbar:color:change',
            expect.objectContaining({
                foregroundColor: '#ffffff',
                backgroundColor: '#000000',
            })
        );
    });

    it('adds text to the canvas from the text tool', () => {
        const { canvas } = renderToolbar();

        fireEvent.click(screen.getByTitle('Text'));

        expect(canvas.add).toHaveBeenCalledTimes(1);
        expect(canvas.setActiveObject).toHaveBeenCalledTimes(1);
        expect(canvas.add.mock.calls[0][0]).toEqual(expect.objectContaining({ type: 'i-text', text: 'Tap to edit' }));
    });

    it('opens selection tool group flyout and switches to marquee', () => {
        const { canvas, setActiveToolSpy } = renderToolbar();

        fireEvent.click(screen.getByTitle('Selection Tools (Move)'));
        fireEvent.click(screen.getByRole('button', { name: 'Marquee' }));

        expect(setActiveToolSpy).toHaveBeenCalledWith('marquee');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('opens retouch group and routes sharpen selection through flyout', () => {
        const { canvas, setActiveToolSpy } = renderToolbar();

        fireEvent.click(screen.getByTitle('Retouch Tools (Healing Brush)'));
        expect(setActiveToolSpy).toHaveBeenCalledWith('healing');

        fireEvent.click(screen.getByTitle('Retouch Tools (Healing Brush)'));
        fireEvent.click(screen.getByRole('button', { name: 'Sharpen Tool' }));

        expect(setActiveToolSpy).toHaveBeenCalledWith('sharpen');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
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

    it('adds a cloud from the shapes menu', () => {
        const onRequestPropertiesPanel = jest.fn();
        const { canvas } = renderToolbar({ onRequestPropertiesPanel });

        fireEvent.click(screen.getByTitle('Shapes'));
        fireEvent.click(screen.getByRole('button', { name: 'Cloud' }));

        expect(canvas.add).toHaveBeenCalled();
        expect(canvas.setActiveObject).toHaveBeenCalled();
        expect(canvas.add.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ type: 'path' }));
        expect(onRequestPropertiesPanel).toHaveBeenCalledWith('properties');
    });

    it('exposes adjustment layers as a creation tool on the left rail', () => {
        renderToolbar();

        expect(screen.queryByTitle('Layers')).not.toBeInTheDocument();
        expect(screen.getByTitle('Adjustment Layers')).toBeInTheDocument();
        expect(screen.queryByTitle('Color')).not.toBeInTheDocument();
    });

    it('creates an adjustment layer from the left rail flyout', () => {
        const onRequestPropertiesPanel = jest.fn();
        const { canvas, setActiveToolSpy } = renderToolbar({ onRequestPropertiesPanel });

        fireEvent.click(screen.getByTitle('Adjustment Layers'));
        fireEvent.click(screen.getByRole('button', { name: 'Curves' }));

        expect(canvas.fire).toHaveBeenCalledWith('adjustment:create', { type: 'curves' });
        expect(setActiveToolSpy).toHaveBeenCalledWith('layers');
        expect(onRequestPropertiesPanel).toHaveBeenCalledWith('properties');
    });

    it('creates Light and Color adjustment layer from the flyout', () => {
        const onRequestPropertiesPanel = jest.fn();
        const { canvas, setActiveToolSpy } = renderToolbar({ onRequestPropertiesPanel });

        fireEvent.click(screen.getByTitle('Adjustment Layers'));
        fireEvent.click(screen.getByRole('button', { name: 'Light and Color' }));

        expect(canvas.fire).toHaveBeenCalledWith('adjustment:create', { type: 'light-and-color' });
        expect(setActiveToolSpy).toHaveBeenCalledWith('layers');
        expect(onRequestPropertiesPanel).toHaveBeenCalledWith('properties');
    });

    it('expands and reveals tool labels on hover when enabled', () => {
        renderToolbar({ enableHoverLabels: true });
        const railHost = screen.getByTestId('toolbar-rail-host');

        expect(screen.queryByText('Fabrication Library')).not.toBeInTheDocument();
        fireEvent.mouseEnter(railHost);
        expect(screen.getByText('Fabrication Library')).toBeInTheDocument();

        fireEvent.mouseLeave(railHost);
        expect(screen.queryByText('Fabrication Library')).not.toBeInTheDocument();
    });

    it('stays icon-only when hover labels are disabled', () => {
        renderToolbar({ enableHoverLabels: false });
        const railHost = screen.getByTestId('toolbar-rail-host');

        fireEvent.mouseEnter(railHost);
        expect(screen.queryByText('Fabrication Library')).not.toBeInTheDocument();
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
            expect(canvas.setActiveObject).toHaveBeenCalled();
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

    it('shows warning toast for unsupported file uploads', () => {
        const { container } = renderToolbar();
        const input = container.querySelector('input[type="file"]');
        expect(input).not.toBeNull();

        const badFile = new File(['bad'], 'clip.mov', { type: 'video/quicktime' });
        fireEvent.change(input as HTMLInputElement, { target: { files: [badFile] } });

        expect(mockToast).toHaveBeenCalledWith({
            title: 'Unsupported file',
            description: 'Please upload a supported image file (JPEG, PNG, WebP, SVG, HEIC, TIFF, PSD, PDF, RAW, and more).',
            variant: 'warning',
        });
    });

    it('supports imperative tool switching through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('pen');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('pen');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports marquee tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('marquee');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('marquee');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports lasso tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('lasso');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('lasso');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports wand tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('wand');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('wand');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports quick selection tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('quick-select');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('quick-select');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports selection brush tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('selection-brush');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('selection-brush');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports healing tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('healing');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('healing');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports clone stamp tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('clone-stamp');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('clone-stamp');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports history brush tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('history-brush');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('history-brush');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports blur tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('blur');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('blur');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports sharpen tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('sharpen');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('sharpen');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('supports dodge tool activation through ref handle', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('dodge');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('dodge');
        expect(canvas.defaultCursor).toBe('crosshair');
        expect(canvas.hoverCursor).toBe('crosshair');
        expect(canvas.selection).toBe(false);
    });

    it('routes path-select alias to move/select behavior', () => {
        const { ref, canvas, setActiveToolSpy } = renderToolbar();

        act(() => {
            ref.current?.triggerTool('pen');
        });
        expect(canvas.selection).toBe(false);

        act(() => {
            ref.current?.triggerTool('path-select');
        });

        expect(setActiveToolSpy).toHaveBeenCalledWith('select');
        expect(canvas.defaultCursor).toBe('default');
        expect(canvas.hoverCursor).toBe('move');
        expect(canvas.selection).toBe(true);
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

    it('finalizes pen paths using top-left origin coordinates to avoid placement drift', () => {
        const { canvas } = renderToolbar();
        fireEvent.click(screen.getByTitle('Pen'));

        const getLatestHandler = (eventName: string) => [...canvas.on.mock.calls]
            .reverse()
            .find((call) => call[0] === eventName)?.[1] as ((opt?: unknown) => void) | undefined;

        expect(getLatestHandler('mouse:down')).toBeDefined();
        expect(getLatestHandler('mouse:dblclick')).toBeDefined();

        act(() => {
            getLatestHandler('mouse:down')?.({
                scenePoint: { x: 200, y: 160 },
                target: null,
                e: { button: 0 },
            });
        });
        act(() => {
            getLatestHandler('mouse:down')?.({
                scenePoint: { x: 340, y: 220 },
                target: null,
                e: { button: 0 },
            });
        });
        act(() => {
            getLatestHandler('mouse:dblclick')?.();
        });

        const createdPath = canvas.add.mock.calls
            .map((call) => call[0] as Record<string, unknown>)
            .reverse()
            .find((obj) => obj?.type === 'path');

        expect(createdPath).toEqual(expect.objectContaining({
            isPenPath: true,
            originX: 'left',
            originY: 'top',
            left: 200,
            top: 160,
        }));
    });

    it('closes the path when clicking the start anchor, even with the Open/Closed toggle left at its default (open)', () => {
        const { canvas } = renderToolbar();
        fireEvent.click(screen.getByTitle('Pen'));

        const getLatestHandler = (eventName: string) => [...canvas.on.mock.calls]
            .reverse()
            .find((call) => call[0] === eventName)?.[1] as ((opt?: unknown) => void) | undefined;
        expect(getLatestHandler('mouse:down')).toBeDefined();

        act(() => {
            getLatestHandler('mouse:down')?.({ scenePoint: { x: 100, y: 100 }, target: null, e: { button: 0 } });
        });
        act(() => {
            getLatestHandler('mouse:down')?.({ scenePoint: { x: 200, y: 100 }, target: null, e: { button: 0 } });
        });
        act(() => {
            getLatestHandler('mouse:down')?.({ scenePoint: { x: 200, y: 200 }, target: null, e: { button: 0 } });
        });

        const startAnchor = canvas.add.mock.calls
            .map((call) => call[0] as { isPenDraftAnchor?: boolean; penAnchorIndex?: number })
            .find((obj) => obj?.isPenDraftAnchor && obj.penAnchorIndex === 0);
        expect(startAnchor).toBeDefined();

        act(() => {
            getLatestHandler('mouse:down')?.({ scenePoint: { x: 100, y: 100 }, target: startAnchor, e: { button: 0 } });
        });

        const createdPath = canvas.add.mock.calls
            .map((call) => call[0] as Record<string, unknown>)
            .reverse()
            .find((obj) => obj?.type === 'path');

        expect(createdPath).toEqual(expect.objectContaining({ isPenPath: true, penClosed: true }));
    });

    it('closes the path on a click near (but not directly on) the start anchor, scaled for the current zoom', () => {
        const { canvas } = renderToolbar();
        canvas.getZoom.mockReturnValue(0.25);
        fireEvent.click(screen.getByTitle('Pen'));

        const getLatestHandler = (eventName: string) => [...canvas.on.mock.calls]
            .reverse()
            .find((call) => call[0] === eventName)?.[1] as ((opt?: unknown) => void) | undefined;

        act(() => {
            getLatestHandler('mouse:down')?.({ scenePoint: { x: 100, y: 100 }, target: null, e: { button: 0 } });
        });
        act(() => {
            getLatestHandler('mouse:down')?.({ scenePoint: { x: 200, y: 100 }, target: null, e: { button: 0 } });
        });
        act(() => {
            getLatestHandler('mouse:down')?.({ scenePoint: { x: 200, y: 200 }, target: null, e: { button: 0 } });
        });

        // Missed the (tiny, zoomed-out) anchor object itself, but landed
        // within the zoom-adjusted proximity radius (14 / 0.25 = 56 scene units).
        act(() => {
            getLatestHandler('mouse:down')?.({ scenePoint: { x: 140, y: 100 }, target: null, e: { button: 0 } });
        });

        const createdPath = canvas.add.mock.calls
            .map((call) => call[0] as Record<string, unknown>)
            .reverse()
            .find((obj) => obj?.type === 'path');

        expect(createdPath).toEqual(expect.objectContaining({ isPenPath: true, penClosed: true }));
    });
});
