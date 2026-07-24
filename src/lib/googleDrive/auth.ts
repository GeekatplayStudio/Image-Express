import { SCOPES } from './constants';
import { saveDriveConfig } from './config';
import { normalizeGoogleAuthError } from './errors';
import type { GapiClient, GoogleIdentityServices, StoredConfig } from './types';

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

function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window is not available.'));
      return;
    }

    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.body.appendChild(script);
  });
}

export async function requestGoogleAccessToken(clientId: string, prompt: string): Promise<{ accessToken: string; expiresIn: number }> {
  await loadGoogleIdentityScript();
  const google = window.google as GoogleIdentityServices | undefined;
  const oauth2 = google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services is unavailable.');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response) => {
          const accessToken = response.access_token;
          if (!accessToken) {
            reject(normalizeGoogleAuthError(response, 'Google token response is missing an access token.'));
            return;
          }

          const expiresIn = Number(response.expires_in || 3600);
          resolve({ accessToken, expiresIn: Number.isFinite(expiresIn) ? expiresIn : 3600 });
        },
        error_callback: (error) => {
          reject(normalizeGoogleAuthError(error, 'Google sign-in request failed.'));
        },
      });

      tokenClient.requestAccessToken({ prompt });
    } catch (error) {
      reject(normalizeGoogleAuthError(error, 'Google sign-in request failed.'));
    }
  });
}

export async function initGapiClient() {
  await loadGapiScript();
  const gapi = window.gapi as GapiClient | undefined;
  if (!gapi) {
    throw new Error('Google API client not available.');
  }
  if (!gapi.client) {
    await new Promise<void>((resolve, reject) => {
      gapi.load('client', {
        callback: () => resolve(),
        onerror: (error) => reject(normalizeGoogleAuthError(error, 'Failed to initialize Google API client module.')),
      });
    });
  }
  const needsClientInit = !gapi.client.drive;
  if (needsClientInit) {
    await gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
  }
  if (!gapi.client.drive && gapi.client.load) {
    await gapi.client.load('drive', 'v3').catch((error: unknown) => {
      throw normalizeGoogleAuthError(error, 'Failed to load Google Drive API.');
    });
  }
  return gapi;
}

export async function refreshAccessToken(gapi: GapiClient, config: StoredConfig, options?: { allowInteractiveAuth?: boolean }) {
  const allowInteractiveAuth = options?.allowInteractiveAuth ?? true;
  if (config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    if (config.accessToken) {
      gapi.client.setToken?.({ access_token: config.accessToken });
    }
    return config.accessToken;
  }

  const resolvedClientId = (config.clientId || '').trim();
  if (!resolvedClientId) {
    throw new Error('Google Drive client ID is missing.');
  }

  if (!allowInteractiveAuth) {
    throw new Error('Google Drive authentication requires user interaction. Reconnect from Settings to continue.');
  }

  let token: { accessToken: string; expiresIn: number };
  try {
    token = await requestGoogleAccessToken(resolvedClientId, '');
  } catch {
    token = await requestGoogleAccessToken(resolvedClientId, 'consent');
  }

  config.accessToken = token.accessToken;
  config.tokenExpiry = Date.now() + token.expiresIn * 1000;
  gapi.client.setToken?.({ access_token: token.accessToken });
  saveDriveConfig(config);
  return config.accessToken;
}
