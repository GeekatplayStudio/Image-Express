import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastProvider';

// Test component to trigger toast
const TestComponent = () => {
    const { toast } = useToast();
    return (
        <button onClick={() => toast({ title: 'Test Toast', description: 'This is a test' })}>
            Show Toast
        </button>
    );
};

describe('ToastProvider', () => {
    it('renders children', () => {
        render(
            <ToastProvider>
                <div>Child Content</div>
            </ToastProvider>
        );
        expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('shows toast when called', async () => {
        render(
            <ToastProvider>
                <TestComponent />
            </ToastProvider>
        );

        fireEvent.click(screen.getByText('Show Toast'));

        // Expect toast to appear. implementation of ToastProvider likely renders something.
        // I need to know what it renders. Let's assume standard toast UI.
        // If it uses Radix or similar, it might be in a Portal.
        // Assuming custom implementation based on file scan earlier.
        
        expect(await screen.findByText('Test Toast')).toBeInTheDocument();
        expect(screen.getByText('This is a test')).toBeInTheDocument();
    });

    it('throws error if useToast used outside provider', () => {
        // Suppress console.error since we expect an error
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        const TestThrow = () => {
            useToast();
            return null;
        };

        expect(() => render(<TestThrow />)).toThrow('useToast must be used within a ToastProvider');
        
        consoleSpy.mockRestore();
    });
});
