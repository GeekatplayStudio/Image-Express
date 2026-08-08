import {
    loadVaultUiState,
    saveVaultUiState,
    thumbnailWidthForSize,
    DEFAULT_VAULT_UI_STATE,
    VAULT_THUMB_SIZES,
} from '../application/client/vaultUiState';

describe('vaultUiState', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('returns defaults when empty', () => {
        expect(loadVaultUiState()).toEqual(DEFAULT_VAULT_UI_STATE);
    });

    it('persists and restores vault chrome state', () => {
        saveVaultUiState({
            use3d: false,
            lens: 'date',
            query: 'sunset',
            pageSize: 'all',
            smartSearch: false,
            sortMode: 'newest',
        });
        expect(loadVaultUiState()).toMatchObject({
            use3d: false,
            lens: 'date',
            query: 'sunset',
            pageSize: 'all',
            smartSearch: false,
            sortMode: 'newest',
        });
    });

    it('rejects invalid lens / pageSize', () => {
        window.localStorage.setItem(
            'image-express-vault-ui-state',
            JSON.stringify({ lens: 'nope', pageSize: 13, use3d: true }),
        );
        const state = loadVaultUiState();
        expect(state.lens).toBe('type');
        expect(state.pageSize).toBe(48);
        expect(state.use3d).toBe(true);
    });

    it('remembers the grid tile size across sessions', () => {
        saveVaultUiState({ thumbSize: 260 });
        expect(loadVaultUiState().thumbSize).toBe(260);
    });

    it('snaps an unrecognised tile size to the nearest step', () => {
        // A size stored by an older build should land on the closest thing the
        // user last chose, not silently reset to the default.
        window.localStorage.setItem(
            'image-express-vault-ui-state',
            JSON.stringify({ thumbSize: 210 }),
        );
        expect(loadVaultUiState().thumbSize).toBe(200);
    });

    it.each([null, 'big', Number.NaN])('falls back to the default for %p', (value) => {
        window.localStorage.setItem(
            'image-express-vault-ui-state',
            JSON.stringify({ thumbSize: value }),
        );
        expect(loadVaultUiState().thumbSize).toBe(DEFAULT_VAULT_UI_STATE.thumbSize);
    });
});

describe('thumbnailWidthForSize', () => {
    it('asks for one cached width across almost the whole range', () => {
        // Every distinct width is a separate cached rendition, and the
        // background precache pass generates 256. Mapping most steps onto it is
        // what makes dragging the slider instant rather than triggering a
        // resize of every visible tile.
        const widths = VAULT_THUMB_SIZES.map(thumbnailWidthForSize);
        expect(new Set(widths).size).toBe(2);
        expect(widths.filter((width) => width === 256).length).toBe(VAULT_THUMB_SIZES.length - 1);
    });

    it('only the largest tile asks for a bigger rendition', () => {
        expect(thumbnailWidthForSize(340)).toBe(512);
        expect(thumbnailWidthForSize(260)).toBe(256);
    });
});
