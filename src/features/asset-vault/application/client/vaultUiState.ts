import type { VaultOrganizeLens } from '@/features/asset-vault/domain/vaultAlbumTree';
import type { VaultSortMode } from '@/features/asset-vault/domain/vaultNaturalQuery';
import type { VaultAssetSource } from '@/features/asset-vault/domain/filterVaultAssets';

/** Left-sidebar mode: derived groupings, or the real folder tree on disk. */
export type VaultNavMode = 'groups' | 'folders';

export const VAULT_UI_STATE_STORAGE_KEY = 'image-express-vault-ui-state';

export type VaultPageSize = 24 | 48 | 96 | 'all';

/**
 * Grid tile size, as the minimum column width in pixels.
 *
 * A fixed set rather than a free slider value: each step maps onto a thumbnail
 * width the server already caches, so dragging the control cannot fill the
 * cache with a hundred near-identical renditions.
 */
export const VAULT_THUMB_SIZES = [96, 128, 160, 200, 260, 340] as const;

export type VaultThumbSize = (typeof VAULT_THUMB_SIZES)[number];

/**
 * The rendition width to request for a tile of this size.
 *
 * Deliberately coarse. Every distinct width is a separate cached rendition, and
 * the background precache pass generates 256 — so mapping five of the six steps
 * onto 256 means resizing the grid is instant for almost the whole range, at
 * the cost of some over-fetching at the smallest step. Only the largest tile
 * asks for something the precache has not already produced.
 */
export function thumbnailWidthForSize(size: VaultThumbSize): 256 | 512 {
    return size >= 340 ? 512 : 256;
}

export type VaultUiState = {
    use3d: boolean;
    smartSearch: boolean;
    lens: VaultOrganizeLens;
    sortMode: VaultSortMode;
    query: string;
    pageSize: VaultPageSize;
    sourcesOpen: boolean;
    /** Left sidebar: derived groupings, or the real on-disk folder tree. */
    navMode: VaultNavMode;
    /**
     * Whether to show everything, only what was brought into the app, or only
     * what a drive scan found.
     */
    assetSource: VaultAssetSource;
    /** Grid tile size, as the minimum column width in pixels. */
    thumbSize: VaultThumbSize;
};

export const DEFAULT_VAULT_UI_STATE: VaultUiState = {
    use3d: false,
    smartSearch: true,
    lens: 'type',
    sortMode: 'relevance',
    query: '',
    pageSize: 48,
    sourcesOpen: false,
    navMode: 'groups',
    // Defaults to the user's own assets. Indexing a drive can add hundreds of
    // thousands of files, and defaulting to everything buries the handful the
    // user actually works with.
    assetSource: 'library',
    thumbSize: 128,
};

const LENSES: VaultOrganizeLens[] = ['type', 'date', 'location', 'subject'];
const SORTS: VaultSortMode[] = [
    'relevance', 'name-asc', 'name-desc', 'newest', 'oldest', 'largest', 'smallest', 'type',
];
const PAGE_SIZES: VaultPageSize[] = [24, 48, 96, 'all'];
const NAV_MODES: VaultNavMode[] = ['groups', 'folders'];
const ASSET_SOURCES: VaultAssetSource[] = ['all', 'library', 'indexed'];

function coerceNavMode(value: unknown): VaultNavMode {
    return typeof value === 'string' && (NAV_MODES as string[]).includes(value)
        ? (value as VaultNavMode)
        : DEFAULT_VAULT_UI_STATE.navMode;
}

function coerceAssetSource(value: unknown): VaultAssetSource {
    return typeof value === 'string' && (ASSET_SOURCES as string[]).includes(value)
        ? (value as VaultAssetSource)
        : DEFAULT_VAULT_UI_STATE.assetSource;
}

function coerceThumbSize(value: unknown): VaultThumbSize {
    // Snap an unknown value to the nearest step rather than discarding it: a
    // stored size from an older build should land on the closest tile size the
    // user last chose, not silently reset to the default.
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_VAULT_UI_STATE.thumbSize;
    }
    return VAULT_THUMB_SIZES.reduce((best, size) => (
        Math.abs(size - value) < Math.abs(best - value) ? size : best
    ), VAULT_THUMB_SIZES[0]);
}

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
            navMode: coerceNavMode(parsed.navMode),
            assetSource: coerceAssetSource(parsed.assetSource),
            thumbSize: coerceThumbSize(parsed.thumbSize),
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
