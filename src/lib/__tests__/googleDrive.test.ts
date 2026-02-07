import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  loadDriveConfig,
  resetDriveConfig,
  updateDriveConfig,
  uploadBackup,
} from '@/lib/googleDrive';

type MockGapi = {
  load: jest.Mock;
  auth?: unknown;
  auth2: {
    getAuthInstance: () => {
      currentUser: {
        get: () => {
          isSignedIn: () => boolean;
          getAuthResponse: (includeAuthData?: boolean) => { access_token: string; expires_in: string | number };
          reloadAuthResponse: () => Promise<{ access_token: string; expires_in: string | number }>;
        };
      };
      signIn: () => Promise<void>;
    } | undefined;
  };
  client: {
    init: jest.Mock;
    getToken?: jest.Mock;
    load?: jest.Mock;
    drive?: {
      files: {
        list: jest.Mock;
        create: jest.Mock;
      };
    };
  };
};

const makeGapiMock = (overrides?: Partial<MockGapi> & { signedIn?: boolean }) => {
  const signedIn = overrides?.signedIn ?? false;
  const authResponse = { access_token: 'token-1', expires_in: '3600' };
  const reloadResponse = { access_token: 'token-2', expires_in: '3600' };

  const user = {
    isSignedIn: () => signedIn,
    getAuthResponse: () => authResponse,
    reloadAuthResponse: jest.fn().mockResolvedValue(reloadResponse),
  };

  const authInstance = {
    currentUser: { get: () => user },
    signIn: jest.fn().mockResolvedValue(undefined),
  };

  const gapi: MockGapi = {
    load: jest.fn((module, { callback }) => callback()),
    auth2: {
      getAuthInstance: () => authInstance,
    },
    client: {
      init: jest.fn().mockResolvedValue(undefined),
      getToken: jest.fn().mockReturnValue(null),
      load: jest.fn().mockResolvedValue(undefined),
      drive: {
        files: {
          list: jest.fn().mockResolvedValue({ result: { files: [] } }),
          create: jest.fn().mockResolvedValue({ result: { id: 'folder-1', name: 'Image Express Backups' } }),
        },
      },
    },
  };

  return Object.assign(gapi, overrides);
};

