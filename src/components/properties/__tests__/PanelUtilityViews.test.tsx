import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NavigatorPanelView } from '../PanelUtilityViews';

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
