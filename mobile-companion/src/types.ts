export type AssetUploadType = 'images' | 'videos' | 'audio';
export type CaptureKind = 'photo' | 'video' | 'audio' | 'file';
export type UploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

export interface AuthSession {
  email: string;
  displayName: string;
  sessionToken: string;
}

export interface CapturedMediaItem {
  id: string;
  captureKind: CaptureKind;
  assetType: AssetUploadType;
  name: string;
  localUri: string;
  mimeType: string;
  previewUri?: string;
  createdAt: string;
}

export interface UploadItem {
  id: string;
  media: CapturedMediaItem;
  status: UploadStatus;
  error?: string;
  remotePath?: string;
  uploadedAt?: string;
}

export interface RemoteAssetItem {
  path: string;
  name: string;
  type: AssetUploadType;
  category: 'uploads' | 'generated';
  owner: string;
  isPublic: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UploadedAssetPayload {
  success: boolean;
  path: string;
  filename: string;
  type: AssetUploadType;
  category: 'uploads' | 'generated';
  owner: string;
  isPublic: boolean;
}