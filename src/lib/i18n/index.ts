import type { LanguageCode, LocaleDictionary } from './types';
import en from './locales/en';

export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, isSupportedLanguage } from './types';
export type { LanguageCode, LocaleDictionary } from './types';

export const LANGUAGE_STORAGE_KEY = 'image-express-language';

/**
 * English ships in the main bundle: it is the SSR language (see
 * getServerLanguageSnapshot in store.ts) and the universal fallback for
 * every missing key, so it must be available synchronously from the first
 * render. Every other locale is fetched on demand via `loadLocale()` — a
 * user who never switches away from English never downloads the other
 * ~20,000 translated strings across the remaining 10 locale files.
 */
const LOCALE_LOADERS: Record<Exclude<LanguageCode, 'en'>, () => Promise<{ default: LocaleDictionary }>> = {
    ru: () => import('./locales/ru'),
    uk: () => import('./locales/uk'),
    es: () => import('./locales/es'),
    fr: () => import('./locales/fr'),
    de: () => import('./locales/de'),
    it: () => import('./locales/it'),
    pt: () => import('./locales/pt'),
    pl: () => import('./locales/pl'),
    zh: () => import('./locales/zh'),
    ja: () => import('./locales/ja'),
};

const loadedDictionaries: Partial<Record<LanguageCode, LocaleDictionary>> = { en };
const pendingLoads = new Map<LanguageCode, Promise<LocaleDictionary>>();

/**
 * Fetch and cache a locale's dictionary chunk. Safe to call repeatedly:
 * resolves immediately once loaded (including for `en`, which always is),
 * and concurrent calls for the same language share one in-flight request
 * rather than triggering duplicate network fetches.
 *
 * `translate()` does not await this — it reads whatever is in the cache at
 * call time and falls back to English otherwise, the same fallback path a
 * genuinely missing key already takes. Callers that want a re-render once
 * the real translation lands (i.e. the I18nProvider) await this separately
 * and bump their own state; see I18nProvider.tsx.
 */
export function loadLocale(language: LanguageCode): Promise<LocaleDictionary> {
    const cached = loadedDictionaries[language];
    if (cached) return Promise.resolve(cached);

    const pending = pendingLoads.get(language);
    if (pending) return pending;

    const loader = LOCALE_LOADERS[language as Exclude<LanguageCode, 'en'>];
    if (!loader) return Promise.resolve(en);

    const promise = loader()
        .then((mod) => {
            loadedDictionaries[language] = mod.default;
            pendingLoads.delete(language);
            return mod.default;
        })
        .catch((error) => {
            // Network hiccup, offline, dev-server hot-reload race, etc. —
            // fall back to English rather than leaving callers awaiting a
            // rejected promise forever. Not cached as loaded, so the next
            // call (e.g. the user reselecting the same language) retries.
            pendingLoads.delete(language);
            console.error(`Failed to load locale "${language}"`, error);
            return en;
        });
    pendingLoads.set(language, promise);
    return promise;
}

/** True once `language`'s dictionary is cached and translate() resolves it fully. */
export function isLocaleLoaded(language: LanguageCode): boolean {
    return language in loadedDictionaries;
}

/** Values substituted into `{name}` placeholders in a translated string. */
export type TranslationVars = Record<string, string | number>;

/**
 * Pick the plural form for `count` in `language`.
 *
 * English has two forms (one/other), but Russian, Ukrainian and Polish have
 * three or four — "1 страница / 2 страницы / 5 страниц". A flat
 * "{count} страниц" is wrong for most numbers, so a key may define variants:
 *
 *   'dashboard.canvasCount.one':   '{count} страница',
 *   'dashboard.canvasCount.few':   '{count} страницы',
 *   'dashboard.canvasCount.many':  '{count} страниц',
 *   'dashboard.canvasCount.other': '{count} страницы',
 *
 * Resolution order is `key.<category>` → `key.other` → `key`, so a locale
 * that has not been pluralised yet still renders its flat string.
 */
function resolvePluralKey(language: LanguageCode, key: string, count: number): string {
    // Before the locale chunk loads, `dict` is just `en` — the plural table
    // still resolves correctly, it is only not-yet-translated (same fallback
    // as translate() below).
    const dict = loadedDictionaries[language] ?? en;
    let category: string;
    try {
        category = new Intl.PluralRules(language).select(count);
    } catch {
        category = count === 1 ? 'one' : 'other';
    }
    // Precedence, most to least specific:
    //   1. the locale's own plural variant for this category
    //   2. the locale's own `.other` variant
    //   3. the locale's flat string — a real translation, so it beats English
    //      even though it is not pluralised
    //   4. English's variant, for locales that lack the key entirely
    if (`${key}.${category}` in dict) return `${key}.${category}`;
    if (`${key}.other` in dict) return `${key}.other`;
    if (key in dict) return key;

    if (`${key}.${category}` in en) return `${key}.${category}`;
    if (`${key}.other` in en) return `${key}.other`;
    return key;
}

/**
 * Resolve a translation key for a language: locale string → English
 * fallback → the key itself (so missing keys are visible, never blank).
 *
 * Supports `{name}` placeholders so translators control word order:
 *   translate('ru', 'channels.channelOpacity', { channel: 'Red' })
 * A missing var leaves its placeholder intact, which is visible in the UI
 * rather than silently rendering "undefined".
 *
 * When `vars.count` is a number the key is resolved through plural rules
 * first — see resolvePluralKey.
 */
export function translate(language: LanguageCode, key: string, vars?: TranslationVars): string {
    let lookupKey = key;
    if (vars && typeof vars.count === 'number') {
        lookupKey = resolvePluralKey(language, key, vars.count);
    }
    // `dict` may be undefined for a locale whose chunk hasn't loaded yet
    // (see loadLocale above) — that falls through to the `en` lookups below,
    // identical to how a genuinely missing key already behaves.
    const dict = loadedDictionaries[language];
    const template = dict?.[lookupKey]
        ?? en[lookupKey]
        ?? dict?.[key]
        ?? en[key]
        ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
        name in vars ? String(vars[name]) : match);
}

export function getDictionary(language: LanguageCode): LocaleDictionary {
    return loadedDictionaries[language] ?? en;
}
