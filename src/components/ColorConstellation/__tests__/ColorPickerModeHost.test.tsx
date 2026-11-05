import { render, screen } from '@testing-library/react';
import ColorPickerModeHost from '@/components/ColorConstellation/ColorPickerModeHost';

jest.mock('@/components/ColorWheelTool', () => ({
    __esModule: true,
    default: ({ variant }: { variant?: string }) => <div data-testid="wheel" data-variant={variant} />,
}));
jest.mock('@/components/ColorConstellation/ColorConstellationPicker', () => ({
    __esModule: true,
    default: ({ variant }: { variant?: string }) => <div data-testid="constellation" data-variant={variant} />,
}));

describe('ColorPickerModeHost', () => {
    beforeEach(() => window.localStorage.clear());

    it('is the positioned panel in the floating variant, with the mode switch inside it', () => {
        render(<ColorPickerModeHost variant="floating" onColorSelect={jest.fn()} currentPalette={null} onPaletteSelect={jest.fn()} />);
        const host = screen.getByTestId('color-picker-mode-host');
        expect(host.className).toContain('fixed');
        expect(host.className).toContain('overflow-y-auto');
        expect(host).toContainElement(screen.getByRole('tab', { name: 'Classic wheel' }));
        // the picker inside renders in its in-panel form; the host owns positioning
        expect(screen.getByTestId('constellation')).toHaveAttribute('data-variant', 'panel');
    });

    it('stays in normal flow inside the properties panel', () => {
        render(<ColorPickerModeHost variant="panel" onColorSelect={jest.fn()} currentPalette={null} onPaletteSelect={jest.fn()} />);
        expect(screen.getByTestId('color-picker-mode-host').className).not.toContain('fixed');
    });
});
