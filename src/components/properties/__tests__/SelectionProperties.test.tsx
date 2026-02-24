import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import * as fabric from 'fabric';
import { SelectionProperties } from '../SelectionProperties';

const baseProps = {
    selectedObject: null,
    selectedObjects: [] as fabric.Object[],
    isGradient: false,
    color: '#000000',
    onPropChange: jest.fn(),
    onLayoutAction: jest.fn(),
    onGroup: jest.fn(),
    onUngroup: jest.fn(),
    onCreateMask: jest.fn(),
    onReleaseMask: jest.fn(),
    updateAdjustment: jest.fn(),
    effectState: {
        stroke: { color: '#000000', width: 0, opacity: 1, inside: true },
        shadow: { enabled: false, color: '#000000', blur: 0, offsetX: 0, offsetY: 0, opacity: 1 },
        skew: { x: 0, y: 0, z: 0, dir: 0 },
        filters: { blur: 0, brightness: 0, contrast: 0, noise: 0, saturation: 0, vibrance: 0, pixelate: 0 }
    }
};

describe('SelectionProperties', () => {
    it('shows text-on-path quick action for text + polygon selection', () => {
        const onTextOnPath = jest.fn();
        const selectedObjects = [
            { type: 'textbox' } as unknown as fabric.Object,
            { type: 'polygon' } as unknown as fabric.Object
        ];

        render(
            <SelectionProperties
                {...baseProps}
                selectedObjects={selectedObjects}
                onTextOnPath={onTextOnPath}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Path/i }));
        expect(onTextOnPath).toHaveBeenCalledTimes(1);
    });

    it('does not show text-on-path quick action when path is not selected', () => {
        const onTextOnPath = jest.fn();
        const selectedObjects = [
            { type: 'textbox' } as unknown as fabric.Object,
            { type: 'rect' } as unknown as fabric.Object
        ];

        render(
            <SelectionProperties
                {...baseProps}
                selectedObjects={selectedObjects}
                onTextOnPath={onTextOnPath}
            />
        );

        expect(screen.queryByRole('button', { name: /Path/i })).toBeNull();
    });
});
