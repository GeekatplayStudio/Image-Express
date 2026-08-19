import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import CircularContextMenu from '../CircularContextMenu';

describe('CircularContextMenu', () => {
    afterEach(() => {
        document.documentElement.dataset.themeAccent = 'ocean';
    });

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

    it('shows one entry per tool family and omits panel modes and tool variants', () => {
        render(
            <CircularContextMenu
                x={160}
                y={140}
                isOpen={true}
                activeTool="select"
                activePanelMode="channels"
                onClose={jest.fn()}
                onSelectTool={jest.fn()}
            />
        );

        // Primaries present
        expect(screen.getByRole('button', { name: 'Healing Brush' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Dodge Tool' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Fabrication Studio' })).toBeInTheDocument();

        // Variants and panel modes trimmed out of the ring
        expect(screen.queryByRole('button', { name: 'Channels' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Burn Tool' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Magic Wand' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Spot Healing' })).not.toBeInTheDocument();
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

    it('uses the active accent palette for inactive tool icon colors', () => {
        document.documentElement.dataset.themeAccent = 'meadow';

        render(
            <CircularContextMenu
                x={160}
                y={140}
                isOpen={true}
                activeTool="select"
                onClose={jest.fn()}
                onSelectTool={jest.fn()}
            />
        );

        const lassoButton = screen.getByRole('button', { name: 'Lasso' });
        const lassoIcon = lassoButton.querySelector('svg');

        expect(lassoIcon).not.toBeNull();
        expect(lassoIcon).toHaveStyle({ color: '#15803d' });
    });

    it('highlights the fabrication family while a fabrication subtool is active', () => {
        render(
            <CircularContextMenu
                x={160}
                y={140}
                isOpen={true}
                activeTool="3d-gen"
                onClose={jest.fn()}
                onSelectTool={jest.fn()}
            />
        );

        expect(screen.getByRole('button', { name: 'Fabrication Studio' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('replaces the full ring with a one-click low-poly unfold for a 3D model', () => {
        const onFoamCut = jest.fn();

        render(
            <CircularContextMenu
                x={160}
                y={140}
                isOpen={true}
                activeTool="select"
                onClose={jest.fn()}
                onSelectTool={jest.fn()}
                modelContext={{ name: 'Fox.glb', isCutting: false, onFoamCut }}
            />
        );

        expect(screen.getByRole('menu', { name: '3D model actions' })).toBeInTheDocument();
        expect(screen.getByText('Fox.glb')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('menuitem', { name: 'Low-poly unfold' }));
        expect(onFoamCut).toHaveBeenCalledTimes(1);
    });
});
