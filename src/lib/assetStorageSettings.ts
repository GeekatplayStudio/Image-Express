'use client';

export type AssetStorageMode = 'local' | 'hybrid' | 'cloud';
export type AssetCloudProvider = 'google-drive';

export interface AssetStorageSettings {
    mode: AssetStorageMode;
    cloudProvider: AssetCloudProvider;
    hybridUploadToCloudByDefault: boolean;
    includeLegacyServerAssetsInHybrid: boolean;
}

const STORAGE_KEY = 'image-express-asset-storage-settings';
const CHANGE_EVENT = 'image-express-asset-storage-changed';

const DEFAULT_SETTINGS: AssetStorageSettings = {
    mode: 'hybrid',
    cloudProvider: 'google-drive',
    hybridUploadToCloudByDefault: false,
    includeLegacyServerAssetsInHybrid: true
};

export function loadAssetStorageSettings(): AssetStorageSettings {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<AssetStorageSettings>;

        const mode: AssetStorageMode = parsed.mode === 'local' || parsed.mode === 'hybrid' || parsed.mode === 'cloud'
            ? parsed.mode
            : DEFAULT_SETTINGS.mode;
        const cloudProvider: AssetCloudProvider = parsed.cloudProvider === 'google-drive'
            ? parsed.cloudProvider
            : DEFAULT_SETTINGS.cloudProvider;

        return {
            mode,
            cloudProvider,
            hybridUploadToCloudByDefault: Boolean(parsed.hybridUploadToCloudByDefault),
            includeLegacyServerAssetsInHybrid: parsed.includeLegacyServerAssetsInHybrid ?? DEFAULT_SETTINGS.includeLegacyServerAssetsInHybrid
        };
    } catch (error) {
        console.error('Failed to parse asset storage settings', error);
        return DEFAULT_SETTINGS;
    }
}

export function saveAssetStorageSettings(next: AssetStorageSettings) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
}

export function onAssetStorageSettingsChanged(listener: () => void) {
    if (typeof window === 'undefined') return () => undefined;
    const handler = () => listener();
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
        window.removeEventListener(CHANGE_EVENT, handler);
        window.removeEventListener('storage', handler);
    };
}

