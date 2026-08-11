'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Key } from 'lucide-react';
import HelpPopup from './HelpPopup';
import { useDialog } from '@/providers/DialogProvider';
import { useI18n } from '@/providers/I18nProvider';
import ModalShell from '@/components/ui/ModalShell';
import SettingsHeader from '@/components/settings/SettingsHeader';
import SettingsTabsNav, { type SettingsTabMeta } from '@/components/settings/SettingsTabsNav';
import SettingsFooter from '@/components/settings/SettingsFooter';
import SharedKeysNotice from '@/components/settings/SharedKeysNotice';
import ServicesTab from '@/components/settings/tabs/ServicesTab';
import ComfyTab from '@/components/settings/tabs/comfy/ComfyTab';
import StorageTab from '@/components/settings/tabs/StorageTab';
import WorkspaceTab from '@/components/settings/tabs/WorkspaceTab';
import AdminTab from '@/components/settings/tabs/AdminTab';
import type { SettingsTabId } from '@/components/settings/settingsTypes';
import { STORAGE_KEYS } from '@/components/settings/settingsTypes';
import { useApiKeysSettings } from '@/components/settings/hooks/useApiKeysSettings';
import { useComfyConnectionSettings } from '@/components/settings/hooks/useComfyConnectionSettings';
import { useComfyLibrarySettings } from '@/components/settings/hooks/useComfyLibrarySettings';
import { useInstallerSettings } from '@/components/settings/hooks/useInstallerSettings';
import { useStorageSettings } from '@/components/settings/hooks/useStorageSettings';
import { useWorkspacePreferences } from '@/components/settings/hooks/useWorkspacePreferences';
import { useAdminUsersSettings } from '@/components/settings/hooks/useAdminUsersSettings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string;
    userRoles?: string[];
}

/**
 * Application settings window. Business logic lives in the domain hooks
 * under `src/components/settings/hooks/`; rendering lives in the tab
 * components under `src/components/settings/tabs/`. This file only wires
 * them together and owns the handful of state pieces that cross domains
 * (active tab, save status, the auto-detected-paths bridge, and the final
 * save-everything handler).
 */
