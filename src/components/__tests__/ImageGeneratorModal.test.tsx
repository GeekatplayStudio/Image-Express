import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImageGeneratorModal from '../ImageGeneratorModal';

const mockImageFromURL = jest.fn();
const mockUseEscapeKey = jest.fn();
const mockDialogConfirm = jest.fn(async () => false);
const mockVerifyAvailableComfyConnection = jest.fn(async () => ({ ok: true, message: 'Connected to ComfyUI.' }));
const mockInspectComfyServerCatalog = jest.fn(async () => ({
    detectedVersion: '0.18.1',
    serverUrl: 'http://localhost:8188',
    workflowCount: 10,
    compatibleWorkflowCount: 8,
    transportKind: 'local',
    records: [],
}));

jest.mock('@/providers/DialogProvider', () => ({
    __esModule: true,
    useDialog: () => ({
        confirm: (...args: unknown[]) => mockDialogConfirm(...args),
    }),
}));

jest.mock('@/lib/comfyui/connection', () => {
    const actual = jest.requireActual('@/lib/comfyui/connection');
    return {
        __esModule: true,
        ...actual,
        verifyAvailableComfyConnection: (...args: unknown[]) => mockVerifyAvailableComfyConnection(...args),
    };
});

jest.mock('@/lib/comfyui/runner', () => {
    const actual = jest.requireActual('@/lib/comfyui/runner');
    return {
        __esModule: true,
        ...actual,
        inspectComfyServerCatalog: (...args: unknown[]) => mockInspectComfyServerCatalog(...args),
    };
});

jest.mock('next/image', () => ({
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default: ({ src, alt, fill, unoptimized }: any) => (
        <div
            data-testid="mock-next-image"
            data-src={String(src)}
            data-alt={String(alt)}
            data-fill={String(fill)}
            data-unoptimized={String(unoptimized)}
        />
    ),
}));

jest.mock('../AI/StabilityGenerator', () => ({
    __esModule: true,
    default: ({
        apiKey,
        embedded,
    }: {
        apiKey?: string;
        embedded?: boolean;
    }) => (
        <div data-testid="stability-generator">
            <span data-testid="stability-api-key">{apiKey || ''}</span>
            <span data-testid="stability-embedded">{String(Boolean(embedded))}</span>
        </div>
    ),
}));

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseEscapeKey(...args),
}));

jest.mock('fabric', () => {
    class MockRect {
        type = 'rect';
        width = 0;
        height = 0;
        left = 0;
        top = 0;
        scaleX = 1;
        scaleY = 1;
        listeners = new Map<string, (...args: unknown[]) => void>();

        constructor(options: Partial<MockRect> = {}) {
            Object.assign(this, options);
        }

        on = jest.fn((event: string, cb: (...args: unknown[]) => void) => {
            this.listeners.set(event, cb);
        });

        set = jest.fn((patch: Record<string, unknown>) => {
            Object.assign(this, patch);
            return this;
        });
    }

    class MockImage {
        width = 1024;
        height = 768;
        scaleX = 1;
        scaleY = 1;
        left = 0;
        top = 0;

        set = jest.fn((patch: Record<string, unknown>) => {
            Object.assign(this, patch);
            return this;
        });

        scale = jest.fn((value: number) => {
            this.scaleX = value;
            this.scaleY = value;
            return this;
        });
    }

    return {
        Rect: MockRect,
        Image: {
            fromURL: (...args: unknown[]) => mockImageFromURL(...args),
        },
        __MockImage: MockImage,
    };
});

type RectLike = {
    type: string;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    left: number;
    top: number;
};

type CanvasLike = {
    width: number;
    height: number;
    artboard?: { width: number; height: number };
    defaultCursor?: string;
    hoverCursor?: string;
    selection?: boolean;
    isDrawingMode?: boolean;
    getActiveObject: jest.Mock;
    getObjects: jest.Mock;
    add: jest.Mock;
    remove: jest.Mock;
    setActiveObject: jest.Mock;
    requestRenderAll: jest.Mock;
    contains: jest.Mock;
    centerObject: jest.Mock;
    renderAll: jest.Mock;
    toDataURL: jest.Mock;
    viewportTransform?: number[];
};

