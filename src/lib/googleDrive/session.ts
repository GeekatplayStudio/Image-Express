import { initGapiClient, refreshAccessToken } from './auth';
import { loadDriveConfig } from './config';
import type { DriveSessionOptions } from './types';

export async function driveApiJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
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

export async function getDriveFileMetadata(accessToken: string, fileId: string) {
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

export async function ensureDriveSession(clientId?: string, options?: DriveSessionOptions) {
  const allowInteractiveAuth = options?.allowInteractiveAuth ?? true;
  const config = loadDriveConfig();
  if (!config.enabled) {
    throw new Error('Google Drive is not connected.');
  }
  const resolvedClientId = (clientId || config.clientId || '').trim();
  if (!resolvedClientId) {
    throw new Error('Google Drive client ID is missing.');
  }

  const gapi = await initGapiClient();
  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }
  await refreshAccessToken(gapi, config, { allowInteractiveAuth });

  const accessToken = config.accessToken;
  if (!accessToken) {
    throw new Error('Missing Google Drive access token.');
  }

  return { gapi, drive, config, accessToken, clientId: resolvedClientId };
}
