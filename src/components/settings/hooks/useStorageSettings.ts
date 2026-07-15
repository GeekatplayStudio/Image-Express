'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DesktopUpdatePayload, DesktopUpdateStatus, GoogleDriveConfig } from '@/types';
import { connectGoogleDrive, disconnectGoogleDrive, loadDriveConfig } from '@/lib/googleDrive';
import {
    ASSET_CLOUD_PROVIDER_OPTIONS,
    getAssetCloudProviderLabel,
    isImplementedAssetCloudProvider,
    loadAssetStorageSettings,
    saveAssetStorageSettings,
    type AssetCloudProvider,
    type AssetStorageMode,
} from '@/lib/assetStorageSettings';

const envDriveClientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? '';

/**
 * Google Drive connection, the asset-storage strategy (local/hybrid/cloud),
 * and desktop-app auto-update status. Grouped together because they're all
 * "where do things live and how do they get there" concerns.
 */
export function useStorageSettings(isOpen: boolean) {
    const [isDesktopApp, setIsDesktopApp] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus>('idle');
    const [updateMessage, setUpdateMessage] = useState<string | null>(null);
    const [driveConfig, setDriveConfig] = useState<GoogleDriveConfig>(() => loadDriveConfig());
    const [isDriveBusy, setIsDriveBusy] = useState(false);
    const [driveError, setDriveError] = useState<string | null>(null);
    const [clientIdInput, setClientIdInput] = useState(envDriveClientId);
    const [showDriveHelp, setShowDriveHelp] = useState(false);
    const [assetStorageMode, setAssetStorageMode] = useState<AssetStorageMode>('hybrid');
    const [assetCloudProvider, setAssetCloudProvider] = useState<AssetCloudProvider>('google-drive');
    const [hybridUploadToCloudByDefault, setHybridUploadToCloudByDefault] = useState(false);
    const [includeLegacyServerAssetsInHybrid, setIncludeLegacyServerAssetsInHybrid] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const bridge = window.desktop;
        let unsubscribe: (() => void) | undefined;

        if (bridge?.isDesktop) {
            setIsDesktopApp(true);
            setUpdateStatus('idle');
            setUpdateMessage(null);
            unsubscribe = bridge.onUpdateStatus?.((payload: DesktopUpdatePayload) => {
                if (!payload) return;
                setUpdateStatus(payload.status || 'idle');
                setUpdateMessage(payload.message || null);
            });
        }

        const storedDrive = loadDriveConfig();
        setDriveConfig(storedDrive);
        setClientIdInput(storedDrive.clientId || envDriveClientId || '');

        const assetStorageSettings = loadAssetStorageSettings();
        setAssetStorageMode(assetStorageSettings.mode);
        setAssetCloudProvider(assetStorageSettings.cloudProvider);
        setHybridUploadToCloudByDefault(assetStorageSettings.hybridUploadToCloudByDefault);
        setIncludeLegacyServerAssetsInHybrid(assetStorageSettings.includeLegacyServerAssetsInHybrid);

        return () => {
            unsubscribe?.();
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isImplementedAssetCloudProvider(assetCloudProvider) && assetStorageMode === 'cloud') {
            setAssetStorageMode('hybrid');
        }
    }, [assetCloudProvider, assetStorageMode]);

    const handleManualUpdateCheck = useCallback(async () => {
        if (!isDesktopApp) return;
        const api = typeof window !== 'undefined' ? window.desktop : undefined;
        if (!api?.checkForUpdates) return;
        setUpdateStatus('checking');
        setUpdateMessage('Checking for updates…');
        try {
            const result = await api.checkForUpdates();
            if (result?.message) setUpdateMessage(result.message);
            if (result?.status && result.status !== 'restarting') setUpdateStatus(result.status as DesktopUpdateStatus);
        } catch (error) {
            setUpdateStatus('error');
            setUpdateMessage(error instanceof Error ? error.message : 'Unable to check for updates.');
        }
    }, [isDesktopApp]);

    const handleInstallUpdate = useCallback(async () => {
        if (!isDesktopApp) return;
        const api = typeof window !== 'undefined' ? window.desktop : undefined;
        if (!api?.installUpdate) return;
        try {
            setUpdateStatus('ready');
            setUpdateMessage('Restarting to apply update…');
            await api.installUpdate();
        } catch (error) {
            setUpdateStatus('error');
            setUpdateMessage(error instanceof Error ? error.message : 'Failed to install update.');
        }
    }, [isDesktopApp]);

    const handleConnectDrive = useCallback(async () => {
        const resolvedClientId = (driveConfig.clientId || clientIdInput || envDriveClientId || '').trim();
        if (!resolvedClientId) {
            setDriveError('Add a Google OAuth client ID before connecting.');
            return;
        }
        setIsDriveBusy(true);
        setDriveError(null);
        try {
            const config = await connectGoogleDrive(resolvedClientId);
            setDriveConfig(config);
            setClientIdInput(resolvedClientId);
        } catch (error) {
            setDriveError(error instanceof Error ? error.message : 'Failed to connect Google Drive.');
        } finally {
            setIsDriveBusy(false);
        }
    }, [clientIdInput, driveConfig.clientId]);

    const handleDisconnectDrive = useCallback(async () => {
        setIsDriveBusy(true);
        setDriveError(null);
        try {
            await disconnectGoogleDrive();
            const updated = loadDriveConfig();
            setDriveConfig(updated);
            setClientIdInput(updated.clientId || envDriveClientId || '');
        } catch (error) {
            setDriveError(error instanceof Error ? error.message : 'Failed to disconnect Google Drive.');
        } finally {
            setIsDriveBusy(false);
        }
    }, []);

    const selectedCloudProviderOption = ASSET_CLOUD_PROVIDER_OPTIONS.find((provider) => provider.id === assetCloudProvider) || ASSET_CLOUD_PROVIDER_OPTIONS[0];
    const selectedCloudProviderLabel = getAssetCloudProviderLabel(assetCloudProvider);
    const selectedCloudProviderIsImplemented = isImplementedAssetCloudProvider(assetCloudProvider);

    const saveStorageSettings = useCallback(() => {
        saveAssetStorageSettings({
            mode: assetStorageMode,
            cloudProvider: assetCloudProvider,
            hybridUploadToCloudByDefault,
            includeLegacyServerAssetsInHybrid,
        });
    }, [assetCloudProvider, assetStorageMode, hybridUploadToCloudByDefault, includeLegacyServerAssetsInHybrid]);

    return {
        isDesktopApp,
        updateStatus,
        updateMessage,
        driveConfig,
        isDriveBusy,
        driveError,
        clientIdInput, setClientIdInput,
        showDriveHelp, setShowDriveHelp,
        assetStorageMode, setAssetStorageMode,
        assetCloudProvider, setAssetCloudProvider,
        hybridUploadToCloudByDefault, setHybridUploadToCloudByDefault,
        includeLegacyServerAssetsInHybrid, setIncludeLegacyServerAssetsInHybrid,
        handleManualUpdateCheck,
        handleInstallUpdate,
        handleConnectDrive,
        handleDisconnectDrive,
        selectedCloudProviderOption,
        selectedCloudProviderLabel,
        selectedCloudProviderIsImplemented,
        saveStorageSettings,
        setDriveConfig,
        ASSET_CLOUD_PROVIDER_OPTIONS,
        envDriveClientId,
    };
}

export type StorageSettings = ReturnType<typeof useStorageSettings>;
