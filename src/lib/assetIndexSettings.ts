'use client';

/**
 * Settings for the asset search-index pipeline.
 *
 * Basic indexing (dimensions, embedded prompts from PNG text chunks) is free
 * and always on. AI captioning/tagging goes through the local Ollama vision
 * model and is opt-in because it needs Ollama running with a vision model.
 */
export interface AssetIndexSettings {
    aiIndexingEnabled: boolean;
}

const STORAGE_KEY = 'image-express-asset-index-settings';
const CHANGE_EVENT = 'image-express-asset-index-changed';

const DEFAULT_SETTINGS: AssetIndexSettings = {
    aiIndexingEnabled: false,
};

export function loadAssetIndexSettings(): AssetIndexSettings {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<AssetIndexSettings>;
        return {
            aiIndexingEnabled: Boolean(parsed.aiIndexingEnabled),
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function saveAssetIndexSettings(next: AssetIndexSettings) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
}

export function onAssetIndexSettingsChanged(listener: () => void) {
    if (typeof window === 'undefined') return () => undefined;
    const handler = () => listener();
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
        window.removeEventListener(CHANGE_EVENT, handler);
        window.removeEventListener('storage', handler);
    };
}
