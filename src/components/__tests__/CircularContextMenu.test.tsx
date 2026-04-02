import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import CircularContextMenu from '../CircularContextMenu';

describe('CircularContextMenu', () => {
    it('highlights the active tool and routes tool selection through the shared callback', () => {
        const onSelectTool = jest.fn();
        const onClose = jest.fn();

        render(
            <CircularContextMenu
                x={160}
                y={140}
                isOpen={true}
                activeTool="lasso"
                onClose={onClose}
                onSelectTool={onSelectTool}
            />
        );

        const lassoButton = screen.getByRole('button', { name: 'Lasso' });
        const moveButton = screen.getByRole('button', { name: 'Move' });

        expect(lassoButton).toHaveAttribute('aria-pressed', 'true');
        expect(moveButton).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(screen.getByRole('button', { name: 'Quick Selection' }));

        expect(onSelectTool).toHaveBeenCalledWith('quick-select');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('enables and disables layer-order actions from the supplied layer state', () => {
        const onLayerOrderAction = jest.fn();

        render(
            <CircularContextMenu
                x={160}
                y={140}
                isOpen={true}
                activeTool="select"
                onClose={jest.fn()}
                onSelectTool={jest.fn()}
                onLayerOrderAction={onLayerOrderAction}
                layerOrderState={{
                    enabled: true,
                    canMoveUp: true,
                    canMoveDown: false,
                    canBringToFront: true,
                    canSendToBack: false,
                }}
            />
        );

        const moveUpButton = screen.getByTitle('Move layer up');
        const disabledButtons = screen.getAllByTitle('Select a layer to reorder');

        expect(moveUpButton).toBeEnabled();
        expect(disabledButtons).toHaveLength(2);
        disabledButtons.forEach((button) => expect(button).toBeDisabled());

        fireEvent.click(moveUpButton);
        expect(onLayerOrderAction).toHaveBeenCalledWith('move-up');
    });
});