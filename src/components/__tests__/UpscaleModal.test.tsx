import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UpscaleModal from '../UpscaleModal';
import { runUpscale, insertUpscaledLayer, getUpscaleApiKey } from '@/lib/upscale/upscaleClient';

jest.mock('@/lib/upscale/upscaleClient', () => ({
    runUpscale: jest.fn(),
    insertUpscaledLayer: jest.fn(),
    getUpscaleApiKey: jest.fn(() => 'test-key'),
}));

jest.mock('@/components/AI/stability-generator/stabilityGeneratorCanvas', () => ({
    captureSelectionImage: jest.fn(() => 'data:image/png;base64,c2VsZWN0aW9u'),
    captureSourceImage: jest.fn(() => 'data:image/png;base64,c291cmNl'),
}));

const runUpscaleMock = runUpscale as jest.MockedFunction<typeof runUpscale>;
const insertUpscaledLayerMock = insertUpscaledLayer as jest.MockedFunction<typeof insertUpscaledLayer>;
const getUpscaleApiKeyMock = getUpscaleApiKey as jest.MockedFunction<typeof getUpscaleApiKey>;

class InstantImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 640;
    naturalHeight = 480;
    width = 640;
    height = 480;
    set src(_value: string) {
        queueMicrotask(() => this.onload?.());
    }
}

const createCanvasStub = (withSelection: boolean) => ({
    getActiveObject: jest.fn(() => (withSelection
        ? { getBoundingRect: () => ({ left: 10, top: 20, width: 200, height: 100 }) }
        : null)),
    add: jest.fn(),
    setActiveObject: jest.fn(),
    centerObject: jest.fn(),
    requestRenderAll: jest.fn(),
    width: 800,
    height: 600,
});

describe('UpscaleModal', () => {
    const originalImage = window.Image;

    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        getUpscaleApiKeyMock.mockReturnValue('test-key');
        window.Image = InstantImage as unknown as typeof Image;
    });

    afterEach(() => {
        window.Image = originalImage;
    });

    it('renders the service catalog and defaults to the local provider', () => {
        render(<UpscaleModal canvas={createCanvasStub(false) as unknown as never} onClose={jest.fn()} />);

        expect(screen.getByRole('heading', { name: 'AI Upscale' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'ComfyUI (local)' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Fal.ai (Clarity)' })).toBeInTheDocument();
        const serviceSelect = screen.getByRole('option', { name: 'ComfyUI (local)' }).closest('select');
        expect((serviceSelect as HTMLSelectElement).value).toBe('comfy');
    });

    it('disables the selected-layer source when nothing is selected', () => {
        render(<UpscaleModal canvas={createCanvasStub(false) as unknown as never} onClose={jest.fn()} />);
        expect(screen.getByRole('button', { name: 'Selected layer' })).toBeDisabled();
    });

    it('warns and blocks the run when the chosen service has no key', () => {
        getUpscaleApiKeyMock.mockReturnValue('');
        render(<UpscaleModal canvas={createCanvasStub(false) as unknown as never} onClose={jest.fn()} />);

        const serviceSelect = screen.getByRole('option', { name: 'ComfyUI (local)' }).closest('select') as HTMLSelectElement;
        fireEvent.change(serviceSelect, { target: { value: 'fal' } });

        expect(screen.getByText(/No API key configured/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Upscale' })).toBeDisabled();
    });

    it('runs an upscale and adds the result as a layer', async () => {
        runUpscaleMock.mockResolvedValue('data:image/png;base64,cmVzdWx0');
        insertUpscaledLayerMock.mockResolvedValue({} as never);
        const canvas = createCanvasStub(true);
        render(<UpscaleModal canvas={canvas as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Upscale' }));

        await waitFor(() => {
            expect(runUpscaleMock).toHaveBeenCalledWith(expect.objectContaining({
                provider: 'comfy',
                scale: 2,
                sourceWidth: 640,
                sourceHeight: 480,
            }));
        });
        await screen.findByAltText('Upscaled result');

        fireEvent.click(screen.getByRole('button', { name: 'Add as layer' }));
        await waitFor(() => {
            expect(insertUpscaledLayerMock).toHaveBeenCalledWith(
                canvas,
                'data:image/png;base64,cmVzdWx0',
                expect.objectContaining({
                    provider: 'comfy',
                    scale: 2,
                    placement: { left: 10, top: 20, width: 200, height: 100 },
                }),
            );
        });
        expect(await screen.findByText('Added to the canvas as a new layer.')).toBeInTheDocument();
    });

    it('shows provider errors instead of a result', async () => {
        runUpscaleMock.mockRejectedValue(new Error('Provider exploded'));
        render(<UpscaleModal canvas={createCanvasStub(false) as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Upscale' }));
        await screen.findByText('Provider exploded');
        expect(screen.queryByAltText('Upscaled result')).not.toBeInTheDocument();
    });
});