describe('googleDrive (browser)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('loads default config when none stored', () => {
    expect(loadDriveConfig()).toEqual({ enabled: false });
  });

  it('handles malformed config', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem('image-express-google-drive', '{bad');

    expect(loadDriveConfig()).toEqual({ enabled: false });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('fails when the gapi script cannot load', async () => {
    Object.defineProperty(window, 'gapi', { value: undefined, configurable: true });

    const createElementSpy = jest.spyOn(document, 'createElement');
    const appendChildSpy = jest.spyOn(document.body, 'appendChild');

    createElementSpy.mockImplementation(() => {
      return {
        set src(_value: string) {
          // no-op
        },
        async: true,
        onload: null,
        onerror: null,
      } as unknown as HTMLScriptElement;
    });

    appendChildSpy.mockImplementation((node) => {
      const script = node as unknown as { onerror?: (error: unknown) => void };
      if (script.onerror) {
        script.onerror(new Error('load failed'));
      }
      return node;
    });

    await expect(connectGoogleDrive('client-1')).rejects.toThrow('Failed to load Google API script.');

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
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

  it('connects and reuses existing folder', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const gapi = makeGapiMock({
      client: {
        init: jest.fn().mockResolvedValue(undefined),
        getToken: jest.fn().mockReturnValue(null),
        load: jest.fn().mockResolvedValue(undefined),
        drive: {
          files: {
            list: jest.fn().mockResolvedValue({ result: { files: [{ id: 'existing', name: 'Image Express Backups' }] } }),
            create: jest.fn(),
          },
        },
      },
    });

    Object.defineProperty(window, 'gapi', { value: gapi, configurable: true });

    const config = await connectGoogleDrive('client-1');

    expect(gapi.load).toHaveBeenCalled();
    expect(config.enabled).toBe(true);
    expect(config.folderId).toBe('existing');
    expect(config.accessToken).toBe('token-1');
    nowSpy.mockRestore();
  });

  it('creates folder when missing', async () => {
    const gapi = makeGapiMock();
    Object.defineProperty(window, 'gapi', { value: gapi, configurable: true });

    const config = await connectGoogleDrive('client-2');

    expect(gapi.client.drive?.files.create).toHaveBeenCalled();
    expect(config.folderId).toBe('folder-1');
  });

  it('skips auth load and client init when already available', async () => {
    const gapi = makeGapiMock({ signedIn: true });
    gapi.auth = {};
    gapi.load = jest.fn();
    gapi.client.getToken = jest.fn().mockReturnValue('existing-token');

    Object.defineProperty(window, 'gapi', { value: gapi, configurable: true });

    await connectGoogleDrive('client-4');

    expect(gapi.load).not.toHaveBeenCalled();
    expect(gapi.client.init).not.toHaveBeenCalled();
  });

  it('fails when drive API cannot load', async () => {
    const gapi = makeGapiMock({
      client: {
        init: jest.fn().mockResolvedValue(undefined),
        getToken: jest.fn().mockReturnValue(null),
        load: jest.fn().mockRejectedValue(new Error('load failed')),
      },
    });

    Object.defineProperty(window, 'gapi', { value: gapi, configurable: true });

    await expect(connectGoogleDrive('client-3')).rejects.toThrow('Failed to load Google Drive API.');
  });

  it('fails when drive API is unavailable', async () => {
    const gapi = makeGapiMock({
      client: {
        init: jest.fn().mockResolvedValue(undefined),
        getToken: jest.fn().mockReturnValue('token'),
      },
    });

    Object.defineProperty(window, 'gapi', { value: gapi, configurable: true });

    await expect(connectGoogleDrive('client-3')).rejects.toThrow('Google Drive API client is unavailable.');
  });

  it('fails when auth instance is missing', async () => {
    const gapi = makeGapiMock();
    gapi.auth2.getAuthInstance = () => undefined;

    Object.defineProperty(window, 'gapi', { value: gapi, configurable: true });

    await expect(connectGoogleDrive('client-3')).rejects.toThrow('Google authentication is unavailable.');
  });

  it('disconnects and revokes token', async () => {
    updateDriveConfig({ enabled: true, accessToken: 'token-1', clientId: 'client-1' });
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    await disconnectGoogleDrive();

    const config = loadDriveConfig();
    expect(config.enabled).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('uploads backup with refreshed token', async () => {
    const gapi = makeGapiMock({ signedIn: false });
    Object.defineProperty(window, 'gapi', { value: gapi, configurable: true });

    updateDriveConfig({
      enabled: true,
      clientId: 'client-1',
      accessToken: 'old-token',
      tokenExpiry: 0,
    });

    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchSpy;

    await uploadBackup('client-1', 'file.json', '{"a":1}', 'application/json', 'thumb');

    expect(gapi.auth2.getAuthInstance()?.signIn).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('throws when backup not enabled', async () => {
    await expect(uploadBackup('client-1', 'file.json', '{}', 'application/json')).rejects.toThrow(
      'Google Drive backup not enabled.'
    );
  });

  it('throws when upload token is missing', async () => {
    const gapi = makeGapiMock({ signedIn: true });
    const authInstance = gapi.auth2.getAuthInstance();
    if (authInstance) {
      authInstance.currentUser.get().reloadAuthResponse = jest.fn().mockResolvedValue({ access_token: '', expires_in: '0' });
    }

    Object.defineProperty(window, 'gapi', { value: gapi, configurable: true });
    updateDriveConfig({ enabled: true, clientId: 'client-1', tokenExpiry: 0 });

    await expect(uploadBackup('client-1', 'file.json', '{}', 'application/json')).rejects.toThrow(
      'Missing access token for Google Drive upload.'
    );
  });

  it('throws when refresh cannot access auth instance', async () => {
    const gapi = makeGapiMock({ signedIn: true });
    gapi.auth2.getAuthInstance = () => undefined;
    Object.defineProperty(window, 'gapi', { value: gapi, configurable: true });

    updateDriveConfig({ enabled: true, clientId: 'client-1', tokenExpiry: 0 });

    await expect(uploadBackup('client-1', 'file.json', '{}', 'application/json')).rejects.toThrow(
      'Google authentication is unavailable.'
    );
  });
});
