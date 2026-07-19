'use client';

import { DownloadCloud, HardDrive, HelpCircle, Loader2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { RichText } from '@/lib/i18n/RichText';
import { updateDriveConfig } from '@/lib/googleDrive';
import { ASSET_CLOUD_PROVIDER_OPTIONS, type AssetCloudProvider, type AssetStorageMode } from '@/lib/assetStorageSettings';
import type { StorageSettings } from '../hooks/useStorageSettings';
import { modalSectionClass } from '../settingsTypes';

interface StorageTabProps {
    storage: StorageSettings;
}

/** Desktop updates, Google Drive connection, and the asset-storage strategy. */
export default function StorageTab({ storage }: StorageTabProps) {
    const { t } = useI18n();
    const {
        isDesktopApp, updateStatus, updateMessage, handleManualUpdateCheck, handleInstallUpdate,
        driveConfig, setDriveConfig, isDriveBusy, driveError, clientIdInput, setClientIdInput,
        showDriveHelp, setShowDriveHelp, handleConnectDrive, handleDisconnectDrive,
        selectedCloudProviderOption, selectedCloudProviderLabel, selectedCloudProviderIsImplemented,
        assetCloudProvider, setAssetCloudProvider, assetStorageMode, setAssetStorageMode,
        hybridUploadToCloudByDefault, setHybridUploadToCloudByDefault,
        includeLegacyServerAssetsInHybrid, setIncludeLegacyServerAssetsInHybrid,
        envDriveClientId,
    } = storage;

    return (
        <>
            {isDesktopApp && (
                <section className={`${modalSectionClass} xl:col-span-12`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                                <ShieldCheck size={16} className="text-primary" />
                                {t('settings.storage.desktopUpdates')}
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                                {t('storage.updatesHint')}
                            </p>
                        </div>
                        <button
                            onClick={handleManualUpdateCheck}
                            className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1"
                            disabled={updateStatus === 'checking'}
                        >
                            <RefreshCcw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                            {t('storage.checkNow')}
                        </button>
                    </div>
                    {updateMessage && (
                        <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-2">
                            {updateMessage}
                        </div>
                    )}
                    {updateStatus === 'ready' && (
                        <button
                            onClick={handleInstallUpdate}
                            className="w-full py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-md flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                        >
                            <DownloadCloud size={14} />
                            {t('storage.restartInstall')}
                        </button>
                    )}
                </section>
            )}

            <section className={`${modalSectionClass} xl:col-span-6`}>
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                            <HardDrive size={16} className="text-primary" />
                            {t('settings.storage.cloudConnections')}
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                            {t('storage.providersHint')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowDriveHelp((prev) => !prev)}
                            className="px-2 py-1 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                        >
                            <HelpCircle size={14} />
                            {t('storage.help')}
                        </button>
                        {driveConfig.enabled ? (
                            <button
                                onClick={handleDisconnectDrive}
                                className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                                disabled={isDriveBusy || !selectedCloudProviderIsImplemented}
                            >
                                {isDriveBusy ? (<><Loader2 size={14} className="animate-spin" />{t('storage.disconnecting')}</>) : t('storage.disconnect')}
                            </button>
                        ) : (
                            <button
                                onClick={handleConnectDrive}
                                className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                                disabled={isDriveBusy || !selectedCloudProviderIsImplemented}
                            >
                                {isDriveBusy ? (<><Loader2 size={14} className="animate-spin" />{t('storage.connecting')}</>) : t('storage.connect')}
                            </button>
                        )}
                    </div>
                </div>
                {showDriveHelp && (
                    <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-3 space-y-2">
                        <p className="font-semibold text-foreground">{t('storage.oauthHowTo')}</p>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>{t('storage.oauth1')}</li>
                            <li>{t('storage.oauth2')}</li>
                            <li>{t('storage.oauth3')}</li>
                            <li>{t('storage.oauth4')}</li>
                            <li>{t('storage.oauth5')}</li>
                        </ol>
                        <p>{t('storage.oauthVerifyHint')}</p>
                    </div>
                )}
                <div className="space-y-2">
                    <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-2">
                        <p className="font-semibold text-foreground">{t('storage.selectedProvider', { provider: selectedCloudProviderLabel })}</p>
                        <p>
                            {selectedCloudProviderIsImplemented
                                ? t('storage.providerImplemented')
                                : t('storage.providerPlannedPrefs', { provider: selectedCloudProviderLabel })}
                        </p>
                    </div>
                    <label className="text-xs font-semibold block">{t('storage.oauthClientId')}</label>
                    <input
                        type="text"
                        value={clientIdInput}
                        onChange={(event) => {
                            const value = event.target.value.trim();
                            setClientIdInput(value);
                            const updated = updateDriveConfig({ clientId: value || undefined });
                            setDriveConfig(updated);
                        }}
                        placeholder={t('storage.oauthPlaceholder')}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    {!envDriveClientId && (
                        <p className="text-[11px] text-muted-foreground">
                            <RichText template={t('storage.clientIdHint')} values={{
                                // i18n-ignore: drive.file is an OAuth scope identifier
                                scope: <span className="font-mono">drive.file</span>,
                            }} />
                        </p>
                    )}
                    {!selectedCloudProviderIsImplemented && (
                        <div className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                            {t('storage.providerNotImplemented', { provider: selectedCloudProviderLabel })}
                        </div>
                    )}
                </div>
                {driveConfig.enabled && (
                    <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-2">
                        <p className="font-semibold">{t('storage.statusConnected')}</p>
                        {driveConfig.folderName && <p>{t('storage.folderLabel', { name: driveConfig.folderName })}</p>}
                        <p className="text-muted-foreground/80">{t('storage.backupsHint')}</p>
                    </div>
                )}
                {driveError && (
                    <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                        {driveError}
                    </div>
                )}
            </section>

            <section className={`${modalSectionClass} xl:col-span-6`}>
                <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                        <HardDrive size={16} className="text-primary" />
                        {t('settings.storage.assetStrategy')}
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                        {t('storage.modeHint')}
                    </p>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold block">{t('storage.cloudProvider')}</label>
                    <select
                        value={assetCloudProvider}
                        onChange={(event) => setAssetCloudProvider(event.target.value as AssetCloudProvider)}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                    >
                        {ASSET_CLOUD_PROVIDER_OPTIONS.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                                {provider.label}{provider.availability === 'planned' ? t('storage.plannedSuffix') : ''}
                            </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                        {t(selectedCloudProviderOption.descriptionKey)}
                    </p>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold block">{t('storage.storageMode')}</label>
                    <select
                        value={assetStorageMode}
                        onChange={(event) => setAssetStorageMode(event.target.value as AssetStorageMode)}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                    >
                        <option value="local">{t('storage.modeLocal')}</option>
                        <option value="hybrid">{t('storage.modeHybrid')}</option>
                        <option value="cloud" disabled={!selectedCloudProviderIsImplemented}>{t('storage.modeCloud', { provider: selectedCloudProviderLabel })}</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                        {assetStorageMode === 'local' && t('storage.localDesc')}
                        {assetStorageMode === 'hybrid' && t('storage.hybridDesc', { provider: selectedCloudProviderLabel })}
                        {assetStorageMode === 'cloud' && t('storage.cloudDesc', { provider: selectedCloudProviderLabel })}
                    </p>
                </div>

                {assetStorageMode === 'hybrid' && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={hybridUploadToCloudByDefault}
                            onChange={(event) => setHybridUploadToCloudByDefault(event.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary/20"
                        />
                        {t('storage.hybridDefaultCheck')}
                    </label>
                )}

                {assetStorageMode === 'hybrid' && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={includeLegacyServerAssetsInHybrid}
                            onChange={(event) => setIncludeLegacyServerAssetsInHybrid(event.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary/20"
                        />
                        {t('storage.includeLegacy')}
                    </label>
                )}

                {assetStorageMode !== 'local' && selectedCloudProviderIsImplemented && !driveConfig.enabled && (
                    <div className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                        {t('storage.connectAbove', { provider: selectedCloudProviderLabel })}
                    </div>
                )}

                {assetStorageMode !== 'local' && !selectedCloudProviderIsImplemented && (
                    <div className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                        {t('storage.providerPlannedAssets', { provider: selectedCloudProviderLabel })}
                    </div>
                )}
            </section>
        </>
    );
}
