import {
    applyChannelOperationToColor,
    applyChannelStateToColor,
    buildChannelFilterState,
    createDefaultChannelFilterState,
    getChannelOperationMatrix,
    readChannelFilterState,
    setChannelValueInColor,
    stripChannelFilters,
    transformPixelForChannel,
} from '../channelEditing';

describe('channelEditing', () => {
    it('builds a red isolate matrix that replicates red across RGB output', () => {
        expect(getChannelOperationMatrix(buildChannelFilterState('r', 'isolate'))).toEqual([
            1, 0, 0, 0, 0,
            1, 0, 0, 0, 0,
            1, 0, 0, 0, 0,
            0, 0, 0, 1, 0,
        ]);
    });

    it('inverts a single color channel without touching the others', () => {
        const result = applyChannelOperationToColor('#123456', 0.5, 'g', 'invert');
        expect(result.channels).toMatchObject({ r: 18, g: 203, b: 86, a: 128 });
        expect(result.opacity).toBeCloseTo(128 / 255, 4);
    });

    it('isolates alpha into a visible grayscale fill', () => {
        const result = applyChannelOperationToColor('#123456', 0.25, 'a', 'isolate');
        expect(result.channels).toEqual({ r: 64, g: 64, b: 64, a: 255 });
        expect(result.opacity).toBe(1);
    });

    it('sets alpha through the numeric channel editor', () => {
        const result = setChannelValueInColor('#112233', 0.4, 'a', 204);
        expect(result.opacity).toBeCloseTo(0.8, 4);
        expect(result.channels.a).toBe(204);
    });

    it('strips tagged channel filters and reads their state', () => {
        const filters = [
            { type: 'Blur' },
            {
                type: 'ColorMatrix',
                imageExpressChannelFilter: true,
                imageExpressChannelMode: 'invert',
                imageExpressChannelTarget: 'b',
                imageExpressChannelOpacities: { ...createDefaultChannelFilterState().opacities, b: 0.4 },
                imageExpressChannelMasks: { ...createDefaultChannelFilterState().masks, g: true },
            },
        ];

        expect(readChannelFilterState(filters)).toEqual({
            mode: 'invert',
            target: 'b',
            opacities: { r: 1, g: 1, b: 0.4, a: 1, lum: 0 },
            masks: { r: false, g: true, b: false, a: false, lum: false },
        });
        expect(stripChannelFilters(filters)).toEqual([{ type: 'Blur' }]);
    });

    it('transforms alpha preview pixels into a visible grayscale mask', () => {
        expect(transformPixelForChannel({ r: 10, g: 20, b: 30, a: 77 }, 'a')).toEqual({
            r: 77,
            g: 77,
            b: 77,
            a: 255,
        });
    });

    it('transforms luminosity preview pixels into grayscale', () => {
        expect(transformPixelForChannel({ r: 100, g: 150, b: 200, a: 255 }, 'lum')).toEqual({
            r: 141,
            g: 141,
            b: 141,
            a: 255,
        });
    });

    it('uses the selected channel as alpha when mask mode is active', () => {
        const state = buildChannelFilterState('lum', 'mask', {
            opacities: { ...createDefaultChannelFilterState().opacities, lum: 1 },
            masks: createDefaultChannelFilterState().masks,
        });
        const result = applyChannelStateToColor('#336699', 1, state);
        expect(result.channels.a).toBe(93);
    });
});