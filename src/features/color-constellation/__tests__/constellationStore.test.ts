import {
    exportHarmonyJson,
    importHarmonyJson,
    loadConstellationUiPrefs,
    saveConstellationUiPrefs,
} from '../application/constellationStore';

describe('constellationStore', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('round-trips harmony JSON export/import', () => {
        const json = exportHarmonyJson([
            { id: 'a', name: 'Warm', colors: ['#ff0000', '#00ff00'], createdAt: 1 },
        ]);
        const imported = importHarmonyJson(json);
        expect(imported).toHaveLength(1);
        expect(imported[0].name).toBe('Warm');
        expect(imported[0].colors).toEqual(['#ff0000', '#00ff00']);
    });

    it('persists UI preference for constellation vs classic', () => {
        expect(loadConstellationUiPrefs().preferConstellation).toBe(true);
        saveConstellationUiPrefs({ preferConstellation: false });
        expect(loadConstellationUiPrefs().preferConstellation).toBe(false);
    });
});
