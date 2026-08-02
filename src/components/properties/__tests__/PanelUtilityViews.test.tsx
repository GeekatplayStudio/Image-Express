import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ColorPanelView, ComingSoonPanelView, NavigatorPanelView, SwatchesPanelView } from '../PanelUtilityViews';

jest.mock('../../ColorConstellation/ColorPickerModeHost', () => ({
    __esModule: true,
    default: ({ onColorSelect }: { onColorSelect?: (color: string) => void }) => (
        <button type="button" onClick={() => onColorSelect?.('#445566')}>
            Mock wheel apply
        </button>
    ),
}));

jest.mock('../../ColorWheelTool', () => ({
    ColorWheelTool: ({ onColorSelect }: { onColorSelect?: (color: string) => void }) => (
        <button type="button" onClick={() => onColorSelect?.('#445566')}>
            Mock wheel apply
        </button>
    ),
}));

describe('NavigatorPanelView', () => {
    it('maps minimap clicks to scene coordinates', () => {
        const onNavigate = jest.fn();

        render(
            <NavigatorPanelView
                zoom={1}
                canvasWidth={1200}
                canvasHeight={800}
                navigatorWorld={{ left: 100, top: 200, width: 1000, height: 600 }}
                navigatorViewport={{ left: 350, top: 260, width: 420, height: 280 }}
                navigatorObjects={[
                    { left: 140, top: 220, width: 140, height: 80 },
                    { left: 700, top: 420, width: 220, height: 160 },
                ]}
                onNavigate={onNavigate}
            />
        );

        const minimap = screen.getByRole('button', { name: 'Navigator minimap' });
        Object.defineProperty(minimap, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                x: 20,
                y: 40,
                left: 20,
                top: 40,
                right: 220,
                bottom: 140,
                width: 200,
                height: 100,
                toJSON: () => ({}),
            }),
        });

        fireEvent.click(minimap, { clientX: 120, clientY: 90 });

        expect(onNavigate).toHaveBeenCalledWith(600, 500);
        expect(screen.getByText('Click preview to center the viewport.')).toBeInTheDocument();
    });

    it('renders a thumbnail preview image when snapshot data is available', () => {
        render(
            <NavigatorPanelView
                zoom={1}
                canvasWidth={1200}
                canvasHeight={800}
                navigatorWorld={{ left: 0, top: 0, width: 1200, height: 800 }}
                navigatorViewport={{ left: 120, top: 80, width: 480, height: 320 }}
                navigatorPreviewDataUrl="data:image/png;base64,preview"
                navigatorObjects={[
                    { left: 140, top: 220, width: 140, height: 80 },
                ]}
            />
        );

        expect(screen.getByRole('img', { name: 'Navigator preview' })).toHaveAttribute('src', 'data:image/png;base64,preview');
    });

    it('preserves canvas aspect ratio in minimap dimensions', () => {
        const { rerender } = render(
            <NavigatorPanelView
                zoom={1}
                canvasWidth={1920}
                canvasHeight={1080}
                navigatorWorld={{ left: 0, top: 0, width: 1920, height: 1080 }}
            />
        );

        const wideMinimap = screen.getByRole('button', { name: 'Navigator minimap' });
        expect(wideMinimap).toHaveStyle({ width: '180px', height: '101px' });

        rerender(
            <NavigatorPanelView
                zoom={1}
                canvasWidth={800}
                canvasHeight={1200}
                navigatorWorld={{ left: 0, top: 0, width: 800, height: 1200 }}
            />
        );

        const tallMinimap = screen.getByRole('button', { name: 'Navigator minimap' });
        expect(tallMinimap).toHaveStyle({ width: '120px', height: '180px' });
    });
});

describe('ColorPanelView', () => {
    it('updates profile hint and forwards mode changes', () => {
        const onColorModeChange = jest.fn();

        render(
            <ColorPanelView
                color="#6699cc"
                colorMode="RGB"
                hasEditableTarget={false}
                onColorModeChange={onColorModeChange}
            />
        );

        expect(screen.getByText('Web standard profile for display work')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Color profile'), { target: { value: 'Adobe RGB' } });
        expect(screen.getByText('Wider-gamut display profile preview')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Color mode CMYK' }));
        expect(onColorModeChange).toHaveBeenCalledWith('CMYK');
    });

    it('applies RGB edits to the selected layer and supports wheel updates', () => {
        const onColorChange = jest.fn();

        render(
            <ColorPanelView
                color="#112233"
                colorMode="RGB"
                hasEditableTarget={true}
                onColorModeChange={() => {}}
                onColorChange={onColorChange}
            />
        );

        fireEvent.change(screen.getByLabelText('RGB R'), { target: { value: '255' } });
        expect(onColorChange).toHaveBeenCalledWith('#ff2233');

        fireEvent.click(screen.getByRole('button', { name: 'Mock wheel apply' }));
        expect(onColorChange).toHaveBeenLastCalledWith('#445566');
    });
});

describe('SwatchesPanelView', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('persists group and swatch CRUD to localStorage and rehydrates saved groups', async () => {
        const onApplySwatch = jest.fn();
        const { unmount } = render(
            <SwatchesPanelView
                hasEditableTarget={true}
                currentColor="#123456"
                onApplySwatch={onApplySwatch}
            />
        );

        fireEvent.change(screen.getByLabelText('New swatch group name'), { target: { value: 'Brand Colors' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add Group' }));

        fireEvent.change(screen.getByLabelText('Add swatch hex value'), { target: { value: '#ABC' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add Hex' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Current' }));

        const currentSwatch = screen.getByRole('button', { name: 'Swatch #123456' });
        fireEvent.click(currentSwatch);
        expect(onApplySwatch).toHaveBeenCalledWith('#123456');

        fireEvent.click(screen.getAllByTitle('Remove swatch')[0]);

        await waitFor(() => {
            const stored = JSON.parse(window.localStorage.getItem('swatch-groups-v1') || '[]');
            expect(stored).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Brand Colors',
                        colors: ['#aabbcc'],
                    }),
                ])
            );
        });

        unmount();

        render(
            <SwatchesPanelView
                hasEditableTarget={true}
                currentColor="#123456"
                onApplySwatch={onApplySwatch}
            />
        );

        expect(screen.getByDisplayValue('Brand Colors')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Swatch #AABBCC' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Swatch #123456' })).not.toBeInTheDocument();
    });

    it('hydrates grouped swatches from legacy palette storage', () => {
        window.localStorage.setItem('userParams.palettes', JSON.stringify([
            { name: 'Legacy Group', colors: ['#ff8800', 'invalid', '#00aa11'] },
        ]));

        render(
            <SwatchesPanelView
                hasEditableTarget={true}
                currentColor="#123456"
                onApplySwatch={() => {}}
            />
        );

        expect(screen.getByDisplayValue('Legacy Group')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Swatch #FF8800' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Swatch #00AA11' })).toBeInTheDocument();
    });
});

describe('ComingSoonPanelView', () => {
    it('renders generic coming-soon messaging', () => {
        render(
            <ComingSoonPanelView
                title="Future Panel"
                description="This utility is still in progress."
            />
        );

        expect(screen.getByText('Future Panel')).toBeInTheDocument();
        expect(screen.getByText('Soon')).toBeInTheDocument();
        expect(screen.getByText(/still in progress/i)).toBeInTheDocument();
    });
});
