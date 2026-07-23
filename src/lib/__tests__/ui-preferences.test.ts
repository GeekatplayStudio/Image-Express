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
        });
    });

    it('respects a persisted hover-expansion preference override', () => {
        localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
            expandToolRailLabelsOnHover: true,
        }));

        expect(loadUiPreferences().expandToolRailLabelsOnHover).toBe(true);
    });
});
