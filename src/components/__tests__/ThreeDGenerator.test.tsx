import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ThreeDGenerator from '../ThreeDGenerator';

jest.mock('next/image', () => ({
    __esModule: true,
    default: ({ fill, unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean }) => {
        void fill;
        void unoptimized;
        // eslint-disable-next-line @next/next/no-img-element
        return <img {...props} alt={props.alt || ''} />;
    },
}));

jest.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-three-canvas">{children}</div>,
    useThree: () => ({
        gl: {},
        scene: {},
        camera: { aspect: 1, updateProjectionMatrix: jest.fn() },
    }),
}));

jest.mock('@react-three/drei', () => ({
    OrbitControls: () => null,
    Stage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useGLTF: () => ({ scene: { traverse: jest.fn() } }),
    ContactShadows: () => null,
}));

const mockToast = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({
    useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/providers/DialogProvider', () => ({
    useDialog: () => ({ confirm: jest.fn() }),
}));

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('@/lib/apiErrorParsing', () => ({
    parseApiResponse: jest.fn(),
    extractApiErrorMessage: jest.fn(() => 'Meshy request failed'),
}));

describe('ThreeDGenerator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        window.localStorage.setItem('meshy_api_key', 'test-meshy-key');
        (global.fetch as jest.Mock) = jest.fn();
    });

    it('ignores rapid repeated Meshy submissions while the first request is in flight', async () => {
        (global.fetch as jest.Mock).mockReturnValueOnce(new Promise(() => undefined));

        render(
            <ThreeDGenerator
                onAddToCanvas={jest.fn()}
                onClose={jest.fn()}
                onStartBackgroundJob={jest.fn()}
            />
        );

        fireEvent.change(screen.getByPlaceholderText(/A cute ceramic cat/i), {
            target: { value: 'A toy robot' },
        });

        const submitButton = screen.getByRole('button', { name: /Generate 3D Model/i });

        await act(async () => {
            submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith('/api/ai/meshy?endpoint=text-to-3d', expect.objectContaining({
            method: 'POST',
        }));
    });

    it('keeps Hitems back preview controls visible in single-image mode', async () => {
        window.localStorage.setItem('image-express-3d-provider', 'hitems');
        window.localStorage.setItem('hitems_api_key', 'ak_test:sk_test');
        window.localStorage.setItem('hitems_back_layer_id', 'back-layer');

        render(
            <ThreeDGenerator
                onAddToCanvas={jest.fn()}
                onClose={jest.fn()}
                onStartBackgroundJob={jest.fn()}
                initialImage="/front.png"
                layerImageOptions={[
                    { id: 'front-layer', label: 'Front art', imageUrl: '/front-layer.png' },
                    { id: 'back-layer', label: 'Back art', imageUrl: '/back-layer.png' },
                ]}
            />
        );

        expect(await screen.findByText('Back Preview')).toBeInTheDocument();
        expect(screen.getByText('Saved for multi-view')).toBeInTheDocument();
        expect(screen.getByText('Back Layer')).toBeInTheDocument();
        expect(screen.getByAltText('Back layer preview')).toHaveAttribute('src', '/back-layer.png');
        expect(screen.getByText(/Back artwork stays visible here/i)).toBeInTheDocument();
    });
});
