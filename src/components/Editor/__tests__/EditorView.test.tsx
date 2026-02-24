import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TextDecoder, TextEncoder } from 'util';

const mockTriggerTool = jest.fn();
const mockDialogConfirm = jest.fn().mockResolvedValue(true);
const mockDialogPrompt = jest.fn().mockResolvedValue('Draft');
const mockDialogAlert = jest.fn().mockResolvedValue(undefined);
const mockToast = jest.fn();
const mockUploadBackup = jest.fn();
const mockLoadDriveConfig = jest.fn(() => ({ enabled: false }));
const mockLoadProfileSettings = jest.fn(() => null);
const mockDialogApi = {
    confirm: (...args: unknown[]) => mockDialogConfirm(...args),
    prompt: (...args: unknown[]) => mockDialogPrompt(...args),
    alert: (...args: unknown[]) => mockDialogAlert(...args),
};
const mockToastApi = {
    toast: (...args: unknown[]) => mockToast(...args),
};
let latestCanvasStub: ReturnType<typeof createCanvasStub> | null = null;

if (typeof global.TextEncoder === 'undefined') {
    global.TextEncoder = TextEncoder as typeof global.TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
    global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}

function createCanvasStub() {
    const canvasElement = document.createElement('canvas');
    const contextContainer = { imageSmoothingEnabled: true } as CanvasRenderingContext2D;
    const contextTop = { imageSmoothingEnabled: true } as CanvasRenderingContext2D;
    return {
        width: 1200,
        height: 800,
        viewportTransform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        backgroundColor: '#ffffff',
        contextContainer,
        contextTop,
        on: jest.fn(),
        off: jest.fn(),
        fire: jest.fn(),
        toJSON: jest.fn(() => ({ objects: [] })),
        loadFromJSON: jest.fn((json: unknown, callback: () => void) => {
            if (typeof callback === 'function') {
                callback();
            }
            return json;
        }),
        toDataURL: jest.fn(() => 'data:image/png;base64,AAAAAA=='),
        toSVG: jest.fn(() => '<svg></svg>'),
        getZoom: jest.fn(() => 1),
        setZoom: jest.fn(),
        zoomToPoint: jest.fn(),
        setDimensions: jest.fn(),
        setViewportTransform: jest.fn(),
        requestRenderAll: jest.fn(),
        getElement: jest.fn(() => canvasElement),
        getObjects: jest.fn(() => []),
        getWidth: jest.fn(() => 1200),
        getHeight: jest.fn(() => 800),
        centerArtboard: jest.fn(),
        add: jest.fn(),
        remove: jest.fn(),
        bringToFront: jest.fn(),
        moveTo: jest.fn(),
        centerObject: jest.fn(),
        setActiveObject: jest.fn(),
        getActiveObject: jest.fn(() => null),
        getActiveObjects: jest.fn(() => []),
        discardActiveObject: jest.fn(),
    };
}

jest.mock('next/image', () => ({
    __esModule: true,
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text, @typescript-eslint/no-explicit-any
    default: ({ fill, unoptimized, ...props }: any) => <img {...props} data-fill={fill} data-unoptimized={unoptimized} />,
}));

jest.mock('@/components/DesignCanvas', () => {
    return function MockDesignCanvas({
        onCanvasReady,
        onRightClick,
        onModified,
    }: {
        onCanvasReady: (canvas: unknown) => void;
        onRightClick?: (event: { clientX: number; clientY: number }) => void;
        onModified?: () => void;
    }) {
        React.useEffect(() => {
            const stub = createCanvasStub();
            latestCanvasStub = stub;
            onCanvasReady(stub);
        }, [onCanvasReady]);
        return (
            <div>
                <button
                    data-testid="design-canvas"
                    onContextMenu={(event) => {
                        event.preventDefault();
                        onRightClick?.({
                            clientX: 100,
                            clientY: 120,
                            preventDefault: () => undefined,
                        } as unknown as MouseEvent);
                    }}
                >
                    Canvas
                </button>
                <button data-testid="canvas-modified" onClick={() => onModified?.()}>
                    Mark Dirty
                </button>
            </div>
        );
    };
});

jest.mock('@/components/Toolbar', () => {
    return {
        __esModule: true,
        default: React.forwardRef(function MockToolbar(
            props: {
                setActivePalette?: (palette: { id: string; name: string; colors: string[] } | null) => void;
                apiKeys?: { openai?: string };
            },
            ref: React.Ref<{ triggerTool: (tool: string) => void }>
        ) {
            React.useImperativeHandle(ref, () => ({
                triggerTool: (tool: string) => mockTriggerTool(tool),
            }));
            return (
                <div>
                    <div data-testid="toolbar">Toolbar</div>
                    <button
                        onClick={() => props.setActivePalette?.({
                            id: 'palette-1',
                            name: 'Sunset',
                            colors: ['#ff0000', '#00ff00'],
                        })}
                    >
                        Apply Palette
                    </button>
                    <div data-testid="toolbar-openai-key">{props.apiKeys?.openai || ''}</div>
                </div>
            );
        }),
    };
});

jest.mock('@/components/PropertiesPanel', () => ({
    __esModule: true,
    default: () => <div data-testid="properties-panel">Properties</div>,
}));

jest.mock('@/components/ThreeDGenerator', () => ({
    __esModule: true,
    default: () => <div data-testid="three-d-generator">3D Generator</div>,
}));

jest.mock('@/components/ThreeDLayerEditor', () => ({
    __esModule: true,
    default: () => <div data-testid="three-d-layer-editor">3D Layer Editor</div>,
}));

jest.mock('@/components/JobStatusFooter', () => ({
    __esModule: true,
    default: () => <div data-testid="job-status-footer">Job Status</div>,
}));

