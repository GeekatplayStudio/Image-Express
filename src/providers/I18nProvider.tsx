'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_LANGUAGE, translate, type LanguageCode, type TranslationVars } from '@/lib/i18n';
import {
    getLanguageSnapshot,
    getServerLanguageSnapshot,
    setStoredLanguage,
    subscribeToLanguage,
} from '@/lib/i18n/store';

type I18nContextValue = {
    /** Active UI language. */
    language: LanguageCode;
    /** Switch language; persists to localStorage and updates <html lang>. */
    setLanguage: (language: LanguageCode) => void;
    /**
     * Translate a dictionary key (falls back to English, then the key).
     * Pass `vars` to fill `{name}` placeholders.
     */
    t: (key: string, vars?: TranslationVars) => string;
};

const I18nContext = createContext<I18nContextValue>({
    language: DEFAULT_LANGUAGE,
    setLanguage: () => undefined,
    t: (key, vars) => translate(DEFAULT_LANGUAGE, key, vars),
});

/**
 * App-wide i18n context. The language lives in a small external store
 * (see src/lib/i18n/store.ts): the server always renders English, and
 * useSyncExternalStore swaps in the persisted preference on the client.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
    const language = useSyncExternalStore(
        subscribeToLanguage,
        getLanguageSnapshot,
        getServerLanguageSnapshot,
    );

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    const setLanguage = useCallback((next: LanguageCode) => {
        setStoredLanguage(next);
    }, []);

    const value = useMemo<I18nContextValue>(() => ({
        language,
        setLanguage,
        t: (key: string, vars?: TranslationVars) => translate(language, key, vars),
    }), [language, setLanguage]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    return useContext(I18nContext);
}
