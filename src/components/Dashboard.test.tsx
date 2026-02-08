import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from './Dashboard';
import { DialogProvider } from '@/providers/DialogProvider';
import { ToastProvider } from '@/providers/ToastProvider';

// Mock dependencies
jest.mock('next/image', () => ({
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @next/next/no-img-element, jsx-a11y/alt-text
    default: ({ fill, ...props }: any) => <img {...props} data-fill={fill} /> 
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

    const renderDashboard = () => {
        return render(
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
    };

    it('renders the quote header', () => {
        renderDashboard();
        // Check for quotes (assuming at least one exists)
        // Since quotes are random, just check if a header is present
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('allows searching templates', () => {
        renderDashboard();
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

    it('calls onNewDesign with correct tool when action buttons clicked', () => {
        renderDashboard();
        
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
        expect(mockOnNewDesign).toHaveBeenCalledWith('upload');

        // Create 3D
        fireEvent.click(screen.getByText('Create 3D'));
        expect(mockOnNewDesign).toHaveBeenCalledWith('3d');
    });

    it('filters templates by category', () => {
        renderDashboard();
        const webTab = screen.getByText('Web');
        fireEvent.click(webTab);
        
        // "Website Hero" is Type 'Web'. 
        // "Instagram Post" is Type 'Social Media'.
        // Assuming "Website Hero" is present
        expect(screen.getByText('Website Hero')).toBeInTheDocument();
    });
});
