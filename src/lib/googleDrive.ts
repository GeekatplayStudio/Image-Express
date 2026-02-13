import type { AssetCategory, AssetType, GoogleDriveConfig } from '@/types';

const STORAGE_KEY = 'image-express-google-drive';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_METADATA = {
  name: 'Image Express Backups',
  mimeType: 'application/vnd.google-apps.folder',
};
const ASSET_FOLDER_METADATA = {
  name: 'Image Express Assets',
  mimeType: 'application/vnd.google-apps.folder',
};

interface StoredConfig extends GoogleDriveConfig {
  accessToken?: string;
  refreshToken?: string;
  folderId?: string;
  assetsFolderId?: string;
  assetsFolderName?: string;
  tokenExpiry?: number;
}

interface DriveFileListResponse {
  files?: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
    createdTime?: string;
    modifiedTime?: string;
    appProperties?: Record<string, string | undefined>;
  }>;
  nextPageToken?: string;
}

type DriveFileItem = NonNullable<DriveFileListResponse['files']>[number];

export interface DriveAssetRecord {
  id: string;
  name: string;
  type: AssetType;
  category: AssetCategory;
  owner: string;
  isPublic: boolean;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
}

interface ListDriveAssetsParams {
  owner: string;
  scope: 'personal' | 'shared';
  includePublic: boolean;
  visibility: 'all' | 'public' | 'private';
  search?: string;
  type?: AssetType;
  category?: AssetCategory;
}

export function loadDriveConfig(): StoredConfig {
  if (typeof window === 'undefined') {
    return { enabled: false };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { enabled: false };
    }
    const parsed = JSON.parse(raw) as StoredConfig;
    return parsed;
  } catch (error) {
    console.error('Failed to parse Google Drive config', error);
    return { enabled: false };
  }
}

function saveDriveConfig(config: StoredConfig) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetDriveConfig() {
  const current = loadDriveConfig();
  saveDriveConfig({ enabled: false, clientId: current.clientId });
}

export function updateDriveConfig(patch: Partial<StoredConfig>) {
  const current = loadDriveConfig();
  const next = { ...current, ...patch } as StoredConfig;
  saveDriveConfig(next);
  return next;
}

function normalizeOwner(owner?: string) {
  const trimmed = owner?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Guest';
}

function nowIso() {
  return new Date().toISOString();
}

function toBooleanString(value: boolean) {
  return value ? 'true' : 'false';
}

function escapeDriveQueryValue(input: string) {
  return input.replace(/'/g, "\\'");
}

function inferTypeFromFilenameAndMime(name: string, mimeType: string): AssetType {
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

function loadGapiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window is not available.'));
      return;
    }

    if (window.gapi) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google API script.'));
    document.body.appendChild(script);
  });
}

type GapiClient = {
  load: (
    module: string,
    options: { callback: () => void; onerror: (error: unknown) => void }
  ) => void;
  auth?: unknown;
  auth2: {
    getAuthInstance: () => {
      currentUser: {
        get: () => {
          isSignedIn: () => boolean;
          getAuthResponse: (includeAuthData?: boolean) => {
            access_token: string;
            expires_in: string | number;
          };
          reloadAuthResponse: () => Promise<{
            access_token: string;
            expires_in: string | number;
          }>;
        };
      };
      signIn: () => Promise<void>;
    } | undefined;
  };
  client: {
    init: (config: { clientId: string; scope: string; discoveryDocs?: string[] }) => Promise<void>;
    getToken?: () => unknown;
    load?: (name: string, version: string) => Promise<void>;
    drive?: {
      files: {
        list: (args: {
          q: string;
          fields: string;
        }) => Promise<{
          result?: {
            files?: Array<{ id?: string; name?: string }>;
          };
        }>;
        create: (args: {
          resource: typeof FOLDER_METADATA;
          fields: string;
        }) => Promise<{
          result?: { id?: string; name?: string };
        }>;
      };
    };
  };
};

