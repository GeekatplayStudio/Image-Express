import * as fabric from 'fabric';
import {
    buildMaskGradientFill,
    DEFAULT_MASK_GRADIENT_SETTINGS,
    mergeMaskGradientSettings,
    readMaskGradientSettings,
} from '../maskGradientUtils';

describe('maskGradientUtils', () => {
    it('returns default settings for solid clip masks', () => {
        const clipPath = {
            fill: '#ffffff',
        } as unknown as fabric.Object;

        expect(readMaskGradientSettings(clipPath)).toEqual(DEFAULT_MASK_GRADIENT_SETTINGS);
    });

    it('reads linear mask gradient settings from gradient color stops and coords', () => {
        const clipPath = {
            fill: {
                type: 'linear',
                coords: { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
                colorStops: [
                    { offset: 0, color: 'rgba(255,255,255,1)' },
                    { offset: 1, color: 'rgba(255,255,255,0.25)' },
                ],
            },
        } as unknown as fabric.Object;

        expect(readMaskGradientSettings(clipPath)).toEqual({
            enabled: true,
            type: 'linear',
            angle: 90,
            startOpacity: 1,
            endOpacity: 0.25,
        });
    });

    it('builds a radial gradient fill when enabled', () => {
        const fill = buildMaskGradientFill({
            enabled: true,
            type: 'radial',
            angle: 180,
            startOpacity: 0.9,
            endOpacity: 0.1,
        });

        expect(fill).toBeInstanceOf(fabric.Gradient);
        expect((fill as fabric.Gradient<'radial'>).type).toBe('radial');
        expect((fill as fabric.Gradient<'radial'>).colorStops?.[0]?.color).toBe('rgba(255,255,255,0.9)');
        expect((fill as fabric.Gradient<'radial'>).colorStops?.[1]?.color).toBe('rgba(255,255,255,0.1)');
    });

    it('merges and clamps mask gradient updates', () => {
        expect(mergeMaskGradientSettings(DEFAULT_MASK_GRADIENT_SETTINGS, {
            enabled: true,
            angle: 135,
            startOpacity: 2,
            endOpacity: -1,
        })).toEqual({
            enabled: true,
            type: 'linear',
            angle: 135,
            startOpacity: 1,
            endOpacity: 0,
        });
    });
});
