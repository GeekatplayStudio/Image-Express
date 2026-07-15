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

/**
 * Resolve a translation key for a language: locale string → English
 * fallback → the key itself (so missing keys are visible, never blank).
 */
export function translate(language: LanguageCode, key: string): string {
    return DICTIONARIES[language]?.[key] ?? DICTIONARIES.en[key] ?? key;
}

export function getDictionary(language: LanguageCode): LocaleDictionary {
    return DICTIONARIES[language] ?? DICTIONARIES.en;
}
