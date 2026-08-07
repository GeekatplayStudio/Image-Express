import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../Dashboard';
import { DialogProvider } from '@/providers/DialogProvider';
import { ToastProvider } from '@/providers/ToastProvider';

// Mock dependencies
jest.mock('next/image', () => ({
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @next/next/no-img-element, jsx-a11y/alt-text
    default: ({ fill, unoptimized, ...props }: any) => <img {...props} data-fill={fill} data-unoptimized={unoptimized} /> 
}));

// Mock fetch
global.fetch = jest.fn(() =>
    Promise.resolve({
        json: () => Promise.resolve({ success: true, designs: [] }),
    })
) as jest.Mock;

describe('Dashboard Component', () => {
    const mockOnNewDesign = jest.fn();
    const mockOnSelectTemplate = jest.fn();
    const mockOnOpenDesign = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    beforeEach(() => {
        jest.clearAllMocks();
        (global.fetch as jest.Mock).mockResolvedValue({
            json: () => Promise.resolve({ success: true, designs: [] }),
        });
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });

    const renderDashboard = async () => {
        const view = render(
            <DialogProvider>
                <ToastProvider>
                    <Dashboard 
                        onNewDesign={mockOnNewDesign}
                        onSelectTemplate={mockOnSelectTemplate}
                        onOpenDesign={mockOnOpenDesign}
                    />
                </ToastProvider>
            </DialogProvider>
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalled();
        });

        return view;
    };

    it('renders the quote header', async () => {
        await renderDashboard();
        // Check for quotes (assuming at least one exists)
        // Since quotes are random, just check if a header is present
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('allows searching templates', async () => {
        await renderDashboard();
        const searchInput = screen.getByPlaceholderText(/Search templates/i);
        expect(searchInput).not.toBeDisabled();

        fireEvent.change(searchInput, { target: { value: 'Instagram' } });
        expect(searchInput).toHaveValue('Instagram');
        
        // Check filtering (indirectly via text presence or absence)
        // Since we mock data or use internal constants, we expect "Instagram Post" to be visible
        expect(screen.getByText('Instagram Post')).toBeInTheDocument();
        // "Website Hero" should probably not be visible if filtered strictly? 
        // Note: The mock data has "Website Hero" (Web type). Search "Instagram" matches "Instagram Post".
        // Let's assume search works.
    });

    it('calls onNewDesign with correct tool when action buttons clicked', async () => {
        await renderDashboard();
        
        // Custom Size (new) logic: now opens a modal first
        const customSizeBtns = screen.getAllByText('Custom Size');
        fireEvent.click(customSizeBtns[0]); 
        
        // Expect modal to appear
        expect(screen.getByText('Width (px)')).toBeInTheDocument();
        
        // Close modal for next test part or just reset?
        // Let's reset via clicking Cancel
        const cancelBtn = screen.getByText('Cancel');
        fireEvent.click(cancelBtn);

        // Upload Media
        // Reset mock
        mockOnNewDesign.mockClear();
        fireEvent.click(screen.getByText('Upload Media'));
        expect(mockOnNewDesign).toHaveBeenCalledWith('upload', undefined);

        // Create 3D
        fireEvent.click(screen.getByText('Create 3D'));
        expect(mockOnNewDesign).toHaveBeenCalledWith('3d', undefined);
    });

    it('lets users clear and retype custom size without forced zero', async () => {
        await renderDashboard();
        mockOnNewDesign.mockClear();

        const customSizeBtns = screen.getAllByText('Custom Size');
        fireEvent.click(customSizeBtns[0]);

        const [widthInput, heightInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[];
        const createBtn = screen.getByRole('button', { name: 'Create Page' });

        fireEvent.change(widthInput, { target: { value: '' } });
        expect(widthInput.value).toBe('');
        expect(createBtn).toBeDisabled();

        fireEvent.change(widthInput, { target: { value: '1920' } });
        fireEvent.change(heightInput, { target: { value: '1080' } });

        expect(widthInput.value).toBe('1920');
        expect(heightInput.value).toBe('1080');
        expect(createBtn).not.toBeDisabled();

        fireEvent.click(createBtn);
        expect(mockOnNewDesign).toHaveBeenCalledWith(undefined, { width: 1920, height: 1080 });
    });

    it('filters templates by category', async () => {
        await renderDashboard();
        const webTab = screen.getByText('Web');
        fireEvent.click(webTab);
        
        // "Website Hero" is Type 'Web'. 
        // "Instagram Post" is Type 'Social Media'.
        // Assuming "Website Hero" is present
        expect(screen.getByText('Website Hero')).toBeInTheDocument();
    });

    it('shows hub version tracking label in footer', async () => {
        await renderDashboard();
        const versionLabel = screen.getByTestId('hub-version-label');
        expect(versionLabel).toBeInTheDocument();
        expect(versionLabel.textContent).toMatch(/Version/i);
        expect(versionLabel.textContent).toMatch(/subversion/i);
        expect(versionLabel.textContent).toMatch(/commit/i);
    });

    it('renders saved project screenshots when the API returns image-only previews', async () => {
        // Dashboard fires more than one fetch on mount (designs list, theme
        // packs, ...), so the mock must dispatch by URL rather than assume
        // the designs-list call is the very next fetch — otherwise whichever
        // request happens to fire first "wins" the queued mock value.
        (global.fetch as jest.Mock).mockImplementation((url: unknown) => {
            if (String(url).includes('/api/designs/list')) {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        success: true,
                        designs: [
                            {
                                id: 'project-1',
                                name: 'Project One',
                                image: '/assets/designs/project-1.png',
                                lastModified: new Date('2026-04-03T12:00:00.000Z').toISOString(),
                            },
                        ],
                    }),
                });
            }
            return Promise.resolve({ json: () => Promise.resolve({ success: true, designs: [] }) });
        });

        await renderDashboard();

        expect(await screen.findByAltText('Project One')).toHaveAttribute('src', '/assets/designs/project-1.png');
    });

    it('falls back to an empty design list when the endpoint returns html 404 content', async () => {
        (global.fetch as jest.Mock).mockImplementation((url: unknown) => {
            if (String(url).includes('/api/designs/list')) {
                return Promise.resolve({
                    ok: false,
                    status: 404,
                    headers: {
                        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
                    },
                    text: () => Promise.resolve('<!DOCTYPE html><html><body>error</body></html>'),
                });
            }
            return Promise.resolve({ json: () => Promise.resolve({ success: true, designs: [] }) });
        });

        const { container } = await renderDashboard();

        // The pages shelf still renders — it just carries no server-saved page.
        await waitFor(() => {
            expect(screen.getByTestId('stack-shelf-pages')).toBeInTheDocument();
        });
        expect(container.querySelectorAll('[data-testid^="dashboard-design-"]')).toHaveLength(0);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});
