import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PropertiesPanel from '../PropertiesPanel';

jest.mock('../properties/LayersView', () => ({
    LayersView: () => <div data-testid="layers-view">Layers view</div>,
}));

jest.mock('../properties/SelectionProperties', () => ({
    SelectionProperties: () => <div data-testid="selection-properties">Selection properties</div>,
}));

jest.mock('../properties/PaintProperties', () => ({
    PaintProperties: () => <div data-testid="paint-properties">Paint properties</div>,
}));

jest.mock('../properties/CanvasSettingsPanel', () => ({
    CanvasSettingsPanel: () => <div data-testid="canvas-settings">Canvas settings</div>,
}));

jest.mock('../properties/PenProperties', () => ({
    PenProperties: () => <div data-testid="pen-properties">Pen properties</div>,
}));

jest.mock('../AssetLibrary', () => ({
    __esModule: true,
    default: () => <div data-testid="asset-library">Asset library</div>,
}));

jest.mock('@/hooks/useGradientControls', () => ({
    useGradientControls: jest.fn(),
}));

const PANEL_MODE_STORAGE_KEY = 'image-express-properties-panel-mode';

describe('PropertiesPanel panel mode rail persistence', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('hydrates panel mode from localStorage', async () => {
        window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, 'layers');

        render(<PropertiesPanel canvas={null} activeTool="select" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode layers' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.getByTestId('layers-view')).toBeInTheDocument();
    });

    it('persists panel mode changes when switching via rail', async () => {
        render(<PropertiesPanel canvas={null} activeTool="select" />);

        const layersButton = screen.getByRole('button', { name: 'Panel mode layers' });
        const propertiesButton = screen.getByRole('button', { name: 'Panel mode properties' });

        fireEvent.click(layersButton);
        await waitFor(() => {
            expect(window.localStorage.getItem(PANEL_MODE_STORAGE_KEY)).toBe('layers');
        });

        fireEvent.click(propertiesButton);
        await waitFor(() => {
            expect(window.localStorage.getItem(PANEL_MODE_STORAGE_KEY)).toBe('properties');
            expect(propertiesButton).toHaveAttribute('aria-pressed', 'true');
        });
    });

    it('hydrates history mode and wires undo/redo actions', async () => {
        const onUndo = jest.fn();
        const onRedo = jest.fn();
        window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, 'history');

        render(
            <PropertiesPanel
                canvas={null}
                activeTool="select"
                historyState={{ undo: 4, redo: 2 }}
                onUndo={onUndo}
                onRedo={onRedo}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode history' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.getByText('History')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'History undo' }));
        fireEvent.click(screen.getByRole('button', { name: 'History redo' }));

        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(onRedo).toHaveBeenCalledTimes(1);
    });

    it('hydrates color mode and persists switching to swatches', async () => {
        window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, 'color');

        render(<PropertiesPanel canvas={null} activeTool="select" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode color' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.getByText('Color')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Panel mode swatches' }));

        await waitFor(() => {
            expect(window.localStorage.getItem(PANEL_MODE_STORAGE_KEY)).toBe('swatches');
            expect(screen.getByRole('button', { name: 'Panel mode swatches' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.getByText('Swatches')).toBeInTheDocument();
    });

    it('renders channels coming-soon surface when channels mode is persisted', async () => {
        window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, 'channels');

        render(<PropertiesPanel canvas={null} activeTool="select" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode channels' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.getByText('Channels')).toBeInTheDocument();
        expect(screen.getByText(/Channel editing .* not implemented yet/i)).toBeInTheDocument();
    });

    it('hydrates brushes mode and wires brush controls', async () => {
        const onBrushPresetChange = jest.fn();
        const onBrushSizeChange = jest.fn();
        const onBrushHardnessChange = jest.fn();
        const onBrushOpacityChange = jest.fn();
        const onBrushFlowChange = jest.fn();
        const onBrushSmoothingChange = jest.fn();
        const onBrushBlendModeChange = jest.fn();
        const onActivatePaintTool = jest.fn();

        window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, 'brushes');

        render(
            <PropertiesPanel
                canvas={null}
                activeTool="select"
                brushOptions={{
                    brushPreset: 'Pencil',
                    size: 14,
                    hardness: 80,
                    opacity: 90,
                    flow: 70,
                    smoothing: 35,
                    blendMode: 'source-over',
                }}
                onBrushPresetChange={onBrushPresetChange}
                onBrushSizeChange={onBrushSizeChange}
                onBrushHardnessChange={onBrushHardnessChange}
                onBrushOpacityChange={onBrushOpacityChange}
                onBrushFlowChange={onBrushFlowChange}
                onBrushSmoothingChange={onBrushSmoothingChange}
                onBrushBlendModeChange={onBrushBlendModeChange}
                onActivatePaintTool={onActivatePaintTool}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode brushes' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.getByText('Brushes')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Activate paint tool' }));
        expect(onActivatePaintTool).toHaveBeenCalledTimes(1);

        fireEvent.change(screen.getByLabelText('Brushes preset'), { target: { value: 'Oil' } });
        expect(onBrushPresetChange).toHaveBeenCalledWith('Oil');

        fireEvent.change(screen.getByLabelText('Brushes preset'), { target: { value: 'Pencil' } });
        expect(onBrushPresetChange).toHaveBeenCalledWith('Pencil');

        fireEvent.change(screen.getByLabelText('Brushes size'), { target: { value: '24' } });
        expect(onBrushSizeChange).toHaveBeenCalledWith(24);

        fireEvent.change(screen.getByLabelText('Brushes hardness'), { target: { value: '55' } });
        expect(onBrushHardnessChange).toHaveBeenCalledWith(55);

        fireEvent.change(screen.getByLabelText('Brushes opacity'), { target: { value: '65' } });
        expect(onBrushOpacityChange).toHaveBeenCalledWith(65);

        fireEvent.change(screen.getByLabelText('Brushes flow'), { target: { value: '45' } });
        expect(onBrushFlowChange).toHaveBeenCalledWith(45);

        fireEvent.change(screen.getByLabelText('Brushes smoothing'), { target: { value: '20' } });
        expect(onBrushSmoothingChange).toHaveBeenCalledWith(20);

        fireEvent.change(screen.getByLabelText('Brushes blend mode'), { target: { value: 'multiply' } });
        expect(onBrushBlendModeChange).toHaveBeenCalledWith('multiply');
    });

    it('does not force pen properties in properties mode when active tool is pen', async () => {
        render(<PropertiesPanel canvas={null} activeTool="pen" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode properties' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.queryByTestId('pen-properties')).not.toBeInTheDocument();
        expect(screen.getByTestId('canvas-settings')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Panel mode paths' })).toBeNull();
    });
});
