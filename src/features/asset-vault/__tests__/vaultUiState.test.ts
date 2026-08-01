import { loadVaultUiState, saveVaultUiState, DEFAULT_VAULT_UI_STATE } from '../application/client/vaultUiState';

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
});