jest.mock('@/components/UserProfileModal', () => ({
    __esModule: true,
    default: ({ isOpen, onLogout }: { isOpen: boolean; onLogout: () => void }) => (
        isOpen ? (
            <div data-testid="profile-modal">
                <button onClick={onLogout}>Mock Logout</button>
            </div>
        ) : null
    ),
}));

jest.mock('@/components/AssetLibrary', () => ({
    __esModule: true,
    default: ({ onSelect }: { onSelect?: (url: string, type: string, name?: string) => void }) => (
        <div data-testid="asset-library">
            <button onClick={() => onSelect?.('https://cdn.example/replacement.png', 'images', 'replacement.png')}>
                Pick Replacement Asset
            </button>
        </div>
    ),
}));

jest.mock('@/components/MissingAssetsModal', () => ({
    __esModule: true,
    default: ({
        isOpen,
        missingItems,
        onReplace,
        onIgnore,
        onClose,
    }: {
        isOpen: boolean;
        missingItems: Array<{ id: string }>;
        onReplace: (id: string) => void;
        onIgnore: () => void;
        onClose: () => void;
    }) => (
        isOpen ? (
            <div data-testid="missing-assets-modal">
                <button onClick={() => onReplace(missingItems[0]?.id || '0')}>Replace Missing</button>
                <button onClick={onIgnore}>Resolve Missing</button>
                <button onClick={onClose}>Close Missing</button>
            </div>
        ) : null
    ),
}));

jest.mock('@/components/GridOverlay', () => ({
    __esModule: true,
    GridOverlay: () => <div data-testid="grid-overlay">Grid</div>,
}));

jest.mock('@/components/GradientControls', () => ({
    __esModule: true,
    GradientControls: () => <div data-testid="gradient-controls">Gradient</div>,
}));

jest.mock('@/components/CircularContextMenu', () => ({
    __esModule: true,
    default: ({
        isOpen,
        onSelectTool,
        onClose,
    }: {
        isOpen: boolean;
        onSelectTool: (tool: string) => void;
        onClose: () => void;
    }) => (
        isOpen ? (
            <div data-testid="context-menu">
                <button onClick={() => onSelectTool('paint')}>Context Paint</button>
                <button onClick={onClose}>Close Context</button>
            </div>
        ) : null
    ),
}));

jest.mock('@/components/BrandIcon', () => ({
    __esModule: true,
    default: () => <div data-testid="brand-icon">Brand</div>,
}));

jest.mock('@/lib/profile-utils', () => ({
    loadProfileSettings: (...args: unknown[]) => mockLoadProfileSettings(...args),
}));

jest.mock('@/lib/googleDrive', () => ({
    loadDriveConfig: (...args: unknown[]) => mockLoadDriveConfig(...args),
    uploadBackup: (...args: unknown[]) => mockUploadBackup(...args),
}));

jest.mock('@/providers/DialogProvider', () => ({
    useDialog: () => mockDialogApi,
}));

jest.mock('@/providers/ToastProvider', () => ({
    useToast: () => mockToastApi,
}));

function makeJsonResponse(payload: unknown, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 500,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
    } as unknown as Response;
}

function hasFetchCall(fetchMock: jest.Mock, url: string, method?: string) {
    return fetchMock.mock.calls.some((call) => {
        const input = call[0] as RequestInfo | URL;
        const init = call[1] as RequestInit | undefined;
        if (String(input) !== url) return false;
        if (!method) return true;
        return init?.method === method;
    });
}

