import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import HelpPopup from '../HelpPopup';

const mockUseEscapeKey = jest.fn();

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseEscapeKey(...args),
}));

describe('HelpPopup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns null when closed', () => {
        const { container } = render(<HelpPopup isOpen={false} onClose={jest.fn()} type="comfy" />);
        expect(container.firstChild).toBeNull();
        expect(mockUseEscapeKey).toHaveBeenCalledWith(expect.any(Function), { enabled: false });
    });

    it('renders ComfyUI setup content and closes via actions', () => {
        const onClose = jest.fn();
        render(<HelpPopup isOpen onClose={onClose} type="comfy" />);

        expect(screen.getByText('How to setup ComfyUI')).toBeInTheDocument();
        expect(screen.getByText('ComfyUI GitHub')).toBeInTheDocument();
        expect(screen.getByText('run_nvidia_gpu.bat')).toBeInTheDocument();
        expect(screen.getByText('Connection Issues:')).toBeInTheDocument();
        expect(screen.getByText('--enable-cors-header')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getAllByRole('button')[0]);
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('renders API key content and wires escape handler', () => {
        const onClose = jest.fn();
        render(<HelpPopup isOpen onClose={onClose} type="api" />);

        expect(screen.getByText('Getting an API Key')).toBeInTheDocument();
        expect(screen.getByText('Option A: Meshy (3D)')).toBeInTheDocument();
        expect(screen.getByText('Option B: Stability AI (2D)')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Get Meshy Key' })).toHaveAttribute('href', 'https://www.meshy.ai/');
        expect(screen.getByRole('link', { name: 'Get Stability Key' })).toHaveAttribute('href', 'https://platform.stability.ai/');

        const [handler, options] = mockUseEscapeKey.mock.calls[0];
        expect(options).toEqual({ enabled: true });
        (handler as () => void)();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