async function initGapiClient(clientId: string) {
  await loadGapiScript();
  const gapi = window.gapi as GapiClient | undefined;
  if (!gapi) {
    throw new Error('Google API client not available.');
  }
  if (!gapi.auth) {
    await new Promise<void>((resolve, reject) => {
      gapi.load('client:auth2', {
        callback: () => resolve(),
        onerror: (error) => reject(error),
      });
    });
  }
  const needsClientInit = !gapi.client?.getToken?.() || !gapi.client.drive;
  if (needsClientInit) {
    await gapi.client.init({
      clientId,
      scope: SCOPES,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
  }
  if (!gapi.client.drive && gapi.client.load) {
    await gapi.client.load('drive', 'v3').catch(() => {
      throw new Error('Failed to load Google Drive API.');
    });
  }
  return gapi;
}

async function ensureFolder(gapi: GapiClient, config: StoredConfig) {
  if (config.folderId) {
    return config.folderId;
  }
  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }
  const response = await drive.files.list({
    q: `name = '${FOLDER_METADATA.name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const existing = response?.result?.files?.[0];
  if (existing?.id) {
    config.folderId = existing.id;
    config.folderName = existing.name;
    saveDriveConfig(config);
    return existing.id;
  }

  const createResponse = await drive.files.create({
    resource: FOLDER_METADATA,
    fields: 'id, name',
  });

  const folder = createResponse?.result;
  if (!folder?.id) {
    throw new Error('Failed to create backup folder.');
  }

  config.folderId = folder.id;
  config.folderName = folder.name;
  saveDriveConfig(config);
  return folder.id;
}

async function ensureAssetsFolder(gapi: GapiClient, config: StoredConfig) {
  if (config.assetsFolderId) {
    return config.assetsFolderId;
  }
  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }
  const response = await drive.files.list({
    q: `name = '${ASSET_FOLDER_METADATA.name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const existing = response?.result?.files?.[0];
  if (existing?.id) {
    config.assetsFolderId = existing.id;
    config.assetsFolderName = existing.name;
    saveDriveConfig(config);
    return existing.id;
  }

  const createResponse = await drive.files.create({
    resource: ASSET_FOLDER_METADATA,
    fields: 'id, name',
  });

  const folder = createResponse?.result;
  if (!folder?.id) {
    throw new Error('Failed to create asset folder.');
  }

  config.assetsFolderId = folder.id;
  config.assetsFolderName = folder.name;
  saveDriveConfig(config);
  return folder.id;
}

async function ensureDriveSession(clientId?: string) {
  const config = loadDriveConfig();
  if (!config.enabled) {
    throw new Error('Google Drive is not connected.');
  }
  const resolvedClientId = (clientId || config.clientId || '').trim();
  if (!resolvedClientId) {
    throw new Error('Google Drive client ID is missing.');
  }

  const gapi = await initGapiClient(resolvedClientId);
  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }
  await refreshAccessToken(gapi, config);

  const accessToken = config.accessToken;
  if (!accessToken) {
    throw new Error('Missing Google Drive access token.');
  }

  return { gapi, drive, config, accessToken, clientId: resolvedClientId };
}

function mapDriveFileToAsset(file: DriveFileItem): DriveAssetRecord | null {
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

async function driveApiJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive API failed (${response.status}): ${text || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function getDriveFileMetadata(accessToken: string, fileId: string) {
  return driveApiJson<{
    id?: string;
    name?: string;
    mimeType?: string;
    createdTime?: string;
    modifiedTime?: string;
    appProperties?: Record<string, string | undefined>;
  }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,createdTime,modifiedTime,appProperties`
  );
}

export async function connectGoogleDrive(clientId: string): Promise<StoredConfig> {
  const config = loadDriveConfig();
  const gapi = await initGapiClient(clientId);
  const authInstance = gapi.auth2.getAuthInstance();
  if (!authInstance) {
    throw new Error('Google authentication is unavailable.');
  }
  const user = authInstance.currentUser.get();

  if (!user.isSignedIn()) {
    await authInstance.signIn();
  }

  const authResponse = user.getAuthResponse(true);
  config.enabled = true;
  config.clientId = clientId;
  config.accessToken = authResponse.access_token;
  config.tokenExpiry = Date.now() + Number(authResponse.expires_in) * 1000;

  saveDriveConfig(config);
  await ensureFolder(gapi, config);
  return config;
}

export async function disconnectGoogleDrive() {
  const config = loadDriveConfig();
  if (config.accessToken) {
    try {
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${config.accessToken}`, {
        method: 'POST',
        mode: 'no-cors',
      });
    } catch (error) {
      console.warn('Failed to revoke token', error);
    }
  }
  resetDriveConfig();
}

async function refreshAccessToken(gapi: GapiClient, config: StoredConfig) {
  if (config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken;
  }

  const authInstance = gapi.auth2.getAuthInstance();
  if (!authInstance) {
    throw new Error('Google authentication is unavailable.');
  }
  const user = authInstance.currentUser.get();
  if (!user.isSignedIn()) {
    await authInstance.signIn();
  }
  const authResponse = await user.reloadAuthResponse();
  config.accessToken = authResponse.access_token;
  config.tokenExpiry = Date.now() + Number(authResponse.expires_in) * 1000;
  saveDriveConfig(config);
  return config.accessToken;
}

export async function uploadBackup(
  clientId: string,
  filename: string,
  fileContent: string,
  mimeType: string,
  thumbnailDataUrl?: string
) {
  const config = loadDriveConfig();
  if (!config.enabled) {
    throw new Error('Google Drive backup not enabled.');
  }

  const gapi = await initGapiClient(clientId);
  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }

  await refreshAccessToken(gapi, config);
  const folderId = await ensureFolder(gapi, config);

  const metadata: Record<string, unknown> = {
    name: filename,
    parents: [folderId],
  };

  if (thumbnailDataUrl) {
    metadata.appProperties = {
      thumbnail: thumbnailDataUrl,
    };
  }

  const file = new Blob([fileContent], { type: mimeType });
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const accessToken = config.accessToken;
  if (!accessToken) {
    throw new Error('Missing access token for Google Drive upload.');
  }

  await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });
}

