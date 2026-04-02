import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';

export type OllamaRuntimeStatusResult = {
    baseUrl: string;
    requestedModel: string;
    modelFound: boolean;
    models: string[];
    count: number;
};

export const formatOllamaRuntimeStatusMessage = (result: OllamaRuntimeStatusResult): string => (
    result.modelFound
        ? `Ollama is reachable. Found ${result.requestedModel}${typeof result.count === 'number' ? ` (${result.count} model${result.count === 1 ? '' : 's'} installed)` : ''}.`
        : `Ollama is reachable, but ${result.requestedModel} is not installed yet.${result.models.length > 0 ? ` Available: ${result.models.slice(0, 3).join(', ')}${result.models.length > 3 ? '…' : ''}.` : ''}`
);

export const requestOllamaRuntimeStatus = async (options: {
    baseUrl?: string;
    model?: string;
}): Promise<OllamaRuntimeStatusResult> => {
    const params = new URLSearchParams({
        baseUrl: options.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL,
        model: options.model?.trim() || DEFAULT_OLLAMA_MODEL,
    });

    const response = await fetch(`/api/ai/ollama/status?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
    });
    const payload = await response.json() as {
        success?: boolean;
        message?: string;
        baseUrl?: string;
        requestedModel?: string;
        modelFound?: boolean;
        models?: string[];
        count?: number;
    };

    if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to contact Ollama.');
    }

    const models = Array.isArray(payload.models)
        ? payload.models.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];

    return {
        baseUrl: payload.baseUrl || (options.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL),
        requestedModel: payload.requestedModel || (options.model?.trim() || DEFAULT_OLLAMA_MODEL),
        modelFound: Boolean(payload.modelFound),
        models,
        count: typeof payload.count === 'number' ? payload.count : models.length,
    };
};