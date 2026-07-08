import {
    buildOllamaCritiquePrompt,
    extractBase64PayloadFromDataUrl,
    formatOllamaModelList,
    isOllamaVisionModel,
    listOllamaVisionModels,
    normalizeOllamaBaseUrl,
    resolveOllamaBaseUrlCandidates,
} from '@/lib/ollama';
import { parseMissingOllamaModelMessage } from '@/lib/ollamaModelInstall';

describe('ollama helpers', () => {
    it('normalizes the base URL and trims trailing slashes', () => {
        expect(normalizeOllamaBaseUrl('http://localhost:11434///')).toBe('http://localhost:11434');
    });

    it('adds host.docker.internal as a fallback for loopback URLs', () => {
        expect(resolveOllamaBaseUrlCandidates('http://localhost:11434')).toEqual([
            'http://localhost:11434',
            'http://host.docker.internal:11434',
        ]);
    });

    it('adds localhost as a fallback when host.docker.internal is configured directly', () => {
        expect(resolveOllamaBaseUrlCandidates('http://host.docker.internal:11434')).toEqual([
            'http://host.docker.internal:11434',
            'http://localhost:11434',
        ]);
    });

    it('extracts the base64 payload from an image data URL', () => {
        expect(extractBase64PayloadFromDataUrl('data:image/png;base64,AAAAAA==')).toBe('AAAAAA==');
    });

    it('formats installed model previews for error messaging', () => {
        expect(formatOllamaModelList(['llava:7b', 'qwen2.5:7b'])).toBe('llava:7b, qwen2.5:7b');
    });

    it('detects whether an Ollama model supports vision input', () => {
        expect(isOllamaVisionModel('llava:7b')).toBe(true);
        expect(isOllamaVisionModel('llama3.2-vision:latest')).toBe(true);
        expect(isOllamaVisionModel('qwen2.5:7b')).toBe(false);
    });

    it('lists the installed vision-capable Ollama models', () => {
        expect(listOllamaVisionModels(['qwen2.5:7b', 'llava:7b', 'gemma3:12b'])).toEqual([
            'llava:7b',
            'gemma3:12b',
        ]);
    });

    it('parses missing-model messages into actionable install details', () => {
        expect(parseMissingOllamaModelMessage(
            'Model "qwen2.5:7b" is not installed in Ollama at http://host.docker.internal:11434. Available models: qwen2.5-coder:7b, llama3.1:8b.'
        )).toEqual({
            model: 'qwen2.5:7b',
            baseUrl: 'http://host.docker.internal:11434',
            availableModels: ['qwen2.5-coder:7b', 'llama3.1:8b'],
        });
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
        expect(prompt).toContain('do not invent visual details');
    });
});
