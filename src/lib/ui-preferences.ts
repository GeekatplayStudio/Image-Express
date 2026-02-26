export type UiPreferences = {
    expandToolRailLabelsOnHover: boolean;
    suppressNumberDragHints: boolean;
};

export const UI_PREFERENCES_STORAGE_KEY = 'image-express-ui-preferences';
export const UI_PREFERENCES_CHANGED_EVENT = 'image-express:ui-preferences-changed';

const DEFAULT_UI_PREFERENCES: UiPreferences = {
    expandToolRailLabelsOnHover: true,
    suppressNumberDragHints: false,
};

const coerceBoolean = (value: unknown, fallback: boolean): boolean => (
    typeof value === 'boolean' ? value : fallback
);

export const loadUiPreferences = (): UiPreferences => {
    if (typeof window === 'undefined') return DEFAULT_UI_PREFERENCES;
    try {
        const raw = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
        if (!raw) return DEFAULT_UI_PREFERENCES;
        const parsed = JSON.parse(raw) as Partial<UiPreferences>;
        return {
            expandToolRailLabelsOnHover: coerceBoolean(
                parsed.expandToolRailLabelsOnHover,
                DEFAULT_UI_PREFERENCES.expandToolRailLabelsOnHover
            ),
            suppressNumberDragHints: coerceBoolean(
                parsed.suppressNumberDragHints,
                DEFAULT_UI_PREFERENCES.suppressNumberDragHints
            ),
        };
    } catch {
        return DEFAULT_UI_PREFERENCES;
    }
};

export const saveUiPreferences = (updates: Partial<UiPreferences>): UiPreferences => {
    if (typeof window === 'undefined') return { ...DEFAULT_UI_PREFERENCES, ...updates };
    const next = { ...loadUiPreferences(), ...updates };
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(UI_PREFERENCES_CHANGED_EVENT));
    return next;
};

