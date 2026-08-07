import { loadUiPreferences, UI_PREFERENCES_STORAGE_KEY } from '../ui-preferences';

describe('ui-preferences', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('defaults hover-expanding tool rail labels to off', () => {
        expect(loadUiPreferences()).toEqual({
            expandToolRailLabelsOnHover: false,
            suppressNumberDragHints: false,
            autosaveEnabled: false,
            lastCanvasWidth: 1080,
            lastCanvasHeight: 1080,
            pipelineRailMode: 'minimal',
            notifyOnJobComplete: true,
        });
    });

    it('defaults the pipeline rail to minimal with completion notifications on', () => {
        const preferences = loadUiPreferences();
        expect(preferences.pipelineRailMode).toBe('minimal');
        expect(preferences.notifyOnJobComplete).toBe(true);
    });

    it('falls back to the default rail mode when a persisted value is not a valid mode', () => {
        localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
            pipelineRailMode: 'sideways',
        }));

        expect(loadUiPreferences().pipelineRailMode).toBe('minimal');
    });

    it('respects a persisted pipeline rail override', () => {
        localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
            pipelineRailMode: 'off',
            notifyOnJobComplete: false,
        }));

        const preferences = loadUiPreferences();
        expect(preferences.pipelineRailMode).toBe('off');
        expect(preferences.notifyOnJobComplete).toBe(false);
    });

    it('respects a persisted hover-expansion preference override', () => {
        localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
            expandToolRailLabelsOnHover: true,
        }));

        expect(loadUiPreferences().expandToolRailLabelsOnHover).toBe(true);
    });
});
