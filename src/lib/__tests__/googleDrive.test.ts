import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  loadDriveConfig,
  resetDriveConfig,
  updateDriveConfig,
  uploadBackup,
} from '@/lib/googleDrive';

type FolderRecord = { id: string; name: string };

type GapiMock = {
  load: jest.Mock;
  client: {
    init: jest.Mock;
    setToken: jest.Mock;
    load: jest.Mock;
    drive?: {
      files: {
        list: jest.Mock;
        create: jest.Mock;
      };
    };
  };
};

type GoogleOauthMock = {
  initTokenClient: jest.Mock;
};

const DRIVE_STORAGE_KEY = 'image-express-google-drive';

const mockGoogleIdentity = (response: { access_token?: string; expires_in?: number | string; error?: string } = { access_token: 'token-1', expires_in: 3600 }) => {
  const oauth2: GoogleOauthMock = {
    initTokenClient: jest.fn(({ callback }) => ({
      requestAccessToken: jest.fn(() => {
        callback(response);
      }),
    })),
  };

  Object.defineProperty(window, 'google', {
    value: { accounts: { oauth2 } },
    configurable: true,
  });

  return oauth2;
};

const createDriveListMock = (folders: Record<string, FolderRecord | undefined>) =>
  jest.fn(async ({ q }: { q: string }) => {
    if (q.includes("name = 'ImageExpress'")) {
      return { result: { files: folders.root ? [folders.root] : [] } };
    }
    if (q.includes("name = 'Backups'")) {
      return { result: { files: folders.backups ? [folders.backups] : [] } };
    }
    if (q.includes("name = 'Assets'")) {
      return { result: { files: folders.assets ? [folders.assets] : [] } };
    }
    if (q.includes("name = 'Generated'")) {
      return { result: { files: folders.generated ? [folders.generated] : [] } };
    }
    if (q.includes("name = '3D Models'")) {
      return { result: { files: folders.models ? [folders.models] : [] } };
    }
    if (q.includes("name = 'Templates'")) {
      return { result: { files: folders.templates ? [folders.templates] : [] } };
    }
    if (q.includes("name = 'Fonts'")) {
      return { result: { files: folders.fonts ? [folders.fonts] : [] } };
    }
    return { result: { files: [] } };
  });

const makeGapiMock = (options?: {
  folders?: Record<string, FolderRecord | undefined>;
  loadDriveRejects?: Error;
  omitDrive?: boolean;
}) => {
  const folders = options?.folders || {};
  const list = createDriveListMock(folders);
  const create = jest.fn(async ({ resource }: { resource: { name: string } }) => {
    const id = `${resource.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-id`;
    return { result: { id, name: resource.name } };
  });

  const gapi: GapiMock = {
    load: jest.fn((_module, { callback }) => callback()),
    client: {
      init: jest.fn().mockResolvedValue(undefined),
      setToken: jest.fn(),
      load: options?.loadDriveRejects
        ? jest.fn().mockRejectedValue(options.loadDriveRejects)
        : jest.fn().mockResolvedValue(undefined),
      drive: options?.omitDrive
        ? undefined
        : {
            files: {
              list,
              create,
            },
          },
    },
  };

  Object.defineProperty(window, 'gapi', {
    value: gapi,
    configurable: true,
  });

  return { gapi, list, create };
};

