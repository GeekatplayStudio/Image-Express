import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImageGeneratorModal from '../ImageGeneratorModal';

const mockImageFromURL = jest.fn();
const mockUseEscapeKey = jest.fn();

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

    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        const fabricModule = jest.requireMock('fabric') as {
            __MockImage: new () => unknown;
        };
        mockImageFromURL.mockResolvedValue(new fabricModule.__MockImage());
        global.fetch = jest.fn();
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

    it('generates image via remote provider and shows preview', async () => {
        localStorage.setItem('openai_api_key', 'openai-123');
        localStorage.setItem('image-express-gen-provider', 'openai');
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            json: async () => ({ success: true, imageUrl: 'https://cdn.example/generated.png' }),
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

        const firstCall = (global.fetch as jest.Mock).mock.calls[0];
        expect(firstCall[0]).toBe('/api/ai/generate-image');
        const payload = JSON.parse(firstCall[1].body as string);
        expect(payload).toEqual(
            expect.objectContaining({
                provider: 'remote',
                specificProvider: 'openai',
                apiKey: 'openai-123',
                prompt: 'A robot in watercolor',
            })
        );
    });

    it('ignores rapid repeated image generation clicks while the first request is in flight', async () => {
        localStorage.setItem('openai_api_key', 'openai-123');
        localStorage.setItem('image-express-gen-provider', 'openai');

        let resolveFetch: ((value: { json: () => Promise<{ success: boolean; imageUrl: string; }>; }) => void) | null = null;
        (global.fetch as jest.Mock).mockReturnValueOnce(new Promise((resolve) => {
            resolveFetch = resolve;
        }));

        const canvas = createCanvasStub();
        render(<ImageGeneratorModal onClose={jest.fn()} canvas={canvas as unknown as never} />);

        fireEvent.change(
            screen.getByPlaceholderText('Describe what you want to appear in the zone...'),
            { target: { value: 'A remote request' } }
        );

        const generateButton = screen.getByRole('button', { name: /Generate Image/i });

        await act(async () => {
            generateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            generateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);

        resolveFetch?.({
            json: async () => ({ success: true, imageUrl: 'https://cdn.example/generated.png' }),
        });

        await waitFor(() => {
            expect(screen.getByText('Generation complete!')).toBeInTheDocument();
        });
    });

    it('shows error message when generation fails', async () => {
        localStorage.setItem('openai_api_key', 'openai-123');
        localStorage.setItem('image-express-gen-provider', 'openai');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            json: async () => ({ success: false, message: 'Generation failed upstream' }),
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

        consoleErrorSpy.mockRestore();
    });

    it('places generated image on canvas, saves asset URL, and closes modal', async () => {
        localStorage.setItem('openai_api_key', 'openai-123');
        localStorage.setItem('image-express-gen-provider', 'openai');
        const onClose = jest.fn();
        const canvas = createCanvasStub();
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                json: async () => ({ success: true, imageUrl: 'https://cdn.example/generated.png' }),
            })
            .mockResolvedValueOnce({
                json: async () => ({ success: true }),
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
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            json: async () => ({ success: true, imageUrl: 'https://cdn.example/generated.png' }),
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

        expect(onGenerate).toHaveBeenCalledWith('https://cdn.example/generated.png');
        expect(onClose).toHaveBeenCalled();
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
});
