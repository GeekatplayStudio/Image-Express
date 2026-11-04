import {
    CUSTOM_ACCENT_VARIABLES,
} from '@/lib/themeAccent';
import {
    applyThemePreferences,
    buildThemePreferencesInitScript,
    loadThemePreferences,
    saveThemePreferences,
} from '@/lib/themePreferences';

describe('themePreferences with a custom accent', () => {
    beforeEach(() => {
        window.localStorage.clear();
        for (const name of CUSTOM_ACCENT_VARIABLES) document.documentElement.style.removeProperty(name);
    });

    it('saves a custom accent with its derived variables and paints them on <html>', () => {
        const saved = saveThemePreferences({ accentPreset: 'custom', customAccent: '#C2410C' });
        expect(saved.customAccent).toBe('#c2410c');
        expect(saved.customAccentVariables?.['--ui-brand-gradient-mid']).toBe('#c2410c');
        expect(document.documentElement.dataset.themeAccent).toBe('custom');
        expect(document.documentElement.style.getPropertyValue('--ui-brand-gradient-mid')).toBe('#c2410c');
        expect(document.documentElement.style.getPropertyValue('--primary')).toMatch(/^hsl\(/);
    });

    it('clears the inline variables again when a preset is chosen', () => {
        saveThemePreferences({ accentPreset: 'custom', customAccent: '#c2410c' });
        applyThemePreferences({ mode: 'dark', accentPreset: 'ocean' });
        expect(document.documentElement.dataset.themeAccent).toBe('ocean');
        expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
    });

    it('falls back to the default accent when the stored custom colour is unusable', () => {
        window.localStorage.setItem('image-express-theme-preferences', JSON.stringify({ mode: 'dark', accentPreset: 'custom', customAccent: 'url(evil)' }));
        expect(loadThemePreferences()).toEqual({ mode: 'dark', accentPreset: 'ocean' });
        window.localStorage.setItem('image-express-theme-preferences', JSON.stringify({ mode: 'dark', accentPreset: 'custom', customAccent: '#abc', customAccentVariables: { '--primary': 'x'.repeat(200) } }));
        // Variables are re-derived from the colour, never trusted from storage.
        expect(loadThemePreferences().customAccentVariables?.['--primary']).toMatch(/^hsl\(/);
    });

    it('applies the stored variables in the pre-hydration script and refuses odd names', () => {
        const script = buildThemePreferencesInitScript();
        const run = (stored: unknown) => {
            window.localStorage.setItem('image-express-theme-preferences', JSON.stringify(stored));
            for (const name of CUSTOM_ACCENT_VARIABLES) document.documentElement.style.removeProperty(name);
            new Function(script)();
        };
        run({ mode: 'dark', accentPreset: 'custom', customAccentVariables: { '--primary': 'hsl(21 90% 48%)', 'color': 'red' } });
        expect(document.documentElement.dataset.themeAccent).toBe('custom');
        expect(document.documentElement.style.getPropertyValue('--primary')).toBe('hsl(21 90% 48%)');
        expect(document.documentElement.style.getPropertyValue('color')).toBe('');
        run({ mode: 'dark', accentPreset: 'custom' });
        expect(document.documentElement.dataset.themeAccent).toBe('ocean');
    });
});
