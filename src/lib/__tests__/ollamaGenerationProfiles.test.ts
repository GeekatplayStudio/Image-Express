import {
    DEFAULT_OLLAMA_GENERATION_PROFILE,
    OLLAMA_GENERATION_PROFILES,
    getOllamaGenerationProfile,
    isOllamaGenerationProfileId,
} from '@/lib/ollamaGenerationProfiles';
import { buildOllamaSvgGenerationPrompt } from '@/lib/ollama';
import { loadLocalAiPreferences, saveLocalAiPreferences, LOCAL_AI_PREFERENCES_STORAGE_KEY } from '@/lib/localAiPreferences';

const prompt = (quality?: unknown) => buildOllamaSvgGenerationPrompt({ prompt: 'A lighthouse at dusk', width: 512, height: 512, quality });

describe('profiles', () => {
    it('offers fast, balanced and quality, defaulting to balanced', () => {
        expect(OLLAMA_GENERATION_PROFILES.map((profile) => profile.id)).toEqual(['fast', 'balanced', 'quality']);
        expect(DEFAULT_OLLAMA_GENERATION_PROFILE).toBe('balanced');
    });

    it('gives each step a larger budget than the last', () => {
        // A richer brief on a smaller budget is cut off mid-SVG, so the token
        // budget has to rise with the amount of drawing asked for.
        const budgets = OLLAMA_GENERATION_PROFILES.map((profile) => profile.options.num_predict);
        expect(budgets[0]).toBeLessThan(budgets[1]);
        expect(budgets[1]).toBeLessThan(budgets[2]);
    });

    it('falls back to the default for anything unrecognised', () => {
        for (const value of [undefined, null, '', 'ultra', 42]) {
            expect(getOllamaGenerationProfile(value).id).toBe('balanced');
        }
        expect(isOllamaGenerationProfileId('quality')).toBe(true);
        expect(isOllamaGenerationProfileId('ultra')).toBe(false);
    });
});

describe('buildOllamaSvgGenerationPrompt', () => {
    it('gives each profile a materially different brief', () => {
        const [fast, balanced, quality] = [prompt('fast'), prompt('balanced'), prompt('quality')];
        expect(new Set([fast, balanced, quality]).size).toBe(3);
        expect(fast).toContain('at most 12 shapes');
        expect(fast).toContain('No gradients');
        expect(quality).toContain('30 to 60 shapes');
        expect(quality).not.toContain('No gradients');
    });

    it('keeps the safety rules in every profile', () => {
        for (const id of ['fast', 'balanced', 'quality']) {
            const text = prompt(id);
            expect(text).toContain('Do not use script, foreignObject, external images');
            expect(text).toContain('viewBox="0 0 512 512"');
            expect(text).toContain('Prompt: A lighthouse at dusk');
        }
    });

    it('uses the balanced brief when no profile is given', () => {
        expect(prompt()).toBe(prompt('balanced'));
    });
});

describe('local AI preferences', () => {
    beforeEach(() => window.localStorage.clear());

    it('defaults to balanced and remembers a choice', () => {
        expect(loadLocalAiPreferences().ollamaQuality).toBe('balanced');
        saveLocalAiPreferences({ ollamaQuality: 'quality' });
        expect(loadLocalAiPreferences().ollamaQuality).toBe('quality');
    });

    it('keeps the choice when only the model is changed', () => {
        saveLocalAiPreferences({ ollamaQuality: 'fast' });
        saveLocalAiPreferences({ ollamaModel: 'gemma3:12b' });
        expect(loadLocalAiPreferences()).toMatchObject({ ollamaModel: 'gemma3:12b', ollamaQuality: 'fast' });
    });

    it('ignores a stored value that is not a profile', () => {
        window.localStorage.setItem(LOCAL_AI_PREFERENCES_STORAGE_KEY, JSON.stringify({ ollamaQuality: 'ultra' }));
        expect(loadLocalAiPreferences().ollamaQuality).toBe('balanced');
    });
});
