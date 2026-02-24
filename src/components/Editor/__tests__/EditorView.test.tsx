import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    return {
        width: 1200,
        height: 800,
        viewportTransform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        backgroundColor: '#ffffff',
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

        expect(screen.getByTestId('brand-icon')).toBeInTheDocument();
        expect(screen.getByTestId('toolbar')).toBeInTheDocument();
        expect(screen.getByTestId('design-canvas')).toBeInTheDocument();
        expect(screen.getByTestId('top-tool-options-bar')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Top option: Open Layers' }));
        expect(mockTriggerTool).toHaveBeenCalledWith('layers');

        fireEvent.click(screen.getByLabelText('Auto-Select'));
        fireEvent.click(screen.getByRole('button', { name: 'Selection mode group' }));
        expect(mockTriggerTool).toHaveBeenCalledWith('layers');

        fireEvent.click(screen.getByLabelText('Show Transform Controls'));

        fireEvent.click(screen.getByTitle('How to use Image Express'));
        expect(props.onOpenDocumentation).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTitle('Settings'));
        expect(props.onOpenSettings).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTitle('Back to Hub'));
        expect(props.onBack).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('Tools'));
        fireEvent.click(screen.getByRole('button', { name: /^Select\s+V$/ }));
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

        fireEvent.click(screen.getByRole('button', { name: 'Text toggle bold' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text toggle italic' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text toggle underline' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text align center' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text align right' }));
        fireEvent.click(screen.getByRole('button', { name: 'Text align justify' }));

        expect(activeTextObject.set).toHaveBeenCalledWith({ fontFamily: 'Georgia' });
        expect(activeTextObject.set).toHaveBeenCalledWith({ fontWeight: 'bold' });
        expect(activeTextObject.set).toHaveBeenCalledWith({ fontSize: 72 });
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
