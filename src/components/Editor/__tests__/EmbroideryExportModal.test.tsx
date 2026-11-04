import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import EmbroideryExportModal from '../EmbroideryExportModal';
import { buildEmbroideryFromDataUrl, downloadDst } from '@/lib/embroidery/embroideryExport';

jest.mock('@/lib/embroidery/embroideryExport', () => ({
    buildEmbroideryFromDataUrl: jest.fn(),
    downloadDst: jest.fn(),
}));

const mockedBuild = jest.mocked(buildEmbroideryFromDataUrl);
const mockedDownload = jest.mocked(downloadDst);

const plan = {
    palette: [
        { r: 200, g: 30, b: 30, stitches: 1200, isBackground: false },
        { r: 255, g: 255, b: 255, stitches: 0, isBackground: true },
    ],
    totalStitches: 1200,
    colorChanges: 1,
    jumpCount: 3,
    threads: [{ color: { r: 200, g: 30, b: 30 }, points: [{ x: 0, y: 0, jump: true }, { x: 10, y: 0, jump: false }, { x: 10, y: 10, jump: false }] }],
    previewWidth: 300,
    previewHeight: 200,
    threadWidth: 2,
    widthMm: 100,
    heightMm: 66.7,
    dstBytes: new Uint8Array([1, 2, 3]),
};

describe('EmbroideryExportModal', () => {
    beforeEach(() => {
        mockedBuild.mockReset();
        mockedDownload.mockReset();
        mockedBuild.mockResolvedValue(plan);
    });

    it('builds a stitch plan from the capture and exports it as a DST named after the page', async () => {
        const onClose = jest.fn();
        render(<EmbroideryExportModal sourceDataUrl="data:image/png;base64,src" designName="My Badge!" onClose={onClose} />);

        expect(screen.getByText('Embroidery Export')).toBeInTheDocument();
        await waitFor(() => expect(mockedBuild).toHaveBeenCalledTimes(1));
        expect(mockedBuild).toHaveBeenCalledWith(
            'data:image/png;base64,src',
            { colorCount: 6, widthMm: 100, rowSpacingMm: 0.4, stitchLengthMm: 3, omitBackground: true },
            'My Badge!',
        );
        await waitFor(() => expect(screen.getByRole('button', { name: /Export \.DST/i })).toBeEnabled());

        fireEvent.click(screen.getByRole('button', { name: /Export \.DST/i }));
        expect(mockedDownload).toHaveBeenCalledWith(plan, 'My Badge.dst');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('rebuilds when an option changes', async () => {
        render(<EmbroideryExportModal sourceDataUrl="data:image/png;base64,src" designName="Badge" onClose={jest.fn()} />);
        await waitFor(() => expect(mockedBuild).toHaveBeenCalledTimes(1));
        // The first slider is the needle-path scrub, which appears once a plan exists.
        await waitFor(() => expect(screen.getAllByRole('slider').length).toBe(5));

        fireEvent.change(screen.getAllByRole('slider')[1], { target: { value: '4' } });
        await waitFor(() => expect(mockedBuild).toHaveBeenCalledTimes(2));
        expect(mockedBuild.mock.calls[1][1]).toMatchObject({ colorCount: 4 });
    });

    it('shows the build error instead of a preview when the plan cannot be built', async () => {
        mockedBuild.mockRejectedValue(new Error('Image too small'));
        render(<EmbroideryExportModal sourceDataUrl="data:image/png;base64,src" designName="Badge" onClose={jest.fn()} />);
        await waitFor(() => expect(screen.getByText('Image too small')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Export \.DST/i })).toBeDisabled();
    });

    it('closes from the header button and from Escape', async () => {
        const onClose = jest.fn();
        render(<EmbroideryExportModal sourceDataUrl="data:image/png;base64,src" designName="Badge" onClose={onClose} />);
        // The window's close button and the footer button share the "Cancel" name; both close.
        const [headerClose, footerCancel] = screen.getAllByRole('button', { name: 'Cancel' });
        fireEvent.click(headerClose);
        fireEvent.click(footerCancel);
        expect(onClose).toHaveBeenCalledTimes(2);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(3);
    });
});
