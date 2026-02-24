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

    it('renders and wires pen family path/shape controls', () => {
        const onTriggerTool = jest.fn();
        const onPenModeChange = jest.fn();
        const onPenPathOperationChange = jest.fn();
        const onPenAutoAddDeleteChange = jest.fn();
        const onPenRubberBandChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="pen"
                onTriggerTool={onTriggerTool}
                penOptions={{ mode: 'path', pathOperation: 'add', autoAddDelete: true, rubberBand: true }}
                onPenModeChange={onPenModeChange}
                onPenPathOperationChange={onPenPathOperationChange}
                onPenAutoAddDeleteChange={onPenAutoAddDeleteChange}
                onPenRubberBandChange={onPenRubberBandChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Pen mode shape' }));
        expect(onPenModeChange).toHaveBeenCalledWith('shape');

        fireEvent.click(screen.getByRole('button', { name: 'Pen mode path' }));
        expect(onPenModeChange).toHaveBeenCalledWith('path');

        fireEvent.click(screen.getByRole('button', { name: 'Pen operation subtract' }));
        expect(onPenPathOperationChange).toHaveBeenCalledWith('subtract');

        fireEvent.click(screen.getByRole('button', { name: 'Pen operation intersect' }));
        expect(onPenPathOperationChange).toHaveBeenCalledWith('intersect');

        fireEvent.click(screen.getByRole('button', { name: 'Pen operation add' }));
        expect(onPenPathOperationChange).toHaveBeenCalledWith('add');

        fireEvent.click(screen.getByLabelText('Pen auto add delete'));
        expect(onPenAutoAddDeleteChange).toHaveBeenCalledWith(false);

        fireEvent.click(screen.getByLabelText('Pen rubber band'));
        expect(onPenRubberBandChange).toHaveBeenCalledWith(false);
    });

    it('renders and wires text font family selector', () => {
        const onTriggerTool = jest.fn();
        const onTextFontFamilyChange = jest.fn();
        const onTextFontStyleChange = jest.fn();
        const onTextFontSizeChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="text"
                onTriggerTool={onTriggerTool}
                textOptions={{
                    fontFamily: 'Arial',
                    fontFamilies: ['Arial', 'Georgia'],
                    fontStyle: 'normal',
                    fontStyles: ['normal', 'bold'],
                    fontSize: 40,
                }}
                onTextFontFamilyChange={onTextFontFamilyChange}
                onTextFontStyleChange={onTextFontStyleChange}
                onTextFontSizeChange={onTextFontSizeChange}
            />
        );

        fireEvent.change(screen.getByLabelText('Text font family'), {
            target: { value: 'Georgia' },
        });

        expect(onTextFontFamilyChange).toHaveBeenCalledWith('Georgia');

        fireEvent.change(screen.getByLabelText('Text font style'), {
            target: { value: 'bold' },
        });

        expect(onTextFontStyleChange).toHaveBeenCalledWith('bold');

        fireEvent.change(screen.getByLabelText('Text font size'), {
            target: { value: '72' },
        });

        expect(onTextFontSizeChange).toHaveBeenCalledWith(72);
    });
});
