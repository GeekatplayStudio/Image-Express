import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ComfyMaskEditor from '../ComfyMaskEditor';

const createMockContext = () => {
    const pixelCount = 8 * 8 * 4;
    const paintedData = new Uint8ClampedArray(pixelCount);
    for (let index = 3; index < pixelCount; index += 4) {
        paintedData[index] = 255;
    }

    return {
        save: jest.fn(),
        restore: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
        clearRect: jest.fn(),
        fillRect: jest.fn(),
        drawImage: jest.fn(),
        putImageData: jest.fn(),
        getImageData: jest.fn(() => ({ data: paintedData, width: 8, height: 8 })),
        createImageData: jest.fn((width: number, height: number) => ({
            data: new Uint8ClampedArray(width * height * 4),
            width,
            height,
        })),
        globalCompositeOperation: 'source-over',
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
    };
};

describe('ComfyMaskEditor', () => {
    let getContextSpy: jest.SpyInstance;
    let toDataURLSpy: jest.SpyInstance;

    beforeEach(() => {
        getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockImplementation(() => createMockContext() as unknown as CanvasRenderingContext2D);
        toDataURLSpy = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
            .mockReturnValue('data:image/png;base64,mock-mask');
    });

    afterEach(() => {
        getContextSpy.mockRestore();
        toDataURLSpy.mockRestore();
    });

    it('renders tools and disables Apply until something is painted', () => {
        render(
            <ComfyMaskEditor
                sourceDataUrl="data:image/png;base64,source"
                width={8}
                height={8}
                onApply={jest.fn()}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByText('Paint Inpaint Mask')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Paint/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Erase/ })).toBeInTheDocument();
        expect(screen.getByLabelText('Mask brush size')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Apply Mask/ })).toBeDisabled();
    });

    it('exports a mask after Fill All and calls onApply', () => {
        const onApply = jest.fn();
        render(
            <ComfyMaskEditor
                sourceDataUrl="data:image/png;base64,source"
                width={8}
                height={8}
                onApply={onApply}
                onCancel={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Fill All/ }));

        const applyButton = screen.getByRole('button', { name: /Apply Mask/ });
        expect(applyButton).toBeEnabled();

        fireEvent.click(applyButton);
        expect(onApply).toHaveBeenCalledWith('data:image/png;base64,mock-mask');
    });

    it('clears strokes and disables Apply again', () => {
        render(
            <ComfyMaskEditor
                sourceDataUrl="data:image/png;base64,source"
                width={8}
                height={8}
                onApply={jest.fn()}
                onCancel={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Fill All/ }));
        expect(screen.getByRole('button', { name: /Apply Mask/ })).toBeEnabled();

        fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
        expect(screen.getByRole('button', { name: /Apply Mask/ })).toBeDisabled();
    });

    it('cancels without applying', () => {
        const onApply = jest.fn();
        const onCancel = jest.fn();
        render(
            <ComfyMaskEditor
                sourceDataUrl="data:image/png;base64,source"
                width={8}
                height={8}
                onApply={onApply}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
        expect(onCancel).toHaveBeenCalled();
        expect(onApply).not.toHaveBeenCalled();
    });
});
