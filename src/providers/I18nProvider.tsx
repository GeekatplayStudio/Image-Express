'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { DEFAULT_LANGUAGE, isLocaleLoaded, loadLocale, translate, type LanguageCode, type TranslationVars } from '@/lib/i18n';
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
 *
 * Non-English dictionaries are code-split (see loadLocale in lib/i18n) so a
 * user who never switches away from English never downloads the other
 * ~20,000 translated strings. Switching language — or returning with a
 * non-English preference already in localStorage — briefly renders whatever
 * `translate()` resolves before the locale chunk arrives (English, via the
 * same fallback a missing key already takes), then re-renders once it lands.
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

    // Bumped once the active language's dictionary chunk finishes loading,
    // so the memoized `value` below gets a new identity and every consumer
    // re-renders with the real translation instead of the English fallback
    // it may have painted on the previous render.
    const [dictionaryTick, setDictionaryTick] = useState(0);
    useEffect(() => {
        if (isLocaleLoaded(language)) return undefined;
        let cancelled = false;
        void loadLocale(language).then(() => {
            if (!cancelled) setDictionaryTick((tick) => tick + 1);
        });
        return () => {
            cancelled = true;
        };
    }, [language]);

    const setLanguage = useCallback((next: LanguageCode) => {
        setStoredLanguage(next);
    }, []);

    // dictionaryTick isn't read below — it's a dep purely to force a new
    // `value` object (and therefore a re-render of every context consumer)
    // once the locale chunk lands; translate() itself always reads the
    // latest cache regardless.
    const value = useMemo<I18nContextValue>(() => ({
        language,
        setLanguage,
        t: (key: string, vars?: TranslationVars) => translate(language, key, vars),
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [language, setLanguage, dictionaryTick]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    return useContext(I18nContext);
}
