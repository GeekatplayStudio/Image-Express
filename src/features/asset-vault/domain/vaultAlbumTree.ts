import type { VaultAssetRecord } from '../contracts/assetRecord';
import type { Bookcase } from '../contracts/bookcase';
import {
    assetMonthKey,
    formatMonthShelfLabel,
    filterAssetsByBookcase,
} from './bookcaseEngine';

/** Organization lens for the vault room (UI copy: Albums / Pages). */
export type VaultOrganizeLens = 'type' | 'date' | 'location' | 'subject';

export const VAULT_ORGANIZE_LENSES: VaultOrganizeLens[] = ['type', 'date', 'location', 'subject'];

/** A Page inside a Vault Album — holds a slice of assets. */
export type VaultPage = {
    id: string;
    /** Fallback English label; prefer labelKey when set. */
    label: string;
    labelKey?: string;
    labelParams?: Record<string, string | number>;
    assetIds: string[];
};

/** A Vault Album — floating box in the room; contains Pages. */
export type VaultAlbum = {
    id: string;
    /** Fallback / custom name (manual, tags, smart clusters). */
    label: string;
    /** i18n key for built-in albums; UI should prefer this over label. */
    labelKey?: string;
    labelParams?: Record<string, string | number>;
    kind: string;
    pageCount: number;
    assetCount: number;
    pages: VaultPage[];
    /** Primary accent hint for 3D chrome */
    accent: 'image' | 'video' | 'audio' | 'model' | 'drive' | 'local' | 'date' | 'tag' | 'mixed';
};

/** Default items per album page when the UI does not pass a size. */
export const DEFAULT_ASSETS_PER_PAGE = 48;

export type VaultAlbumTreeOptions = {
    /** How many assets land on each album Page. Use a huge number for a single page. */
    assetsPerPage?: number;
};

const TYPE_LABEL_KEYS: Record<string, string> = {
    images: 'vault.albumTypePhotos',
    videos: 'vault.albumTypeVideos',
    audio: 'vault.albumTypeAudio',
    models: 'vault.albumTypeModels',
};

const TYPE_ACCENT: Record<string, VaultAlbum['accent']> = {
    images: 'image',
    videos: 'video',
    audio: 'audio',
    models: 'model',
};

const LOCATION_LABEL_KEYS: Record<string, string> = {
    server: 'vault.albumLocServer',
    'indexeddb-legacy': 'vault.albumLocLocalLibrary',
    'google-drive': 'vault.albumLocGoogleDrive',
    local: 'vault.albumLocIndexedDrives',
    network: 'vault.albumLocNetwork',
};

const LOCATION_ACCENT: Record<string, VaultAlbum['accent']> = {
    server: 'mixed',
    'indexeddb-legacy': 'local',
    'google-drive': 'drive',
    local: 'local',
    network: 'local',
};

function normalizeAssetsPerPage(size: number | undefined): number {
    if (!Number.isFinite(size) || !size || size < 1) return DEFAULT_ASSETS_PER_PAGE;
    return Math.floor(size);
}

function chunkAssetIds(ids: string[], size: number): string[][] {
    if (ids.length === 0) return [[]];
    const pageSize = normalizeAssetsPerPage(size);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += pageSize) {
        chunks.push(ids.slice(i, i + pageSize));
    }
    return chunks;
}

function pagesFromAssetIds(
    albumId: string,
    options: { label: string; labelKey?: string; labelParams?: Record<string, string | number> },
    assetIds: string[],
    assetsPerPage: number,
): VaultPage[] {
    const chunks = chunkAssetIds(assetIds, assetsPerPage);
    return chunks.map((ids, index) => ({
        id: `${albumId}::page_${index + 1}`,
        label: chunks.length === 1 ? options.label : `Page ${index + 1}`,
        labelKey: chunks.length === 1 ? options.labelKey : 'vault.pageN',
        labelParams: chunks.length === 1 ? options.labelParams : { n: index + 1 },
        assetIds: ids,
    }));
}

function albumFromGroup(options: {
    id: string;
    label: string;
    labelKey?: string;
    labelParams?: Record<string, string | number>;
    kind: string;
    assetIds: string[];
    accent: VaultAlbum['accent'];
    assetsPerPage: number;
}): VaultAlbum {
    const pages = pagesFromAssetIds(
        options.id,
        { label: options.label, labelKey: options.labelKey, labelParams: options.labelParams },
        options.assetIds,
        options.assetsPerPage,
    );
    return {
        id: options.id,
        label: options.label,
        labelKey: options.labelKey,
        labelParams: options.labelParams,
        kind: options.kind,
        pageCount: pages.length,
        assetCount: options.assetIds.length,
        pages,
        accent: options.accent,
    };
}

