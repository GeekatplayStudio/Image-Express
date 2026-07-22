export type ThemePreferenceMode = 'system' | 'dark' | 'light';
export type ThemeAccentPreset = 'ocean' | 'ember' | 'meadow' | 'violet';

export type ThemePreferences = {
    mode: ThemePreferenceMode;
    accentPreset: ThemeAccentPreset;
};

export const THEME_PREFERENCES_STORAGE_KEY = 'image-express-theme-preferences';
export const THEME_PREFERENCES_CHANGED_EVENT = 'image-express:theme-preferences-changed';

// `value` is the stored preference identifier; labelKey/descriptionKey
// resolve through t() at render (see AppearancePanel).
export const THEME_MODE_OPTIONS: Array<{ value: ThemePreferenceMode; labelKey: string; descriptionKey: string }> = [
    { value: 'system', labelKey: 'themeMode.system', descriptionKey: 'themeMode.system.desc' },
    { value: 'dark', labelKey: 'themeMode.dark', descriptionKey: 'themeMode.dark.desc' },
    { value: 'light', labelKey: 'themeMode.light', descriptionKey: 'themeMode.light.desc' },
];

export const THEME_ACCENT_OPTIONS: Array<{ value: ThemeAccentPreset; labelKey: string; descriptionKey: string; swatch: string }> = [
    { value: 'ocean', labelKey: 'accent.ocean', descriptionKey: 'accent.ocean.desc', swatch: 'linear-gradient(135deg, #0f766e 0%, #0891b2 52%, #2563eb 100%)' },
    { value: 'ember', labelKey: 'accent.ember', descriptionKey: 'accent.ember.desc', swatch: 'linear-gradient(135deg, #c2410c 0%, #ea580c 50%, #dc2626 100%)' },
    { value: 'meadow', labelKey: 'accent.meadow', descriptionKey: 'accent.meadow.desc', swatch: 'linear-gradient(135deg, #15803d 0%, #16a34a 52%, #0f766e 100%)' },
    { value: 'violet', labelKey: 'accent.violet', descriptionKey: 'accent.violet.desc', swatch: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 52%, #db2777 100%)' },
];

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
    mode: 'system',
    accentPreset: 'ocean',
};

export const DEFAULT_THEME_RESOLVED_MODE: 'dark' | 'light' = 'dark';

const isThemeMode = (value: unknown): value is ThemePreferenceMode => (
    value === 'system' || value === 'dark' || value === 'light'
);

const isAccentPreset = (value: unknown): value is ThemeAccentPreset => (
    value === 'ocean' || value === 'ember' || value === 'meadow' || value === 'violet'
);

export const resolveThemeMode = (
    mode: ThemePreferenceMode,
    systemPrefersDark: boolean
): 'dark' | 'light' => {
    if (mode === 'system') {
        return systemPrefersDark ? 'dark' : 'light';
    }
    return mode;
};

export const loadThemePreferences = (): ThemePreferences => {
    if (typeof window === 'undefined') {
        return DEFAULT_THEME_PREFERENCES;
    }

    try {
        const raw = window.localStorage.getItem(THEME_PREFERENCES_STORAGE_KEY);
        if (!raw) {
            return DEFAULT_THEME_PREFERENCES;
        }

        const parsed = JSON.parse(raw) as Partial<ThemePreferences>;
        return {
            mode: isThemeMode(parsed.mode) ? parsed.mode : DEFAULT_THEME_PREFERENCES.mode,
            accentPreset: isAccentPreset(parsed.accentPreset) ? parsed.accentPreset : DEFAULT_THEME_PREFERENCES.accentPreset,
        };
    } catch {
        return DEFAULT_THEME_PREFERENCES;
    }
};

export const applyThemePreferences = (preferences: ThemePreferences = DEFAULT_THEME_PREFERENCES) => {
    if (typeof document === 'undefined') {
        return preferences;
    }

    const systemPrefersDark = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedMode = resolveThemeMode(preferences.mode, systemPrefersDark);
    const root = document.documentElement;

    root.dataset.themeMode = resolvedMode;
    root.dataset.themeModePreference = preferences.mode;
    root.dataset.themeAccent = preferences.accentPreset;
    root.style.colorScheme = resolvedMode;

    return preferences;
};

export const saveThemePreferences = (updates: Partial<ThemePreferences>) => {
    if (typeof window === 'undefined') {
        return { ...DEFAULT_THEME_PREFERENCES, ...updates };
    }

    const next: ThemePreferences = {
        ...loadThemePreferences(),
        ...updates,
    };

    window.localStorage.setItem(THEME_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    applyThemePreferences(next);
    window.dispatchEvent(new Event(THEME_PREFERENCES_CHANGED_EVENT));
    return next;
};

export const buildThemePreferencesInitScript = () => `(() => {
  try {
    const storageKey = ${JSON.stringify(THEME_PREFERENCES_STORAGE_KEY)};
    const defaults = ${JSON.stringify(DEFAULT_THEME_PREFERENCES)};
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    const mode = ['system', 'dark', 'light'].includes(parsed?.mode) ? parsed.mode : defaults.mode;
    const accentPreset = ['ocean', 'ember', 'meadow', 'violet'].includes(parsed?.accentPreset) ? parsed.accentPreset : defaults.accentPreset;
    const prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedMode = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
    const root = document.documentElement;
    root.dataset.themeMode = resolvedMode;
    root.dataset.themeModePreference = mode;
    root.dataset.themeAccent = accentPreset;
    root.style.colorScheme = resolvedMode;
  } catch {
        document.documentElement.dataset.themeMode = ${JSON.stringify(DEFAULT_THEME_RESOLVED_MODE)};
        document.documentElement.dataset.themeModePreference = ${JSON.stringify(DEFAULT_THEME_PREFERENCES.mode)};
        document.documentElement.dataset.themeAccent = ${JSON.stringify(DEFAULT_THEME_PREFERENCES.accentPreset)};
        document.documentElement.style.colorScheme = ${JSON.stringify(DEFAULT_THEME_RESOLVED_MODE)};
  }
})();`;