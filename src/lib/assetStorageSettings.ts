'use client';

export type AssetStorageMode = 'local' | 'hybrid' | 'cloud';
export type AssetCloudProvider = 'google-drive' | 'dropbox' | 'onedrive' | 's3-compatible';

export const ASSET_CLOUD_PROVIDER_OPTIONS: Array<{
    id: AssetCloudProvider;
    label: string;
    availability: 'available' | 'planned';
    description: string;
}> = [
    {
        id: 'google-drive',
        label: 'Google Drive',
        availability: 'available',
        description: 'Fully integrated today for asset sync and design backup.',
    },
    {
        id: 'dropbox',
        label: 'Dropbox',
        availability: 'planned',
        description: 'Provider slot is wired, but the Dropbox adapter is not implemented yet.',
    },
    {
        id: 'onedrive',
        label: 'OneDrive',
        availability: 'planned',
        description: 'Provider slot is wired, but the OneDrive adapter is not implemented yet.',
    },
    {
        id: 's3-compatible',
        label: 'S3-compatible',
        availability: 'planned',
        description: 'Provider slot is wired, but S3-compatible storage setup is not implemented yet.',
    },
];

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

export function isAssetCloudProvider(value: unknown): value is AssetCloudProvider {
    return ASSET_CLOUD_PROVIDER_OPTIONS.some((option) => option.id === value);
}

export function getAssetCloudProviderLabel(provider: AssetCloudProvider) {
    return ASSET_CLOUD_PROVIDER_OPTIONS.find((option) => option.id === provider)?.label || 'Cloud';
}

export function isImplementedAssetCloudProvider(provider: AssetCloudProvider) {
    return provider === 'google-drive';
}

export function loadAssetStorageSettings(): AssetStorageSettings {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<AssetStorageSettings>;

        const mode: AssetStorageMode = parsed.mode === 'local' || parsed.mode === 'hybrid' || parsed.mode === 'cloud'
            ? parsed.mode
            : DEFAULT_SETTINGS.mode;
        const cloudProvider: AssetCloudProvider = isAssetCloudProvider(parsed.cloudProvider)
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