export async function uploadDriveAsset(
  clientId: string,
  params: {
    file: Blob;
    filename: string;
    type: AssetType;
    category: AssetCategory;
    owner?: string;
    isPublic?: boolean;
  }
) {
  const { gapi, config, accessToken } = await ensureDriveSession(clientId);
  const folderId = await ensureAssetsFolder(gapi, config);
  const createdAt = nowIso();

  const metadata = {
    name: params.filename,
    parents: [folderId],
    appProperties: {
      iexAssetType: params.type,
      iexAssetCategory: params.category,
      iexOwner: normalizeOwner(params.owner),
      iexIsPublic: toBooleanString(Boolean(params.isPublic)),
      iexCreatedAt: createdAt,
      iexUpdatedAt: createdAt,
    },
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', params.file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,createdTime,modifiedTime,appProperties', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive upload failed (${response.status}): ${text || response.statusText}`);
  }

  const file = await response.json() as DriveFileItem;
  const mapped = mapDriveFileToAsset(file);
  if (!mapped) {
    throw new Error('Google Drive upload returned invalid metadata.');
  }
  return mapped;
}

export async function listDriveAssets(clientId: string, params: ListDriveAssetsParams) {
  const { gapi, config, accessToken } = await ensureDriveSession(clientId);
  const folderId = await ensureAssetsFolder(gapi, config);
  const queryParts = [`'${escapeDriveQueryValue(folderId)}' in parents`, 'trashed = false'];
  const search = params.search?.trim();
  if (search) {
    queryParts.push(`name contains '${escapeDriveQueryValue(search)}'`);
  }

  const files: NonNullable<DriveFileListResponse['files']> = [];
  let pageToken: string | undefined;
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', queryParts.join(' and '));
    url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,appProperties)');
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const result = await driveApiJson<DriveFileListResponse>(accessToken, url.toString());
    if (Array.isArray(result.files)) {
      files.push(...result.files);
    }
    pageToken = result.nextPageToken;
  } while (pageToken);

  const owner = normalizeOwner(params.owner);
  const records = files
    .map(mapDriveFileToAsset)
    .filter((item): item is DriveAssetRecord => Boolean(item))
    .filter((item) => !params.type || item.type === params.type)
    .filter((item) => !params.category || item.category === params.category)
    .filter((item) => {
      if (params.scope === 'shared') {
        return item.owner !== owner && item.isPublic;
      }
      if (item.owner === owner) return true;
      return params.includePublic && item.isPublic;
    })
    .filter((item) => {
      if (params.visibility === 'public') return item.isPublic;
      if (params.visibility === 'private') return !item.isPublic;
      return true;
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return records;
}

export async function deleteDriveAsset(clientId: string, fileId: string) {
  const { accessToken } = await ensureDriveSession(clientId);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive delete failed (${response.status}): ${text || response.statusText}`);
  }
}

export async function renameDriveAsset(clientId: string, fileId: string, newName: string) {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error('Asset name is required.');
  }
  const { accessToken } = await ensureDriveSession(clientId);
  const current = await getDriveFileMetadata(accessToken, fileId);
  const app = { ...(current.appProperties || {}) };
  app.iexUpdatedAt = nowIso();

  const updated = await driveApiJson<{
    id?: string;
    name?: string;
    mimeType?: string;
    createdTime?: string;
    modifiedTime?: string;
    appProperties?: Record<string, string | undefined>;
  }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,createdTime,modifiedTime,appProperties`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        appProperties: app,
      }),
    }
  );

  const mapped = mapDriveFileToAsset(updated);
  if (!mapped) throw new Error('Google Drive rename returned invalid metadata.');
  return mapped;
}

export async function setDriveAssetVisibility(clientId: string, fileId: string, isPublic: boolean) {
  const { accessToken } = await ensureDriveSession(clientId);
  const current = await getDriveFileMetadata(accessToken, fileId);
  const app = { ...(current.appProperties || {}) };
  app.iexIsPublic = toBooleanString(isPublic);
  app.iexUpdatedAt = nowIso();

  const updated = await driveApiJson<{
    id?: string;
    name?: string;
    mimeType?: string;
    createdTime?: string;
    modifiedTime?: string;
    appProperties?: Record<string, string | undefined>;
  }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,createdTime,modifiedTime,appProperties`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appProperties: app,
      }),
    }
  );

  const mapped = mapDriveFileToAsset(updated);
  if (!mapped) throw new Error('Google Drive visibility update returned invalid metadata.');
  return mapped;
}

export async function downloadDriveAssetBlob(clientId: string, fileId: string) {
  const { accessToken } = await ensureDriveSession(clientId);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive download failed (${response.status}): ${text || response.statusText}`);
  }

  return response.blob();
}
