import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

export const normalizeOllamaBaseUrl = (
    value: string,
    fallback = DEFAULT_OLLAMA_BASE_URL
): string => {
    const raw = value.trim() || fallback;
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Ollama URL must use http or https.');
    }
    return trimTrailingSlashes(parsed.toString());
};

export const extractBase64PayloadFromDataUrl = (value: string): string => {
    const trimmed = value.trim();
    const matches = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!matches || matches.length < 2 || matches[1].trim().length === 0) {
        throw new Error('Critique image must be a base64-encoded image data URL.');
    }
    return matches[1].trim();
};

export const formatOllamaModelList = (models: string[], maxItems = 8): string => {
    const normalized = models.filter((model) => model.trim().length > 0);
    if (normalized.length === 0) {
        return 'none detected';
    }

    const preview = normalized.slice(0, maxItems).join(', ');
    const remainder = normalized.length - Math.min(normalized.length, maxItems);
    return remainder > 0 ? `${preview}, +${remainder} more` : preview;
};

export const buildOllamaCritiquePrompt = (options: {
    target: 'selection' | 'canvas';
    targetLabel: string;
    focus?: string;
}): string => {
    const focus = options.focus?.trim();
    const focusSection = focus
        ? `Focus request: ${focus}\n`
        : '';

    return [
        'You are a concise senior design critic reviewing a creative layout.',
        `Analyze the attached ${options.target === 'selection' ? 'selected layer crop' : 'full canvas'}: ${options.targetLabel}.`,
        focusSection,
        'Respond with plain text under these headings:',
        'Summary',
        'What Works',
        'Issues',
        'Next Edits',
        'Keep it practical, specific, and brief. Mention composition, hierarchy, readability, color, spacing, and obvious production risks when relevant.',
    ].filter(Boolean).join('\n');
};
