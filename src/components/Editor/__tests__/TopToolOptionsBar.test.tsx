import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TopToolOptionsBar from '../TopToolOptionsBar';

describe('TopToolOptionsBar', () => {
    it('renders active tool and triggers mapped actions', () => {
        const onTriggerTool = jest.fn();
        render(<TopToolOptionsBar activeTool="select" onTriggerTool={onTriggerTool} />);

        expect(screen.getByTestId('top-tool-options-bar')).toBeInTheDocument();
        expect(screen.getByText('select')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Top option: Open Layers' }));
        expect(onTriggerTool).toHaveBeenCalledWith('layers');

        fireEvent.click(screen.getByRole('button', { name: 'Top option: Adjustments' }));
        expect(onTriggerTool).toHaveBeenCalledWith('adjustments');
    });

    it('uses tool-specific actions for text mode', () => {
        const onTriggerTool = jest.fn();
        render(<TopToolOptionsBar activeTool="text" onTriggerTool={onTriggerTool} />);

        fireEvent.click(screen.getByRole('button', { name: 'Top option: Pen Tool' }));
        expect(onTriggerTool).toHaveBeenCalledWith('pen');

        fireEvent.click(screen.getByRole('button', { name: 'Top option: Shapes Tool' }));
        expect(onTriggerTool).toHaveBeenCalledWith('shapes');
    });

    it('renders and wires select family controls', () => {
        const onTriggerTool = jest.fn();
        const onAutoSelectChange = jest.fn();
        const onSelectionModeChange = jest.fn();
        const onTransformControlsChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="select"
                onTriggerTool={onTriggerTool}
                selectOptions={{
                    autoSelectEnabled: true,
                    selectionMode: 'layer',
                    showTransformControls: true,
                }}
                onAutoSelectChange={onAutoSelectChange}
                onSelectionModeChange={onSelectionModeChange}
                onTransformControlsChange={onTransformControlsChange}
            />
        );

        fireEvent.click(screen.getByLabelText('Auto-Select'));
        expect(onAutoSelectChange).toHaveBeenCalledWith(false);

        fireEvent.click(screen.getByRole('button', { name: 'Selection mode group' }));
        expect(onSelectionModeChange).toHaveBeenCalledWith('group');

        fireEvent.click(screen.getByLabelText('Show Transform Controls'));
        expect(onTransformControlsChange).toHaveBeenCalledWith(false);
    });

    it('renders and wires paint family controls', () => {
        const onTriggerTool = jest.fn();
        const onPaintPresetChange = jest.fn();
        const onPaintSizeChange = jest.fn();
        const onPaintHardnessChange = jest.fn();
        const onPaintOpacityChange = jest.fn();
        const onPaintFlowChange = jest.fn();
        const onPaintSmoothingChange = jest.fn();
        const onPaintBlendModeChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="paint"
                onTriggerTool={onTriggerTool}
                paintOptions={{
                    brushPreset: 'Pencil',
                    size: 10,
                    hardness: 80,
                    opacity: 100,
                    flow: 100,
                    smoothing: 50,
                    blendMode: 'source-over',
                }}
                onPaintPresetChange={onPaintPresetChange}
                onPaintSizeChange={onPaintSizeChange}
                onPaintHardnessChange={onPaintHardnessChange}
                onPaintOpacityChange={onPaintOpacityChange}
                onPaintFlowChange={onPaintFlowChange}
                onPaintSmoothingChange={onPaintSmoothingChange}
                onPaintBlendModeChange={onPaintBlendModeChange}
            />
        );

        fireEvent.change(screen.getByLabelText('Paint preset'), { target: { value: 'Oil' } });
        expect(onPaintPresetChange).toHaveBeenCalledWith('Oil');

        fireEvent.change(screen.getByLabelText('Paint size'), { target: { value: '25' } });
        expect(onPaintSizeChange).toHaveBeenCalledWith(25);

        fireEvent.change(screen.getByLabelText('Paint hardness'), { target: { value: '60' } });
        expect(onPaintHardnessChange).toHaveBeenCalledWith(60);

        fireEvent.change(screen.getByLabelText('Paint opacity'), { target: { value: '70' } });
        expect(onPaintOpacityChange).toHaveBeenCalledWith(70);

        fireEvent.change(screen.getByLabelText('Paint flow'), { target: { value: '65' } });
        expect(onPaintFlowChange).toHaveBeenCalledWith(65);

        fireEvent.change(screen.getByLabelText('Paint smoothing'), { target: { value: '40' } });
        expect(onPaintSmoothingChange).toHaveBeenCalledWith(40);

        fireEvent.change(screen.getByLabelText('Paint blend mode'), { target: { value: 'multiply' } });
        expect(onPaintBlendModeChange).toHaveBeenCalledWith('multiply');
    });
});
