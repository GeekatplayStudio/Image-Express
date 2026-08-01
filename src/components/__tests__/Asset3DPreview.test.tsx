import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Asset3DPreview from '../Asset3DPreview';

const mockUseGLTF = jest.fn();
const mockSceneClone = jest.fn();

jest.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="mock-three-canvas">{children}</div>
    ),
}));

jest.mock('@react-three/drei', () => ({
    useGLTF: (...args: unknown[]) => mockUseGLTF(...args),
    Center: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="mock-center">{children}</div>
    ),
    Resize: ({ children, scale }: { children: React.ReactNode; scale: number }) => (
        <div data-testid="mock-resize" data-scale={String(scale)}>
            {children}
        </div>
    ),
    Environment: ({ preset }: { preset: string }) => (
        <div data-testid="mock-environment" data-preset={preset} />
    ),
    OrbitControls: ({
        autoRotate,
        autoRotateSpeed,
        enableZoom,
    }: {
        autoRotate?: boolean;
        autoRotateSpeed?: number;
        enableZoom?: boolean;
    }) => (
        <div
            data-testid="mock-orbit-controls"
            data-auto-rotate={String(Boolean(autoRotate))}
            data-auto-rotate-speed={String(autoRotateSpeed)}
            data-enable-zoom={String(Boolean(enableZoom))}
        />
    ),
}));

describe('Asset3DPreview', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockSceneClone.mockReturnValue({ id: 'scene-clone' });
        mockUseGLTF.mockReturnValue({
            scene: {
                clone: mockSceneClone,
            },
        });
    });

    it('loads model and renders three scene helpers', () => {
        const { container } = render(<Asset3DPreview url="/assets/models/robot.glb" />);

        expect(mockUseGLTF).toHaveBeenCalledWith('/assets/models/robot.glb');
        expect(mockSceneClone).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('mock-three-canvas')).toBeInTheDocument();
        expect(screen.getByTestId('mock-resize')).toHaveAttribute('data-scale', '3.5');
        expect(screen.getByTestId('mock-center')).toBeInTheDocument();
        expect(screen.getByTestId('mock-environment')).toHaveAttribute('data-preset', 'city');
        expect(screen.getByTestId('mock-orbit-controls')).toHaveAttribute('data-auto-rotate', 'true');
        expect(screen.getByTestId('mock-orbit-controls')).toHaveAttribute('data-auto-rotate-speed', '3.2');
        // enableZoom defaults to true; this renders without the prop.
        expect(screen.getByTestId('mock-orbit-controls')).toHaveAttribute('data-enable-zoom', 'true');

        // Model renders through a react-three primitive in the mocked canvas tree.
        expect(container.querySelector('primitive')).not.toBeNull();
    });

    it('opens lighting settings and updates slider-controlled values', () => {
        render(<Asset3DPreview url="/assets/models/chair.glb" />);

        fireEvent.click(screen.getByRole('button', { name: /Light/i }));
        expect(screen.getByText('Lighting')).toBeInTheDocument();
        expect(screen.getByText('1.20')).toBeInTheDocument();

        const sliders = screen.getAllByRole('slider');
        expect(sliders).toHaveLength(4);

        fireEvent.change(sliders[0], { target: { value: '2.35' } });
        expect(screen.getByText('2.35')).toBeInTheDocument();

        fireEvent.change(sliders[1], { target: { value: '-3.2' } });
        expect(screen.getByText('-3.2')).toBeInTheDocument();
    });

    it('toggles lighting panel visibility', () => {
        render(<Asset3DPreview url="/assets/models/table.glb" />);

        const button = screen.getByRole('button', { name: /Light/i });
        fireEvent.click(button);
        expect(screen.getByText('Lighting')).toBeInTheDocument();

        fireEvent.click(button);
        expect(screen.queryByText('Lighting')).not.toBeInTheDocument();
    });
});
