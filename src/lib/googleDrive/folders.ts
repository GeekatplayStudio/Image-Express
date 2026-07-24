import {
  ASSET_FOLDER_METADATA,
  FOLDER_METADATA,
  FONTS_FOLDER_METADATA,
  GENERATED_FOLDER_METADATA,
  MODELS_FOLDER_METADATA,
  ROOT_FOLDER_METADATA,
  TEMPLATES_FOLDER_METADATA,
} from './constants';
import { saveDriveConfig } from './config';
import { escapeDriveQueryValue } from './helpers';
import type { GapiClient, StoredConfig } from './types';

export async function ensureRootFolder(gapi: GapiClient, config: StoredConfig) {
  if (config.rootFolderId) {
    return config.rootFolderId;
  }

  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }

  const response = await drive.files.list({
    q: `name = '${ROOT_FOLDER_METADATA.name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });

  const existing = response?.result?.files?.[0];
  if (existing?.id) {
    config.rootFolderId = existing.id;
    saveDriveConfig(config);
    return existing.id;
  }

  const createResponse = await drive.files.create({
    resource: ROOT_FOLDER_METADATA,
    fields: 'id, name',
  });

  const folder = createResponse?.result;
  if (!folder?.id) {
    throw new Error('Failed to create ImageExpress root folder.');
  }

  config.rootFolderId = folder.id;
  saveDriveConfig(config);
  return folder.id;
}

export async function ensureFolder(gapi: GapiClient, config: StoredConfig) {
  if (config.folderId) {
    return config.folderId;
  }
  const rootFolderId = await ensureRootFolder(gapi, config);
  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }
  const response = await drive.files.list({
    q: `name = '${FOLDER_METADATA.name}' and '${escapeDriveQueryValue(rootFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
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
    resource: {
      ...FOLDER_METADATA,
      parents: [rootFolderId],
    } as typeof FOLDER_METADATA & { parents: string[] },
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

export async function ensureAssetsFolder(gapi: GapiClient, config: StoredConfig) {
  if (config.assetsFolderId) {
    return config.assetsFolderId;
  }
  const rootFolderId = await ensureRootFolder(gapi, config);
  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }
  const response = await drive.files.list({
    q: `name = '${ASSET_FOLDER_METADATA.name}' and '${escapeDriveQueryValue(rootFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
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
    resource: {
      ...ASSET_FOLDER_METADATA,
      parents: [rootFolderId],
    } as typeof ASSET_FOLDER_METADATA & { parents: string[] },
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

export async function ensureModelsFolder(gapi: GapiClient, config: StoredConfig) {
  if (config.modelsFolderId) {
    return config.modelsFolderId;
  }

  const rootFolderId = await ensureRootFolder(gapi, config);
  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }

  const response = await drive.files.list({
    q: `name = '${MODELS_FOLDER_METADATA.name}' and '${escapeDriveQueryValue(rootFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });

  const existing = response?.result?.files?.[0];
  if (existing?.id) {
    config.modelsFolderId = existing.id;
    saveDriveConfig(config);
    return existing.id;
  }

  const createResponse = await drive.files.create({
    resource: {
      ...MODELS_FOLDER_METADATA,
      parents: [rootFolderId],
    } as typeof MODELS_FOLDER_METADATA & { parents: string[] },
    fields: 'id, name',
  });

  const folder = createResponse?.result;
  if (!folder?.id) {
    throw new Error('Failed to create 3D models folder.');
  }

  config.modelsFolderId = folder.id;
  saveDriveConfig(config);
  return folder.id;
}

export async function ensureGeneratedFolder(gapi: GapiClient, config: StoredConfig) {
  if (config.generatedFolderId) {
    return config.generatedFolderId;
  }

  const assetsFolderId = await ensureAssetsFolder(gapi, config);
  const drive = gapi.client.drive;
  if (!drive) {
    throw new Error('Google Drive API client is unavailable.');
  }

  const response = await drive.files.list({
    q: `name = '${GENERATED_FOLDER_METADATA.name}' and '${escapeDriveQueryValue(assetsFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });

  const existing = response?.result?.files?.[0];
  if (existing?.id) {
    config.generatedFolderId = existing.id;
    saveDriveConfig(config);
    return existing.id;
  }

  const createResponse = await drive.files.create({
    resource: {
      ...GENERATED_FOLDER_METADATA,
      parents: [assetsFolderId],
    } as typeof GENERATED_FOLDER_METADATA & { parents: string[] },
    fields: 'id, name',
  });

  const folder = createResponse?.result;
  if (!folder?.id) {
    throw new Error('Failed to create generated folder.');
  }

  config.generatedFolderId = folder.id;
  saveDriveConfig(config);
  return folder.id;
}

export async function ensureTemplatesFolder(gapi: GapiClient, config: StoredConfig) {
  if (config.templatesFolderId) return config.templatesFolderId;
  const rootFolderId = await ensureRootFolder(gapi, config);
  const drive = gapi.client.drive;
  if (!drive) throw new Error('Google Drive API client is unavailable.');
  const response = await drive.files.list({
    q: `name = '${TEMPLATES_FOLDER_METADATA.name}' and '${escapeDriveQueryValue(rootFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const existing = response?.result?.files?.[0];
  if (existing?.id) {
    config.templatesFolderId = existing.id;
    saveDriveConfig(config);
    return existing.id;
  }
  const createResponse = await drive.files.create({
    resource: {
      ...TEMPLATES_FOLDER_METADATA,
      parents: [rootFolderId],
    } as typeof TEMPLATES_FOLDER_METADATA & { parents: string[] },
    fields: 'id, name',
  });
  const folder = createResponse?.result;
  if (!folder?.id) throw new Error('Failed to create templates folder.');
  config.templatesFolderId = folder.id;
  saveDriveConfig(config);
  return folder.id;
}

export async function ensureFontsFolder(gapi: GapiClient, config: StoredConfig) {
  if (config.fontsFolderId) return config.fontsFolderId;
  const rootFolderId = await ensureRootFolder(gapi, config);
  const drive = gapi.client.drive;
  if (!drive) throw new Error('Google Drive API client is unavailable.');
  const response = await drive.files.list({
    q: `name = '${FONTS_FOLDER_METADATA.name}' and '${escapeDriveQueryValue(rootFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const existing = response?.result?.files?.[0];
  if (existing?.id) {
    config.fontsFolderId = existing.id;
    saveDriveConfig(config);
    return existing.id;
  }
  const createResponse = await drive.files.create({
    resource: {
      ...FONTS_FOLDER_METADATA,
      parents: [rootFolderId],
    } as typeof FONTS_FOLDER_METADATA & { parents: string[] },
    fields: 'id, name',
  });
  const folder = createResponse?.result;
  if (!folder?.id) throw new Error('Failed to create fonts folder.');
  config.fontsFolderId = folder.id;
  saveDriveConfig(config);
  return folder.id;
}

export async function ensureProjectFolders(gapi: GapiClient, config: StoredConfig) {
  await ensureRootFolder(gapi, config);
  await ensureFolder(gapi, config);
  await ensureAssetsFolder(gapi, config);
  await ensureGeneratedFolder(gapi, config);
  await ensureModelsFolder(gapi, config);
  await ensureTemplatesFolder(gapi, config);
  await ensureFontsFolder(gapi, config);
}
