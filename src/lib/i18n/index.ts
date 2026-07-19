import type { LanguageCode, LocaleDictionary } from './types';
import en from './locales/en';
import ru from './locales/ru';
import uk from './locales/uk';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';
import it from './locales/it';
import pt from './locales/pt';
import pl from './locales/pl';
import zh from './locales/zh';
import ja from './locales/ja';

export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, isSupportedLanguage } from './types';
export type { LanguageCode, LocaleDictionary } from './types';

export const LANGUAGE_STORAGE_KEY = 'image-express-language';

const DICTIONARIES: Record<LanguageCode, LocaleDictionary> = {
    en, ru, uk, es, fr, de, it, pt, pl, zh, ja,
};

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
    const dict = DICTIONARIES[language] ?? DICTIONARIES.en;
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

    if (`${key}.${category}` in DICTIONARIES.en) return `${key}.${category}`;
    if (`${key}.other` in DICTIONARIES.en) return `${key}.other`;
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
    const template = DICTIONARIES[language]?.[lookupKey]
        ?? DICTIONARIES.en[lookupKey]
        ?? DICTIONARIES[language]?.[key]
        ?? DICTIONARIES.en[key]
        ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
        name in vars ? String(vars[name]) : match);
}

export function getDictionary(language: LanguageCode): LocaleDictionary {
    return DICTIONARIES[language] ?? DICTIONARIES.en;
}
