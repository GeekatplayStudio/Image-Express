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
    onAdjustmentTypeChange: jest.fn(),
    onCreateAdjustmentLayer: jest.fn(),
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

    it('renders color mode tabs and switches to HSB mode info', () => {
        const selectedObject = {
            type: 'rect',
            opacity: 1,
            visible: true,
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            scaleX: 1,
            scaleY: 1,
        } as unknown as fabric.Object;

        render(
            <SelectionProperties
                {...baseProps}
                selectedObject={selectedObject}
                selectedObjects={[selectedObject]}
            />
        );

        expect(screen.getByRole('button', { name: 'Color mode RGB' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Color mode HSB' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Color mode CMYK' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Color mode Lab' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Color mode HSB' }));
        expect(screen.getByText(/HSB mode UI is currently mapped/i)).toBeInTheDocument();
    });

    it('renders categorized adjustment launcher and creates supported adjustment layers', () => {
        const onCreateAdjustmentLayer = jest.fn();
        const selectedObject = {
            type: 'rect',
            opacity: 1,
            visible: true,
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            scaleX: 1,
            scaleY: 1,
        } as unknown as fabric.Object;

        render(
            <SelectionProperties
                {...baseProps}
                selectedObject={selectedObject}
                selectedObjects={[selectedObject]}
                onCreateAdjustmentLayer={onCreateAdjustmentLayer}
            />
        );

        expect(screen.getByText('Adjustments')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Adjustment action Curves' }));
        expect(onCreateAdjustmentLayer).toHaveBeenCalledWith('curves');

        const unsupported = screen.getByRole('button', { name: 'Adjustment action Light and Color' });
        expect(unsupported).toBeDisabled();
    });

    it('renders adjustment quick controls and switches type for adjustment layers', () => {
        const onAdjustmentTypeChange = jest.fn();
        const selectedObject = {
            type: 'rect',
            opacity: 1,
            visible: true,
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            scaleX: 1,
            scaleY: 1,
            isAdjustmentLayer: true,
            adjustmentType: 'curves',
            adjustmentSettings: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        } as unknown as fabric.Object;

        render(
            <SelectionProperties
                {...baseProps}
                selectedObject={selectedObject}
                selectedObjects={[selectedObject]}
                onAdjustmentTypeChange={onAdjustmentTypeChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Quick adjustment Levels' }));
        expect(onAdjustmentTypeChange).toHaveBeenCalledWith('levels');

        fireEvent.click(screen.getByRole('button', { name: 'Adjustment action Exposure' }));
        expect(onAdjustmentTypeChange).toHaveBeenCalledWith('exposure');
    });
});
