export type LocalAiPreferences = {
    ollamaBaseUrl: string;
    ollamaModel: string;
};

export const LOCAL_AI_PREFERENCES_STORAGE_KEY = 'image-express-local-ai-preferences';
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b';

const DEFAULT_LOCAL_AI_PREFERENCES: LocalAiPreferences = {
    ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
    ollamaModel: DEFAULT_OLLAMA_MODEL,
};

export const loadLocalAiPreferences = (): LocalAiPreferences => {
    if (typeof window === 'undefined') {
        return DEFAULT_LOCAL_AI_PREFERENCES;
    }

    try {
        const raw = window.localStorage.getItem(LOCAL_AI_PREFERENCES_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<LocalAiPreferences>) : {};
        return {
            ollamaBaseUrl: typeof parsed.ollamaBaseUrl === 'string' && parsed.ollamaBaseUrl.trim().length > 0
                ? parsed.ollamaBaseUrl.trim()
                : DEFAULT_OLLAMA_BASE_URL,
            ollamaModel: typeof parsed.ollamaModel === 'string' && parsed.ollamaModel.trim().length > 0
                ? parsed.ollamaModel.trim()
                : DEFAULT_OLLAMA_MODEL,
        };
    } catch {
        return DEFAULT_LOCAL_AI_PREFERENCES;
    }
};

export const saveLocalAiPreferences = (updates: Partial<LocalAiPreferences>): LocalAiPreferences => {
    if (typeof window === 'undefined') {
        return {
            ...DEFAULT_LOCAL_AI_PREFERENCES,
            ...updates,
        };
    }

    const current = loadLocalAiPreferences();
    const next: LocalAiPreferences = {
        ollamaBaseUrl: (updates.ollamaBaseUrl ?? current.ollamaBaseUrl).trim() || DEFAULT_OLLAMA_BASE_URL,
        ollamaModel: (updates.ollamaModel ?? current.ollamaModel).trim() || DEFAULT_OLLAMA_MODEL,
    };

    window.localStorage.setItem(LOCAL_AI_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    return next;
};