export default function SettingsModal({ isOpen, onClose, userId, userRoles }: SettingsModalProps) {
    const { t } = useI18n();
    const dialog = useDialog();

    const [status, setStatus] = useState<'idle' | 'saved' | 'saving' | 'error'>('idle');
    const [helpType, setHelpType] = useState<'comfy' | 'api' | null>(null);
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>('comfy');

    const isAdmin = !!userRoles?.includes('admin') && !!userId && userId.includes('@');
    const showAdminSection = isAdmin && !!userId && userId !== 'Guest';

    const markSaved = useCallback(() => {
        setStatus('saved');
        window.setTimeout(() => setStatus('idle'), 1500);
    }, []);

    const apiKeys = useApiKeysSettings(isOpen, userId);
    const comfy = useComfyConnectionSettings(isOpen, apiKeys);
    const installer = useInstallerSettings(isOpen, activeSettingsTab, comfy.comfyInstallPath);
    const library = useComfyLibrarySettings(
        isOpen,
        {
            comfyConnectionMode: comfy.comfyConnectionMode,
            comfyServerUrl: comfy.comfyServerUrl,
            comfyTunnelUrl: comfy.comfyTunnelUrl,
            comfyCloudUrl: comfy.comfyCloudUrl,
            comfyCloudApiKey: comfy.comfyCloudApiKey,
            comfyInstallPath: comfy.comfyInstallPath,
            comfyCustomNodesPath: comfy.comfyCustomNodesPath,
            comfyWorkflowLibraryPath: comfy.comfyWorkflowLibraryPath,
        },
        comfy.comfyMissingRequirements,
        comfy.handleVerifyComfyConnection,
        dialog,
    );
    const storage = useStorageSettings(isOpen);
    const workspace = useWorkspacePreferences(isOpen, markSaved);
    const admin = useAdminUsersSettings(isOpen, isAdmin, userId);

    // Bridge: once the installer detects a standard Comfy layout, fill in
    // empty path fields (but never overwrite a path the user typed).
    useEffect(() => {
        const installerStatus = installer.installerStatus;
        if (!installerStatus?.comfyDirectory.exists) return;

        const previousAutoDetected = installer.autoDetectedComfyPathsRef.current;
        const detectedInstallPath = installerStatus.comfyDirectory.path.trim();
        const detectedCustomNodesPath = installerStatus.paths?.customNodesPath?.trim() || '';
        const detectedWorkflowLibraryPath = Array.isArray(installerStatus.paths?.workflowLibraryPaths)
            ? installerStatus.paths.workflowLibraryPaths.map((entry) => entry.trim()).filter(Boolean).join('\n')
            : '';

        if (detectedInstallPath) {
            comfy.setComfyInstallPath((current) => {
                const trimmed = current.trim();
                return !trimmed || trimmed === previousAutoDetected.installPath ? detectedInstallPath : current;
            });
        }
        if (detectedCustomNodesPath) {
            comfy.setComfyCustomNodesPath((current) => {
                const trimmed = current.trim();
                return !trimmed || trimmed === previousAutoDetected.customNodesPath ? detectedCustomNodesPath : current;
            });
        }
        if (detectedWorkflowLibraryPath) {
            comfy.setComfyWorkflowLibraryPath((current) => {
                const trimmed = current.trim();
                return !trimmed || trimmed === previousAutoDetected.workflowLibraryPath ? detectedWorkflowLibraryPath : current;
            });
        }

        installer.autoDetectedComfyPathsRef.current = {
            installPath: detectedInstallPath,
            customNodesPath: detectedCustomNodesPath,
            workflowLibraryPath: detectedWorkflowLibraryPath,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [installer.installerStatus]);

    const handleSave = useCallback(async () => {
        setStatus('saving');

        const effectiveKeys = apiKeys.getEffectiveKeysForSave();
        localStorage.setItem(STORAGE_KEYS.MESHY_API_KEY, effectiveKeys.meshy);
        localStorage.setItem(STORAGE_KEYS.TRIPO_API_KEY, effectiveKeys.tripo);
        localStorage.setItem(STORAGE_KEYS.HITEMS_API_KEY, effectiveKeys.hitems);
        localStorage.setItem(STORAGE_KEYS.HITEMS_APP_ID, effectiveKeys.hitemsAppId);
        localStorage.setItem(STORAGE_KEYS.STABILITY_API_KEY, effectiveKeys.stability);
        localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, effectiveKeys.openai);
        localStorage.setItem(STORAGE_KEYS.GOOGLE_API_KEY, effectiveKeys.google);
        localStorage.setItem(STORAGE_KEYS.BANANA_API_KEY, effectiveKeys.banana);
        localStorage.setItem(STORAGE_KEYS.IMG_GEN_PROVIDER, comfy.defaultGenerativeProvider);
        localStorage.setItem(STORAGE_KEYS.COMFY_UI_URL, comfy.comfyServerUrl.trim());

        apiKeys.saveUpscaleSettings();
        apiKeys.saveOllamaPreferences();
        comfy.saveComfySettings();
        storage.saveStorageSettings();
        workspace.saveWorkspacePreferences();

        if (userId && userId !== 'Guest') {
            try {
                const res = await fetch('/api/user/keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        keys: {
                            meshy: effectiveKeys.meshy,
                            tripo: effectiveKeys.tripo,
                            hitems: effectiveKeys.hitems,
                            stability: effectiveKeys.stability,
                            openai: effectiveKeys.openai,
                            google: effectiveKeys.google,
                            banana: effectiveKeys.banana,
                            ...apiKeys.getUpscaleKeysForSave(),
                        },
                    }),
                });

                if (res.ok) {
                    apiKeys.setSyncStatus('synced');
                } else {
                    console.error('Failed to save to server, status:', res.status);
                    apiKeys.setSyncStatus('local');
                }
            } catch (e) {
                console.error('Exception saving to server', e);
                apiKeys.setSyncStatus('local');
            }
        }

        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
    }, [apiKeys, comfy, storage, userId, workspace]);

    const saveStatusMessage = status === 'saving'
        ? 'Saving settings...'
        : status === 'saved'
            ? userId && userId !== 'Guest'
                ? 'Settings saved locally and synced to your account.'
                : 'Settings saved locally in this browser.'
            : userId && userId !== 'Guest'
                ? 'Changes save locally and sync to your account when possible.'
                : 'Changes save locally in this browser.';

    const settingsTabs: SettingsTabMeta[] = useMemo(() => [
        {
            id: 'comfy',
            label: t('settings.tab.comfy'),
            shortLabel: 'Comfy',
            description: 'Provider defaults, Comfy connection paths, installer status, and workflow management.',
            badge: 'Automation',
        },
        {
            id: 'services',
            label: t('settings.tab.services'),
            shortLabel: 'Services',
            description: '3D providers, image runtimes, and local Ollama credentials in one place.',
            badge: '3D + Vision',
        },
        {
            id: 'storage',
            label: t('settings.tab.storage'),
            shortLabel: 'Storage',
            description: 'Drive connection, upload strategy, setup shortcuts, and desktop update controls.',
            badge: storage.isDesktopApp ? 'Cloud + Desktop' : 'Cloud',
        },
        {
            id: 'workspace',
            label: t('settings.tab.workspace'),
            shortLabel: 'Workspace',
            description: 'Theme, rail behavior, hint preferences, and activity visibility for the editor.',
            badge: 'Appearance',
        },
        ...(showAdminSection
            ? [{
                id: 'admin' as const,
                label: t('settings.tab.admin'),
                shortLabel: 'Admin',
                description: 'User approvals, role edits, and rights management for the current account.',
                badge: 'Access',
            }]
            : []),
    ], [showAdminSection, storage.isDesktopApp, t]);

    const activeSettingsTabMeta = settingsTabs.find((tab) => tab.id === activeSettingsTab) || settingsTabs[0];

    useEffect(() => {
        if (!showAdminSection && activeSettingsTab === 'admin') {
            setActiveSettingsTab('comfy');
        }
    }, [activeSettingsTab, showAdminSection]);

    if (!isOpen) return null;

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={t('settings.title')}
            icon={<Key size={14} className="text-primary" />}
            initialWidth={1180}
            initialHeight={820}
            minWidth={560}
            minHeight={420}
            zIndex={50}
            bodyClassName="overflow-hidden flex flex-col"
        >
            <SettingsHeader
                syncStatus={apiKeys.syncStatus}
                userId={userId}
                defaultGenerativeProvider={comfy.defaultGenerativeProvider}
                assetStorageMode={storage.assetStorageMode}
                themeMode={workspace.themeMode}
            />

            <div className="flex-1 overflow-y-auto px-3 pb-5 sm:px-6 sm:pb-6 lg:px-8">
                <SettingsTabsNav
                    tabs={settingsTabs}
                    activeTab={activeSettingsTab}
                    activeTabMeta={activeSettingsTabMeta}
                    onSelect={setActiveSettingsTab}
                />

                <div
                    role="tabpanel"
                    id={`settings-panel-${activeSettingsTabMeta.id}`}
                    aria-labelledby={`settings-tab-${activeSettingsTabMeta.id}`}
                    className="grid gap-6 py-5 xl:grid-cols-12"
                >
                    {activeSettingsTab === 'services' && <ServicesTab apiKeys={apiKeys} />}
                    {activeSettingsTab === 'comfy' && <ComfyTab comfy={comfy} installer={installer} library={library} />}
                    {(activeSettingsTab === 'services' || activeSettingsTab === 'comfy') && <SharedKeysNotice />}
                    {activeSettingsTab === 'storage' && <StorageTab storage={storage} />}
                    {activeSettingsTab === 'workspace' && <WorkspaceTab workspace={workspace} installer={installer} />}
                    {activeSettingsTab === 'admin' && showAdminSection && <AdminTab admin={admin} />}
                </div>
            </div>

            <SettingsFooter
                saveStatusMessage={saveStatusMessage}
                status={status}
                onCancel={onClose}
                onSave={() => void handleSave()}
            />

            <HelpPopup
                isOpen={!!helpType}
                onClose={() => setHelpType(null)}
                type={helpType || 'comfy'}
            />
        </ModalShell>
    );
}

// Utility to get the key from anywhere
export const getApiKey = (provider: 'meshy' | 'tripo' | 'hitems') => {
    if (typeof window === 'undefined') return '';

    switch (provider) {
        case 'meshy':
            return localStorage.getItem(STORAGE_KEYS.MESHY_API_KEY) || process.env.NEXT_PUBLIC_MESHY_API_KEY || '';
        case 'tripo':
            return localStorage.getItem(STORAGE_KEYS.TRIPO_API_KEY) || '';
        case 'hitems':
            return localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '';
        default:
            return '';
    }
};