function buildTypeAlbums(assets: VaultAssetRecord[], assetsPerPage: number): VaultAlbum[] {
    const order = ['images', 'videos', 'audio', 'models'] as const;
    return order
        .map((type) => {
            const ids = assets.filter((asset) => asset.type === type).map((asset) => asset.id);
            if (ids.length === 0) return null;
            return albumFromGroup({
                id: `album_type_${type}`,
                label: type,
                labelKey: TYPE_LABEL_KEYS[type],
                kind: 'type',
                assetIds: ids,
                accent: TYPE_ACCENT[type] || 'mixed',
                assetsPerPage,
            });
        })
        .filter((entry): entry is VaultAlbum => entry !== null);
}

function buildDateAlbums(assets: VaultAssetRecord[], assetsPerPage: number): VaultAlbum[] {
    const buckets = new Map<string, string[]>();
    for (const asset of assets) {
        const key = assetMonthKey(asset);
        const list = buckets.get(key);
        if (list) list.push(asset.id);
        else buckets.set(key, [asset.id]);
    }
    return Array.from(buckets.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, assetIds]) => albumFromGroup({
            id: `album_date_${key}`,
            label: key === 'unknown' ? 'unknown' : formatMonthShelfLabel(key, 'en-US'),
            labelKey: key === 'unknown' ? 'vault.unknownDate' : 'vault.albumMonth',
            labelParams: key === 'unknown' ? undefined : { monthKey: key },
            kind: 'date',
            assetIds,
            accent: 'date',
            assetsPerPage,
        }));
}

function buildLocationAlbums(assets: VaultAssetRecord[], assetsPerPage: number): VaultAlbum[] {
    const buckets = new Map<string, string[]>();
    for (const asset of assets) {
        const key = asset.origin.connector;
        const list = buckets.get(key);
        if (list) list.push(asset.id);
        else buckets.set(key, [asset.id]);
    }
    return Array.from(buckets.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, assetIds]) => albumFromGroup({
            id: `album_loc_${key}`,
            label: key,
            labelKey: LOCATION_LABEL_KEYS[key],
            kind: 'location',
            assetIds,
            accent: LOCATION_ACCENT[key] || 'mixed',
            assetsPerPage,
        }));
}

/** Subject lens: tag clusters + generated + smart-cluster bookcases + untagged. */
function buildSubjectAlbums(
    assets: VaultAssetRecord[],
    bookcases: Bookcase[],
    assetsPerPage: number,
): VaultAlbum[] {
    const albums: VaultAlbum[] = [];
    const claimed = new Set<string>();

    const generated = assets.filter((asset) => asset.category === 'generated');
    if (generated.length > 0) {
        const ids = generated.map((asset) => asset.id);
        ids.forEach((id) => claimed.add(id));
        albums.push(albumFromGroup({
            id: 'album_subject_generated',
            label: 'Generated',
            labelKey: 'vault.albumSubjectGenerated',
            kind: 'subject',
            assetIds: ids,
            accent: 'image',
            assetsPerPage,
        }));
    }

    for (const bookcase of bookcases) {
        if (bookcase.kind !== 'smart-cluster' && bookcase.kind !== 'manual' && bookcase.kind !== 'search-result') continue;
        const filtered = filterAssetsByBookcase(assets, bookcase);
        if (filtered.length === 0) continue;
        const ids = filtered.map((asset) => asset.id);
        ids.forEach((id) => claimed.add(id));
        albums.push(albumFromGroup({
            id: `album_subject_${bookcase.id}`,
            label: bookcase.name,
            kind: bookcase.kind,
            assetIds: ids,
            accent: 'tag',
            assetsPerPage,
        }));
    }

    const tagBuckets = new Map<string, string[]>();
    for (const asset of assets) {
        if (claimed.has(asset.id)) continue;
        const tags = asset.tags?.length ? asset.tags : [];
        if (tags.length === 0) continue;
        const tag = tags[0].toLowerCase();
        const list = tagBuckets.get(tag);
        if (list) list.push(asset.id);
        else tagBuckets.set(tag, [asset.id]);
    }

    const topTags = Array.from(tagBuckets.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 12);

    for (const [tag, assetIds] of topTags) {
        assetIds.forEach((id) => claimed.add(id));
        albums.push(albumFromGroup({
            id: `album_subject_tag_${tag}`,
            label: tag.replace(/[_-]+/g, ' '),
            kind: 'subject',
            assetIds,
            accent: 'tag',
            assetsPerPage,
        }));
    }

    const untagged = assets.filter((asset) => !claimed.has(asset.id));
    if (untagged.length > 0) {
        albums.push(albumFromGroup({
            id: 'album_subject_untagged',
            label: 'Unsorted',
            labelKey: 'vault.albumSubjectUnsorted',
            kind: 'subject',
            assetIds: untagged.map((asset) => asset.id),
            accent: 'mixed',
            assetsPerPage,
        }));
    }

    return albums.filter((album) => album.assetCount > 0);
}

