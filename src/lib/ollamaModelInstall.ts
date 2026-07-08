import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';

export type MissingOllamaModelDetails = {
    model: string;
    baseUrl: string;
    availableModels: string[];
};

export type OllamaInstallResult = {
    success: true;
    message: string;
    baseUrl: string;
    attemptedBaseUrls: string[];
    model: string;
    models: string[];
    alreadyInstalled: boolean;
};

const MISSING_MODEL_REGEX = /Model "([^"]+)" is not installed in Ollama at (.+?)\. Available models: (.+?)\.?$/i;

const parseAvailableModels = (value: string): string[] => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'none detected') {
        return [];
    }

    return trimmed
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && !/^\+\d+ more$/i.test(entry));
};

export const parseMissingOllamaModelMessage = (value: string): MissingOllamaModelDetails | null => {
    const matches = value.match(MISSING_MODEL_REGEX);
    if (!matches) {
        return null;
    }

    return {
        model: matches[1].trim(),
        baseUrl: matches[2].trim(),
        availableModels: parseAvailableModels(matches[3]),
    };
};

export const requestOllamaModelInstall = async (options: {
    baseUrl?: string;
    model?: string;
}): Promise<OllamaInstallResult> => {
    const response = await fetch('/api/ai/ollama/install', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            baseUrl: options.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL,
            model: options.model?.trim() || DEFAULT_OLLAMA_MODEL,
        }),
    });

    const payload = await response.json() as {
        success?: boolean;
        message?: string;
        baseUrl?: string;
        attemptedBaseUrls?: string[];
        model?: string;
        models?: string[];
        alreadyInstalled?: boolean;
    };

    if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to install Ollama model.');
    }

    return {
        success: true,
        message: payload.message || 'Installed Ollama model.',
        baseUrl: payload.baseUrl || (options.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL),
        attemptedBaseUrls: Array.isArray(payload.attemptedBaseUrls)
            ? payload.attemptedBaseUrls.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            : [],
        model: payload.model || (options.model?.trim() || DEFAULT_OLLAMA_MODEL),
        models: Array.isArray(payload.models)
            ? payload.models.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            : [],
        alreadyInstalled: Boolean(payload.alreadyInstalled),
    };
};