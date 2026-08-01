import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AICritiqueModal from '../AICritiqueModal';
import { LOCAL_AI_PREFERENCES_STORAGE_KEY } from '@/lib/localAiPreferences';

type MockObject = {
    type: string;
    name?: string;
    getBoundingRect: jest.Mock;
};

type MockCanvas = {
    defaultCursor: string;
    hoverCursor: string;
    isDrawingMode: boolean;
    selection: boolean;
    viewportTransform: number[];
    artboard?: { width: number; height: number };
    getActiveObject: jest.Mock;
    toDataURL: jest.Mock;
    requestRenderAll: jest.Mock;
    setViewportTransform: jest.Mock;
    on: jest.Mock;
    off: jest.Mock;
};

const createObjectStub = (overrides?: Partial<MockObject>): MockObject => ({
    type: 'image',
    name: 'Hero Layer',
    getBoundingRect: jest.fn(() => ({
        left: 24,
        top: 32,
        width: 320,
        height: 180,
    })),
    ...overrides,
});

const createCanvasStub = (activeObject: MockObject | null): MockCanvas => ({
    defaultCursor: 'crosshair',
    hoverCursor: 'crosshair',
    isDrawingMode: true,
    selection: false,
    viewportTransform: [2, 0, 0, 2, 12, 16],
    artboard: { width: 1280, height: 720 },
    getActiveObject: jest.fn(() => activeObject),
    toDataURL: jest.fn(() => 'data:image/png;base64,AAAAAA=='),
    requestRenderAll: jest.fn(),
    setViewportTransform: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
});

