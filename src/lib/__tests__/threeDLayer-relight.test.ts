import { hexToRgb, sunDirection, MAX_RELIGHT_LIGHTS } from '../threeDLayer/relightShader';
import { DEFAULT_GLOBAL_LIGHT, globalLightAsLayerLight } from '../threeDLayer/globalLight';

describe('hexToRgb', () => {
    it('parses 6-digit hex with or without #', () => {
        expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
        expect(hexToRgb('00ff00')).toEqual([0, 1, 0]);
        expect(hexToRgb('#0000ff')).toEqual([0, 0, 1]);
    });
    it('falls back to white on junk', () => {
        expect(hexToRgb('red')).toEqual([1, 1, 1]);
        expect(hexToRgb('#fff')).toEqual([1, 1, 1]);
    });
});

describe('sunDirection', () => {
    it('is unit length everywhere', () => {
        for (const [az, el] of [[0, 0], [90, 45], [200, 80], [315, 10]]) {
            const [x, y, z] = sunDirection(az, el);
            expect(Math.hypot(x, y, z)).toBeCloseTo(1);
        }
    });
    it('points straight up the z axis at 90° elevation', () => {
        const [x, y, z] = sunDirection(0, 90);
        expect(x).toBeCloseTo(0);
        expect(y).toBeCloseTo(0);
        expect(z).toBeCloseTo(1);
    });
    it('lies in the screen plane at 0° elevation', () => {
        const [x, , z] = sunDirection(0, 0);
        expect(x).toBeCloseTo(1);
        expect(z).toBeCloseTo(0);
    });
});

describe('globalLightAsLayerLight', () => {
    it('maps the store state onto a directional layer light', () => {
        const light = globalLightAsLayerLight(DEFAULT_GLOBAL_LIGHT);
        expect(light.kind).toBe('directional');
        expect(light.id).toBe('global-sun');
        expect(light.azimuth).toBe(DEFAULT_GLOBAL_LIGHT.azimuth);
        expect(light.shadows?.enabled).toBe(true);
    });
});

describe('MAX_RELIGHT_LIGHTS', () => {
    it('is above the reference implementation cap of 3', () => {
        expect(MAX_RELIGHT_LIGHTS).toBeGreaterThan(3);
    });
});
