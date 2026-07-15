import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as fabric from 'fabric';
import PropertiesPanel from '../PropertiesPanel';
import { createMockCanvas, createMockObject } from './propertiesPanelTestUtils';

type SelectionPropertiesMockProps = {
    selectedObject: { type?: string; adjustmentType?: string; isAdjustmentLayer?: boolean } | null;
    onPropChange: (prop: string, value: unknown) => void;
};

type ColorPanelViewMockProps = {
    color: string;
    hasEditableTarget: boolean;
    onColorChange: (color: string) => void;
};

let latestSelectionProps: SelectionPropertiesMockProps | null = null;
let latestColorPanelProps: ColorPanelViewMockProps | null = null;
let getContextSpy: jest.SpyInstance | null = null;

jest.mock('fabric', () => {
    const actual = jest.requireActual('fabric');

    class MockCanvas2dFilterBackend {}

    class MockRect {
        type = 'rect';
        left = 0;
        top = 0;
        width = 0;
        height = 0;
        fill = 'transparent';
        selectable = true;
        evented = true;
        visible = true;
        opacity = 1;
        set = jest.fn((key: string | Record<string, unknown>, value?: unknown) => {
            if (typeof key === 'string') {
                (this as unknown as Record<string, unknown>)[key] = value;
                return;
            }

            Object.assign(this, key);
        });
        setCoords = jest.fn();

        constructor(options: Partial<MockRect> = {}) {
            Object.assign(this, options);
        }
    }

    return {
        ...actual,
        Canvas2dFilterBackend: MockCanvas2dFilterBackend,
        Rect: MockRect,
        getFilterBackend: jest.fn(() => new MockCanvas2dFilterBackend()),
        setFilterBackend: jest.fn(),
    };
});

jest.mock('../properties/LayersView', () => ({
    LayersView: () => <div data-testid="layers-view">Layers view</div>,
}));

jest.mock('../properties/SelectionProperties', () => ({
    SelectionProperties: (props: SelectionPropertiesMockProps) => {
        latestSelectionProps = props;

        return (
            <div data-testid="selection-properties">
                <div>Selection properties</div>
                <div data-testid="selection-object-type">{props.selectedObject?.type ?? 'none'}</div>
                <div data-testid="selection-adjustment-type">{props.selectedObject?.adjustmentType ?? 'none'}</div>
                <button type="button" onClick={() => props.onPropChange('fill', '#224466')}>
                    Mock apply selection color
                </button>
            </div>
        );
    },
}));

jest.mock('../properties/PanelUtilityViews', () => {
    const actual = jest.requireActual('../properties/PanelUtilityViews');

    return {
        ...actual,
        ColorPanelView: (props: ColorPanelViewMockProps) => {
            latestColorPanelProps = props;

            return (
                <div>
                    <div>Color</div>
                    <div data-testid="color-panel-current-color">{props.color}</div>
                    <div data-testid="color-panel-has-target">{String(props.hasEditableTarget)}</div>
                    <button type="button" onClick={() => props.onColorChange('#224466')}>
                        Apply mock color
                    </button>
                </div>
            );
        },
    };
});

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
    beforeAll(() => {
        getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}) as CanvasRenderingContext2D);
    });

    afterAll(() => {
        getContextSpy?.mockRestore();
    });

    beforeEach(() => {
        window.localStorage.clear();
        latestSelectionProps = null;
        latestColorPanelProps = null;
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

    it('renders the channels panel when channels mode is persisted', async () => {
        window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, 'channels');

        render(<PropertiesPanel canvas={null} activeTool="select" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode channels' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.getByText('Channels')).toBeInTheDocument();
        expect(screen.getByText(/Select an image or a fillable layer/i)).toBeInTheDocument();
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
                    brushPreset: 'soft-round',
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

    it('keeps the panel rail visible when the gallery tool is active', async () => {
        render(<PropertiesPanel canvas={null} activeTool="assets" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode properties' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.getByTestId('canvas-settings')).toBeInTheDocument();
        expect(screen.queryByTestId('asset-library')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Panel mode layers' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode layers' })).toHaveAttribute('aria-pressed', 'true');
        });

        expect(screen.getByTestId('layers-view')).toBeInTheDocument();
    });

    it('switches back to properties and focuses the new adjustment layer after adjustment creation', async () => {
        const canvas = createMockCanvas();
        window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, 'layers');

        render(<PropertiesPanel canvas={canvas as unknown as fabric.Canvas} activeTool="select" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode layers' })).toHaveAttribute('aria-pressed', 'true');
        });

        act(() => {
            canvas.emit('adjustment:create', { type: 'brightness-contrast' });
        });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Panel mode properties' })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByTestId('selection-properties')).toBeInTheDocument();
            expect(screen.getByTestId('selection-adjustment-type')).toHaveTextContent('brightness-contrast');
        });

        expect(canvas.add).toHaveBeenCalledTimes(1);
        // Called on create and again after the tool switch settles (the
        // deferred re-select keeps the new layer focused).
        expect(canvas.setActiveObject).toHaveBeenCalled();
        expect(latestSelectionProps?.selectedObject?.isAdjustmentLayer).toBe(true);
    });

    it('hydrates the selected fill into color mode and applies color changes back to the object', async () => {
        const selectedObject = createMockObject({ fill: '#112233' });
        const canvas = createMockCanvas([selectedObject], [selectedObject]);

        render(
            <PropertiesPanel
                canvas={canvas as unknown as fabric.Canvas}
                activeTool="select"
                panelMode="color"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('color-panel-current-color')).toHaveTextContent('#112233');
            expect(screen.getByTestId('color-panel-has-target')).toHaveTextContent('true');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Apply mock color' }));

        await waitFor(() => {
            expect(selectedObject.fill).toBe('#224466');
            expect(screen.getByTestId('color-panel-current-color')).toHaveTextContent('#224466');
        });

        expect(selectedObject.set).toHaveBeenCalledWith('fill', '#224466');
        expect(latestColorPanelProps?.hasEditableTarget).toBe(true);
    });

    it('applies the pseudo backside preset and restores the front view', async () => {
        const selectedObject = createMockObject({
            type: 'image',
            flipX: false,
            skewX: 0,
            skewY: 0,
            skewZ: 0,
            taperDirection: 0,
        });
        const canvas = createMockCanvas([selectedObject], [selectedObject]);

        render(
            <PropertiesPanel
                canvas={canvas as unknown as fabric.Canvas}
                activeTool="select"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('selection-properties')).toBeInTheDocument();
        });

        act(() => {
            latestSelectionProps?.onPropChange('pseudoBacksidePreset', 'back');
        });

        expect(selectedObject.flipX).toBe(true);
        expect(selectedObject.skewZ).toBe(0);
        expect(selectedObject.taperDirection).toBe(0);
        expect(selectedObject.backsideBaseFlipX).toBe(false);
        expect(selectedObject.pseudoBacksidePreset).toBe('back');

        act(() => {
            latestSelectionProps?.onPropChange('pseudoBacksidePreset', 'front');
        });

        expect(selectedObject.flipX).toBe(false);
        expect(selectedObject.skewZ).toBe(0);
        expect(selectedObject.taperDirection).toBe(0);
        expect(selectedObject.pseudoBacksidePreset).toBe('front');
    });
});
