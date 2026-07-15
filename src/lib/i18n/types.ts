/**
 * Shared types for the Image Express i18n layer.
 *
 * A locale dictionary is a flat map of dot-namespaced keys to translated
 * strings (e.g. "common.close" -> "Close"). English (`en`) is the base
 * locale: it defines the complete key set, and every other locale may be
 * partial — missing keys fall back to English, then to the key itself.
 */

export const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English', nativeLabel: 'English' },
    { code: 'ru', label: 'Russian', nativeLabel: 'Русский' },
    { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська' },
    { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
    { code: 'fr', label: 'French', nativeLabel: 'Français' },
    { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
    { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
    { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
    { code: 'pl', label: 'Polish', nativeLabel: 'Polski' },
    { code: 'zh', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
    { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export type LocaleDictionary = Record<string, string>;

export function isSupportedLanguage(value: string): value is LanguageCode {
    return SUPPORTED_LANGUAGES.some((entry) => entry.code === value);
}
