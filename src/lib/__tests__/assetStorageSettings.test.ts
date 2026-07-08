import {
    loadAssetStorageSettings,
    onAssetStorageSettingsChanged,
    saveAssetStorageSettings,
} from '@/lib/assetStorageSettings';

describe('assetStorageSettings', () => {
    beforeEach(() => {
        window.localStorage.clear();
        jest.restoreAllMocks();
    });

    it('returns defaults when no settings are saved', () => {
        expect(loadAssetStorageSettings()).toEqual({
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: true,
        });
    });

    it('loads saved settings and dispatches change event', () => {
        const listener = jest.fn();
        const unsubscribe = onAssetStorageSettingsChanged(listener);

        saveAssetStorageSettings({
            mode: 'cloud',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: true,
            includeLegacyServerAssetsInHybrid: false,
        });

        expect(loadAssetStorageSettings()).toEqual({
            mode: 'cloud',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: true,
            includeLegacyServerAssetsInHybrid: false,
        });
        expect(listener).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new Event('storage'));
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        window.dispatchEvent(new Event('storage'));
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('accepts supported planned providers in stored settings', () => {
        window.localStorage.setItem(
            'image-express-asset-storage-settings',
            JSON.stringify({
                mode: 'hybrid',
                cloudProvider: 'dropbox',
                hybridUploadToCloudByDefault: true,
                includeLegacyServerAssetsInHybrid: false,
            })
        );

        expect(loadAssetStorageSettings()).toEqual({
            mode: 'hybrid',
            cloudProvider: 'dropbox',
            hybridUploadToCloudByDefault: true,
            includeLegacyServerAssetsInHybrid: false,
        });
    });

    it('falls back to defaults for malformed or invalid stored settings', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        window.localStorage.setItem('image-express-asset-storage-settings', '{bad');
        expect(loadAssetStorageSettings()).toEqual({
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: true,
        });
        expect(errorSpy).toHaveBeenCalled();

        window.localStorage.setItem(
            'image-express-asset-storage-settings',
            JSON.stringify({
                mode: 'unsupported',
                cloudProvider: 'unknown-cloud',
                hybridUploadToCloudByDefault: 0,
                includeLegacyServerAssetsInHybrid: false,
            })
        );
        expect(loadAssetStorageSettings()).toEqual({
            mode: 'hybrid',
            cloudProvider: 'google-drive',
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: false,
        });
    });
});
