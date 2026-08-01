import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';

export type VisionModelSuggestion = {
    model: string;
    size: string;
    note: string;
    stillListed?: boolean;
};

export type OllamaVisionModels = {
    baseUrl: string;
    ollamaReachable: boolean;
    /** Installed models Ollama reports as vision-capable. */
    installed: string[];
    /** Curated, installable suggestions with download sizes. */
    suggestions: VisionModelSuggestion[];
    /** Vision models listed by Ollama that the curated list does not cover. */
    newerInLibrary: string[];
    libraryChecked: boolean;
    defaultModel: string;
};

const asStringArray = (value: unknown): string[] => (
    Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : []
);

const asSuggestions = (value: unknown): VisionModelSuggestion[] => (
    Array.isArray(value)
        ? value
            .filter((entry): entry is VisionModelSuggestion => (
                Boolean(entry)
                && typeof (entry as VisionModelSuggestion).model === 'string'
                && typeof (entry as VisionModelSuggestion).size === 'string'
            ))
            .map((entry) => ({
                model: entry.model,
                size: entry.size,
                note: typeof entry.note === 'string' ? entry.note : '',
                stillListed: entry.stillListed,
            }))
        : []
);

/** Vision models the user can switch to or install, for the given Ollama. */
export const fetchOllamaVisionModels = async (baseUrl?: string): Promise<OllamaVisionModels> => {
    const params = new URLSearchParams({ baseUrl: baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL });
    const response = await fetch(`/api/ai/ollama/vision-models?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
    });
    const payload = await response.json() as {
        success?: boolean;
        message?: string;
        baseUrl?: string;
        ollamaReachable?: boolean;
        installed?: unknown;
        suggestions?: unknown;
        newerInLibrary?: unknown;
        libraryChecked?: boolean;
        defaultModel?: string;
    };

    if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to list vision models.');
    }

    return {
        baseUrl: payload.baseUrl || (baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL),
        ollamaReachable: Boolean(payload.ollamaReachable),
        installed: asStringArray(payload.installed),
        suggestions: asSuggestions(payload.suggestions),
        newerInLibrary: asStringArray(payload.newerInLibrary),
        libraryChecked: Boolean(payload.libraryChecked),
        defaultModel: typeof payload.defaultModel === 'string' ? payload.defaultModel : '',
    };
};
