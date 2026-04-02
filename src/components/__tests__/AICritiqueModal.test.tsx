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
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                critique: 'Summary\nStrong focal point.\n\nNext Edits\nIncrease headline contrast.',
            }),
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
        expect(screen.getAllByText('Hero Layer').length).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText('Focus Prompt'), {
            target: { value: 'Focus on readability.' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Analyze with Ollama' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
        const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
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

    it('updates the selected-layer target when canvas selection changes while the panel stays open', async () => {
        const canvas = createCanvasStub(null);

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
});
