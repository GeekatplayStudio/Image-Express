import { persistAssetToLibrary } from '@/lib/assetPersistence';

const mockLoadAssetStorageSettings = jest.fn();
const mockLoadDriveConfig = jest.fn();
const mockSaveLocalAsset = jest.fn();
const mockUploadDriveAsset = jest.fn();

jest.mock('@/lib/assetStorageSettings', () => ({
    loadAssetStorageSettings: (...args: unknown[]) => mockLoadAssetStorageSettings(...args),
}));

jest.mock('@/lib/googleDrive', () => ({
    loadDriveConfig: (...args: unknown[]) => mockLoadDriveConfig(...args),
    uploadDriveAsset: (...args: unknown[]) => mockUploadDriveAsset(...args),
}));

jest.mock('@/lib/localAssetStore', () => ({
    saveLocalAsset: (...args: unknown[]) => mockSaveLocalAsset(...args),
}));

describe('persistAssetToLibrary', () => {
    const originalFetch = global.fetch;
    let dispatchSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLoadAssetStorageSettings.mockReturnValue({
            mode: 'local',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: true,
        });
        mockLoadDriveConfig.mockReturnValue({ enabled: true, clientId: 'drive-client' });
        mockSaveLocalAsset.mockResolvedValue(undefined);
        mockUploadDriveAsset.mockResolvedValue(undefined);
        global.fetch = jest.fn();
        dispatchSpy = jest.spyOn(window, 'dispatchEvent');
    });

    afterEach(() => {
        dispatchSpy.mockRestore();
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('saves local assets in local mode and emits a library change event', async () => {
        const blob = new Blob(['image-bytes'], { type: 'image/png' });

        const result = await persistAssetToLibrary({
            source: blob,
            filename: 'generated.png',
            type: 'images',
            category: 'generated',
            owner: 'artist@example.com',
        });

        expect(mockSaveLocalAsset).toHaveBeenCalledWith(expect.objectContaining({
            filename: 'generated.png',
            type: 'images',
            category: 'generated',
            owner: 'artist@example.com',
            mimeType: 'image/png',
        }));
        expect(mockUploadDriveAsset).not.toHaveBeenCalled();
        expect(result).toEqual({ savedProviders: ['local'], warnings: [] });
        expect(dispatchSpy).toHaveBeenCalled();
    });

    it('mirrors assets to both local storage and Google Drive in hybrid cloud-sync mode', async () => {
        mockLoadAssetStorageSettings.mockReturnValue({
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: true,
            includeLegacyServerAssetsInHybrid: true,
        });

        const blob = new Blob(['image-bytes'], { type: 'image/png' });
        const result = await persistAssetToLibrary({
            source: blob,
            filename: 'generated.png',
            type: 'images',
            category: 'generated',
            owner: 'artist@example.com',
        });

        expect(mockSaveLocalAsset).toHaveBeenCalledTimes(1);
        expect(mockUploadDriveAsset).toHaveBeenCalledWith('drive-client', expect.objectContaining({
            filename: 'generated.png',
            type: 'images',
            category: 'generated',
            owner: 'artist@example.com',
        }));
        expect(result).toEqual({ savedProviders: ['local', 'google-drive'], warnings: [] });
    });

    it('falls back to local-only with a warning when hybrid cloud mirroring is enabled but drive is disconnected', async () => {
        mockLoadAssetStorageSettings.mockReturnValue({
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: true,
            includeLegacyServerAssetsInHybrid: true,
        });
        mockLoadDriveConfig.mockReturnValue({ enabled: false, clientId: '' });

        const result = await persistAssetToLibrary({
            source: new Blob(['image-bytes'], { type: 'image/png' }),
            filename: 'generated.png',
            type: 'images',
            category: 'generated',
            owner: 'artist@example.com',
        });

        expect(mockSaveLocalAsset).toHaveBeenCalledTimes(1);
        expect(mockUploadDriveAsset).not.toHaveBeenCalled();
        expect(result.savedProviders).toEqual(['local']);
        expect(result.warnings).toEqual([
            'Google Drive is not connected, so the asset was not mirrored to cloud storage.',
        ]);
    });

    it('uses the server fetch bridge for remote URLs before saving locally', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            blob: async () => new Blob(['remote-image'], { type: 'image/webp' }),
        });

        await persistAssetToLibrary({
            source: 'https://cdn.example/remote-image.webp',
            filename: 'remote-image.webp',
            type: 'images',
            category: 'generated',
            owner: 'artist@example.com',
        });

        expect(global.fetch).toHaveBeenCalledWith('/api/assets/fetch-url', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }));
        expect(mockSaveLocalAsset).toHaveBeenCalledWith(expect.objectContaining({
            filename: 'remote-image.webp',
            mimeType: 'image/webp',
        }));
    });
});