import type { VaultAssetType } from '../contracts/assetRecord';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.oga']);
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply']);

export function inferVaultAssetType(filename: string, mimeType?: string): VaultAssetType {
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
    return 'images';
}

export function buildVaultAssetId(prefix = 'vast'): string {
    const random = Math.round(Math.random() * 1e9).toString(36);
    return `${prefix}_${Date.now().toString(36)}_${random}`;
}

/** Deterministic vault id so catalog reloads keep the same keys for thumbs/bookcases. */
export function stableVaultAssetId(prefix: string, key: string): string {
    const safe = key
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._/-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 180);
    return `${prefix}_${safe || 'unknown'}`;
}

export function buildMergeKey(asset: { type: string; category: string; owner?: string; name: string }) {
    return [
        asset.type,
        asset.category,
        (asset.owner || 'Guest').toLowerCase(),
        asset.name.trim().toLowerCase(),
    ].join('|');
}
