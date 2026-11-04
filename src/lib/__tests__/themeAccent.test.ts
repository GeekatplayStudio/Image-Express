import {
    BACKGROUND_CONTRAST_MIN,
    TEXT_CONTRAST_MIN,
    contrastRatio,
    deriveCustomAccent,
    isHexColor,
    normalizeHex,
} from '@/lib/themeAccent';

describe('themeAccent', () => {
    it('validates and normalises hex colours', () => {
        expect(isHexColor('#ABC')).toBe(true);
        expect(isHexColor('#1f8aa5')).toBe(true);
        expect(isHexColor('1f8aa5')).toBe(false);
        expect(isHexColor('#12345')).toBe(false);
        expect(isHexColor('javascript:alert(1)')).toBe(false);
        expect(normalizeHex('#ABC')).toBe('#aabbcc');
    });

    it('computes WCAG contrast the standard way', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBe(21);
        expect(contrastRatio('#ffffff', '#000000')).toBe(21);
        expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    });

    it('derives every variable the shipped accents set, with white text on a dark accent', () => {
        const accent = deriveCustomAccent('#1f8aa5')!;
        expect(Object.keys(accent.variables).sort()).toEqual([
            '--primary', '--primary-foreground', '--tool-accent', '--tool-accent-foreground',
            '--ui-avatar-gradient-end', '--ui-avatar-gradient-start',
            '--ui-brand-gradient-end', '--ui-brand-gradient-mid', '--ui-brand-gradient-start',
        ]);
        expect(accent.foreground).toBe('light');
        expect(accent.variables['--ui-brand-gradient-mid']).toBe('#1f8aa5');
        expect(accent.variables['--primary']).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
        expect(accent.warnings).toEqual([]);
    });

    it('switches to dark text on a pale accent and warns about the light page', () => {
        const accent = deriveCustomAccent('#ffe066')!;
        expect(accent.foreground).toBe('dark');
        expect(accent.contrast.textOnPrimary).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
        expect(accent.contrast.onLightBackground).toBeLessThan(BACKGROUND_CONTRAST_MIN);
        expect(accent.warnings).toContain('onLightBackground');
    });

    it('keeps white text on a mid-tone accent, as the shipped accents do, and reports the ratio', () => {
        const accent = deriveCustomAccent('#8a8a8a')!;
        expect(accent.foreground).toBe('light');
        expect(accent.contrast.textOnPrimary).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
    });

    it('warns when a near-black accent would vanish against the dark theme', () => {
        const accent = deriveCustomAccent('#1a1a2e')!;
        expect(accent.contrast.onDarkBackground).toBeLessThan(BACKGROUND_CONTRAST_MIN);
        expect(accent.warnings).toEqual(['onDarkBackground']);
    });

    it('returns null for anything that is not a colour', () => {
        expect(deriveCustomAccent('red')).toBeNull();
        expect(deriveCustomAccent('')).toBeNull();
    });
});