describe('EditorView', () => {
    let EditorView: typeof import('../EditorView').default;
    let fetchMock: jest.Mock;
    let anchorClickSpy: jest.SpyInstance;
    let renameShouldFail = false;
    let saveShouldFail = false;

    beforeAll(async () => {
        ({ default: EditorView } = await import('../EditorView'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        mockLoadDriveConfig.mockReturnValue({ enabled: false });
        mockLoadProfileSettings.mockReturnValue(null);
        mockUploadBackup.mockResolvedValue(undefined);
        renameShouldFail = false;
        saveShouldFail = false;
        latestCanvasStub = null;

        fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === '/api/designs/save' && init?.method === 'POST') {
                if (saveShouldFail) {
                    return makeJsonResponse({ success: false, message: 'Server save failed.' }, false);
                }
                const raw = String(init.body || '{}');
                const body = JSON.parse(raw) as { id?: string | null; name?: string };
                return makeJsonResponse({
                    success: true,
                    design: {
                        id: body.id || 'design-1',
                        name: body.name || 'Untitled Design',
                    },
                });
            }

            if (url === '/api/designs/rename' && init?.method === 'POST') {
                if (renameShouldFail) {
                    return makeJsonResponse({ success: false, message: 'Rename failed.' }, false);
                }
                const raw = String(init.body || '{}');
                const body = JSON.parse(raw) as { id?: string; name?: string };
                return makeJsonResponse({
                    success: true,
                    design: {
                        id: body.id || 'design-1',
                        name: body.name || 'Renamed Server',
                    },
                });
            }

            if (url === '/template-missing.json') {
                return makeJsonResponse({
                    objects: [{ type: 'image', src: '/missing-image.png' }],
                });
            }

            if (url === '/missing-image.png' && init?.method === 'HEAD') {
                return makeJsonResponse({}, false);
            }

            if (url === '/api/assets/save-url' && init?.method === 'POST') {
                return makeJsonResponse({ success: true });
            }

            if (url === '/design-ok.json') {
                return makeJsonResponse({ objects: [] });
            }

            if (url === '/design-fail.json') {
                return makeJsonResponse({ message: 'nope' }, false);
            }

            return makeJsonResponse({});
        });
        (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

        Object.defineProperty(window, 'open', {
            configurable: true,
            writable: true,
            value: jest.fn(),
        });

        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            writable: true,
            value: jest.fn(() => 'blob:editor-export'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            writable: true,
            value: jest.fn(),
        });

        anchorClickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => {
        anchorClickSpy.mockRestore();
    });

    const createDefaultProps = () => ({
        initialDesign: null,
        initialTemplateJsonUrl: null,
        initialSize: null,
        user: 'alice@example.com',
        onBack: jest.fn(),
        onLogout: jest.fn(),
        currentDesignName: 'Untitled Design',
        currentDesignId: null,
        onUpdateDesignInfo: jest.fn(),
        onOpenDocumentation: jest.fn(),
        onOpenSettings: jest.fn(),
        onOpenAdminArea: jest.fn(),
        isAdminUser: false,
        settingsOpen: false,
    });

    it('renders core editor UI and wires header actions', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="paint" />);

        const activeObject = { set: jest.fn() };
        latestCanvasStub?.getActiveObject.mockReturnValue(activeObject);

        expect(screen.getByTestId('brand-icon')).toBeInTheDocument();
        expect(screen.getByTestId('toolbar')).toBeInTheDocument();
        expect(screen.getByTestId('design-canvas')).toBeInTheDocument();
        expect(screen.getByTestId('top-tool-options-bar')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Auto-Select'));
        fireEvent.click(screen.getByRole('button', { name: 'Selection mode group' }));

        fireEvent.click(screen.getByLabelText('Show Transform Controls'));

        fireEvent.change(screen.getByLabelText('Select feather'), { target: { value: '18' } });
        expect(activeObject.set).toHaveBeenCalledWith(expect.objectContaining({ shadow: expect.anything() }));

        fireEvent.click(screen.getByLabelText('Select anti-alias'));
        await waitFor(() => {
            expect(latestCanvasStub?.contextContainer?.imageSmoothingEnabled).toBe(false);
            expect(latestCanvasStub?.contextTop?.imageSmoothingEnabled).toBe(false);
        });

        fireEvent.click(screen.getByTitle('How to use Image Express'));
        expect(props.onOpenDocumentation).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTitle('Settings'));
        expect(props.onOpenSettings).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTitle('Back to Hub'));
        expect(props.onBack).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('Tools'));
        fireEvent.click(screen.getByRole('button', { name: /^Move\s+V$/ }));
        expect(mockTriggerTool).toHaveBeenCalledWith('select');

        await waitFor(() => {
            expect(screen.getByLabelText('Paint preset')).toBeInTheDocument();
        });
        fireEvent.change(screen.getByLabelText('Paint size'), { target: { value: '24' } });
        fireEvent.change(screen.getByLabelText('Paint hardness'), { target: { value: '55' } });
        fireEvent.change(screen.getByLabelText('Paint opacity'), { target: { value: '75' } });
        fireEvent.change(screen.getByLabelText('Paint flow'), { target: { value: '70' } });
        fireEvent.change(screen.getByLabelText('Paint smoothing'), { target: { value: '35' } });
        fireEvent.change(screen.getByLabelText('Paint blend mode'), { target: { value: 'multiply' } });

        fireEvent.click(screen.getByRole('button', { name: 'Apply Palette' }));
        expect(screen.getByText('Sunset')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('User Profile'));
        expect(screen.getByTestId('profile-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Mock Logout' }));
        expect(props.onLogout).toHaveBeenCalledTimes(1);
    });

    it('wires top pen path/shape toggle to pen config events', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="pen" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Pen mode path' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Pen mode shape' }));

        expect(latestCanvasStub?.fire).toHaveBeenCalledWith('pen:config:set', {
            closure: 'closed',
        });

        fireEvent.click(screen.getByRole('button', { name: 'Pen mode path' }));

        expect(latestCanvasStub?.fire).toHaveBeenCalledWith('pen:config:set', {
            closure: 'open',
        });

        fireEvent.click(screen.getByRole('button', { name: 'Pen operation subtract' }));

        expect(latestCanvasStub?.fire).toHaveBeenCalledWith('pen:config:set', {
            pathOperation: 'subtract',
        });

        fireEvent.click(screen.getByRole('button', { name: 'Pen operation intersect' }));

        expect(latestCanvasStub?.fire).toHaveBeenCalledWith('pen:config:set', {
            pathOperation: 'intersect',
        });

        fireEvent.click(screen.getByLabelText('Pen auto add delete'));

        expect(latestCanvasStub?.fire).toHaveBeenCalledWith('pen:config:set', {
            autoAddDelete: false,
        });

        fireEvent.click(screen.getByLabelText('Pen rubber band'));

        expect(latestCanvasStub?.fire).toHaveBeenCalledWith('pen:config:set', {
            rubberBand: false,
        });
    });

    it('wires top shape controls and applies shape style to active shape object', async () => {
        const activeShapeObject = {
            type: 'rect',
            set: jest.fn(),
            setCoords: jest.fn(),
            fill: '#8b5cf6',
            stroke: '#111827',
            strokeWidth: 2,
            lockScalingX: false,
            lockScalingY: false,
        };

        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="shapes" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Shape mode shape' })).toBeInTheDocument();
        });

        latestCanvasStub?.getActiveObject.mockReturnValue(activeShapeObject);

        fireEvent.click(screen.getByRole('button', { name: 'Shape mode path' }));
        expect(latestCanvasStub?.fire).toHaveBeenCalledWith('shape:config:set', expect.objectContaining({
            mode: 'path',
        }));
        expect(activeShapeObject.set).toHaveBeenCalledWith(expect.objectContaining({
            fill: 'transparent',
            strokeWidth: 1,
        }));

        fireEvent.click(screen.getByRole('button', { name: 'Shape mode shape' }));
        expect(latestCanvasStub?.fire).toHaveBeenCalledWith('shape:config:set', expect.objectContaining({
            mode: 'shape',
        }));

        fireEvent.change(screen.getByLabelText('Shape fill color'), {
            target: { value: '#336699' },
        });
        expect(activeShapeObject.set).toHaveBeenCalledWith(expect.objectContaining({
            fill: '#336699',
        }));

        fireEvent.change(screen.getByLabelText('Shape stroke color'), {
            target: { value: '#ff5500' },
        });
        expect(activeShapeObject.set).toHaveBeenCalledWith(expect.objectContaining({
            stroke: '#ff5500',
        }));

        fireEvent.change(screen.getByLabelText('Shape stroke width'), {
            target: { value: '12' },
        });
        expect(activeShapeObject.set).toHaveBeenCalledWith(expect.objectContaining({
            strokeWidth: 12,
        }));

        fireEvent.click(screen.getByLabelText('Shape fixed size'));
        expect(activeShapeObject.set).toHaveBeenCalledWith(expect.objectContaining({
            lockScalingX: true,
            lockScalingY: true,
        }));

        expect(activeShapeObject.setCoords).toHaveBeenCalled();
        expect(latestCanvasStub?.requestRenderAll).toHaveBeenCalled();
    });

    it('wires top gradient controls and applies gradient config with angle fallback', async () => {
        const activeGradientObject: {
            [key: string]: unknown;
            type: string;
            fill: unknown;
            globalCompositeOperation: string;
            opacity: number;
            gradientTypeHint?: 'linear' | 'radial' | 'angle';
            gradientReversed?: boolean;
            gradientDitherEnabled?: boolean;
            get: jest.Mock;
            set: jest.Mock;
            setCoords: jest.Mock;
        } = {
            type: 'rect',
            fill: {
                type: 'linear',
                coords: { x1: 0, y1: 0, x2: 1, y2: 1 },
                colorStops: [
                    { offset: 0, color: '#0000ff' },
                    { offset: 1, color: '#ff0000' },
                ],
            },
            globalCompositeOperation: 'source-over',
            opacity: 1,
            gradientTypeHint: 'linear',
            gradientReversed: false,
            gradientDitherEnabled: false,
            get: jest.fn((key: string) => activeGradientObject[key]),
            set: jest.fn((props: Record<string, unknown>) => {
                Object.assign(activeGradientObject, props);
            }),
            setCoords: jest.fn(),
        };

        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="gradient" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Gradient type radial' })).toBeInTheDocument();
        });

        latestCanvasStub?.getActiveObject.mockReturnValue(activeGradientObject);

        fireEvent.click(screen.getByRole('button', { name: 'Gradient type radial' }));
        expect(activeGradientObject.gradientTypeHint).toBe('radial');
        expect(activeGradientObject.set).toHaveBeenCalledWith(expect.objectContaining({
            fill: expect.anything(),
            globalCompositeOperation: 'source-over',
            opacity: 1,
        }));

        fireEvent.change(screen.getByLabelText('Gradient blend mode'), {
            target: { value: 'multiply' },
        });
        expect(activeGradientObject.globalCompositeOperation).toBe('multiply');

        fireEvent.change(screen.getByLabelText('Gradient opacity'), {
            target: { value: '65' },
        });
        expect(activeGradientObject.opacity).toBeCloseTo(0.65, 5);

        fireEvent.click(screen.getByLabelText('Gradient reverse'));
        expect(activeGradientObject.gradientReversed).toBe(true);

        fireEvent.click(screen.getByLabelText('Gradient dither'));
        expect(activeGradientObject.gradientDitherEnabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Gradient type angle' }));
        expect(activeGradientObject.gradientTypeHint).toBe('angle');
        expect((activeGradientObject.fill as { type?: string }).type).toBe('linear');
        expect(activeGradientObject.setCoords).toHaveBeenCalled();
        expect(latestCanvasStub?.requestRenderAll).toHaveBeenCalled();
    });

    it('wires crop/eyedropper/zoom/hand top utility controls', async () => {
        const props = createDefaultProps();
        const { rerender } = render(<EditorView {...props} initialActiveTool="crop" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Apply crop' })).toBeInTheDocument();
        });

        const artboardRect = {
            set: jest.fn(),
            setCoords: jest.fn(),
        };
        const insideObject = {
            getBoundingRect: jest.fn(() => ({ left: 100, top: 100, width: 200, height: 200 })),
        };
        const outsideObject = {
            getBoundingRect: jest.fn(() => ({ left: 1500, top: 900, width: 120, height: 120 })),
        };

        const mutableCanvas = latestCanvasStub as (ReturnType<typeof createCanvasStub> & {
            artboard?: { width: number; height: number; left: number; top: number };
            artboardRect?: { set: jest.Mock; setCoords: jest.Mock };
        }) | null;
        if (mutableCanvas) {
            mutableCanvas.artboard = { left: 0, top: 0, width: 1200, height: 800 };
            mutableCanvas.artboardRect = artboardRect;
        }
        latestCanvasStub?.getObjects.mockReturnValue([
            artboardRect as unknown as object,
            insideObject as unknown as object,
            outsideObject as unknown as object,
        ]);

        fireEvent.click(screen.getByRole('button', { name: 'Crop ratio 1:1' }));
        fireEvent.click(screen.getByLabelText('Crop delete outside'));
        fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));

        expect(artboardRect.set).toHaveBeenCalledWith(expect.objectContaining({
            width: 800,
            height: 800,
        }));
        expect(latestCanvasStub?.remove).toHaveBeenCalledWith(outsideObject);
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Crop applied',
            variant: 'success',
        }));

        rerender(<EditorView {...props} initialActiveTool="eyedropper" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Eyedropper sample' })).toBeInTheDocument();
        });
        latestCanvasStub?.getActiveObject.mockReturnValue({
            fill: '#336699',
            stroke: '#000000',
        });

        fireEvent.click(screen.getByRole('button', { name: 'Eyedropper sample' }));

        expect(latestCanvasStub?.fire).toHaveBeenCalledWith('eyedropper:sample', expect.objectContaining({
            color: '#336699',
            sampleSize: 1,
            sampleSource: 'current-layer',
        }));
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Color sampled',
            variant: 'success',
        }));

        rerender(<EditorView {...props} initialActiveTool="zoom" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Zoom apply' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Zoom mode out' }));
        fireEvent.change(screen.getByLabelText('Zoom step'), { target: { value: '25' } });
        fireEvent.click(screen.getByRole('button', { name: 'Zoom apply' }));

        await waitFor(() => {
            expect(latestCanvasStub?.zoomToPoint).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Zoom fit to screen' }));
        expect(latestCanvasStub?.centerArtboard).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Zoom reset' }));
        expect(latestCanvasStub?.zoomToPoint).toHaveBeenCalledWith(expect.anything(), 1);

        rerender(<EditorView {...props} initialActiveTool="hand" />);

        await waitFor(() => {
            expect(screen.getByLabelText('Hand lock pan')).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(latestCanvasStub?.fire).toHaveBeenCalledWith('hand:mode:set', {
                enabled: true,
            });
        });

        fireEvent.click(screen.getByLabelText('Hand lock pan'));
        await waitFor(() => {
            expect(latestCanvasStub?.fire).toHaveBeenCalledWith('hand:mode:set', {
                enabled: false,
            });
        });
    });

    it('applies top text font family changes to active text object', async () => {
        const activeTextObject = {
            type: 'i-text',
            set: jest.fn(),
            fontFamily: 'Arial',
            fontWeight: 'normal',
            fontStyle: 'normal',
            underline: false,
            textAlign: 'left',
            fontSize: 40,
            fill: '#000000',
        };

        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="text" />);

        await waitFor(() => {
            expect(screen.getByLabelText('Text font family')).toBeInTheDocument();
        });

        latestCanvasStub?.getActiveObject.mockReturnValue(activeTextObject);

        fireEvent.change(screen.getByLabelText('Text font family'), {
            target: { value: 'Georgia' },
        });

        fireEvent.change(screen.getByLabelText('Text font style'), {
            target: { value: 'bold' },
        });

        fireEvent.change(screen.getByLabelText('Text font size'), {
            target: { value: '72' },
        });

        fireEvent.change(screen.getByLabelText('Text color'), {
            target: { value: '#336699' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Text toggle bold' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text toggle italic' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text toggle underline' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text align center' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text align right' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text align justify' }));

        expect(activeTextObject.set).toHaveBeenCalledWith({ fontFamily: 'Georgia' });
        expect(activeTextObject.set).toHaveBeenCalledWith({ fontWeight: 'bold' });
        expect(activeTextObject.set).toHaveBeenCalledWith({ fontSize: 72 });
        expect(activeTextObject.set).toHaveBeenCalledWith({ fill: '#336699' });
        expect(activeTextObject.set).toHaveBeenCalledWith({ fontStyle: 'italic' });
        expect(activeTextObject.set).toHaveBeenCalledWith({ underline: true });
        expect(activeTextObject.set).toHaveBeenCalledWith({ textAlign: 'center' });
        expect(activeTextObject.set).toHaveBeenCalledWith({ textAlign: 'right' });
        expect(activeTextObject.set).toHaveBeenCalledWith({ textAlign: 'justify' });
        expect(latestCanvasStub?.requestRenderAll).toHaveBeenCalled();
    });

    it('supports admin actions, server rename fallback, and dirty-design back confirmation', async () => {
        renameShouldFail = true;
        const props = createDefaultProps();
        render(
            <EditorView
                {...props}
                isAdminUser={true}
                currentDesignName="Draft Name"
                currentDesignId="design-42"
            />
        );

        fireEvent.click(screen.getByTitle('Admin Area'));
        expect(props.onOpenAdminArea).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTitle('Click to rename document'));
        const titleInput = screen.getByPlaceholderText('Untitled Design');
        fireEvent.change(titleInput, { target: { value: 'Renamed Draft Server Fail' } });
        fireEvent.blur(titleInput);

        await waitFor(() => {
            expect(props.onUpdateDesignInfo).toHaveBeenCalledWith('design-42', 'Renamed Draft Server Fail');
        });
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Rename synced locally',
            variant: 'warning',
        }));

        fireEvent.click(screen.getByTestId('canvas-modified'));
        fireEvent.click(screen.getByTitle('Back to Hub'));
        await waitFor(() => {
            expect(mockDialogConfirm).toHaveBeenCalled();
        });
        expect(props.onBack).toHaveBeenCalled();
    });

    it('supports server-backed rename success flow', async () => {
        const props = createDefaultProps();
        render(
            <EditorView
                {...props}
                currentDesignName="Old Name"
                currentDesignId="design-88"
            />
        );

        fireEvent.click(screen.getByTitle('Click to rename document'));
        const titleInput = screen.getByPlaceholderText('Untitled Design');
        fireEvent.change(titleInput, { target: { value: 'Renamed Success' } });
        fireEvent.blur(titleInput);

        await waitFor(() => {
            expect(props.onUpdateDesignInfo).toHaveBeenCalledWith('design-88', 'Renamed Success');
        });
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Design renamed',
            variant: 'success',
        }));
    });

    it('closes open menus on Escape', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.click(screen.getByText('Tools'));
        expect(screen.getByText('AI Zone')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByText('AI Zone')).toBeNull();
        });
    });

    it('wires file/edit/view menu shells to existing editor actions', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /^File$/i }));
        const fileMenu = await screen.findByTestId('menu-file');
        fireEvent.click(within(fileMenu).getByRole('button', { name: 'Save' }));
        await waitFor(() => {
            expect(mockDialogPrompt).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByRole('button', { name: /^File$/i }));
        fireEvent.click(within(await screen.findByTestId('menu-file')).getByRole('button', { name: 'Export As...' }));
        expect(await screen.findByRole('button', { name: /PNG/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
        const editMenu = await screen.findByTestId('menu-edit');
        fireEvent.click(within(editMenu).getByRole('button', { name: 'Preferences...' }));
        expect(props.onOpenSettings).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: /^View$/i }));
        const viewMenu = await screen.findByTestId('menu-view');
        fireEvent.click(within(viewMenu).getByRole('button', { name: 'Zoom In' }));
        await waitFor(() => {
            expect(latestCanvasStub?.zoomToPoint).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByRole('button', { name: /^View$/i }));
        fireEvent.click(within(await screen.findByTestId('menu-view')).getByRole('button', { name: 'Show Grid' }));
        expect(screen.getByText('Grid Thirds')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'v' });
        expect(mockTriggerTool).toHaveBeenCalledWith('select');
    });

    it('supports move, wand, healing, clone stamp, marquee, lasso, and path-select keyboard aliases', () => {
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.keyDown(window, { key: 'v' });
        expect(mockTriggerTool).toHaveBeenCalledWith('select');

        fireEvent.keyDown(window, { key: 'w' });
        expect(mockTriggerTool).toHaveBeenCalledWith('wand');

        fireEvent.keyDown(window, { key: 'j' });
        expect(mockTriggerTool).toHaveBeenCalledWith('healing');

        fireEvent.keyDown(window, { key: 's' });
        expect(mockTriggerTool).toHaveBeenCalledWith('clone-stamp');

        fireEvent.keyDown(window, { key: 'm' });
        expect(mockTriggerTool).toHaveBeenCalledWith('marquee');

        fireEvent.keyDown(window, { key: 'l' });
        expect(mockTriggerTool).toHaveBeenCalledWith('lasso');

        fireEvent.keyDown(window, { key: 'a' });
        expect(mockTriggerTool).toHaveBeenCalledWith('path-select');
    });

    it('uses marquee drag bounds to select the top-most intersecting object', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="marquee" />);

        await waitFor(() => {
            expect(screen.getByText('marquee')).toBeInTheDocument();
        });

        const backObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            getBoundingRect: jest.fn(() => ({ left: 60, top: 60, width: 80, height: 80 })),
        };
        const frontObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            getBoundingRect: jest.fn(() => ({ left: 120, top: 120, width: 90, height: 90 })),
        };

        latestCanvasStub?.getObjects.mockReturnValue([
            backObject as unknown as object,
            frontObject as unknown as object,
        ]);

        const getHandlers = (eventName: string) => (
            latestCanvasStub?.on.mock.calls
                .filter((call) => call[0] === eventName)
                .map((call) => call[1] as (payload: unknown) => void) || []
        );

        const dragStart = { scenePoint: { x: 40, y: 40 }, e: { button: 0 } };
        const dragMove = { scenePoint: { x: 250, y: 250 }, e: { button: 0 } };

        getHandlers('mouse:down').forEach((handler) => handler(dragStart));
        getHandlers('mouse:move').forEach((handler) => handler(dragMove));
        getHandlers('mouse:up').forEach((handler) => handler(dragMove));

        expect(latestCanvasStub?.setActiveObject).toHaveBeenCalledWith(frontObject);
    });

    it('uses lasso path bounds to select the top-most object inside polygon', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="lasso" />);

        await waitFor(() => {
            expect(screen.getByText('lasso')).toBeInTheDocument();
        });

        const backObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            getBoundingRect: jest.fn(() => ({ left: 60, top: 60, width: 60, height: 60 })),
        };
        const frontObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            getBoundingRect: jest.fn(() => ({ left: 140, top: 120, width: 80, height: 80 })),
        };
        const outsideObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            getBoundingRect: jest.fn(() => ({ left: 420, top: 350, width: 60, height: 60 })),
        };

        latestCanvasStub?.getObjects.mockReturnValue([
            backObject as unknown as object,
            frontObject as unknown as object,
            outsideObject as unknown as object,
        ]);

        const getHandlers = (eventName: string) => (
            latestCanvasStub?.on.mock.calls
                .filter((call) => call[0] === eventName)
                .map((call) => call[1] as (payload: unknown) => void) || []
        );

        getHandlers('mouse:down').forEach((handler) => handler({
            scenePoint: { x: 40, y: 40 },
            e: { button: 0 },
        }));
        getHandlers('mouse:move').forEach((handler) => handler({
            scenePoint: { x: 260, y: 70 },
            e: { button: 0 },
        }));
        getHandlers('mouse:move').forEach((handler) => handler({
            scenePoint: { x: 260, y: 250 },
            e: { button: 0 },
        }));
        getHandlers('mouse:move').forEach((handler) => handler({
            scenePoint: { x: 40, y: 250 },
            e: { button: 0 },
        }));
        getHandlers('mouse:up').forEach((handler) => handler({
            scenePoint: { x: 40, y: 40 },
            e: { button: 0 },
        }));

        expect(latestCanvasStub?.setActiveObject).toHaveBeenCalledWith(frontObject);
        expect(latestCanvasStub?.setActiveObject).not.toHaveBeenCalledWith(outsideObject);
    });

    it('uses wand threshold matching and falls back to pointer-hit target when direct target is missing', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="wand" />);

        await waitFor(() => {
            expect(screen.getByText('wand')).toBeInTheDocument();
        });

        const seedObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            fill: '#336699',
            stroke: null,
            getBoundingRect: jest.fn(() => ({ left: 120, top: 120, width: 80, height: 80 })),
        };
        const nearObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            fill: '#3a6ea4',
            stroke: null,
            getBoundingRect: jest.fn(() => ({ left: 320, top: 120, width: 80, height: 80 })),
        };
        const farObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            fill: '#e11d48',
            stroke: null,
            getBoundingRect: jest.fn(() => ({ left: 520, top: 120, width: 80, height: 80 })),
        };

        latestCanvasStub?.getObjects.mockReturnValue([
            seedObject as unknown as object,
            nearObject as unknown as object,
            farObject as unknown as object,
        ]);

        const getHandlers = (eventName: string) => (
            latestCanvasStub?.on.mock.calls
                .filter((call) => call[0] === eventName)
                .map((call) => call[1] as (payload: unknown) => void) || []
        );

        fireEvent.change(screen.getByLabelText('Wand threshold'), { target: { value: '20' } });
        getHandlers('mouse:down').forEach((handler) => handler({
            scenePoint: { x: 140, y: 140 },
            e: { button: 0 },
            target: seedObject,
        }));
        expect(latestCanvasStub?.setActiveObject).toHaveBeenCalledWith(nearObject);

        latestCanvasStub?.setActiveObject.mockClear();

        fireEvent.change(screen.getByLabelText('Wand threshold'), { target: { value: '0' } });
        getHandlers('mouse:down').forEach((handler) => handler({
            scenePoint: { x: 140, y: 140 },
            e: { button: 0 },
        }));
        expect(latestCanvasStub?.setActiveObject).toHaveBeenCalledWith(seedObject);
    });

    it('captures clone source point on option-click and updates clone source status', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="clone-stamp" />);

        await waitFor(() => {
            expect(screen.getByText('clone stamp')).toBeInTheDocument();
        });
        expect(screen.getByText('Source: Option-click to set')).toBeInTheDocument();

        const getHandlers = (eventName: string) => (
            latestCanvasStub?.on.mock.calls
                .filter((call) => call[0] === eventName)
                .map((call) => call[1] as (payload: unknown) => void) || []
        );

        act(() => {
            getHandlers('mouse:down').forEach((handler) => handler({
                scenePoint: { x: 140, y: 110 },
                e: { button: 0, altKey: true },
            }));
        });

        await waitFor(() => {
            expect(screen.getByText('Source: Set')).toBeInTheDocument();
        });
    });

    it('applies selection expand and contract operations from top controls', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} initialActiveTool="select" />);

        await waitFor(() => {
            expect(screen.getByText('move')).toBeInTheDocument();
        });

        const selectedObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            getBoundingRect: jest.fn(() => ({ left: 100, top: 100, width: 60, height: 60 })),
        };
        const neighborObject = {
            type: 'rect',
            selectable: true,
            evented: true,
            getBoundingRect: jest.fn(() => ({ left: 180, top: 100, width: 60, height: 60 })),
        };

        latestCanvasStub?.getObjects.mockReturnValue([
            selectedObject as unknown as object,
            neighborObject as unknown as object,
        ]);
        latestCanvasStub?.getActiveObject.mockReturnValue(selectedObject as unknown as object);
        latestCanvasStub?.getActiveObjects.mockReturnValue([selectedObject as unknown as object]);

        fireEvent.change(screen.getByLabelText('Selection modify pixels'), { target: { value: '40' } });
        fireEvent.click(screen.getByRole('button', { name: 'Selection expand' }));
        expect(latestCanvasStub?.setActiveObject).toHaveBeenCalledWith(neighborObject);

        latestCanvasStub?.setActiveObject.mockClear();

        fireEvent.click(screen.getByRole('button', { name: 'Selection contract' }));
        expect(latestCanvasStub?.setActiveObject).toHaveBeenCalledWith(selectedObject);
    });

    it('handles grid selection, context menu tool trigger, and zoom controls', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.click(screen.getByTitle('Grid & Guides'));
        fireEvent.click(screen.getByRole('button', { name: /Rule of Thirds/i }));
        expect(screen.queryByRole('button', { name: /Rule of Thirds/i })).toBeNull();

        fireEvent.contextMenu(screen.getByTestId('design-canvas'));
        expect(screen.getByTestId('context-menu')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Context Paint' }));
        expect(mockTriggerTool).toHaveBeenCalledWith('paint');

        expect(screen.getByTestId('bottom-right-utilities')).toBeInTheDocument();
        expect(screen.getByText('Grid Thirds')).toBeInTheDocument();
        expect(screen.getByText('Canvas 1200x800')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Zoom In'));
        fireEvent.click(screen.getByTitle('Zoom Out'));

        await waitFor(() => {
            expect(latestCanvasStub?.zoomToPoint).toHaveBeenCalledTimes(2);
        });
    });

    it('saves a new design and uploads a Drive backup when Drive is connected', async () => {
        mockDialogPrompt.mockResolvedValueOnce('My Saved Design');
        mockLoadDriveConfig.mockReturnValue({ enabled: true, clientId: 'drive-client' });

        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.click(screen.getByTitle('Save Design'));

        await waitFor(() => {
            expect(mockDialogPrompt).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(hasFetchCall(fetchMock, '/api/designs/save', 'POST')).toBe(true);
        });
        expect(props.onUpdateDesignInfo).toHaveBeenCalledWith('design-1', 'My Saved Design');
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Design saved',
            variant: 'success',
        }));
        expect(mockUploadBackup).toHaveBeenCalledWith(
            'drive-client',
            expect.stringMatching(/^My Saved Design-/),
            expect.any(String),
            'application/json',
            expect.any(String)
        );
    });

    it('stops save when prompt is cancelled for untitled design', async () => {
        mockDialogPrompt.mockResolvedValueOnce(null);
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.click(screen.getByTitle('Save Design'));

        await waitFor(() => {
            expect(mockDialogPrompt).toHaveBeenCalled();
        });
        expect(hasFetchCall(fetchMock, '/api/designs/save', 'POST')).toBe(false);
    });

    it('shows save failure message when server save fails', async () => {
        saveShouldFail = true;
        mockDialogPrompt.mockResolvedValueOnce('Broken Save');
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.click(screen.getByTitle('Save Design'));

        await waitFor(() => {
            expect(hasFetchCall(fetchMock, '/api/designs/save', 'POST')).toBe(true);
        });
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Save failed',
            variant: 'destructive',
        }));
    });

    it('saves successfully when canvas toDataURL throws with missing upper ctx', async () => {
        mockDialogPrompt.mockResolvedValueOnce('Recovered Save');
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        await waitFor(() => {
            expect(latestCanvasStub).toBeTruthy();
        });

        latestCanvasStub?.toDataURL.mockImplementation(() => {
            throw new TypeError("Cannot set properties of undefined (setting 'ctx')");
        });

        const fallbackCanvas = document.createElement('canvas');
        Object.defineProperty(fallbackCanvas, 'toDataURL', {
            configurable: true,
            writable: true,
            value: jest.fn(() => 'data:image/png;base64,FALLBACK'),
        });
        latestCanvasStub?.getElement.mockReturnValue(fallbackCanvas);

        fireEvent.click(screen.getByTitle('Save Design'));

        await waitFor(() => {
            expect(hasFetchCall(fetchMock, '/api/designs/save', 'POST')).toBe(true);
        });
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Design saved',
            variant: 'success',
        }));
    });

    it('opens share flow, launches export quality modal, and downloads export', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.click(screen.getByTitle('Share'));
        fireEvent.click(screen.getByRole('button', { name: /Facebook/i }));

        await waitFor(() => {
            expect(window.open).toHaveBeenCalledWith('https://www.facebook.com', '_blank');
        });
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Ready to Share',
        }));
        expect(screen.getByText('Export Quality')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(anchorClickSpy).toHaveBeenCalled();
        });
    });

    it('exports PNG without canvas background when toggle is off', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /Export/i }));
        fireEvent.click(screen.getByRole('button', { name: /PNG/i }));

        await waitFor(() => {
            expect(screen.getByText('Export Quality')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByLabelText('Include canvas background'));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(anchorClickSpy).toHaveBeenCalled();
        });

        const calls = latestCanvasStub?.toDataURL.mock.calls ?? [];
        const pngCall = [...calls].reverse().find((call) => {
            const options = call[0] as { format?: string } | undefined;
            return options?.format === 'png';
        });
        expect(pngCall).toBeDefined();
        expect((pngCall?.[0] as { backgroundColor?: string }).backgroundColor).toBeUndefined();
    });

    it('exports JSON and HTML bundle from export menu', async () => {
        const props = createDefaultProps();
        render(<EditorView {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /Export/i }));
        fireEvent.click(screen.getByRole('button', { name: /JSON/i }));

        await waitFor(() => {
            expect(URL.createObjectURL).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Export/i }));
        fireEvent.click(screen.getByRole('button', { name: /HTML Bundle/i }));

        await waitFor(() => {
            expect(anchorClickSpy).toHaveBeenCalledTimes(2);
        });
        expect(fetchMock.mock.calls.some((call) => (
            String(call[0]).includes('cdn.jsdelivr.net/npm/fabric@7.1.0/dist/fabric.min.js')
        ))).toBe(true);
    });

    it('loads initial design from URL and handles load errors', async () => {
        const successProps = createDefaultProps();
        const { unmount } = render(
            <EditorView
                {...successProps}
                initialDesign={{ data: '/design-ok.json' }}
            />
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith('/design-ok.json');
        });
        await waitFor(() => {
            expect(latestCanvasStub?.loadFromJSON).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Function)
            );
        });
        unmount();

        const failProps = createDefaultProps();
        render(
            <EditorView
                {...failProps}
                initialDesign={{ data: '/design-fail.json' }}
            />
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith('/design-fail.json');
        });
        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Load failed',
                variant: 'destructive',
            }));
        });
    });

    it('loads template missing assets, replaces with library selection, and resolves', async () => {
        const originalImage = window.Image;
        class BrokenImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) {
                window.setTimeout(() => {
                    this.onerror?.();
                }, 0);
            }
        }
        Object.defineProperty(window, 'Image', {
            configurable: true,
            writable: true,
            value: BrokenImage as unknown as typeof Image,
        });

        try {
            const props = createDefaultProps();
            render(
                <EditorView
                    {...props}
                    initialTemplateJsonUrl="/template-missing.json"
                />
            );

            await waitFor(() => {
                expect(screen.getByTestId('missing-assets-modal')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByRole('button', { name: 'Replace Missing' }));
            await waitFor(() => {
                expect(screen.getByTestId('asset-library')).toBeInTheDocument();
            });

            fireEvent.click(within(screen.getByTestId('asset-library')).getByRole('button', { name: 'Pick Replacement Asset' }));

            await waitFor(() => {
                expect(screen.queryByTestId('asset-library')).toBeNull();
            });

            fireEvent.click(screen.getByRole('button', { name: 'Resolve Missing' }));

            await waitFor(() => {
                expect(latestCanvasStub?.loadFromJSON).toHaveBeenCalledWith(
                    expect.objectContaining({
                        objects: [expect.objectContaining({ src: 'https://cdn.example/replacement.png' })],
                    }),
                    expect.any(Function)
                );
            });
            await waitFor(() => {
                expect(screen.queryByTestId('missing-assets-modal')).toBeNull();
            });
        } finally {
            Object.defineProperty(window, 'Image', {
                configurable: true,
                writable: true,
                value: originalImage,
            });
        }
    });
});
