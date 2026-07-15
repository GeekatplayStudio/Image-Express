'use client';

import { DownloadCloud, HardDrive, HelpCircle, Loader2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
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
                                Stay current with the latest Image Express desktop features.
                            </p>
                        </div>
                        <button
                            onClick={handleManualUpdateCheck}
                            className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1"
                            disabled={updateStatus === 'checking'}
                        >
                            <RefreshCcw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                            Check Now
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
                            Restart & Install Update
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
                            Google Drive is available today. Additional providers can now be selected in storage settings and surfaced explicitly while their adapters are pending.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowDriveHelp((prev) => !prev)}
                            className="px-2 py-1 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                        >
                            <HelpCircle size={14} />
                            Help
                        </button>
                        {driveConfig.enabled ? (
                            <button
                                onClick={handleDisconnectDrive}
                                className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                                disabled={isDriveBusy || !selectedCloudProviderIsImplemented}
                            >
                                {isDriveBusy ? (<><Loader2 size={14} className="animate-spin" />Disconnecting...</>) : 'Disconnect'}
                            </button>
                        ) : (
                            <button
                                onClick={handleConnectDrive}
                                className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                                disabled={isDriveBusy || !selectedCloudProviderIsImplemented}
                            >
                                {isDriveBusy ? (<><Loader2 size={14} className="animate-spin" />Connecting...</>) : 'Connect'}
                            </button>
                        )}
                    </div>
                </div>
                {showDriveHelp && (
                    <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-3 space-y-2">
                        <p className="font-semibold text-foreground">How to create a Google OAuth Client ID</p>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>Visit Google Cloud Console and create (or select) a project.</li>
                            <li>Enable the Drive API under APIs and Services.</li>
                            <li>Configure the OAuth consent screen (External) and add your app domains.</li>
                            <li>Create OAuth credentials: choose Web application, add your origins (for example http://localhost:3000), and copy the Client ID.</li>
                            <li>Paste the Client ID here or set NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID before running the app.</li>
                        </ol>
                        <p>If you publish the app, submit the OAuth consent screen for verification so users see the Google account picker without warnings.</p>
                    </div>
                )}
                <div className="space-y-2">
                    <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-2">
                        <p className="font-semibold text-foreground">Selected provider: {selectedCloudProviderLabel}</p>
                        <p>
                            {selectedCloudProviderIsImplemented
                                ? 'This provider can be connected below and used for cloud backups/uploads.'
                                : `${selectedCloudProviderLabel} is planned. Selecting it updates preferences now, but cloud uploads stay local-only until that adapter is implemented.`}
                        </p>
                    </div>
                    <label className="text-xs font-semibold block">Google OAuth Client ID</label>
                    <input
                        type="text"
                        value={clientIdInput}
                        onChange={(event) => {
                            const value = event.target.value.trim();
                            setClientIdInput(value);
                            const updated = updateDriveConfig({ clientId: value || undefined });
                            setDriveConfig(updated);
                        }}
                        placeholder="1234567890-abcdef.apps.googleusercontent.com"
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                    />
                    {!envDriveClientId && (
                        <p className="text-[11px] text-muted-foreground">
                            Paste the Client ID from your Google Cloud OAuth credentials. Enable the Drive API and include the <span className="font-mono">drive.file</span> scope.
                        </p>
                    )}
                    {!selectedCloudProviderIsImplemented && (
                        <div className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                            {selectedCloudProviderLabel} connection controls are not implemented yet. Google Drive remains the only active cloud connector in this build.
                        </div>
                    )}
                </div>
                {driveConfig.enabled && (
                    <div className="text-[11px] text-muted-foreground bg-secondary/20 border border-border/40 rounded-md px-3 py-2">
                        <p className="font-semibold">Status: Connected</p>
                        {driveConfig.folderName && <p>Folder: {driveConfig.folderName}</p>}
                        <p className="text-muted-foreground/80">Backups run after each successful save.</p>
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
                        Choose where uploaded assets are stored: browser-local, hybrid, or cloud-backed with your selected provider.
                    </p>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold block">Cloud Provider</label>
                    <select
                        value={assetCloudProvider}
                        onChange={(event) => setAssetCloudProvider(event.target.value as AssetCloudProvider)}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                    >
                        {ASSET_CLOUD_PROVIDER_OPTIONS.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                                {provider.label}{provider.availability === 'planned' ? ' (planned)' : ''}
                            </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                        {selectedCloudProviderOption.description}
                    </p>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold block">Storage Mode</label>
                    <select
                        value={assetStorageMode}
                        onChange={(event) => setAssetStorageMode(event.target.value as AssetStorageMode)}
                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                    >
                        <option value="local">Local only (browser)</option>
                        <option value="hybrid">Hybrid (local + optional cloud per upload)</option>
                        <option value="cloud" disabled={!selectedCloudProviderIsImplemented}>Cloud only ({selectedCloudProviderLabel})</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                        {assetStorageMode === 'local' && 'Files stay in your browser storage (IndexedDB).'}
                        {assetStorageMode === 'hybrid' && `Files save locally by default; you can enable per-upload cloud copy for ${selectedCloudProviderLabel} when supported.`}
                        {assetStorageMode === 'cloud' && `All uploads go to your connected ${selectedCloudProviderLabel} assets folder.`}
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
                        In hybrid mode, check cloud upload by default
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
                        Include legacy server assets in Asset Library lists
                    </label>
                )}

                {assetStorageMode !== 'local' && selectedCloudProviderIsImplemented && !driveConfig.enabled && (
                    <div className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                        Connect {selectedCloudProviderLabel} above to use cloud or hybrid cloud uploads.
                    </div>
                )}

                {assetStorageMode !== 'local' && !selectedCloudProviderIsImplemented && (
                    <div className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                        {selectedCloudProviderLabel} is planned but not active yet. Assets will remain local in this build.
                    </div>
                )}
            </section>
        </>
    );
}
