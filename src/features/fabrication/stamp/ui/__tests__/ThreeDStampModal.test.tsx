import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ThreeDStampModal from '../ThreeDStampModal';
import { exportStampFile } from '../../domain/stampExporters';

const toast = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ toast }) }));

// The studio's three panes are WebGL and canvas work; the window's own
// behaviour is what is under test, so each pane is a labelled stub.
jest.mock('../StampViewport', () => ({ __esModule: true, default: () => <div data-testid="pane-3d" /> }));
jest.mock('../StampPressSimulator', () => ({ __esModule: true, default: () => <div data-testid="pane-simulator" /> }));
jest.mock('../StampMaterialImpression', () => ({ __esModule: true, default: () => <div data-testid="pane-impression" /> }));
jest.mock('../StampControls', () => ({
    __esModule: true,
    default: ({ onExport, isExporting }: { onExport: (f: string, t: string) => void; isExporting: boolean }) => (
        <button type="button" onClick={() => onExport('stl-binary', 'complete')} disabled={isExporting}>Export STL</button>
    ),
}));
jest.mock('../StampCanvasRenderer', () => ({
    renderStampArtwork: jest.fn(async () => ({ heightmapData: new Uint8ClampedArray(4), gridWidth: 1, gridHeight: 1, imprintDataUrl: 'data:image/png;base64,imprint' })),
}));
jest.mock('../../domain/stampModelBuilder', () => ({ buildStampModel: jest.fn(() => ({ parts: [] })) }));
jest.mock('../../domain/stampExporters', () => ({ exportStampFile: jest.fn(async () => undefined) }));
jest.mock('../stampCanvasCapture', () => ({ captureVisibleCanvasLayers: jest.fn(() => null) }));

const mockedExport = jest.mocked(exportStampFile);

describe('ThreeDStampModal', () => {
    beforeEach(() => { toast.mockClear(); mockedExport.mockClear(); });

    it('builds the model, then hands the imprint to the page and exports the assembly, named after the default text', async () => {
        const onAddToCanvas = jest.fn();
        render(<ThreeDStampModal onClose={jest.fn()} onAddToCanvas={onAddToCanvas} />);
        expect(screen.getByText('3D Stamp Studio')).toBeInTheDocument();

        const addButton = screen.getByRole('button', { name: /Add to Page/ });
        await waitFor(() => expect(addButton).toBeEnabled());
        fireEvent.click(addButton);
        expect(onAddToCanvas).toHaveBeenCalledWith('data:image/png;base64,imprint');
        expect(screen.getByRole('button', { name: /Added!/ })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Export STL' }));
        await waitFor(() => expect(mockedExport).toHaveBeenCalledTimes(1));
        expect(mockedExport.mock.calls[0].slice(1)).toEqual(['stl-binary', 'complete', 'stamp-APPROVED']);
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export Successful' }));
    });

    it('switches between the 3D, impression and simulator panes', () => {
        render(<ThreeDStampModal onClose={jest.fn()} />);
        expect(screen.getByTestId('pane-3d')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Material Impression/ }));
        expect(screen.getByTestId('pane-impression')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Press Simulator/ }));
        expect(screen.getByTestId('pane-simulator')).toBeInTheDocument();
        expect(screen.queryByTestId('pane-3d')).toBeNull();
    });

    it('closes from the header button and from Escape', () => {
        const onClose = jest.fn();
        render(<ThreeDStampModal onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'Close 3D Stamp Tool' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
