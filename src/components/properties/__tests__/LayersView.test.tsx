import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import * as fabric from 'fabric';
import { LayersView } from '../LayersView';

const makeObject = (overrides: Partial<Record<string, unknown>> = {}) => {
    return {
        id: 'layer-1',
        type: 'image',
        visible: true,
        opacity: 1,
        left: 10,
        top: 20,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        set: jest.fn(),
        ...overrides,
    } as unknown as fabric.Object;
};

describe('LayersView', () => {
    it('opens selected-layer inspector from row settings toggle and applies numeric edits', () => {
        const selectedObject = makeObject();
        const onLayerNumericPropChange = jest.fn();

        render(
            <LayersView
                objects={[selectedObject]}
                selectedIds={new Set(['layer-1'])}
                selectedObject={selectedObject}
                onSelect={jest.fn()}
                onToggleVisibility={jest.fn()}
                onToggleLock={jest.fn()}
                onDelete={jest.fn()}
                onReorder={jest.fn()}
                onGroup={jest.fn()}
                onUngroup={jest.fn()}
                onCreateFolder={jest.fn()}
                onLayerOpacityChange={jest.fn()}
                onLayerBlendChange={jest.fn()}
                onLayerNumericPropChange={onLayerNumericPropChange}
            />
        );

        fireEvent.click(screen.getByTitle('Layer settings'));

        expect(screen.getByText('Selected Layer Properties')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('X'), { target: { value: '44' } });
        fireEvent.change(screen.getByLabelText('Y'), { target: { value: '55' } });
        fireEvent.change(screen.getByLabelText('W'), { target: { value: '640' } });
        fireEvent.change(screen.getByLabelText('H'), { target: { value: '360' } });

        expect(onLayerNumericPropChange).toHaveBeenCalledWith('left', 44);
        expect(onLayerNumericPropChange).toHaveBeenCalledWith('top', 55);
        expect(onLayerNumericPropChange).toHaveBeenCalledWith('width', 640);
        expect(onLayerNumericPropChange).toHaveBeenCalledWith('height', 360);
    });

    it('keeps selected-layer actions in top strip and triggers delete', () => {
        const selectedObject = makeObject();
        const onDelete = jest.fn();

        render(
            <LayersView
                objects={[selectedObject]}
                selectedIds={new Set(['layer-1'])}
                selectedObject={selectedObject}
                onSelect={jest.fn()}
                onToggleVisibility={jest.fn()}
                onToggleLock={jest.fn()}
                onDelete={onDelete}
                onReorder={jest.fn()}
                onGroup={jest.fn()}
                onUngroup={jest.fn()}
                onCreateFolder={jest.fn()}
                onLayerOpacityChange={jest.fn()}
                onLayerBlendChange={jest.fn()}
            />
        );

        fireEvent.click(screen.getByTitle('Delete selected layer'));
        expect(onDelete).toHaveBeenCalledWith(selectedObject);
    });

    it('toggles arrange mode control state', () => {
        const selectedObject = makeObject();

        render(
            <LayersView
                objects={[selectedObject]}
                selectedIds={new Set(['layer-1'])}
                selectedObject={selectedObject}
                onSelect={jest.fn()}
                onToggleVisibility={jest.fn()}
                onToggleLock={jest.fn()}
                onDelete={jest.fn()}
                onReorder={jest.fn()}
                onGroup={jest.fn()}
                onUngroup={jest.fn()}
                onCreateFolder={jest.fn()}
                onLayerOpacityChange={jest.fn()}
                onLayerBlendChange={jest.fn()}
            />
        );

        const arrangeButton = screen.getByRole('button', { name: 'Arrange layers' });
        expect(arrangeButton).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(arrangeButton);
        expect(arrangeButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('triggers quick layer order controls from the top toolbar', () => {
        const selectedObject = makeObject();
        const onMoveLayerUp = jest.fn();
        const onMoveLayerDown = jest.fn();
        const onBringLayerToFront = jest.fn();
        const onSendLayerToBack = jest.fn();

        render(
            <LayersView
                objects={[selectedObject]}
                selectedIds={new Set(['layer-1'])}
                selectedObject={selectedObject}
                onSelect={jest.fn()}
                onToggleVisibility={jest.fn()}
                onToggleLock={jest.fn()}
                onDelete={jest.fn()}
                onReorder={jest.fn()}
                onGroup={jest.fn()}
                onUngroup={jest.fn()}
                onCreateFolder={jest.fn()}
                onLayerOpacityChange={jest.fn()}
                onLayerBlendChange={jest.fn()}
                onMoveLayerUp={onMoveLayerUp}
                onMoveLayerDown={onMoveLayerDown}
                onBringLayerToFront={onBringLayerToFront}
                onSendLayerToBack={onSendLayerToBack}
                canMoveLayerUp
                canMoveLayerDown
                canBringLayerToFront
                canSendLayerToBack
            />
        );

        fireEvent.click(screen.getByTitle('Move selected layer up'));
        fireEvent.click(screen.getByTitle('Move selected layer down'));
        fireEvent.click(screen.getByTitle('Bring selected layer to front'));
        fireEvent.click(screen.getByTitle('Send selected layer to back'));

        expect(onMoveLayerUp).toHaveBeenCalledTimes(1);
        expect(onMoveLayerDown).toHaveBeenCalledTimes(1);
        expect(onBringLayerToFront).toHaveBeenCalledTimes(1);
        expect(onSendLayerToBack).toHaveBeenCalledTimes(1);
    });
});
