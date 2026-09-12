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
        spellcheckEnabled: true,
        onTextContentChange: jest.fn(),
        onFontFamilyChange: jest.fn(),
        onFontWeightChange: jest.fn(),
        onCurveChange: jest.fn(),
        onSpellcheckChange: jest.fn(),
    };

    it('renders multiline text content in editor', async () => {
        const { rerender } = render(
            <TextProperties
                {...baseProps}
            />
        );

        const editor = await screen.findByLabelText('Text content');
        expect(editor).toHaveTextContent('Line 1');

        rerender(
            <TextProperties
                {...baseProps}
                textContent={'Line 1\nLine 2\nLine 3'}
            />
        );

        expect(editor).toHaveTextContent('Line 1');
        expect(editor).toHaveTextContent('Line 2');
        expect(editor).toHaveTextContent('Line 3');
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

    it('triggers onCurveChange with variable curvature when Bend slider moves', () => {
        const onCurveChange = jest.fn();
        render(
            <TextProperties
                {...baseProps}
                onCurveChange={onCurveChange}
            />
        );

        const sliders = screen.getAllByRole('slider');
        const bendSlider = sliders[0];

        // Move bend slider to 2 (should produce gentle curve ~7° rather than stuck at 180°)
        fireEvent.change(bendSlider, { target: { value: '2' } });
        expect(onCurveChange).toHaveBeenCalledWith(2, 0, 7);

        // Move bend slider to 50 (half-circle 180°)
        fireEvent.change(bendSlider, { target: { value: '50' } });
        expect(onCurveChange).toHaveBeenCalledWith(50, 0, 180);

        // Move bend slider to -25 (quarter-circle 90° downward)
        fireEvent.change(bendSlider, { target: { value: '-25' } });
        expect(onCurveChange).toHaveBeenCalledWith(-25, 0, 90);
    });

    it('forwards an explicit arc span, including exactly 180°', () => {
        const onCurveChange = jest.fn();
        render(
            <TextProperties
                {...baseProps}
                curveStrength={30}
                curveSpan={120}
                onCurveChange={onCurveChange}
            />
        );

        // Bend, curve centre, then arc span.
        const spanSlider = screen.getAllByRole('slider')[2];

        fireEvent.change(spanSlider, { target: { value: '240' } });
        expect(onCurveChange).toHaveBeenCalledWith(30, 0, 240);

        // 180 is a legitimate span, not a "no span supplied" sentinel.
        fireEvent.change(spanSlider, { target: { value: '180' } });
        expect(onCurveChange).toHaveBeenCalledWith(30, 0, 180);
    });
});

