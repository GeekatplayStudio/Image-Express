import {
    UPSCALE_PREFERENCES_STORAGE_KEY,
    UPSCALE_PROVIDERS,
    getUpscaleProvider,
    isUpscaleProviderId,
    loadUpscalePreferences,
    saveUpscalePreferences,
} from '@/lib/upscale/upscaleProviders';

describe('upscale provider catalog', () => {
    it('keeps ids unique and every remote provider keyed', () => {
        const ids = UPSCALE_PROVIDERS.map((provider) => provider.id);
        expect(new Set(ids).size).toBe(ids.length);

        for (const provider of UPSCALE_PROVIDERS) {
            expect(provider.scales.length).toBeGreaterThan(0);
            if (!provider.isLocal) {
                expect(provider.apiKeyStorageKey).not.toBe('');
                expect(provider.accountKeyName).not.toBe('');
            }
        }
    });

    it('resolves providers by id', () => {
        expect(getUpscaleProvider('fal')?.name).toContain('Fal');
        expect(getUpscaleProvider('nope')).toBeUndefined();
        expect(isUpscaleProviderId('comfy')).toBe(true);
        expect(isUpscaleProviderId('magic')).toBe(false);
    });
});

describe('upscale preferences', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('defaults to the local ComfyUI provider', () => {
        const preferences = loadUpscalePreferences();
        expect(preferences.defaultProvider).toBe('comfy');
        expect(preferences.defaultScale).toBe(2);
    });

    it('round-trips saved preferences', () => {
        saveUpscalePreferences({ defaultProvider: 'replicate', defaultScale: 8, creativity: 0.9 });
        const loaded = loadUpscalePreferences();
        expect(loaded.defaultProvider).toBe('replicate');
        expect(loaded.defaultScale).toBe(8);
        expect(loaded.creativity).toBeCloseTo(0.9);
    });

    it('sanitizes unknown providers, out-of-range scales, and bad creativity', () => {
        window.localStorage.setItem(UPSCALE_PREFERENCES_STORAGE_KEY, JSON.stringify({
            defaultProvider: 'made-up',
            defaultScale: 999,
            creativity: 7,
        }));
        const loaded = loadUpscalePreferences();
        expect(loaded.defaultProvider).toBe('comfy');
        expect(loaded.defaultScale).toBe(2);
        expect(loaded.creativity).toBeLessThanOrEqual(1);
    });

    it('snaps the scale to the provider when the provider changes', () => {
        saveUpscalePreferences({ defaultProvider: 'stability', defaultScale: 2 });
        // Stability only offers 4x, so 2 is not valid there.
        expect(loadUpscalePreferences().defaultScale).toBe(4);
    });
});