/**
 * Build Vault Album → Page trees for the active organization lens.
 * Bookcases are only used for subject/manual/smart-cluster enrichment.
 */
export function buildVaultAlbumTree(
    assets: VaultAssetRecord[],
    lens: VaultOrganizeLens,
    bookcases: Bookcase[] = [],
    options: VaultAlbumTreeOptions = {},
): VaultAlbum[] {
    if (assets.length === 0) return [];
    const assetsPerPage = normalizeAssetsPerPage(options.assetsPerPage);
    switch (lens) {
        case 'type':
            return buildTypeAlbums(assets, assetsPerPage);
        case 'date':
            return buildDateAlbums(assets, assetsPerPage);
        case 'location':
            return buildLocationAlbums(assets, assetsPerPage);
        case 'subject':
            return buildSubjectAlbums(assets, bookcases, assetsPerPage);
        default:
            return buildTypeAlbums(assets, assetsPerPage);
    }
}

export function findVaultAlbum(albums: VaultAlbum[], albumId: string | null | undefined): VaultAlbum | null {
    if (!albumId) return null;
    return albums.find((album) => album.id === albumId) || null;
}

export function findVaultPage(album: VaultAlbum | null, pageId: string | null | undefined): VaultPage | null {
    if (!album || !pageId) return null;
    return album.pages.find((page) => page.id === pageId) || null;
}

export function assetsForPage(
    assets: VaultAssetRecord[],
    page: VaultPage | null,
): VaultAssetRecord[] {
    if (!page) return [];
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return page.assetIds
        .map((id) => byId.get(id))
        .filter((asset): asset is VaultAssetRecord => Boolean(asset));
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

/** Resolve a vault album/page label through i18n, with locale-aware month names. */
export function resolveVaultLabel(
    entry: { label: string; labelKey?: string; labelParams?: Record<string, string | number> },
    t: TranslateFn,
    language = 'en',
): string {
    if (entry.labelKey === 'vault.albumMonth') {
        const monthKey = String(entry.labelParams?.monthKey || '');
        if (!monthKey || monthKey === 'unknown') return t('vault.unknownDate');
        const locale = language.includes('-') ? language : language;
        return formatMonthShelfLabel(monthKey, locale) || t('vault.unknownDate');
    }
    if (entry.labelKey) {
        return t(entry.labelKey, entry.labelParams);
    }
    return entry.label;
}

/**
 * Axis-aligned XYZ lattice for floating album boxes.
 * X = columns, Z = depth rows, Y = vertical layers when the set grows.
 * All boxes share the same orientation — no diagonal skew.
 */
export function albumGridPose(index: number, total: number) {
    const n = Math.max(1, total);
    const spacingX = 118;
    const spacingZ = 118;
    const spacingY = 108;

    // Flat floor grid until we need a second vertical layer.
    if (n <= 16) {
        const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
        const rows = Math.ceil(n / cols);
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
            cx: (col - (cols - 1) / 2) * spacingX,
            cy: 0,
            cz: (row - (rows - 1) / 2) * spacingZ,
        };
    }

    const cols = Math.max(2, Math.ceil(Math.cbrt(n)));
    const depthRows = Math.max(2, Math.ceil(Math.sqrt(n / cols)));
    const col = index % cols;
    const row = Math.floor(index / cols) % depthRows;
    const layer = Math.floor(index / (cols * depthRows));

    return {
        cx: (col - (cols - 1) / 2) * spacingX,
        // Avoid signed-zero from `-0 * spacingY` so poses stay clean for tests/debug.
        cy: layer === 0 ? 0 : -layer * spacingY,
        cz: (row - (depthRows - 1) / 2) * spacingZ,
    };
}
