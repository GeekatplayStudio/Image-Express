import { hexToOklch, oklchToHex, clipOklchToSrgb, isInSrgbGamut, normalizeHex, tryParseHex } from '../domain/oklch';
import { buildHarmonyNodes, harmonyKindFromCount, nodesToHexPalette } from '../domain/constellation';
import { buildVolumeSamples } from '../domain/volumeSamples';

describe('oklch', () => {
    it('round-trips common hex colors approximately', () => {
        for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#808080', '#ffffff', '#000000']) {
            const back = oklchToHex(hexToOklch(hex));
            expect(back).toMatch(/^#[0-9a-f]{6}$/);
            // Allow small quantization drift from sRGB ↔ OKLab
            const a = hexToOklch(hex);
            const b = hexToOklch(back);
            expect(Math.abs(a.l - b.l)).toBeLessThan(0.02);
        }
    });

    it('normalizes short hex', () => {
        expect(normalizeHex('#f0a')).toBe('#ff00aa');
    });

    it('does not treat incomplete hex drafts as black', () => {
        expect(tryParseHex('#33')).toBeNull();
        expect(tryParseHex('#3366cc')).toBe('#3366cc');
        expect(tryParseHex('#f0a')).toBe('#ff00aa');
    });

    it('clips extreme chroma into sRGB', () => {
        const clipped = clipOklchToSrgb({ l: 0.7, c: 0.9, h: 40 });
        expect(isInSrgbGamut(clipped)).toBe(true);
        expect(clipped.c).toBeLessThan(0.9);
    });
});

describe('constellation harmonies', () => {
    it('maps wheel counts to harmony kinds', () => {
        expect(harmonyKindFromCount(2)).toBe('complementary');
        expect(harmonyKindFromCount(3)).toBe('triadic');
        expect(harmonyKindFromCount(6)).toBe('hexadic');
    });

    it('builds complementary nodes with opposite hue', () => {
        const nodes = buildHarmonyNodes('#3366cc', 'complementary');
        expect(nodes).toHaveLength(2);
        expect(nodes[0].role).toBe('primary');
        expect(nodes[0].hex).toBe('#3366cc');
        const delta = Math.abs(nodes[1].oklch.h - nodes[0].oklch.h);
        expect(Math.min(delta, 360 - delta)).toBeGreaterThan(170);
        expect(nodesToHexPalette(nodes).every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    });

    it('keeps black primary but still suggests colorful siblings', () => {
        const nodes = buildHarmonyNodes('#000000', 'triadic');
        expect(nodes[0].hex).toBe('#000000');
        expect(nodes.slice(1).every((node) => node.oklch.c >= 0.08)).toBe(true);
        expect(nodes.slice(1).some((node) => node.hex !== '#000000')).toBe(true);
    });

    it('builds triadic with three nodes', () => {
        expect(buildHarmonyNodes('#cc6633', 'triadic')).toHaveLength(3);
    });
});

describe('volume samples', () => {
    it('builds a dense colored solid with bead weights', () => {
        const samples = buildVolumeSamples();
        expect(samples.length).toBeGreaterThan(500);
        expect(samples.every((s) => /^#[0-9a-f]{6}$/.test(s.hex) && s.weight > 0)).toBe(true);
    });
});
