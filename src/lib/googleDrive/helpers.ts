import type { AssetCategory, AssetType } from '@/types';
import type { DriveAssetRecord, DriveFileItem } from './types';

export function normalizeOwner(owner?: string) {
  const trimmed = owner?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Guest';
}

export function nowIso() {
  return new Date().toISOString();
}

export function toBooleanString(value: boolean) {
  return value ? 'true' : 'false';
}

export function escapeDriveQueryValue(input: string) {
  return input.replace(/'/g, "\\'");
}

export function inferTypeFromFilenameAndMime(name: string, mimeType: string): AssetType {
  const lower = name.toLowerCase();
  if (mimeType.startsWith('video/')) return 'videos';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'model/gltf-binary' || mimeType === 'model/gltf+json') return 'models';
  if (mimeType.startsWith('image/')) return 'images';
  if (/\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(lower)) return 'videos';
  if (/\.(mp3|wav|ogg|m4a|aac|flac|oga)$/i.test(lower)) return 'audio';
  if (/\.(glb|gltf|obj|fbx|stl|ply)$/i.test(lower)) return 'models';
  return 'images';
}

export function mapDriveFileToAsset(file: DriveFileItem): DriveAssetRecord | null {
  if (!file?.id || !file.name) return null;
  const app = file.appProperties || {};
  const mimeType = file.mimeType || 'application/octet-stream';
  const owner = normalizeOwner(app.iexOwner);
  const category = (app.iexAssetCategory === 'generated' ? 'generated' : 'uploads') as AssetCategory;
  const type = (app.iexAssetType === 'videos' || app.iexAssetType === 'audio' || app.iexAssetType === 'models' || app.iexAssetType === 'images'
    ? app.iexAssetType
    : inferTypeFromFilenameAndMime(file.name, mimeType)) as AssetType;
  const createdAt = file.createdTime || app.iexCreatedAt || nowIso();
  const updatedAt = file.modifiedTime || app.iexUpdatedAt || createdAt;

  return {
    id: file.id,
    name: file.name,
    type,
    category,
    owner,
    isPublic: app.iexIsPublic === 'true',
    mimeType,
    createdAt,
    updatedAt
  };
}