describe('googleDrive (browser)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
    delete (window as typeof window & { google?: unknown }).google;
    delete (window as typeof window & { gapi?: unknown }).gapi;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('loads default config when none stored', () => {
    expect(loadDriveConfig()).toEqual({ enabled: false });
  });

  it('handles malformed config', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem(DRIVE_STORAGE_KEY, '{bad');

    expect(loadDriveConfig()).toEqual({ enabled: false });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('fails when the Google Identity Services script cannot load', async () => {
    Object.defineProperty(window, 'google', { value: undefined, configurable: true });
    const createElementSpy = jest.spyOn(document, 'createElement');
    const appendChildSpy = jest.spyOn(document.body, 'appendChild');

    createElementSpy.mockImplementation(() => ({
      src: '',
      async: true,
      defer: true,
      onload: null,
      onerror: null,
    } as unknown as HTMLScriptElement));

    appendChildSpy.mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      script.onerror?.(new Event('error'));
      return node;
    });

    await expect(connectGoogleDrive('client-1')).rejects.toThrow('Failed to load Google Identity Services script.');
  });

  it('updates and resets config', () => {
    updateDriveConfig({ enabled: true, clientId: 'client-1' });
    const updated = updateDriveConfig({ folderId: 'folder-1' });

    expect(updated.enabled).toBe(true);
    expect(updated.folderId).toBe('folder-1');

    resetDriveConfig();
    const reset = loadDriveConfig();
    expect(reset.enabled).toBe(false);
    expect(reset.clientId).toBe('client-1');
  });

  it('connects and reuses existing folders', async () => {
    mockGoogleIdentity({ access_token: 'token-1', expires_in: 3600 });
    const { gapi, create } = makeGapiMock({
      folders: {
        root: { id: 'root-1', name: 'ImageExpress' },
        backups: { id: 'backups-1', name: 'Backups' },
        assets: { id: 'assets-1', name: 'Assets' },
        generated: { id: 'generated-1', name: 'Generated' },
        models: { id: 'models-1', name: '3D Models' },
        templates: { id: 'templates-1', name: 'Templates' },
        fonts: { id: 'fonts-1', name: 'Fonts' },
      },
    });

    const config = await connectGoogleDrive('client-1');

    expect(gapi.client.setToken).toHaveBeenCalledWith({ access_token: 'token-1' });
    expect(create).not.toHaveBeenCalled();
    expect(config).toEqual(expect.objectContaining({
      enabled: true,
      clientId: 'client-1',
      accessToken: 'token-1',
      rootFolderId: 'root-1',
      folderId: 'backups-1',
      assetsFolderId: 'assets-1',
      generatedFolderId: 'generated-1',
      modelsFolderId: 'models-1',
      templatesFolderId: 'templates-1',
      fontsFolderId: 'fonts-1',
    }));
  });

  it('creates project folders when missing', async () => {
    mockGoogleIdentity({ access_token: 'token-1', expires_in: 3600 });
    const { create } = makeGapiMock();

    const config = await connectGoogleDrive('client-2');

    expect(create).toHaveBeenCalledTimes(7);
    expect(config.rootFolderId).toBe('imageexpress-id');
    expect(config.folderId).toBe('backups-id');
    expect(config.assetsFolderId).toBe('assets-id');
    expect(config.generatedFolderId).toBe('generated-id');
    expect(config.modelsFolderId).toBe('3d-models-id');
    expect(config.templatesFolderId).toBe('templates-id');
    expect(config.fontsFolderId).toBe('fonts-id');
  });

  it('fails when drive API cannot load', async () => {
    mockGoogleIdentity({ access_token: 'token-1', expires_in: 3600 });
    makeGapiMock({ omitDrive: true, loadDriveRejects: new Error('load failed') });

    await expect(connectGoogleDrive('client-3')).rejects.toThrow('load failed');
  });

  it('fails when drive API is unavailable', async () => {
    mockGoogleIdentity({ access_token: 'token-1', expires_in: 3600 });
    const { gapi } = makeGapiMock({ omitDrive: true });
    gapi.client.load = undefined as unknown as jest.Mock;

    await expect(connectGoogleDrive('client-3')).rejects.toThrow('Google Drive API client is unavailable.');
  });

  it('disconnects and revokes token', async () => {
    updateDriveConfig({ enabled: true, accessToken: 'token-1', clientId: 'client-1' });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    await disconnectGoogleDrive();

    expect(loadDriveConfig()).toEqual({ enabled: false, clientId: 'client-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/revoke?token=token-1',
      expect.objectContaining({ method: 'POST', mode: 'no-cors' })
    );
  });

  it('uploads backup with refreshed token', async () => {
    mockGoogleIdentity({ access_token: 'token-2', expires_in: 3600 });
    const { gapi } = makeGapiMock({
      folders: {
        root: { id: 'root-1', name: 'ImageExpress' },
        backups: { id: 'backups-1', name: 'Backups' },
      },
    });

    updateDriveConfig({
      enabled: true,
      clientId: 'client-1',
      accessToken: 'old-token',
      tokenExpiry: 0,
      rootFolderId: 'root-1',
      folderId: 'backups-1',
    });

    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    await uploadBackup('client-1', 'file.json', '{"a":1}', 'application/json', 'thumb');

    expect(gapi.client.setToken).toHaveBeenCalledWith({ access_token: 'token-2' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-2' }),
      })
    );
  });

  it('throws when backup not enabled', async () => {
    await expect(uploadBackup('client-1', 'file.json', '{}', 'application/json')).rejects.toThrow(
      'Google Drive backup not enabled.'
    );
  });

  it('throws when upload token is missing', async () => {
    makeGapiMock({
      folders: {
        root: { id: 'root-1', name: 'ImageExpress' },
        backups: { id: 'backups-1', name: 'Backups' },
      },
    });

    updateDriveConfig({
      enabled: true,
      clientId: 'client-1',
      tokenExpiry: Date.now() + 120000,
      rootFolderId: 'root-1',
      folderId: 'backups-1',
    });

    await expect(uploadBackup('client-1', 'file.json', '{}', 'application/json')).rejects.toThrow(
      'Missing access token for Google Drive upload.'
    );
  });

  it('throws when Google Identity Services is unavailable during token refresh', async () => {
    Object.defineProperty(window, 'google', { value: {}, configurable: true });
    const appendChildSpy = jest.spyOn(document.body, 'appendChild');
    appendChildSpy.mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      script.onload?.(new Event('load'));
      return node;
    });
    makeGapiMock({
      folders: {
        root: { id: 'root-1', name: 'ImageExpress' },
        backups: { id: 'backups-1', name: 'Backups' },
      },
    });

    updateDriveConfig({
      enabled: true,
      clientId: 'client-1',
      tokenExpiry: 0,
      rootFolderId: 'root-1',
      folderId: 'backups-1',
    });

    await expect(uploadBackup('client-1', 'file.json', '{}', 'application/json')).rejects.toThrow(
      'Google Identity Services is unavailable.'
    );
  });
});
