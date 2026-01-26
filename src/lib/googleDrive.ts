import type { GoogleDriveConfig } from '@/types';

const STORAGE_KEY = 'image-express-google-drive';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_METADATA = {
  name: 'Image Express Backups',
  mimeType: 'application/vnd.google-apps.folder',
};

interface StoredConfig extends GoogleDriveConfig {
  accessToken?: string;
  refreshToken?: string;
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
  if (existing) {
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
