import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CampaignManagerModal from '../CampaignManagerModal';
import { createEmptyCampaign, saveCampaigns } from '@/lib/campaign/campaignProfile';

const createCanvasStub = () => {
    const objects: unknown[] = [];
    return {
        getObjects: jest.fn(() => objects),
        getActiveObject: jest.fn(() => null),
        getWidth: jest.fn(() => 800),
        getHeight: jest.fn(() => 600),
        add: jest.fn((obj: unknown) => objects.push(obj)),
        remove: jest.fn(),
        requestRenderAll: jest.fn(),
        toDataURL: jest.fn(() => 'data:image/png;base64,AA'),
    };
};

describe('CampaignManagerModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        // Server sync + audit calls fail fast; local state must carry the UI.
        global.fetch = jest.fn(async () => {
            throw new Error('network unavailable');
        }) as unknown as typeof fetch;
    });

    it('shows the empty state and creates a campaign', () => {
        render(<CampaignManagerModal canvas={createCanvasStub() as unknown as never} onClose={jest.fn()} />);
        expect(screen.getByText(/No campaigns yet/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /New campaign/ }));
        expect(screen.getByDisplayValue('New Campaign')).toBeInTheDocument();
    });

    it('lists stored campaigns and selects one', () => {
        saveCampaigns([
            { ...createEmptyCampaign('Summer Sale'), id: 'c1' },
            { ...createEmptyCampaign('Winter Promo'), id: 'c2' },
        ]);
        render(<CampaignManagerModal canvas={createCanvasStub() as unknown as never} onClose={jest.fn()} />);

        expect(screen.getByText('Summer Sale')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Winter Promo'));
        expect(screen.getByDisplayValue('Winter Promo')).toBeInTheDocument();
    });

    it('verifies the canvas in report-only mode using the local engine when the API is down', async () => {
        saveCampaigns([{ ...createEmptyCampaign('Strict'), id: 'c1', colors: ['#111111'] }]);
        const canvas = createCanvasStub();
        canvas.getObjects.mockReturnValue([]);
        render(<CampaignManagerModal canvas={canvas as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
        fireEvent.click(screen.getByRole('button', { name: 'Verify (report only)' }));

        await waitFor(() => {
            expect(screen.getByText(/100% — PASS/)).toBeInTheDocument();
        });
        expect(screen.getByText(/Everything complies/)).toBeInTheDocument();
    });

    it('switches the verify button label in auto-fix mode', () => {
        saveCampaigns([{ ...createEmptyCampaign('Strict'), id: 'c1' }]);
        render(<CampaignManagerModal canvas={createCanvasStub() as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
        fireEvent.click(screen.getByRole('checkbox'));
        expect(screen.getByRole('button', { name: 'Verify & auto-fix' })).toBeInTheDocument();
    });

    it('deletes a campaign from the list', () => {
        saveCampaigns([{ ...createEmptyCampaign('Doomed'), id: 'c1' }]);
        render(<CampaignManagerModal canvas={createCanvasStub() as unknown as never} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }));
        expect(screen.queryByText('Doomed')).not.toBeInTheDocument();
        expect(screen.getByText(/No campaigns yet/)).toBeInTheDocument();
    });
});
