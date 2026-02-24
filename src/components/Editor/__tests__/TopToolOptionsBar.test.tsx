import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TopToolOptionsBar from '../TopToolOptionsBar';

describe('TopToolOptionsBar', () => {
    it('renders active tool and only tool-specific quick properties', () => {
        render(<TopToolOptionsBar activeTool="select" />);

        expect(screen.getByTestId('top-tool-options-bar')).toBeInTheDocument();
        expect(screen.getByText('move')).toBeInTheDocument();
        expect(screen.getByText('No quick properties for this tool.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Top option:/i })).not.toBeInTheDocument();
    });

    it('renders and wires select family controls', () => {
        const onAutoSelectChange = jest.fn();
        const onSelectionModeChange = jest.fn();
        const onTransformControlsChange = jest.fn();
        const onSelectFeatherChange = jest.fn();
        const onSelectAntiAliasChange = jest.fn();
        const onSelectionModifyPixelsChange = jest.fn();
        const onSelectionExpand = jest.fn();
        const onSelectionContract = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="select"
                selectOptions={{
                    autoSelectEnabled: true,
                    selectionMode: 'layer',
                    showTransformControls: true,
                    feather: 0,
                    antiAlias: true,
                    modifyPixels: 12,
                }}
                onAutoSelectChange={onAutoSelectChange}
                onSelectionModeChange={onSelectionModeChange}
                onTransformControlsChange={onTransformControlsChange}
                onSelectFeatherChange={onSelectFeatherChange}
                onSelectAntiAliasChange={onSelectAntiAliasChange}
                onSelectionModifyPixelsChange={onSelectionModifyPixelsChange}
                onSelectionExpand={onSelectionExpand}
                onSelectionContract={onSelectionContract}
            />
        );

        fireEvent.click(screen.getByLabelText('Auto-Select'));
        expect(onAutoSelectChange).toHaveBeenCalledWith(false);

        fireEvent.click(screen.getByRole('button', { name: 'Selection mode group' }));
        expect(onSelectionModeChange).toHaveBeenCalledWith('group');

        fireEvent.click(screen.getByLabelText('Show Transform Controls'));
        expect(onTransformControlsChange).toHaveBeenCalledWith(false);

        fireEvent.change(screen.getByLabelText('Select feather'), { target: { value: '24' } });
        expect(onSelectFeatherChange).toHaveBeenCalledWith(24);

        fireEvent.click(screen.getByLabelText('Select anti-alias'));
        expect(onSelectAntiAliasChange).toHaveBeenCalledWith(false);

        fireEvent.change(screen.getByLabelText('Selection modify pixels'), { target: { value: '28' } });
        expect(onSelectionModifyPixelsChange).toHaveBeenCalledWith(28);

        fireEvent.click(screen.getByRole('button', { name: 'Selection expand' }));
        expect(onSelectionExpand).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Selection contract' }));
        expect(onSelectionContract).toHaveBeenCalledTimes(1);
    });

    it('reuses select controls for marquee tool mode', () => {
        const onSelectionModeChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="marquee"
                selectOptions={{
                    autoSelectEnabled: true,
                    selectionMode: 'layer',
                    showTransformControls: true,
                    feather: 0,
                    antiAlias: true,
                }}
                onSelectionModeChange={onSelectionModeChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Selection mode group' }));
        expect(onSelectionModeChange).toHaveBeenCalledWith('group');
    });

    it('reuses select controls for lasso tool mode', () => {
        const onSelectionModeChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="lasso"
                selectOptions={{
                    autoSelectEnabled: true,
                    selectionMode: 'layer',
                    showTransformControls: true,
                    feather: 0,
                    antiAlias: true,
                }}
                onSelectionModeChange={onSelectionModeChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Selection mode group' }));
        expect(onSelectionModeChange).toHaveBeenCalledWith('group');
    });

    it('renders wand threshold controls and emits updates', () => {
        const onWandThresholdChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="wand"
                selectOptions={{
                    autoSelectEnabled: true,
                    selectionMode: 'layer',
                    showTransformControls: true,
                    feather: 0,
                    antiAlias: true,
                }}
                wandOptions={{
                    threshold: 48,
                }}
                onWandThresholdChange={onWandThresholdChange}
            />
        );

        fireEvent.change(screen.getByLabelText('Wand threshold'), { target: { value: '72' } });
        expect(onWandThresholdChange).toHaveBeenCalledWith(72);
    });

    it('renders and wires healing brush bootstrap controls', () => {
        const onHealingSizeChange = jest.fn();
        const onHealingHardnessChange = jest.fn();
        const onHealingSampleAllLayersChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="healing"
                healingOptions={{
                    size: 24,
                    hardness: 70,
                    sampleAllLayers: true,
                }}
                onHealingSizeChange={onHealingSizeChange}
                onHealingHardnessChange={onHealingHardnessChange}
                onHealingSampleAllLayersChange={onHealingSampleAllLayersChange}
            />
        );

        fireEvent.change(screen.getByLabelText('Healing size'), { target: { value: '36' } });
        expect(onHealingSizeChange).toHaveBeenCalledWith(36);

        fireEvent.change(screen.getByLabelText('Healing hardness'), { target: { value: '45' } });
        expect(onHealingHardnessChange).toHaveBeenCalledWith(45);

        fireEvent.click(screen.getByLabelText('Healing sample all layers'));
        expect(onHealingSampleAllLayersChange).toHaveBeenCalledWith(false);
    });

    it('renders and wires clone stamp bootstrap controls', () => {
        const onCloneSizeChange = jest.fn();
        const onCloneHardnessChange = jest.fn();
        const onCloneAlignedChange = jest.fn();
        const onCloneSampleAllLayersChange = jest.fn();
        const onCloneClearSource = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="clone-stamp"
                cloneOptions={{
                    size: 20,
                    hardness: 60,
                    aligned: true,
                    sampleAllLayers: true,
                    hasSource: true,
                }}
                onCloneSizeChange={onCloneSizeChange}
                onCloneHardnessChange={onCloneHardnessChange}
                onCloneAlignedChange={onCloneAlignedChange}
                onCloneSampleAllLayersChange={onCloneSampleAllLayersChange}
                onCloneClearSource={onCloneClearSource}
            />
        );

        fireEvent.change(screen.getByLabelText('Clone size'), { target: { value: '42' } });
        expect(onCloneSizeChange).toHaveBeenCalledWith(42);

        fireEvent.change(screen.getByLabelText('Clone hardness'), { target: { value: '33' } });
        expect(onCloneHardnessChange).toHaveBeenCalledWith(33);

        fireEvent.click(screen.getByLabelText('Clone aligned'));
        expect(onCloneAlignedChange).toHaveBeenCalledWith(false);

        fireEvent.click(screen.getByLabelText('Clone sample all layers'));
        expect(onCloneSampleAllLayersChange).toHaveBeenCalledWith(false);

        fireEvent.click(screen.getByRole('button', { name: 'Clone clear source' }));
        expect(onCloneClearSource).toHaveBeenCalledTimes(1);
    });

    it('renders and wires paint family controls', () => {
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

        fireEvent.change(screen.getByLabelText('Paint preset'), { target: { value: 'Pencil' } });
        expect(onPaintPresetChange).toHaveBeenCalledWith('Pencil');

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

    it('renders and wires gradient family controls', () => {
        const onGradientTypeChange = jest.fn();
        const onGradientBlendModeChange = jest.fn();
        const onGradientOpacityChange = jest.fn();
        const onGradientReverseChange = jest.fn();
        const onGradientDitherChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="gradient"
                gradientOptions={{
                    type: 'linear',
                    blendMode: 'source-over',
                    opacity: 100,
                    reverse: false,
                    dither: false,
                }}
                onGradientTypeChange={onGradientTypeChange}
                onGradientBlendModeChange={onGradientBlendModeChange}
                onGradientOpacityChange={onGradientOpacityChange}
                onGradientReverseChange={onGradientReverseChange}
                onGradientDitherChange={onGradientDitherChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Gradient type radial' }));
        expect(onGradientTypeChange).toHaveBeenCalledWith('radial');

        fireEvent.click(screen.getByRole('button', { name: 'Gradient type angle' }));
        expect(onGradientTypeChange).toHaveBeenCalledWith('angle');

        fireEvent.change(screen.getByLabelText('Gradient blend mode'), { target: { value: 'screen' } });
        expect(onGradientBlendModeChange).toHaveBeenCalledWith('screen');

        fireEvent.change(screen.getByLabelText('Gradient opacity'), { target: { value: '72' } });
        expect(onGradientOpacityChange).toHaveBeenCalledWith(72);

        fireEvent.click(screen.getByLabelText('Gradient reverse'));
        expect(onGradientReverseChange).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByLabelText('Gradient dither'));
        expect(onGradientDitherChange).toHaveBeenCalledWith(true);
    });

    it('renders and wires pen family path/shape controls', () => {
        const onPenModeChange = jest.fn();
        const onPenPathOperationChange = jest.fn();
        const onPenAutoAddDeleteChange = jest.fn();
        const onPenRubberBandChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="pen"
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

    it('renders and wires shape family controls', () => {
        const onShapeModeChange = jest.fn();
        const onShapeFillColorChange = jest.fn();
        const onShapeStrokeColorChange = jest.fn();
        const onShapeStrokeWidthChange = jest.fn();
        const onShapeFixedSizeChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="shapes"
                shapeOptions={{
                    mode: 'shape',
                    fillColor: '#8b5cf6',
                    strokeColor: '#111827',
                    strokeWidth: 2,
                    fixedSize: false,
                }}
                onShapeModeChange={onShapeModeChange}
                onShapeFillColorChange={onShapeFillColorChange}
                onShapeStrokeColorChange={onShapeStrokeColorChange}
                onShapeStrokeWidthChange={onShapeStrokeWidthChange}
                onShapeFixedSizeChange={onShapeFixedSizeChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Shape mode path' }));
        expect(onShapeModeChange).toHaveBeenCalledWith('path');

        fireEvent.click(screen.getByRole('button', { name: 'Shape mode pixels' }));
        expect(onShapeModeChange).toHaveBeenCalledWith('pixels');

        fireEvent.change(screen.getByLabelText('Shape fill color'), { target: { value: '#112233' } });
        expect(onShapeFillColorChange).toHaveBeenCalledWith('#112233');

        fireEvent.change(screen.getByLabelText('Shape stroke color'), { target: { value: '#445566' } });
        expect(onShapeStrokeColorChange).toHaveBeenCalledWith('#445566');

        fireEvent.change(screen.getByLabelText('Shape stroke width'), { target: { value: '11' } });
        expect(onShapeStrokeWidthChange).toHaveBeenCalledWith(11);

        fireEvent.click(screen.getByLabelText('Shape fixed size'));
        expect(onShapeFixedSizeChange).toHaveBeenCalledWith(true);
    });

    it('renders and wires text font family selector', () => {
        const onTextFontFamilyChange = jest.fn();
        const onTextFontStyleChange = jest.fn();
        const onTextFontSizeChange = jest.fn();
        const onTextColorChange = jest.fn();
        const onTextBoldChange = jest.fn();
        const onTextItalicChange = jest.fn();
        const onTextUnderlineChange = jest.fn();
        const onTextAlignChange = jest.fn();

        render(
            <TopToolOptionsBar
                activeTool="text"
                textOptions={{
                    fontFamily: 'Arial',
                    fontFamilies: ['Arial', 'Georgia'],
                    fontStyle: 'normal',
                    fontStyles: ['normal', 'bold'],
                    fontSize: 40,
                    color: '#000000',
                    bold: false,
                    italic: false,
                    underline: false,
                    align: 'left',
                }}
                onTextFontFamilyChange={onTextFontFamilyChange}
                onTextFontStyleChange={onTextFontStyleChange}
                onTextFontSizeChange={onTextFontSizeChange}
                onTextColorChange={onTextColorChange}
                onTextBoldChange={onTextBoldChange}
                onTextItalicChange={onTextItalicChange}
                onTextUnderlineChange={onTextUnderlineChange}
                onTextAlignChange={onTextAlignChange}
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

        fireEvent.change(screen.getByLabelText('Text color'), {
            target: { value: '#112233' },
        });

        expect(onTextColorChange).toHaveBeenCalledWith('#112233');

        fireEvent.click(screen.getByRole('button', { name: 'Text toggle bold' }));
        expect(onTextBoldChange).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByRole('button', { name: 'Text toggle italic' }));
        expect(onTextItalicChange).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByRole('button', { name: 'Text toggle underline' }));
        expect(onTextUnderlineChange).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByRole('button', { name: 'Text align center' }));
        expect(onTextAlignChange).toHaveBeenCalledWith('center');

        fireEvent.click(screen.getByRole('button', { name: 'Text align right' }));
        expect(onTextAlignChange).toHaveBeenCalledWith('right');

        fireEvent.click(screen.getByRole('button', { name: 'Text align justify' }));
        expect(onTextAlignChange).toHaveBeenCalledWith('justify');

        fireEvent.click(screen.getByRole('button', { name: 'Text align left' }));
        expect(onTextAlignChange).toHaveBeenCalledWith('left');
    });

    it('renders and wires crop/eyedropper/zoom/hand utility controls', () => {
        const onCropRatioPresetChange = jest.fn();
        const onCropDeleteOutsideChange = jest.fn();
        const onCropUseArtboardBoundsChange = jest.fn();
        const onCropApply = jest.fn();
        const onEyedropperSampleSizeChange = jest.fn();
        const onEyedropperSampleSourceChange = jest.fn();
        const onEyedropperSample = jest.fn();
        const onZoomModeChange = jest.fn();
        const onZoomStepChange = jest.fn();
        const onZoomApply = jest.fn();
        const onZoomFitToScreen = jest.fn();
        const onZoomReset = jest.fn();
        const onHandLockPanChange = jest.fn();

        const { rerender } = render(
            <TopToolOptionsBar
                activeTool="crop"
                cropOptions={{ ratioPreset: 'free', deleteOutside: false, useArtboardBounds: true }}
                onCropRatioPresetChange={onCropRatioPresetChange}
                onCropDeleteOutsideChange={onCropDeleteOutsideChange}
                onCropUseArtboardBoundsChange={onCropUseArtboardBoundsChange}
                onCropApply={onCropApply}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Crop ratio 1:1' }));
        expect(onCropRatioPresetChange).toHaveBeenCalledWith('1:1');

        fireEvent.click(screen.getByLabelText('Crop delete outside'));
        expect(onCropDeleteOutsideChange).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByLabelText('Crop use artboard bounds'));
        expect(onCropUseArtboardBoundsChange).toHaveBeenCalledWith(false);

        fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));
        expect(onCropApply).toHaveBeenCalledTimes(1);

        rerender(
            <TopToolOptionsBar
                activeTool="eyedropper"
                eyedropperOptions={{ sampleSize: 1, sampleSource: 'current-layer', sampledColor: '#112233' }}
                onEyedropperSampleSizeChange={onEyedropperSampleSizeChange}
                onEyedropperSampleSourceChange={onEyedropperSampleSourceChange}
                onEyedropperSample={onEyedropperSample}
            />
        );

        fireEvent.change(screen.getByLabelText('Eyedropper sample size'), { target: { value: '5' } });
        expect(onEyedropperSampleSizeChange).toHaveBeenCalledWith(5);

        fireEvent.change(screen.getByLabelText('Eyedropper sample source'), { target: { value: 'all-layers' } });
        expect(onEyedropperSampleSourceChange).toHaveBeenCalledWith('all-layers');

        fireEvent.click(screen.getByRole('button', { name: 'Eyedropper sample' }));
        expect(onEyedropperSample).toHaveBeenCalledTimes(1);

        rerender(
            <TopToolOptionsBar
                activeTool="zoom"
                zoomOptions={{ mode: 'in', step: 10, zoomPercent: 125 }}
                onZoomModeChange={onZoomModeChange}
                onZoomStepChange={onZoomStepChange}
                onZoomApply={onZoomApply}
                onZoomFitToScreen={onZoomFitToScreen}
                onZoomReset={onZoomReset}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Zoom mode out' }));
        expect(onZoomModeChange).toHaveBeenCalledWith('out');

        fireEvent.change(screen.getByLabelText('Zoom step'), { target: { value: '25' } });
        expect(onZoomStepChange).toHaveBeenCalledWith(25);

        fireEvent.click(screen.getByRole('button', { name: 'Zoom apply' }));
        expect(onZoomApply).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Zoom fit to screen' }));
        expect(onZoomFitToScreen).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Zoom reset' }));
        expect(onZoomReset).toHaveBeenCalledTimes(1);

        rerender(
            <TopToolOptionsBar
                activeTool="hand"
                handOptions={{ lockPan: true }}
                onHandLockPanChange={onHandLockPanChange}
            />
        );

        fireEvent.click(screen.getByLabelText('Hand lock pan'));
        expect(onHandLockPanChange).toHaveBeenCalledWith(false);
    });
});
