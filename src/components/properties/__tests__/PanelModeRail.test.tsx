import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PanelModeRail } from '../PanelModeRail';

describe('PanelModeRail', () => {
    it('renders modes and toggles selection', () => {
        const onModeChange = jest.fn();
        render(<PanelModeRail mode="layers" onModeChange={onModeChange} />);

        const layersButton = screen.getByTestId('panel-mode-layers');
        const propertiesButton = screen.getByTestId('panel-mode-properties');
        const historyButton = screen.getByTestId('panel-mode-history');
        const colorButton = screen.getByTestId('panel-mode-color');
        const swatchesButton = screen.getByTestId('panel-mode-swatches');
        const brushesButton = screen.getByTestId('panel-mode-brushes');
        const channelsButton = screen.getByTestId('panel-mode-channels');
        const adjustmentsButton = screen.getByTestId('panel-mode-adjustments');
        const navigatorButton = screen.getByTestId('panel-mode-navigator');
        const infoButton = screen.getByTestId('panel-mode-info');

        expect(layersButton).toHaveAttribute('aria-pressed', 'true');
        expect(propertiesButton).toHaveAttribute('aria-pressed', 'false');
        expect(historyButton).toHaveAttribute('aria-pressed', 'false');
        expect(colorButton).toHaveAttribute('aria-pressed', 'false');
        expect(swatchesButton).toHaveAttribute('aria-pressed', 'false');
        expect(brushesButton).toHaveAttribute('aria-pressed', 'false');
        expect(channelsButton).toHaveAttribute('aria-pressed', 'false');
        expect(adjustmentsButton).toHaveAttribute('aria-pressed', 'false');
        expect(navigatorButton).toHaveAttribute('aria-pressed', 'false');
        expect(infoButton).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(propertiesButton);
        expect(onModeChange).toHaveBeenCalledWith('properties');

        fireEvent.click(historyButton);
        expect(onModeChange).toHaveBeenCalledWith('history');

        fireEvent.click(colorButton);
        expect(onModeChange).toHaveBeenCalledWith('color');

        fireEvent.click(swatchesButton);
        expect(onModeChange).toHaveBeenCalledWith('swatches');

        fireEvent.click(brushesButton);
        expect(onModeChange).toHaveBeenCalledWith('brushes');

        fireEvent.click(channelsButton);
        expect(onModeChange).toHaveBeenCalledWith('channels');

        fireEvent.click(adjustmentsButton);
        expect(onModeChange).toHaveBeenCalledWith('adjustments');

        fireEvent.click(navigatorButton);
        expect(onModeChange).toHaveBeenCalledWith('navigator');

        fireEvent.click(infoButton);
        expect(onModeChange).toHaveBeenCalledWith('info');

        fireEvent.click(layersButton);
        expect(onModeChange).toHaveBeenCalledWith('layers');
    });

    it('reveals panel labels on hover when hover labels are enabled', () => {
        const onModeChange = jest.fn();
        render(<PanelModeRail mode="layers" onModeChange={onModeChange} showHoverLabels />);

        expect(screen.queryByText('Layers')).not.toBeInTheDocument();
        fireEvent.mouseEnter(screen.getByTestId('panel-mode-rail'));
        expect(screen.getByText('Layers')).toBeInTheDocument();
    });

    it('keeps icon-only rail when hover labels are disabled', () => {
        const onModeChange = jest.fn();
        render(<PanelModeRail mode="layers" onModeChange={onModeChange} showHoverLabels={false} />);

        fireEvent.mouseEnter(screen.getByTestId('panel-mode-rail'));
        expect(screen.queryByText('Layers')).not.toBeInTheDocument();
    });
});
