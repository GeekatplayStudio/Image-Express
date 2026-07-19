import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OpenDesignModal from '@/components/Editor/OpenDesignModal';

const mockFetch = (payload: unknown, ok = true, contentType = 'application/json') => {
    global.fetch = jest.fn().mockResolvedValue({
        ok,
        headers: { get: () => contentType },
        json: async () => payload,
    }) as unknown as typeof fetch;
};

describe('OpenDesignModal', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not fetch while closed', () => {
        mockFetch({ designs: [] });
        render(<OpenDesignModal isOpen={false} onClose={jest.fn()} onOpenDesign={jest.fn()} />);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('lists designs once loaded and opens one on click', async () => {
        mockFetch({
            success: true,
            designs: [
                { id: 'a', name: 'Poster A', lastModified: '2026-01-01T00:00:00Z' },
                { id: 'b', name: 'Poster B', lastModified: '2026-01-02T00:00:00Z' },
            ],
        });
        const onOpenDesign = jest.fn();
        const onClose = jest.fn();
        render(<OpenDesignModal isOpen onClose={onClose} onOpenDesign={onOpenDesign} />);

        await waitFor(() => expect(screen.getByTestId('open-design-a')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('open-design-a'));

        expect(onOpenDesign).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', name: 'Poster A' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('shows an empty state when there are no saved pages', async () => {
        mockFetch({ success: true, designs: [] });
        render(<OpenDesignModal isOpen onClose={jest.fn()} onOpenDesign={jest.fn()} />);
        await waitFor(() => expect(screen.queryByText(/No saved pages/i)).toBeInTheDocument());
    });

    it('shows an error message when the request fails', async () => {
        mockFetch({}, false);
        render(<OpenDesignModal isOpen onClose={jest.fn()} onOpenDesign={jest.fn()} />);
        await waitFor(() => expect(screen.queryByText(/Could not load/i)).toBeInTheDocument());
    });

    it('treats an HTML response (e.g. a 404 page) as an empty list rather than an error', async () => {
        mockFetch({}, true, 'text/html');
        render(<OpenDesignModal isOpen onClose={jest.fn()} onOpenDesign={jest.fn()} />);
        await waitFor(() => expect(screen.queryByText(/No saved pages/i)).toBeInTheDocument());
    });
});