const createCanvasStub = (
    activeObject: RectLike | null = null,
    objects: Array<Record<string, unknown>> = []
): CanvasLike => ({
    width: 1200,
    height: 800,
    artboard: { width: 1000, height: 700 },
    defaultCursor: 'crosshair',
    hoverCursor: 'crosshair',
    selection: false,
    isDrawingMode: true,
    getActiveObject: jest.fn(() => activeObject),
    getObjects: jest.fn(() => objects),
    add: jest.fn(),
    remove: jest.fn(),
    setActiveObject: jest.fn(),
    requestRenderAll: jest.fn(),
    contains: jest.fn(() => true),
    centerObject: jest.fn(),
    renderAll: jest.fn(),
    toDataURL: jest.fn(() => 'data:image/png;base64,mock'),
    viewportTransform: [1, 0, 0, 1, 0, 0],
});

describe('ImageGeneratorModal', () => {
    const originalFetch = global.fetch;

    const mockJsonResponse = (body: unknown) => ({
        ok: true,
        json: async () => body,
    });

    const mockComfyLibraryResponse = () => mockJsonResponse({
        success: true,
        snapshot: {
            installPath: 'D:\\ComfyUI',
            customNodesPath: 'D:\\ComfyUI\\custom_nodes',
            workflowLibraryPath: 'D:\\ComfyUI\\user\\default\\workflows',
            serverTemplates: [
                {
                    id: 'server-upscale',
                    source: 'server-template',
                    name: 'Server Upscale',
                    description: 'Upscale workflow',
                    task: 'upscale',
                    runnable: true,
                    category: 'Server Templates',
                    nodeTypes: ['LoadImage', 'SaveImage'],
                    registration: {
                        id: 'server-upscale',
                        task: 'upscale',
                        name: 'Server Upscale',
                        description: 'Upscale workflow',
                        blueprint: {
                            '1': { class_type: 'LoadImage', inputs: { image: 'input.png' } },
                            '2': { class_type: 'SaveImage', inputs: { images: ['1', 0], filename_prefix: 'ComfyUI' } },
                        },
                        inputBindings: [{ source: 'image', nodeId: '1', inputName: 'image' }],
                        outputNodeIds: ['2'],
                        modelPresetIds: ['default'],
                        defaultModelPresetId: 'default',
                    },
                },
            ],
            customFolderWorkflows: [],
            nodeRepos: [],
            warnings: [],
        },
    });

    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        const fabricModule = jest.requireMock('fabric') as {
            __MockImage: new () => unknown;
        };
        mockImageFromURL.mockResolvedValue(new fabricModule.__MockImage());
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === '/api/ai/comfy/library') {
                return mockComfyLibraryResponse() as Response;
            }

            return mockJsonResponse({}) as Response;
        });
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('returns null when closed', () => {
        const { container } = render(<ImageGeneratorModal isOpen={false} onClose={jest.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('creates a new zone rectangle when no active rect exists and cleans it up on unmount', () => {
        const onClose = jest.fn();
        const canvas = createCanvasStub();
        const { unmount } = render(
            <ImageGeneratorModal onClose={onClose} canvas={canvas as unknown as never} />
        );

        expect(canvas.add).toHaveBeenCalledTimes(1);
        expect(canvas.setActiveObject).toHaveBeenCalledTimes(1);
        expect(canvas.requestRenderAll).toHaveBeenCalled();

        const createdZone = canvas.add.mock.calls[0][0];
        unmount();

        expect(canvas.contains).toHaveBeenCalledWith(createdZone);
        expect(canvas.remove).toHaveBeenCalledWith(createdZone);
    });

    it('uses selected rectangle as zone dimensions', () => {
        const existingRect = {
            type: 'rect',
            width: 300,
            height: 200,
            scaleX: 1.5,
            scaleY: 0.8,
            left: 40,
            top: 50,
        };
        const canvas = createCanvasStub(existingRect);
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        expect(screen.getByText('450x160')).toBeInTheDocument();
        expect(canvas.add).not.toHaveBeenCalled();
    });

    it('forces the canvas back into selectable mode when the AI modal opens', () => {
        const canvas = createCanvasStub();
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        expect(canvas.isDrawingMode).toBe(false);
        expect(canvas.selection).toBe(true);
        expect(canvas.defaultCursor).toBe('default');
        expect(canvas.hoverCursor).toBe('move');
        expect(canvas.requestRenderAll).toHaveBeenCalled();
    });

    it('loads provider options from localStorage and persists provider selection', () => {
        localStorage.setItem('stability_api_key', 'stability-key');
        localStorage.setItem('openai_api_key', 'openai-key');
        localStorage.setItem(
            'image-express-generative-preferences',
            JSON.stringify({
                defaultProvider: 'openai',
                defaultWorkflow: 'zone',
                comfyServerUrl: 'http://localhost:8188',
                autoStartInpaintMasking: true,
                showInpaintPromptDock: true,
            })
        );
        const canvas = createCanvasStub();
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        const providerSelect = screen.getAllByRole('combobox')[0];
        expect(providerSelect).toHaveValue('openai');
        expect(screen.getByRole('option', { name: 'ComfyUI' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Stability AI' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'ChatGPT / OpenAI' })).toBeInTheDocument();

        fireEvent.change(providerSelect, { target: { value: 'comfy' } });
        expect(localStorage.getItem('image-express-gen-provider')).toBe('comfy');
    });

    it('imports a runnable workflow from the Comfy workflow library', async () => {
        const canvas = createCanvasStub();
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Use' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Use' }));

        await waitFor(() => {
            expect(screen.getByText('Comfy workflow "Server Upscale" is ready.')).toBeInTheDocument();
        });
    });

    it('generates image via remote provider and shows preview', async () => {
        localStorage.setItem('openai_api_key', 'openai-123');
        localStorage.setItem('image-express-gen-provider', 'openai');
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input === '/api/ai/comfy/library') {
                return mockComfyLibraryResponse() as Response;
            }
            if (input === '/api/ai/generate-image') {
                return mockJsonResponse({ success: true, imageUrl: 'https://cdn.example/generated.png' });
            }

            throw new Error(`Unexpected fetch call: ${input}`);
        });

        const canvas = createCanvasStub();
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        fireEvent.change(
            screen.getByPlaceholderText('Describe what you want to appear in the zone...'),
            { target: { value: 'A robot in watercolor' } }
        );
        fireEvent.click(screen.getByRole('button', { name: /Generate Image/i }));

        await waitFor(() => {
            expect(screen.getByTestId('mock-next-image')).toBeInTheDocument();
            expect(screen.getByText('Generation complete!')).toBeInTheDocument();
        });

        const generateCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === '/api/ai/generate-image');
        expect(generateCall).toBeDefined();
        const payload = JSON.parse(generateCall?.[1].body as string);
        expect(payload).toEqual(
            expect.objectContaining({
                provider: 'remote',
                specificProvider: 'openai',
                apiKey: 'openai-123',
                prompt: 'A robot in watercolor',
            })
        );
    });

    it('shows error message when generation fails', async () => {
        localStorage.setItem('openai_api_key', 'openai-123');
        localStorage.setItem('image-express-gen-provider', 'openai');
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input === '/api/ai/comfy/library') {
                return mockComfyLibraryResponse() as Response;
            }
            if (input === '/api/ai/generate-image') {
                return mockJsonResponse({ success: false, message: 'Generation failed upstream' });
            }

            throw new Error(`Unexpected fetch call: ${input}`);
        });
        const canvas = createCanvasStub();
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        fireEvent.change(
            screen.getByPlaceholderText('Describe what you want to appear in the zone...'),
            { target: { value: 'Bad request' } }
        );
        fireEvent.click(screen.getByRole('button', { name: /Generate Image/i }));

        await waitFor(() => {
            expect(screen.getByText('Error: Generation failed upstream')).toBeInTheDocument();
        });
    });

    it('places generated image on canvas, saves asset URL, and closes modal', async () => {
        localStorage.setItem('openai_api_key', 'openai-123');
        localStorage.setItem('image-express-gen-provider', 'openai');
        const onClose = jest.fn();
        const canvas = createCanvasStub();
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input === '/api/ai/comfy/library') {
                return mockComfyLibraryResponse() as Response;
            }
            if (input === '/api/ai/generate-image') {
                return mockJsonResponse({ success: true, imageUrl: 'https://cdn.example/generated.png' });
            }

            if (input === '/api/assets/save-url') {
                return mockJsonResponse({ success: true });
            }

            throw new Error(`Unexpected fetch call: ${input}`);
        });

        render(
            <ImageGeneratorModal
                onClose={onClose}
                canvas={canvas as unknown as never}
                currentUser="artist@example.com"
            />
        );

        fireEvent.change(
            screen.getByPlaceholderText('Describe what you want to appear in the zone...'),
            { target: { value: 'A mountain logo' } }
        );
        fireEvent.click(screen.getByRole('button', { name: /Generate Image/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Place on Canvas' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Place on Canvas' }));

        await waitFor(() => {
            expect(mockImageFromURL).toHaveBeenCalledWith('https://cdn.example/generated.png', {
                crossOrigin: 'anonymous',
            });
            expect(canvas.remove).toHaveBeenCalled();
            expect(canvas.add).toHaveBeenCalledTimes(2);
            expect(canvas.setActiveObject).toHaveBeenCalled();
            expect(canvas.requestRenderAll).toHaveBeenCalled();
            expect(onClose).toHaveBeenCalled();
        });

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/assets/save-url',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
        );
    });

    it('calls onGenerate fallback when no canvas is provided', async () => {
        localStorage.setItem('openai_api_key', 'openai-123');
        localStorage.setItem('image-express-gen-provider', 'openai');
        const onGenerate = jest.fn();
        const onClose = jest.fn();
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input === '/api/ai/comfy/library') {
                return mockComfyLibraryResponse() as Response;
            }
            if (input === '/api/ai/generate-image') {
                return mockJsonResponse({ success: true, imageUrl: 'https://cdn.example/generated.png' });
            }

            throw new Error(`Unexpected fetch call: ${input}`);
        });

        render(<ImageGeneratorModal onClose={onClose} onGenerate={onGenerate} />);

        fireEvent.change(
            screen.getByPlaceholderText('Describe what you want to appear in the zone...'),
            { target: { value: 'A skyline at dusk' } }
        );
        fireEvent.click(screen.getByRole('button', { name: /Generate Image/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Place on Canvas' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Place on Canvas' }));

        await waitFor(() => {
            expect(onGenerate).toHaveBeenCalledWith('https://cdn.example/generated.png');
            expect(onClose).toHaveBeenCalled();
        });
    });

    it('switches to stability mode and renders embedded generator with configured key', () => {
        localStorage.setItem('stability_api_key', 'stab-abc');
        const canvas = createCanvasStub();
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'stability' } });

        expect(screen.getByTestId('stability-generator')).toBeInTheDocument();
        expect(screen.getByTestId('stability-api-key')).toHaveTextContent('stab-abc');
        expect(screen.getByTestId('stability-embedded')).toHaveTextContent('true');
    });

    it('shows AI Edit Notes step flow and keeps layer actions disabled without canvas layers', async () => {
        const canvas = createCanvasStub();
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        fireEvent.click(screen.getByRole('checkbox'));

        expect(screen.getByText('Step 1 · Create Reference Layer')).toBeInTheDocument();
        expect(screen.getByText('Step 2 · Notes Workspace')).toBeInTheDocument();
        expect(screen.getByText('Step 3 · Note Tools')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Make Reference Layer' })).toBeDisabled();
            expect(screen.getByRole('button', { name: /Pointer Notes:/i })).toBeDisabled();
            expect(
                screen.getByRole('button', {
                    name: 'Step 4 · Save Ref Notes Layer to Canvas (embedded notes + metadata)',
                })
            ).toBeDisabled();
        });
    });

    it('auto-selects a canvas layer for AI Edit Notes when layers are present', async () => {
        const layerObject = {
            type: 'image',
            visible: true,
            getBoundingRect: jest.fn(() => ({ left: 0, top: 0, width: 512, height: 512 })),
        };
        const canvas = createCanvasStub(null, [layerObject]);
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        fireEvent.click(screen.getByRole('checkbox'));

        await waitFor(() => {
            expect(screen.getByText(/Selected layer:/i)).not.toHaveTextContent('None selected');
            expect(screen.getByRole('button', { name: 'Make Reference Layer' })).toBeEnabled();
        });
    });

    it('prompts to install missing Comfy requirements from the Comfy panel', async () => {
        mockDialogConfirm.mockResolvedValueOnce(true);
        mockInspectComfyServerCatalog.mockResolvedValueOnce({
            detectedVersion: '0.18.1',
            serverUrl: 'http://localhost:8188',
            workflowCount: 10,
            compatibleWorkflowCount: 10,
            transportKind: 'local',
            records: [],
        });
        mockInspectComfyServerCatalog.mockResolvedValueOnce({
            detectedVersion: '0.18.1',
            serverUrl: 'http://localhost:8188',
            workflowCount: 10,
            compatibleWorkflowCount: 7,
            transportKind: 'local',
            records: [
                {
                    workflowId: 'image_flux2_klein_image_edit_4b_base',
                    workflowName: 'FLUX 2 Klein Image Edit (4B Template)',
                    task: 'img2img',
                    requiredNodeTypes: ['Flux2Scheduler', 'UNETLoader'],
                    missingNodeTypes: [],
                    missingModels: [
                        {
                            name: 'flux-2-klein-base-4b-fp8.safetensors',
                            downloadUrl: 'https://example.com/flux-2-klein-base-4b-fp8.safetensors',
                            directory: 'diffusion_models',
                        },
                    ],
                    compatible: false,
                    canAutoUpdateInstall: false,
                },
                {
                    workflowId: 'image_flux2_klein_image_edit_9b_base',
                    workflowName: 'FLUX 2 Klein Image Edit (9B Template)',
                    task: 'img2img',
                    requiredNodeTypes: ['Flux2Scheduler', 'UNETLoader'],
                    missingNodeTypes: ['Flux2Scheduler'],
                    missingModels: [],
                    compatible: false,
                    canAutoUpdateInstall: true,
                },
            ],
        });
        mockInspectComfyServerCatalog.mockResolvedValueOnce({
            detectedVersion: '0.18.1',
            serverUrl: 'http://localhost:8188',
            workflowCount: 10,
            compatibleWorkflowCount: 10,
            transportKind: 'local',
            records: [
                {
                    workflowId: 'image_flux2_klein_image_edit_4b_base',
                    workflowName: 'FLUX 2 Klein Image Edit (4B Template)',
                    task: 'img2img',
                    requiredNodeTypes: ['Flux2Scheduler', 'UNETLoader'],
                    missingNodeTypes: [],
                    missingModels: [],
                    compatible: true,
                    canAutoUpdateInstall: false,
                },
                {
                    workflowId: 'image_flux2_klein_image_edit_9b_base',
                    workflowName: 'FLUX 2 Klein Image Edit (9B Template)',
                    task: 'img2img',
                    requiredNodeTypes: ['Flux2Scheduler', 'UNETLoader'],
                    missingNodeTypes: [],
                    missingModels: [],
                    compatible: true,
                    canAutoUpdateInstall: false,
                },
            ],
        });

        (global.fetch as jest.Mock).mockImplementation(async (input: string, init?: RequestInit) => {
            if (input === '/api/ai/comfy/library') {
                const body = init?.body ? JSON.parse(init.body as string) : {};
                if (body.action === 'install-requirements') {
                    return mockJsonResponse({ success: true, message: 'Installed Comfy requirements.' }) as Response;
                }

                return mockComfyLibraryResponse() as Response;
            }

            return mockJsonResponse({}) as Response;
        });

        const canvas = createCanvasStub();
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        fireEvent.click(screen.getByRole('button', { name: 'Verify ComfyUI Connection' }));

        await waitFor(() => {
            expect(mockDialogConfirm).toHaveBeenCalled();
        });

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/ai/comfy/library',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('install-requirements'),
            })
        );

        await waitFor(() => {
            expect(screen.getByText('Installed Comfy requirements.')).toBeInTheDocument();
        });
    });
});
