'use client';

import { LANGUAGE_STORAGE_KEY } from './index';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type LanguageCode } from './types';

/**
 * Tiny external store for the active UI language, designed for
 * React's useSyncExternalStore:
 * - server snapshot is always English (stable SSR markup),
 * - client snapshot lazily reads the persisted preference,
 * - setLanguage persists and notifies subscribers.
 */

let currentLanguage: LanguageCode | null = null;
const listeners = new Set<() => void>();

function readStoredLanguage(): LanguageCode {
    try {
        const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (stored && isSupportedLanguage(stored)) {
            return stored;
        }
    } catch {
        // Storage unavailable; fall through to default.
    }
    return DEFAULT_LANGUAGE;
}

export function getLanguageSnapshot(): LanguageCode {
    if (currentLanguage === null) {
        currentLanguage = readStoredLanguage();
    }
    return currentLanguage;
}

export function getServerLanguageSnapshot(): LanguageCode {
    return DEFAULT_LANGUAGE;
}

export function subscribeToLanguage(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function setStoredLanguage(next: LanguageCode) {
    currentLanguage = next;
    try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
        // Persistence is best-effort.
    }
    listeners.forEach((listener) => listener());
}
