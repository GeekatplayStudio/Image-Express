import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import CricutExportModal from '../CricutExportModal';
import { buildCricutPlan, downloadCricutPlan } from '@/lib/cricut/cricutExport';

jest.mock('@/lib/cricut/cricutExport', () => ({
    buildCricutPlan: jest.fn(),
    downloadCricutPlan: jest.fn(),
}));

jest.mock('@/lib/cricut/cricutSvg', () => ({
    cricutSvgDataUrl: () => 'data:image/svg+xml,test',
}));

const mockedBuild = jest.mocked(buildCricutPlan);
const mockedDownload = jest.mocked(downloadCricutPlan);

const plan = {
    sourceWidthPx: 300,
    sourceHeightPx: 200,
    traceWidthPx: 300,
    traceHeightPx: 200,
    outputWidthMm: 150,
    outputHeightMm: 100,
    layerCount: 1,
    parts: [],
    sheets: [{ index: 0, widthMm: 304.8, heightMm: 304.8, placements: [], usedAreaMm2: 0, svg: '<svg />' }],
    nodeCount: 42,
    originalNodeCount: 300,
    materialAreaMm2: 5000,
    occupiedAreaMm2: 92903.04,
    utilizationPercent: 5.38,
    monochromeDataUrl: 'data:image/png;base64,test',
};

describe('CricutExportModal', () => {
    beforeEach(() => {
        mockedBuild.mockReset();
        mockedDownload.mockReset();
        mockedBuild.mockResolvedValue(plan);
        mockedDownload.mockResolvedValue(undefined);
    });

    it('builds a live physical cut plan and downloads the generated SVG', async () => {
        render(<CricutExportModal sourceDataUrl="data:image/png;base64,source" designName="Badge" onClose={jest.fn()} />);

        expect(await screen.findByText('150.0 × 100.0 mm', {}, { timeout: 2000 })).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Download SVG/i }));

        await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith(plan, expect.objectContaining({
            widthMm: 304.8,
            heightMm: 304.8,
            designWidthMm: 150,
        }), 'Badge'));
    });

    it('rebuilds with layered depth and registration settings', async () => {
        render(<CricutExportModal sourceDataUrl="data:image/png;base64,source" designName="Layers" onClose={jest.fn()} />);
        await screen.findByText('150.0 × 100.0 mm', {}, { timeout: 2000 });

        fireEvent.click(screen.getByRole('checkbox', { name: /Slice extruded silhouette/i }));
        await waitFor(() => expect(mockedBuild).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.objectContaining({ enabled: true, targetDepthMm: 12, materialThicknessMm: 3, registrationMarks: true }),
            'Layers',
        ), { timeout: 2000 });
        expect(screen.getByText('4 layers')).toBeInTheDocument();
    });
});
