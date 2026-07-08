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

    it('exposes add-mask and paint-mask actions for the selected layer', () => {
        const selectedObject = makeObject();
        const onAddMask = jest.fn();
        const onPaintMask = jest.fn();

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
                onAddMask={onAddMask}
                onPaintMask={onPaintMask}
            />
        );

        fireEvent.click(screen.getByTitle('Add layer mask (reveal all)'));
        expect(onAddMask).toHaveBeenCalledWith(selectedObject);

        fireEvent.click(screen.getByTitle('Paint raster mask (white reveals, black hides)'));
        expect(onPaintMask).toHaveBeenCalledWith(selectedObject);
    });

    it('disables add-mask when the layer already has a mask', () => {
        const selectedObject = makeObject({ clipPath: {} });

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
                onAddMask={jest.fn()}
                onPaintMask={jest.fn()}
            />
        );

        expect(screen.getByTitle('Layer already has a mask')).toBeDisabled();
    });

    it('opens a right-click context menu with clip, lock, hide, duplicate and delete', () => {
        const selectedObject = makeObject();
        const onClipToBelow = jest.fn();
        const onClipLayerAbove = jest.fn();
        const onDelete = jest.fn();
        const onDuplicate = jest.fn();
        const onToggleLock = jest.fn();
        const onToggleVisibility = jest.fn();
        const onSelect = jest.fn();

        render(
            <LayersView
                objects={[selectedObject]}
                selectedIds={new Set(['layer-1'])}
                selectedObject={selectedObject}
                onSelect={onSelect}
                onToggleVisibility={onToggleVisibility}
                onToggleLock={onToggleLock}
                onDelete={onDelete}
                onReorder={jest.fn()}
                onGroup={jest.fn()}
                onUngroup={jest.fn()}
                onCreateFolder={jest.fn()}
                onLayerOpacityChange={jest.fn()}
                onLayerBlendChange={jest.fn()}
                onDuplicate={onDuplicate}
                onClipToBelow={onClipToBelow}
                onClipLayerAbove={onClipLayerAbove}
                onReleaseClip={jest.fn()}
            />
        );

        const row = screen.getByTitle('Double-click to set layer tag color').closest('.cursor-pointer') as HTMLElement;
        fireEvent.contextMenu(row, { clientX: 120, clientY: 140 });

        expect(onSelect).toHaveBeenCalledWith(selectedObject);
        expect(screen.getByRole('menu', { name: 'Layer actions' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('menuitem', { name: /Clip to Layer Below/ }));
        expect(onClipToBelow).toHaveBeenCalledWith(selectedObject);
        expect(screen.queryByRole('menu', { name: 'Layer actions' })).not.toBeInTheDocument();

        fireEvent.contextMenu(row, { clientX: 120, clientY: 140 });
        expect(screen.getByRole('menuitem', { name: /Clip Layer Above to This/ })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Duplicate/ })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Lock/ })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Hide/ })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }));
        expect(onDelete).toHaveBeenCalledWith(selectedObject);
    });

    it('shows release option in context menu for clipped layers', () => {
        const selectedObject = makeObject({ isClippedToBelow: true, clipPath: {} });
        const onReleaseClip = jest.fn();

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
                onReleaseClip={onReleaseClip}
                onClipToBelow={jest.fn()}
            />
        );

        const row = screen.getByTitle('Double-click to set layer tag color').closest('.cursor-pointer') as HTMLElement;
        fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });

        fireEvent.click(screen.getByRole('menuitem', { name: /Release Clipping Mask/ }));
        expect(onReleaseClip).toHaveBeenCalledWith(selectedObject);
    });

    it('opens mask editing when the mask badge on a row is clicked', () => {
        const selectedObject = makeObject({ clipPath: { type: 'image' } });
        const onEditMask = jest.fn();

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
                onEditMask={onEditMask}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Edit mask' }));
        expect(onEditMask).toHaveBeenCalledWith(selectedObject);

        // Also reachable from the row context menu
        const row = screen.getByTitle('Double-click to set layer tag color').closest('.cursor-pointer') as HTMLElement;
        fireEvent.contextMenu(row, { clientX: 90, clientY: 90 });
        fireEvent.click(screen.getByRole('menuitem', { name: /Edit Mask/ }));
        expect(onEditMask).toHaveBeenCalledTimes(2);
    });

    it('always renders draggable rows without an arrange-mode gate', () => {
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

        expect(screen.queryByRole('button', { name: 'Arrange layers' })).not.toBeInTheDocument();
        expect(screen.getByTitle('Double-click to set layer tag color')).toHaveClass('cursor-move');
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
