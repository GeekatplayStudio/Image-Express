import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TextProperties } from '../TextProperties';

describe('TextProperties', () => {
    const baseProps = {
        textContent: 'Line 1',
        fontFamily: 'Arial',
        fontWeight: 'normal',
        curveStrength: 0,
        curveCenter: 0,
        onTextContentChange: jest.fn(),
        onFontFamilyChange: jest.fn(),
        onFontWeightChange: jest.fn(),
        onCurveChange: jest.fn(),
    };

    it('updates multiline text content from textarea', () => {
        const onTextContentChange = jest.fn();
        render(
            <TextProperties
                {...baseProps}
                onTextContentChange={onTextContentChange}
            />
        );

        fireEvent.change(screen.getByLabelText('Text content'), {
            target: { value: 'Line 1\nLine 2\nLine 3' },
        });

        expect(onTextContentChange).toHaveBeenCalledWith('Line 1\nLine 2\nLine 3');
    });

    it('attaches text to selected path from dropdown', () => {
        const onAttachPath = jest.fn();
        render(
            <TextProperties
                {...baseProps}
                pathOptions={[
                    { id: 'path-1', label: 'Vector Path 1' },
                    { id: 'path-2', label: 'Vector Path 2' },
                ]}
                onAttachPath={onAttachPath}
            />
        );

        const select = screen.getByDisplayValue('Select a pen path');
        fireEvent.change(select, { target: { value: 'path-2' } });
        expect(onAttachPath).toHaveBeenCalledWith('path-2');
    });

    it('shows detach action when text already has attached path', () => {
        const onDetachPath = jest.fn();
        render(
            <TextProperties
                {...baseProps}
                pathOptions={[{ id: 'path-1', label: 'Vector Path 1' }]}
                selectedPathId="path-1"
                hasAttachedPath={true}
                onDetachPath={onDetachPath}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Detach Path' }));
        expect(onDetachPath).toHaveBeenCalledTimes(1);
    });
});