describe('AICritiqueModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        (global.fetch as jest.Mock | undefined)?.mockReset?.();
        global.fetch = jest.fn();

        localStorage.setItem(LOCAL_AI_PREFERENCES_STORAGE_KEY, JSON.stringify({
            ollamaBaseUrl: 'http://localhost:11434',
            ollamaModel: 'llava:7b',
        }));
    });

    it('forces canvas selection mode and analyzes the selected layer with saved Ollama settings', async () => {
        const canvas = createCanvasStub(createObjectStub());
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input.startsWith('/api/ai/ollama/status?')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        requestedModel: 'llava:7b',
                        modelFound: true,
                        visionCapable: true,
                        visionModels: ['llava:7b'],
                        count: 1,
                        models: ['llava:7b'],
                    }),
                } as Response;
            }

            if (input === '/api/ai/ollama/critique') {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        critique: 'Summary\nStrong focal point.\n\nNext Edits\nIncrease headline contrast.',
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${input}`);
        });

        render(
            <AICritiqueModal
                isOpen
                canvas={canvas as unknown as never}
                onClose={jest.fn()}
            />
        );

        expect(canvas.isDrawingMode).toBe(false);
        expect(canvas.selection).toBe(true);
        expect(canvas.defaultCursor).toBe('default');
        expect(canvas.hoverCursor).toBe('move');
        await waitFor(() => expect(screen.getByLabelText('Selected Layer')).toBeChecked());
        await waitFor(() => expect(screen.getByText(/Ollama is reachable/i)).toBeInTheDocument());
        expect(screen.getAllByText('Hero Layer').length).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText('Focus Prompt'), {
            target: { value: 'Focus on readability.' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Analyze with Ollama' }));

        let critiqueCall: [string, RequestInit] | undefined;
        await waitFor(() => {
            critiqueCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === '/api/ai/ollama/critique') as [string, RequestInit] | undefined;
            expect(critiqueCall).toBeDefined();
        });
        const requestInit = critiqueCall?.[1] as RequestInit;
        const body = JSON.parse((requestInit as RequestInit).body as string);

        expect(body).toEqual(expect.objectContaining({
            baseUrl: 'http://localhost:11434',
            model: 'llava:7b',
            target: 'selection',
            targetLabel: 'Hero Layer',
            focus: 'Focus on readability.',
            imageDataUrl: 'data:image/png;base64,AAAAAA==',
        }));
        expect(canvas.toDataURL).toHaveBeenCalledWith(expect.objectContaining({
            left: 24,
            top: 32,
            width: 320,
            height: 180,
        }));

        await waitFor(() => {
            expect(screen.getByText(/Strong focal point/)).toBeInTheDocument();
            expect(screen.getByText(/Increase headline contrast/)).toBeInTheDocument();
        });
    });

    it('blocks critique when the saved Ollama model is not installed', async () => {
        const canvas = createCanvasStub(createObjectStub());
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input.startsWith('/api/ai/ollama/status?')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        requestedModel: 'llava:7b',
                        modelFound: false,
                        visionCapable: false,
                        visionModels: [],
                        count: 1,
                        models: ['qwen2.5:7b'],
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${input}`);
        });

        render(
            <AICritiqueModal
                isOpen
                canvas={canvas as unknown as never}
                onClose={jest.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/not installed yet/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/Update Local AI Runtime in Settings/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Analyze with Ollama' })).toBeDisabled();
    });

    it('installs the missing Ollama model from the critique panel', async () => {
        const canvas = createCanvasStub(createObjectStub());
        let installCompleted = false;
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input.startsWith('/api/ai/ollama/status?')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        requestedModel: 'llava:7b',
                        modelFound: installCompleted,
                        visionCapable: installCompleted,
                        visionModels: installCompleted ? ['llava:7b'] : [],
                        count: installCompleted ? 2 : 1,
                        models: installCompleted ? ['qwen2.5:7b', 'llava:7b'] : ['qwen2.5:7b'],
                    }),
                } as Response;
            }

            if (input === '/api/ai/ollama/install') {
                installCompleted = true;
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        message: 'Installed "llava:7b" in Ollama at http://localhost:11434.',
                        model: 'llava:7b',
                        baseUrl: 'http://localhost:11434',
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${input}`);
        });

        render(
            <AICritiqueModal
                isOpen
                canvas={canvas as unknown as never}
                onClose={jest.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Install llava:7b' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Install llava:7b' }));

        await waitFor(() => {
            expect((global.fetch as jest.Mock).mock.calls.find(([url]) => url === '/api/ai/ollama/install')).toBeDefined();
        });
        await waitFor(() => {
            expect(screen.getByText(/Ollama is reachable/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Analyze with Ollama' })).toBeEnabled();
        });
    });

    it('updates the selected-layer target when canvas selection changes while the panel stays open', async () => {
        const canvas = createCanvasStub(null);
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input.startsWith('/api/ai/ollama/status?')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        requestedModel: 'llava:7b',
                        modelFound: true,
                        visionCapable: true,
                        visionModels: ['llava:7b'],
                        count: 1,
                        models: ['llava:7b'],
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${input}`);
        });

        render(
            <AICritiqueModal
                isOpen
                canvas={canvas as unknown as never}
                onClose={jest.fn()}
            />
        );

        const selectedLayerInput = screen.getByLabelText('Selected Layer') as HTMLInputElement;
        expect(selectedLayerInput).toBeDisabled();
        expect(screen.getByText('Select a layer on the canvas')).toBeInTheDocument();

        const nextObject = createObjectStub({ name: 'Headline Group' });
        canvas.getActiveObject.mockReturnValue(nextObject);

        const selectionCreatedHandler = canvas.on.mock.calls.find((call) => call[0] === 'selection:created')?.[1] as (() => void) | undefined;
        expect(selectionCreatedHandler).toBeDefined();

        await act(async () => {
            selectionCreatedHandler?.();
        });

        await waitFor(() => {
            expect(screen.getByText('Headline Group')).toBeInTheDocument();
            expect((screen.getByLabelText('Selected Layer') as HTMLInputElement).disabled).toBe(false);
        });
    });

    it('blocks critique when the saved Ollama model is reachable but not vision-capable', async () => {
        const canvas = createCanvasStub(createObjectStub());
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input.startsWith('/api/ai/ollama/status?')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        requestedModel: 'qwen2.5:7b',
                        modelFound: true,
                        visionCapable: false,
                        visionModels: ['llava:7b', 'llama3.2-vision:latest'],
                        count: 3,
                        models: ['qwen2.5:7b', 'llava:7b', 'llama3.2-vision:latest'],
                    }),
                } as Response;
            }

            // The picker asks which vision models exist and what to install.
            if (input.startsWith('/api/ai/ollama/vision-models')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        ollamaReachable: true,
                        installed: ['llava:7b', 'llama3.2-vision:latest'],
                        suggestions: [
                            { model: 'qwen3-vl:4b', size: '3.3 GB', note: 'Balanced default.', stillListed: true },
                        ],
                        newerInLibrary: ['gemma4'],
                        libraryChecked: true,
                        defaultModel: 'qwen3-vl:4b',
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${input}`);
        });

        localStorage.setItem(LOCAL_AI_PREFERENCES_STORAGE_KEY, JSON.stringify({
            ollamaBaseUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:7b',
        }));

        render(
            <AICritiqueModal
                isOpen
                canvas={canvas as unknown as never}
                onClose={jest.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/cannot read images/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/AI Critique needs a vision-capable Ollama model/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Analyze with Ollama' })).toBeDisabled();

        // The failure must come with a way out: the models that would work,
        // and one to install if none would.
        await waitFor(() => {
            expect(screen.getByTestId('vision-model-picker')).toBeInTheDocument();
        });
        expect(screen.getByTestId('vision-use-llava:7b')).toBeInTheDocument();
        expect(screen.getByTestId('vision-install-qwen3-vl:4b')).toBeInTheDocument();
    });

    it('switching to an installed vision model saves it and rechecks', async () => {
        const canvas = createCanvasStub(createObjectStub());
        let statusCalls = 0;
        (global.fetch as jest.Mock).mockImplementation(async (input: string) => {
            if (input.startsWith('/api/ai/ollama/status?')) {
                statusCalls += 1;
                // First check reports the saved text-only model; after the
                // switch the URL carries the vision model instead.
                const usingVision = input.includes('llava');
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        requestedModel: usingVision ? 'llava:7b' : 'qwen2.5:7b',
                        modelFound: true,
                        visionCapable: usingVision,
                        visionModels: ['llava:7b'],
                        count: 2,
                        models: ['qwen2.5:7b', 'llava:7b'],
                    }),
                } as Response;
            }
            if (input.startsWith('/api/ai/ollama/vision-models')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        ollamaReachable: true,
                        installed: ['llava:7b'],
                        suggestions: [],
                        newerInLibrary: [],
                        libraryChecked: true,
                        defaultModel: 'qwen3-vl:4b',
                    }),
                } as Response;
            }
            throw new Error(`Unexpected fetch call: ${input}`);
        });

        localStorage.setItem(LOCAL_AI_PREFERENCES_STORAGE_KEY, JSON.stringify({
            ollamaBaseUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:7b',
        }));

        render(<AICritiqueModal isOpen canvas={canvas as unknown as never} onClose={jest.fn()} />);

        const useButton = await screen.findByTestId('vision-use-llava:7b');
        const callsBefore = statusCalls;
        fireEvent.click(useButton);

        // The choice is persisted, not just held in the modal — every other
        // local-AI feature reads the same preference.
        await waitFor(() => {
            const saved = JSON.parse(localStorage.getItem(LOCAL_AI_PREFERENCES_STORAGE_KEY) || '{}');
            expect(saved.ollamaModel).toBe('llava:7b');
        });
        await waitFor(() => expect(statusCalls).toBeGreaterThan(callsBefore));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Analyze with Ollama' })).not.toBeDisabled();
        });
    });
});
