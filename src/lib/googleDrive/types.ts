import type { AssetCategory, AssetType, GoogleDriveConfig } from '@/types';
import type { FOLDER_METADATA } from './constants';

export interface StoredConfig extends GoogleDriveConfig {
  accessToken?: string;
  refreshToken?: string;
  rootFolderId?: string;
  folderId?: string;
  assetsFolderId?: string;
  generatedFolderId?: string;
  assetsFolderName?: string;
  modelsFolderId?: string;
  templatesFolderId?: string;
  fontsFolderId?: string;
  tokenExpiry?: number;
}

export interface DriveFileListResponse {
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

export type DriveFileItem = NonNullable<DriveFileListResponse['files']>[number];

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

export interface ListDriveAssetsParams {
  owner: string;
  scope: 'personal' | 'shared';
  includePublic: boolean;
  visibility: 'all' | 'public' | 'private';
  search?: string;
  type?: AssetType;
  category?: AssetCategory;
}

export interface DriveSessionOptions {
  allowInteractiveAuth?: boolean;
}

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
};

export type GoogleTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

export type GoogleIdentityServices = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
        error_callback?: (error: unknown) => void;
      }) => GoogleTokenClient;
    };
  };
};

export type GapiClient = {
  load: (
    module: string,
    options: { callback: () => void; onerror: (error: unknown) => void }
  ) => void;
  client: {
    init: (config: { clientId?: string; scope?: string; discoveryDocs?: string[]; cookie_policy?: string }) => Promise<void>;
    getToken?: () => unknown;
    setToken?: (token: { access_token: string } | null) => void;
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
