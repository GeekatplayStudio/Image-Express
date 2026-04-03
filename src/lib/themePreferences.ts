export type ThemePreferenceMode = 'system' | 'dark' | 'light';
export type ThemeAccentPreset = 'ocean' | 'ember' | 'meadow' | 'violet';

export type ThemePreferences = {
    mode: ThemePreferenceMode;
    accentPreset: ThemeAccentPreset;
};

export const THEME_PREFERENCES_STORAGE_KEY = 'image-express-theme-preferences';
export const THEME_PREFERENCES_CHANGED_EVENT = 'image-express:theme-preferences-changed';

export const THEME_MODE_OPTIONS: Array<{ value: ThemePreferenceMode; label: string; description: string }> = [
    { value: 'system', label: 'System', description: 'Follow the device appearance automatically.' },
    { value: 'dark', label: 'Dark', description: 'Keep the studio in a contrast-rich workspace.' },
    { value: 'light', label: 'Light', description: 'Use a brighter workspace for daytime editing.' },
];

export const THEME_ACCENT_OPTIONS: Array<{ value: ThemeAccentPreset; label: string; description: string; swatch: string }> = [
    { value: 'ocean', label: 'Ocean', description: 'Current blue-cyan default.', swatch: 'linear-gradient(135deg, #0f766e 0%, #0891b2 52%, #2563eb 100%)' },
    { value: 'ember', label: 'Ember', description: 'Warm orange-red emphasis.', swatch: 'linear-gradient(135deg, #c2410c 0%, #ea580c 50%, #dc2626 100%)' },
    { value: 'meadow', label: 'Meadow', description: 'Green-teal production palette.', swatch: 'linear-gradient(135deg, #15803d 0%, #16a34a 52%, #0f766e 100%)' },
    { value: 'violet', label: 'Violet', description: 'Cool indigo-magenta highlight.', swatch: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 52%, #db2777 100%)' },
];

const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
    mode: 'system',
    accentPreset: 'ocean',
};

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
    document.documentElement.dataset.themeMode = 'dark';
    document.documentElement.dataset.themeModePreference = 'system';
    document.documentElement.dataset.themeAccent = 'ocean';
    document.documentElement.style.colorScheme = 'dark';
  }
})();`;