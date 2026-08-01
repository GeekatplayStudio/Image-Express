import type { VaultOrganizeLens } from '@/features/asset-vault/domain/vaultAlbumTree';
import type { VaultSortMode } from '@/features/asset-vault/domain/vaultNaturalQuery';

export const VAULT_UI_STATE_STORAGE_KEY = 'image-express-vault-ui-state';

export type VaultPageSize = 24 | 48 | 96 | 'all';

export type VaultUiState = {
    use3d: boolean;
    smartSearch: boolean;
    lens: VaultOrganizeLens;
    sortMode: VaultSortMode;
    query: string;
    pageSize: VaultPageSize;
    sourcesOpen: boolean;
};

export const DEFAULT_VAULT_UI_STATE: VaultUiState = {
    use3d: false,
    smartSearch: true,
    lens: 'type',
    sortMode: 'relevance',
    query: '',
    pageSize: 48,
    sourcesOpen: false,
};

const LENSES: VaultOrganizeLens[] = ['type', 'date', 'location', 'subject'];
const SORTS: VaultSortMode[] = [
    'relevance', 'name-asc', 'name-desc', 'newest', 'oldest', 'largest', 'smallest', 'type',
];
const PAGE_SIZES: VaultPageSize[] = [24, 48, 96, 'all'];

function coerceLens(value: unknown): VaultOrganizeLens {
    return typeof value === 'string' && (LENSES as string[]).includes(value)
        ? (value as VaultOrganizeLens)
        : DEFAULT_VAULT_UI_STATE.lens;
}

function coerceSort(value: unknown): VaultSortMode {
    return typeof value === 'string' && (SORTS as string[]).includes(value)
        ? (value as VaultSortMode)
        : DEFAULT_VAULT_UI_STATE.sortMode;
}

function coercePageSize(value: unknown): VaultPageSize {
    if (value === 'all') return 'all';
    if (value === 24 || value === 48 || value === 96) return value;
    if (value === '24' || value === '48' || value === '96') return Number(value) as 24 | 48 | 96;
    return DEFAULT_VAULT_UI_STATE.pageSize;
}

export function loadVaultUiState(): VaultUiState {
    if (typeof window === 'undefined') return { ...DEFAULT_VAULT_UI_STATE };
    try {
        const raw = window.localStorage.getItem(VAULT_UI_STATE_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_VAULT_UI_STATE };
        const parsed = JSON.parse(raw) as Partial<VaultUiState>;
        return {
            use3d: typeof parsed.use3d === 'boolean' ? parsed.use3d : DEFAULT_VAULT_UI_STATE.use3d,
            smartSearch: typeof parsed.smartSearch === 'boolean' ? parsed.smartSearch : DEFAULT_VAULT_UI_STATE.smartSearch,
            lens: coerceLens(parsed.lens),
            sortMode: coerceSort(parsed.sortMode),
            query: typeof parsed.query === 'string' ? parsed.query : DEFAULT_VAULT_UI_STATE.query,
            pageSize: coercePageSize(parsed.pageSize),
            sourcesOpen: typeof parsed.sourcesOpen === 'boolean' ? parsed.sourcesOpen : DEFAULT_VAULT_UI_STATE.sourcesOpen,
        };
    } catch {
        return { ...DEFAULT_VAULT_UI_STATE };
    }
}

export function saveVaultUiState(updates: Partial<VaultUiState>): VaultUiState {
    const next = { ...loadVaultUiState(), ...updates };
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(VAULT_UI_STATE_STORAGE_KEY, JSON.stringify(next));
    }
    return next;
}

export function isVaultPageSize(value: string): value is string {
    return PAGE_SIZES.some((entry) => String(entry) === value);
}
