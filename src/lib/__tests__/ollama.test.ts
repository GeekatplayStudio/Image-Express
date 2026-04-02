import {
    buildOllamaCritiquePrompt,
    extractBase64PayloadFromDataUrl,
    formatOllamaModelList,
    normalizeOllamaBaseUrl,
} from '@/lib/ollama';

describe('ollama helpers', () => {
    it('normalizes the base URL and trims trailing slashes', () => {
        expect(normalizeOllamaBaseUrl('http://localhost:11434///')).toBe('http://localhost:11434');
    });

    it('extracts the base64 payload from an image data URL', () => {
        expect(extractBase64PayloadFromDataUrl('data:image/png;base64,AAAAAA==')).toBe('AAAAAA==');
    });

    it('formats installed model previews for error messaging', () => {
        expect(formatOllamaModelList(['llava:7b', 'qwen2.5:7b'])).toBe('llava:7b, qwen2.5:7b');
    });

    it('builds a critique prompt that keeps the requested focus', () => {
        const prompt = buildOllamaCritiquePrompt({
            target: 'selection',
            targetLabel: 'Hero Layer',
            focus: 'Check hierarchy.',
        });

        expect(prompt).toContain('Hero Layer');
        expect(prompt).toContain('Check hierarchy.');
        expect(prompt).toContain('Next Edits');
    });
});
