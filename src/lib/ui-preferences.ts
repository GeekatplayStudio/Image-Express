export type PipelineRailMode = 'off' | 'minimal' | 'detailed';

export type UiPreferences = {
    expandToolRailLabelsOnHover: boolean;
    suppressNumberDragHints: boolean;
    autosaveEnabled: boolean;
    lastCanvasWidth: number;
    lastCanvasHeight: number;
    /** Pipeline activity rail below the top toolbar. */
    pipelineRailMode: PipelineRailMode;
    /** Toast when a background job reaches a terminal state. */
    notifyOnJobComplete: boolean;
};

const PIPELINE_RAIL_MODES: readonly PipelineRailMode[] = ['off', 'minimal', 'detailed'];

export const UI_PREFERENCES_STORAGE_KEY = 'image-express-ui-preferences';
export const UI_PREFERENCES_CHANGED_EVENT = 'image-express:ui-preferences-changed';

const DEFAULT_UI_PREFERENCES: UiPreferences = {
    expandToolRailLabelsOnHover: false,
    suppressNumberDragHints: false,
    autosaveEnabled: false,
    lastCanvasWidth: 1080,
    lastCanvasHeight: 1080,
    pipelineRailMode: 'minimal',
    notifyOnJobComplete: true,
};

const coercePipelineRailMode = (value: unknown, fallback: PipelineRailMode): PipelineRailMode => (
    PIPELINE_RAIL_MODES.includes(value as PipelineRailMode) ? value as PipelineRailMode : fallback
);

const coerceBoolean = (value: unknown, fallback: boolean): boolean => (
    typeof value === 'boolean' ? value : fallback
);

const coercePositiveNumber = (value: unknown, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
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
            autosaveEnabled: coerceBoolean(
                parsed.autosaveEnabled,
                DEFAULT_UI_PREFERENCES.autosaveEnabled
            ),
            lastCanvasWidth: coercePositiveNumber(
                parsed.lastCanvasWidth,
                DEFAULT_UI_PREFERENCES.lastCanvasWidth
            ),
            lastCanvasHeight: coercePositiveNumber(
                parsed.lastCanvasHeight,
                DEFAULT_UI_PREFERENCES.lastCanvasHeight
            ),
            pipelineRailMode: coercePipelineRailMode(
                parsed.pipelineRailMode,
                DEFAULT_UI_PREFERENCES.pipelineRailMode
            ),
            notifyOnJobComplete: coerceBoolean(
                parsed.notifyOnJobComplete,
                DEFAULT_UI_PREFERENCES.notifyOnJobComplete
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

