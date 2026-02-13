import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InputModal from '../InputModal';

describe('InputModal', () => {
    const mockOnConfirm = jest.fn();
    const mockOnCancel = jest.fn();

    const defaultProps = {
        isOpen: true,
        title: 'Test Modal',
        onConfirm: mockOnConfirm,
        onCancel: mockOnCancel,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('renders nothing when closed', () => {
        render(<InputModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    });

    test('renders correctly when open', () => {
        render(<InputModal {...defaultProps} />);
        expect(screen.getByText('Test Modal')).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    test('calls onConfirm with input value', () => {
        render(<InputModal {...defaultProps} />);
        
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'New Value' } });
        
        // Assuming there is a confirm button with confirmLabel or default "Save"
        const confirmButton = screen.getByText('Save');
        fireEvent.click(confirmButton);

        expect(mockOnConfirm).toHaveBeenCalledWith('New Value');
    });

    test('calls onCancel when cancel button clicked', () => {
        render(<InputModal {...defaultProps} />);
        
        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);

        expect(mockOnCancel).toHaveBeenCalled();
    });

    test('initializes with default value', () => {
        render(<InputModal {...defaultProps} defaultValue="Initial" />);
        expect(screen.getByRole('textbox')).toHaveValue('Initial');
    });
});
