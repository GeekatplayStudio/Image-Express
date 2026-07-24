import type { AssetCategory, AssetType } from '@/types';
import { initGapiClient, refreshAccessToken, requestGoogleAccessToken } from './auth';
import { loadDriveConfig, resetDriveConfig, saveDriveConfig } from './config';
import { normalizeGoogleAuthError } from './errors';
import {
  ensureAssetsFolder,
  ensureFolder,
  ensureGeneratedFolder,
  ensureModelsFolder,
  ensureProjectFolders,
} from './folders';
import { escapeDriveQueryValue, mapDriveFileToAsset, normalizeOwner, nowIso, toBooleanString } from './helpers';
import { driveApiJson, ensureDriveSession, getDriveFileMetadata } from './session';
import type {
  DriveAssetRecord,
  DriveFileItem,
  DriveFileListResponse,
  DriveSessionOptions,
  ListDriveAssetsParams,
  StoredConfig,
} from './types';

export { loadDriveConfig, resetDriveConfig, updateDriveConfig } from './config';
export type { DriveAssetRecord } from './types';

export async function connectGoogleDrive(clientId: string): Promise<StoredConfig> {
  try {
    const config = loadDriveConfig();
    const token = await requestGoogleAccessToken(clientId, 'consent');
    const gapi = await initGapiClient();
    gapi.client.setToken?.({ access_token: token.accessToken });
    config.enabled = true;
    config.clientId = clientId;
    config.accessToken = token.accessToken;
    config.tokenExpiry = Date.now() + token.expiresIn * 1000;

    saveDriveConfig(config);
    await ensureProjectFolders(gapi, config);
    return config;
  } catch (error) {
    throw normalizeGoogleAuthError(error, 'Failed to connect Google Drive.');
  }
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

  const gapi = await initGapiClient();
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
  const folderId = params.type === 'models'
    ? await ensureModelsFolder(gapi, config)
    : params.category === 'generated'
      ? await ensureGeneratedFolder(gapi, config)
      : await ensureAssetsFolder(gapi, config);
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

export async function listDriveAssets(clientId: string, params: ListDriveAssetsParams, options?: DriveSessionOptions) {
  const allowInteractiveAuth = options?.allowInteractiveAuth ?? false;
  const { gapi, config, accessToken } = await ensureDriveSession(clientId, { allowInteractiveAuth });
  const assetsFolderId = await ensureAssetsFolder(gapi, config);
  const generatedFolderId = await ensureGeneratedFolder(gapi, config);
  const modelsFolderId = await ensureModelsFolder(gapi, config);
  const folderIds = params.type === 'models'
    ? [modelsFolderId]
    : params.category === 'generated'
      ? [generatedFolderId, assetsFolderId]
    : params.type === 'images' || params.type === 'videos' || params.type === 'audio'
      ? [assetsFolderId]
      : [assetsFolderId, generatedFolderId, modelsFolderId];
  const parentFilter = folderIds.map((id) => `'${escapeDriveQueryValue(id)}' in parents`).join(' or ');
  const queryParts = [`(${parentFilter})`, 'trashed = false'];
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
