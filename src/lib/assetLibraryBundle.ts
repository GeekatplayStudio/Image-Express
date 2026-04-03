import type { AssetCategory, AssetType } from '@/types';

export const ASSET_LIBRARY_BUNDLE_KIND = 'image-express-asset-library';
export const ASSET_LIBRARY_BUNDLE_VERSION = 1;
export const ASSET_LIBRARY_BUNDLE_MANIFEST_PATH = 'manifest.json';

export type AssetLibraryBundleEntry = {
    archivePath: string;
    name: string;
    type: AssetType;
    category: AssetCategory;
    owner: string;
    isPublic: boolean;
    mimeType?: string;
    createdAt?: string;
    updatedAt?: string;
    sourceProviders: string[];
};

export type AssetLibraryBundleManifest = {
    kind: typeof ASSET_LIBRARY_BUNDLE_KIND;
    version: typeof ASSET_LIBRARY_BUNDLE_VERSION;
    exportedAt: string;
    exportedBy: string;
    assetCount: number;
    assets: AssetLibraryBundleEntry[];
};

type AssetLibraryBundleCollisionInput = {
    name: string;
    type: AssetType;
    category: AssetCategory;
    owner?: string;
    isPublic?: boolean;
};

export function normalizeAssetBundleOwner(owner?: string) {
    const trimmed = owner?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : 'Guest';
}

export function buildAssetLibraryBundleCollisionKey({
    name,
    type,
    category,
    owner,
    isPublic,
}: AssetLibraryBundleCollisionInput) {
    return [
        type,
        category,
        normalizeAssetBundleOwner(owner).toLowerCase(),
        isPublic ? 'public' : 'private',
        name.trim().toLowerCase(),
    ].join('|');
}

function sanitizeArchiveSegment(value: string) {
    return value
        .trim()
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
        .replace(/\s+/g, '_')
        .replace(/-+/g, '-')
        .replace(/_+/g, '_')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        || 'asset';
}

export function buildAssetLibraryBundleArchivePath(params: {
    index: number;
    name: string;
    type: AssetType;
    category: AssetCategory;
}) {
    const prefix = String(params.index + 1).padStart(3, '0');
    return `assets/${params.category}/${params.type}/${prefix}-${sanitizeArchiveSegment(params.name)}`;
}

export function isAssetLibraryBundleManifest(value: unknown): value is AssetLibraryBundleManifest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Partial<AssetLibraryBundleManifest>;
    if (candidate.kind !== ASSET_LIBRARY_BUNDLE_KIND || candidate.version !== ASSET_LIBRARY_BUNDLE_VERSION) {
        return false;
    }

    if (!Array.isArray(candidate.assets)) {
        return false;
    }

    return candidate.assets.every((asset) => (
        asset
        && typeof asset === 'object'
        && typeof asset.archivePath === 'string'
        && typeof asset.name === 'string'
        && typeof asset.type === 'string'
        && typeof asset.category === 'string'
        && typeof asset.owner === 'string'
        && typeof asset.isPublic === 'boolean'
        && Array.isArray(asset.sourceProviders)
    ));
}