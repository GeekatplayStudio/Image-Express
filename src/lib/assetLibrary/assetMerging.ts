import { AssetDescriptor, AssetType } from '@/types';
import { ALL_IMAGE_EXTENSIONS } from '@/lib/imageFormats/supportedFormats';

/**
 * Asset identity, deduplication and group membership for the asset library.
 *
 * The same file routinely exists in more than one place — saved on the server,
 * cached locally, and synced to the user's Drive. Without merging, the library
 * shows the same asset three times; merging badly shows a Drive copy that needs
 * a network round-trip when a local one was available. That decision lived
 * inside a 3,000-line component with no tests.
 *
 * Everything here is pure except `loadAssetGroups`/`saveAssetGroups`, which
 * touch localStorage and are written to never throw.
 */

export type AssetScopeTab = 'personal' | 'shared';
export type VisibilityFilter = 'all' | 'public' | 'private';
export type AssetStorageProvider = 'server' | 'local' | 'google-drive' | 'merged';

export type LibraryAsset = AssetDescriptor & {
    storageProvider: AssetStorageProvider;
    storageId?: string;
    previewPath?: string;
    sourceAssets?: LibraryAsset[];
    /** Search-index metadata (AI caption/tags, embedded prompt) when available. */
    description?: string;
    tags?: string[];
};

const IMAGE_EXTENSIONS = ALL_IMAGE_EXTENSIONS;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.oga']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply']);

/**
 * Drive errors that mean "the browser blocked a popup", not "auth failed".
 * These must not surface as sign-in failures — the user did nothing wrong and
 * retrying silently is correct.
 */
export const isDrivePassiveAuthError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalized = message.toLowerCase();
    return normalized.includes('requires user interaction')
        || normalized.includes('failed to open popup window')
        || normalized.includes('popup_failed_to_open')
        || normalized.includes('cross-origin-opener-policy');
};

/** MIME type wins over extension; images are the fallback for anything unknown. */
export const inferAssetType = (filename: string, mimeType?: string): AssetType => {
    const lowerName = filename.toLowerCase();
    const dotIndex = lowerName.lastIndexOf('.');
    const extension = dotIndex >= 0 ? lowerName.slice(dotIndex) : '';

    if (mimeType) {
        if (mimeType.startsWith('video/')) return 'videos';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType === 'model/gltf-binary' || mimeType === 'model/gltf+json') return 'models';
        if (mimeType.startsWith('image/')) return 'images';
    }

    if (VIDEO_EXTENSIONS.has(extension)) return 'videos';
    if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
    if (MODEL_EXTENSIONS.has(extension)) return 'models';
    if (IMAGE_EXTENSIONS.has(extension)) return 'images';

    return 'images';
};

/**
 * Which copy to prefer when the same asset exists in several places. Local
 * first because it needs no network at all, then Drive, then the server.
 */
const SOURCE_PRIORITY: Record<Exclude<AssetStorageProvider, 'merged'>, number> = {
    local: 0,
    'google-drive': 1,
    server: 2,
};

const MODEL_SOURCE_PRIORITY: Record<Exclude<AssetStorageProvider, 'merged'>, number> = {
    server: 0,
    local: 1,
    'google-drive': 2,
};

/**
 * What makes two entries "the same asset".
 *
 * Owner and visibility are part of the key on purpose: two users may each have
 * a `logo.png`, and a public copy is not interchangeable with a private one.
 */
export const getAssetMergeKey = (asset: LibraryAsset) => [
    asset.type,
    asset.category,
    (asset.owner || '').toLowerCase(),
    asset.isPublic ? 'public' : 'private',
    asset.name.trim().toLowerCase(),
].join('|');

export const getSourceAssets = (asset: LibraryAsset): LibraryAsset[] => (
    Array.isArray(asset.sourceAssets) && asset.sourceAssets.length > 0
        ? asset.sourceAssets
        : [asset]
);

export const pickRepresentativeAsset = (asset: LibraryAsset): LibraryAsset => {
    const sourceAssets = getSourceAssets(asset).filter((entry) => entry.storageProvider !== 'merged');
    if (sourceAssets.length === 0) return asset;
    return [...sourceAssets].sort((a, b) => {
        const priorities = asset.type === 'models' ? MODEL_SOURCE_PRIORITY : SOURCE_PRIORITY;
        const aPriority = priorities[a.storageProvider as Exclude<AssetStorageProvider, 'merged'>] ?? 99;
        const bPriority = priorities[b.storageProvider as Exclude<AssetStorageProvider, 'merged'>] ?? 99;
        return aPriority - bPriority;
    })[0];
};

/** Collapse duplicates into one entry per asset, newest first. */
export const mergeDuplicateAssets = (items: LibraryAsset[]): LibraryAsset[] => {
    const groups = new Map<string, LibraryAsset[]>();

    items.forEach((item) => {
        const key = getAssetMergeKey(item);
        const bucket = groups.get(key);
        if (bucket) {
            bucket.push(item);
        } else {
            groups.set(key, [item]);
        }
    });

    const merged = Array.from(groups.entries()).map(([key, grouped]) => {
        if (grouped.length === 1) {
            return grouped[0];
        }
        const representative = pickRepresentativeAsset({
            ...grouped[0],
            storageProvider: 'merged',
            sourceAssets: grouped,
        } as LibraryAsset);
        return {
            ...representative,
            path: `merged://${encodeURIComponent(key)}`,
            storageProvider: 'merged',
            sourceAssets: grouped,
        } as LibraryAsset;
    });

    return merged.sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''));
};

export const GROUPS_STORAGE_PREFIX = 'imageExpressAssetGroups:';

/** Stable identity for group membership that survives re-listing and storage merges. */
export const getAssetGroupKey = (asset: LibraryAsset) => [
    asset.type,
    asset.category,
    (asset.owner || '').toLowerCase(),
    asset.name.trim().toLowerCase(),
].join('|');

export type AssetGroupMap = Record<string, string[]>;

export const loadAssetGroups = (user: string): AssetGroupMap => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(`${GROUPS_STORAGE_PREFIX}${user.toLowerCase()}`);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const result: AssetGroupMap = {};
        Object.entries(parsed as Record<string, unknown>).forEach(([name, keys]) => {
            if (Array.isArray(keys)) {
                result[name] = keys.filter((key): key is string => typeof key === 'string');
            }
        });
        return result;
    } catch {
        return {};
    }
};

export const saveAssetGroups = (user: string, groups: AssetGroupMap) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(`${GROUPS_STORAGE_PREFIX}${user.toLowerCase()}`, JSON.stringify(groups));
    } catch {
        // Best-effort persistence; groups are a convenience layer.
    }
};
