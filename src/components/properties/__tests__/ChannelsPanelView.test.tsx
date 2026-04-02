import { fireEvent, render, screen } from '@testing-library/react';
import { ChannelsPanelView } from '../ChannelsPanelView';

jest.mock('../channelEditing', () => {
    const actual = jest.requireActual('../channelEditing');
    return {
        ...actual,
        buildChannelPreviewDataUrl: jest.fn(() => 'data:image/png;base64,preview'),
    };
});

describe('ChannelsPanelView', () => {
    it('renders a guidance message when no supported selection exists', () => {
        render(<ChannelsPanelView supportedTarget="none" />);

        expect(screen.getByText('Channels')).toBeInTheDocument();
        expect(screen.getByText(/Select an image or a fillable layer/i)).toBeInTheDocument();
        expect(screen.getByText(/luminosity/i)).toBeInTheDocument();
    });

    it('invokes isolate, value edit, opacity, and mask actions for color targets', () => {
        const onApplyMode = jest.fn();
        const onSetChannelValue = jest.fn();
        const onChangeControls = jest.fn();

        render(
            <ChannelsPanelView
                supportedTarget="color"
                selectionLabel="Rectangle"
                previewSource={{ kind: 'color', color: '#336699', opacity: 0.5 }}
                currentColor="#336699"
                currentOpacity={0.5}
                appliedState={{
                    mode: 'composite',
                    target: 'composite',
                    opacities: { r: 1, g: 1, b: 1, a: 1, lum: 0 },
                    masks: { r: false, g: false, b: false, a: false, lum: false },
                }}
                onApplyMode={onApplyMode}
                onSetChannelValue={onSetChannelValue}
                onChangeControls={onChangeControls}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Red/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Isolate' }));
        expect(onApplyMode).toHaveBeenCalledWith('r', 'isolate', {
            opacities: { r: 1, g: 1, b: 1, a: 1, lum: 0 },
            masks: { r: false, g: false, b: false, a: false, lum: false },
        });

        fireEvent.change(screen.getByLabelText('Adjust r channel'), { target: { value: '140' } });
        expect(onSetChannelValue).toHaveBeenCalledWith('r', 140, {
            opacities: { r: 1, g: 1, b: 1, a: 1, lum: 0 },
            masks: { r: false, g: false, b: false, a: false, lum: false },
        });

        fireEvent.change(screen.getByLabelText('Adjust r opacity'), { target: { value: '35' } });
        expect(onChangeControls).toHaveBeenCalledWith({
            opacities: { r: 0.35, g: 1, b: 1, a: 1, lum: 0 },
            masks: { r: false, g: false, b: false, a: false, lum: false },
        });

        fireEvent.click(screen.getByLabelText('Mask r channel'));
        expect(onChangeControls).toHaveBeenCalledWith({
            opacities: { r: 1, g: 1, b: 1, a: 1, lum: 0 },
            masks: { r: true, g: false, b: false, a: false, lum: false },
        });
    });

    it('renders reset action and luminosity mask action for image targets when a channel filter is active', () => {
        const onResetComposite = jest.fn();
        const onApplyMode = jest.fn();

        render(
            <ChannelsPanelView
                supportedTarget="image"
                selectionLabel="Generated asset"
                previewSource={{ kind: 'image', element: document.createElement('canvas') }}
                appliedState={{
                    mode: 'invert',
                    target: 'g',
                    opacities: { r: 1, g: 0.5, b: 1, a: 1, lum: 0.25 },
                    masks: { r: false, g: false, b: false, a: false, lum: false },
                }}
                onApplyMode={onApplyMode}
                onResetComposite={onResetComposite}
            />,
        );

        expect(screen.getByText('invert')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Luminosity/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Mask' }));
        expect(onApplyMode).toHaveBeenCalledWith('lum', 'mask', {
            opacities: { r: 1, g: 0.5, b: 1, a: 1, lum: 0.25 },
            masks: { r: false, g: false, b: false, a: false, lum: false },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Reset To Composite' }));
        expect(onResetComposite).toHaveBeenCalledTimes(1);
    });
});