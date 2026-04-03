'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Key, ShieldCheck, AlertCircle, Server, Cloud, Box, RefreshCcw, DownloadCloud, HardDrive, Loader2, HelpCircle } from 'lucide-react';
import HelpPopup from './HelpPopup';
import type { AuthUser, DesktopUpdatePayload, DesktopUpdateStatus, GoogleDriveConfig } from '@/types';
import { useDialog } from '@/providers/DialogProvider';
import { connectGoogleDrive, disconnectGoogleDrive, loadDriveConfig, updateDriveConfig } from '@/lib/googleDrive';
import useEscapeKey from '@/hooks/useEscapeKey';
import {
    ASSET_CLOUD_PROVIDER_OPTIONS,
    getAssetCloudProviderLabel,
    isImplementedAssetCloudProvider,
    loadAssetStorageSettings,
    saveAssetStorageSettings,
    type AssetCloudProvider,
    type AssetStorageMode
} from '@/lib/assetStorageSettings';
import {
    GENERATIVE_PROVIDER_OPTIONS,
    GENERATIVE_WORKFLOW_OPTIONS,
    isGenerativeProviderReady,
    isWorkflowSupportedByProvider,
    loadGenerativePreferences,
    resolveCompatibleWorkflowForProvider,
    saveGenerativePreferences,
    type GenerativeProviderId,
    type GenerativeWorkflowId
} from '@/lib/generative-preferences';
import {
    DEFAULT_COMFY_LOCAL_URL,
    hydrateComfyCloudSettingsFromRuntime,
    loadComfyCloudApiKey,
    saveComfyCloudApiKey,
    verifyAvailableComfyConnection,
    type ComfyConnectionMode
} from '@/lib/comfyui/connection';
import type { ComfyLibraryRepoKind, ComfyLibrarySnapshot } from '@/lib/comfyui/libraryTypes';
import { inspectComfyServerCatalog } from '@/lib/comfyui/runner';
import type { ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';
import { requestOpenSetupWizard } from '@/lib/setupWizard';
import { loadUiPreferences, saveUiPreferences } from '@/lib/ui-preferences';
import {
    THEME_ACCENT_OPTIONS,
    THEME_MODE_OPTIONS,
    loadThemePreferences,
    saveThemePreferences,
    type ThemeAccentPreset,
    type ThemePreferenceMode,
} from '@/lib/themePreferences';
import { resetNumberDragHintSeen } from '@/lib/number-drag-hints';
import {
    DEFAULT_OLLAMA_BASE_URL,
    DEFAULT_OLLAMA_MODEL,
    loadLocalAiPreferences,
    saveLocalAiPreferences,
} from '@/lib/localAiPreferences';
import { requestOllamaModelInstall } from '@/lib/ollamaModelInstall';
import {
    fetchInstallerRuntimeStatus,
    type InstallerRuntimeStatus,
} from '@/lib/installerRuntimeStatus';
import {
    runInstallerRuntime,
    type InstallerRunResult,
} from '@/lib/installerRuntimeRun';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string;
    userRoles?: string[];
}

export const STORAGE_KEYS = {
    // 3D Services
    MESHY_API_KEY: 'meshy_api_key',
    TRIPO_API_KEY: 'tripo_api_key',
    HITEMS_API_KEY: 'hitems_api_key',
    HITEMS_APP_ID: 'hitems_appid',

    // Image Services
    STABILITY_API_KEY: 'stability_api_key',
    OPENAI_API_KEY: 'openai_api_key',
    GOOGLE_API_KEY: 'google_api_key', // Google Nano/Gemini
    BANANA_API_KEY: 'banana_api_key', // Banana.dev

    // Legacy / Others
    IMG_GEN_PROVIDER: 'image-express-provider',
    COMFY_UI_URL: 'image-express-comfy-url',
};

type ValidationProvider = 'meshy' | 'tripo' | 'hitems' | 'google';
type ValidationState = 'idle' | 'checking' | 'valid' | 'invalid';

const sanitizeHeaderValue = (value: string) => value.replace(/Bearer /gi, '').replace(/["']/g, '').trim();

const envDriveClientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? '';

export default function SettingsModal({ isOpen, onClose, userId, userRoles }: SettingsModalProps) {
    const dialog = useDialog();
    // 3D Keys
    const [meshyKey, setMeshyKey] = useState('');
    const [tripoKey, setTripoKey] = useState('');
    const [hitemsKey, setHitemsKey] = useState(''); // Stores either "token" or "ak:sk"

    // UI state for splitting Hitems key
    const [hitemsMode, setHitemsMode] = useState<'token' | 'ak_sk'>('ak_sk');
    const [hitemsAk, setHitemsAk] = useState('');
    const [hitemsSk, setHitemsSk] = useState('');

    const [hitemsAppId, setHitemsAppId] = useState('');

    // Image Keys
    const [stabilityKey, setStabilityKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [googleKey, setGoogleKey] = useState('');
    const [bananaKey, setBananaKey] = useState('');
    const [ollamaBaseUrl, setOllamaBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL);
    const [ollamaModel, setOllamaModel] = useState(DEFAULT_OLLAMA_MODEL);
    const [defaultGenerativeProvider, setDefaultGenerativeProvider] = useState<GenerativeProviderId>('comfy');
    const [defaultGenerativeWorkflow, setDefaultGenerativeWorkflow] = useState<GenerativeWorkflowId>('zone');
    const [comfyServerUrl, setComfyServerUrl] = useState(DEFAULT_COMFY_LOCAL_URL);
    const [comfyConnectionMode, setComfyConnectionMode] = useState<ComfyConnectionMode>('auto');
    const [comfyCloudUrl, setComfyCloudUrl] = useState('https://cloud.comfy.org');
    const [comfyCloudApiKey, setComfyCloudApiKey] = useState('');
    const [comfyInstallPath, setComfyInstallPath] = useState('');
    const [comfyCustomNodesPath, setComfyCustomNodesPath] = useState('');
    const [comfyWorkflowLibraryPath, setComfyWorkflowLibraryPath] = useState('');
    const [comfyConnectionCheck, setComfyConnectionCheck] = useState<{
        state: 'idle' | 'checking' | 'success' | 'error';
        message: string;
    }>({
        state: 'idle',
        message: '',
    });
    const [comfyLibrarySnapshot, setComfyLibrarySnapshot] = useState<ComfyLibrarySnapshot | null>(null);
    const [comfyLibraryCheck, setComfyLibraryCheck] = useState<{
        state: 'idle' | 'checking' | 'success' | 'error';
        message: string;
    }>({
        state: 'idle',
        message: '',
    });
    const [comfyRepoUrl, setComfyRepoUrl] = useState('');
    const [comfyRepoKind, setComfyRepoKind] = useState<ComfyLibraryRepoKind>('custom-nodes');
    const [comfyMissingRequirements, setComfyMissingRequirements] = useState<{
        updateInstall: boolean;
        models: ComfyWorkflowInstallableModel[];
        workflows: Array<{
            workflowName: string;
            missingNodeTypes: string[];
            missingModels: string[];
        }>;
    } | null>(null);
    const [installerStatus, setInstallerStatus] = useState<InstallerRuntimeStatus | null>(null);
    const [installerStatusState, setInstallerStatusState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [installerStatusMessage, setInstallerStatusMessage] = useState('');
    const [installerRunState, setInstallerRunState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [installerRunMessage, setInstallerRunMessage] = useState('');
    const [installerRunResult, setInstallerRunResult] = useState<InstallerRunResult | null>(null);
    const [autoStartInpaintMasking, setAutoStartInpaintMasking] = useState(false);
    const [showInpaintPromptDock, setShowInpaintPromptDock] = useState(true);
    const [ollamaCheck, setOllamaCheck] = useState<{
        state: 'idle' | 'checking' | 'success' | 'error';
        message: string;
        modelFound?: boolean;
    }>({
        state: 'idle',
        message: '',
    });
    const [isInstallingOllamaModel, setIsInstallingOllamaModel] = useState(false);

    const [status, setStatus] = useState<'idle' | 'saved' | 'saving' | 'error'>('idle');
    const [syncStatus, setSyncStatus] = useState<'local' | 'synced' | 'syncing'>('local');
    const [helpType, setHelpType] = useState<'comfy' | 'api' | null>(null);
    const [isLogVisible, setIsLogVisible] = useState(false);
    const [logContent, setLogContent] = useState('');
    const [isLogLoading, setIsLogLoading] = useState(false);
    const [logError, setLogError] = useState<string | null>(null);
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
    const [expandToolRailLabelsOnHover, setExpandToolRailLabelsOnHover] = useState(true);
    const [suppressNumberDragHints, setSuppressNumberDragHints] = useState(false);
    const [themeMode, setThemeMode] = useState<ThemePreferenceMode>('system');
    const [themeAccentPreset, setThemeAccentPreset] = useState<ThemeAccentPreset>('ocean');
    const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
    const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);
    const [adminError, setAdminError] = useState<string | null>(null);
    const [adminDraftRoles, setAdminDraftRoles] = useState<Record<string, string>>({});
    const [adminDraftRights, setAdminDraftRights] = useState<Record<string, string>>({});
    const [adminBusyUser, setAdminBusyUser] = useState<string | null>(null);
    const [validationStatus, setValidationStatus] = useState<Record<ValidationProvider, { state: ValidationState; message: string }>>({
        meshy: { state: 'idle', message: '' },
        tripo: { state: 'idle', message: '' },
        hitems: { state: 'idle', message: '' },
        google: { state: 'idle', message: '' },
    });

    const isAdmin = !!userRoles?.includes('admin') && !!userId && userId.includes('@');

    useEscapeKey(onClose, { enabled: isOpen });

    // Load keys on mount
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const bridge = window.desktop;
        let unsubscribe: (() => void) | undefined;

        if (bridge?.isDesktop) {
            setIsDesktopApp(true);
            setUpdateStatus('idle');
            setUpdateMessage(null);
            unsubscribe = bridge.onUpdateStatus?.((payload: DesktopUpdatePayload) => {
                if (!payload) {
                    return;
                }
                setUpdateStatus(payload.status || 'idle');
                setUpdateMessage(payload.message || null);
            });
        }

        const storedDrive = loadDriveConfig();
        setDriveConfig(storedDrive);
        if (storedDrive.clientId) {
            setClientIdInput(storedDrive.clientId);
        } else {
            setClientIdInput(envDriveClientId || '');
        }

        // Always load from local storage first for immediate UI
        setMeshyKey(localStorage.getItem(STORAGE_KEYS.MESHY_API_KEY) || '');
        setTripoKey(localStorage.getItem(STORAGE_KEYS.TRIPO_API_KEY) || '');
        setHitemsKey(localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '');
        setHitemsAppId(localStorage.getItem(STORAGE_KEYS.HITEMS_APP_ID) || '');

        // Parse Hitem Key
        const rawHitemKey = localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '';
        setHitemsKey(rawHitemKey);

        if (rawHitemKey.includes(':') && !rawHitemKey.startsWith('Bearer')) {
            setHitemsMode('ak_sk');
            const [ak, sk] = rawHitemKey.split(':');
            setHitemsAk(ak || '');
            setHitemsSk(sk || '');
        } else {
            // Default to AK/SK if empty, or Token if it looks like a token
            if (!rawHitemKey) setHitemsMode('ak_sk');
            else setHitemsMode('token');
        }

        setStabilityKey(localStorage.getItem(STORAGE_KEYS.STABILITY_API_KEY) || '');
        setOpenaiKey(localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '');
        setGoogleKey(localStorage.getItem(STORAGE_KEYS.GOOGLE_API_KEY) || '');
        setBananaKey(localStorage.getItem(STORAGE_KEYS.BANANA_API_KEY) || '');
        const localAiPreferences = loadLocalAiPreferences();
        setOllamaBaseUrl(localAiPreferences.ollamaBaseUrl);
        setOllamaModel(localAiPreferences.ollamaModel);
        const generativePreferences = loadGenerativePreferences();
        setDefaultGenerativeProvider(generativePreferences.defaultProvider);
        setDefaultGenerativeWorkflow(generativePreferences.defaultWorkflow);
        setComfyServerUrl(generativePreferences.comfyServerUrl);
        setComfyConnectionMode(generativePreferences.comfyConnectionMode);
        setComfyCloudUrl(generativePreferences.comfyCloudUrl);
        setComfyInstallPath(generativePreferences.comfyInstallPath);
        setComfyCustomNodesPath(generativePreferences.comfyCustomNodesPath);
        setComfyWorkflowLibraryPath(generativePreferences.comfyWorkflowLibraryPath);
        setComfyCloudApiKey(loadComfyCloudApiKey());
        void hydrateComfyCloudSettingsFromRuntime().then((runtimeConfig) => {
            if (runtimeConfig.cloudApiKey) {
                setComfyCloudApiKey((current) => current || runtimeConfig.cloudApiKey);
            }

            if (
                runtimeConfig.cloudUrl
                && (
                    !generativePreferences.comfyCloudUrl.trim()
                    || generativePreferences.comfyCloudUrl.trim() === 'https://cloud.comfy.org'
                )
            ) {
                setComfyCloudUrl(runtimeConfig.cloudUrl);
            }
        });
        setAutoStartInpaintMasking(generativePreferences.autoStartInpaintMasking);
        setShowInpaintPromptDock(generativePreferences.showInpaintPromptDock);

        // If user is logged in, fetch from server
        if (userId && userId !== 'Guest') {
            setSyncStatus('syncing');
            fetch(`/api/user/keys?userId=${encodeURIComponent(userId)}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Failed to fetch keys');
                })
                .then(data => {
                    if (data && data.keys) {
                        if (data.keys.meshy) setMeshyKey(data.keys.meshy);
                        if (data.keys.tripo) setTripoKey(data.keys.tripo);
                        if (data.keys.hitems) {
                            const raw = data.keys.hitems;
                            setHitemsKey(raw);
                            if (raw.includes(':') && !raw.startsWith('Bearer')) {
                                setHitemsMode('ak_sk');
                                const [ak, sk] = raw.split(':');
                                setHitemsAk(ak || '');
                                setHitemsSk(sk || '');
                            } else {
                                setHitemsMode(raw ? 'token' : 'ak_sk');
                            }
                        }
                        if (data.keys.stability) setStabilityKey(data.keys.stability);
                        if (data.keys.openai) setOpenaiKey(data.keys.openai);
                        if (data.keys.google) setGoogleKey(data.keys.google);
                        if (data.keys.banana) setBananaKey(data.keys.banana);
                        setSyncStatus('synced');
                    } else {
                        setSyncStatus('local'); // No keys on server yet
                    }
                })
                .catch(err => {
                    console.error("Failed to sync keys:", err);
                    setSyncStatus('local');
                });
        } else {
            setSyncStatus('local');
        }

        const assetStorageSettings = loadAssetStorageSettings();
        setAssetStorageMode(assetStorageSettings.mode);
        setAssetCloudProvider(assetStorageSettings.cloudProvider);
        setHybridUploadToCloudByDefault(assetStorageSettings.hybridUploadToCloudByDefault);
        setIncludeLegacyServerAssetsInHybrid(assetStorageSettings.includeLegacyServerAssetsInHybrid);
        const uiPreferences = loadUiPreferences();
        setExpandToolRailLabelsOnHover(uiPreferences.expandToolRailLabelsOnHover);
        setSuppressNumberDragHints(uiPreferences.suppressNumberDragHints);
        const themePreferences = loadThemePreferences();
        setThemeMode(themePreferences.mode);
        setThemeAccentPreset(themePreferences.accentPreset);

        return () => {
            unsubscribe?.();
        };
    }, [isOpen, userId]);

    const loadAdminUsers = useCallback(async () => {
        if (!isAdmin || !userId || userId === 'Guest') return;
        setIsAdminUsersLoading(true);
        setAdminError(null);
        try {
            const res = await fetch(`/api/user/admin/users?requesterEmail=${encodeURIComponent(userId)}`);
            const data = await res.json();
            if (!res.ok || !data.success) {
                setAdminError(data.message || 'Failed to load users.');
                setAdminUsers([]);
                return;
            }
            const users = (Array.isArray(data.users) ? data.users : []) as AuthUser[];
            setAdminUsers(users);
            setAdminDraftRoles(
                Object.fromEntries(users.map((user) => [user.email, (user.roles || []).join(', ')]))
            );
            setAdminDraftRights(
                Object.fromEntries(users.map((user) => [user.email, (user.rights || []).join(', ')]))
            );
        } catch (error) {
            console.error('Failed to load admin users', error);
            setAdminError('Failed to load users.');
            setAdminUsers([]);
        } finally {
            setIsAdminUsersLoading(false);
        }
    }, [isAdmin, userId]);

    useEffect(() => {
        if (!isOpen) return;
        if (!isAdmin || !userId || userId === 'Guest') return;
        void loadAdminUsers();
    }, [isOpen, isAdmin, userId, loadAdminUsers]);

    useEffect(() => {
        setComfyConnectionCheck((current) => (
            current.state === 'idle' && !current.message
                ? current
                : { state: 'idle', message: '' }
        ));
        setComfyMissingRequirements(null);
    }, [comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyServerUrl]);

    useEffect(() => {
        setComfyLibraryCheck((current) => (
            current.state === 'idle' && !current.message
                ? current
                : { state: 'idle', message: '' }
        ));
    }, [comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyCustomNodesPath, comfyInstallPath, comfyServerUrl, comfyWorkflowLibraryPath]);

    const setProviderValidation = useCallback((provider: ValidationProvider, state: ValidationState, message: string) => {
        setValidationStatus((prev) => ({
            ...prev,
            [provider]: { state, message },
        }));
    }, []);

    const clearProviderValidation = useCallback((provider: ValidationProvider) => {
        setProviderValidation(provider, 'idle', '');
    }, [setProviderValidation]);

    const getEffectiveHitemsKey = useCallback(() => {
        if (hitemsMode === 'ak_sk') {
            const ak = hitemsAk.trim();
            const sk = hitemsSk.trim();
            return ak && sk ? `${ak}:${sk}` : '';
        }
        return hitemsKey.trim();
    }, [hitemsAk, hitemsKey, hitemsMode, hitemsSk]);

    const validateProviderKey = useCallback(async (provider: ValidationProvider) => {
        if (provider === 'meshy') {
            const key = meshyKey.trim();
            if (!key) {
                setProviderValidation('meshy', 'invalid', 'Meshy key is empty.');
                return;
            }
            if (key.length < 20) {
                setProviderValidation('meshy', 'invalid', 'Meshy key looks too short.');
                return;
            }
            setProviderValidation('meshy', 'valid', 'Meshy key format looks valid (preflight check).');
            return;
        }

        if (provider === 'tripo') {
            const key = tripoKey.trim();
            if (!key) {
                setProviderValidation('tripo', 'invalid', 'Tripo key is empty.');
                return;
            }
            if (key.length < 20) {
                setProviderValidation('tripo', 'invalid', 'Tripo key looks too short.');
                return;
            }
            setProviderValidation('tripo', 'valid', 'Tripo key format looks valid (preflight check).');
            return;
        }

        if (provider === 'google') {
            const key = googleKey.trim();
            if (!key) {
                setProviderValidation('google', 'invalid', 'Google key is empty.');
                return;
            }
            if (!/^AIza[\w-]{20,}$/.test(key)) {
                setProviderValidation('google', 'invalid', 'Google key format looks invalid.');
                return;
            }
            setProviderValidation('google', 'valid', 'Google key format looks valid (preflight check).');
            return;
        }

        const effectiveHitemsKey = sanitizeHeaderValue(getEffectiveHitemsKey());
        const appId = sanitizeHeaderValue(hitemsAppId);
        if (!effectiveHitemsKey) {
            setProviderValidation('hitems', 'invalid', 'Hitem key is empty.');
            return;
        }

        setProviderValidation('hitems', 'checking', 'Validating Hitem credentials...');
        try {
            const authHeader = effectiveHitemsKey.includes(':') ? effectiveHitemsKey : `Bearer ${effectiveHitemsKey}`;
            const headers: Record<string, string> = { Authorization: authHeader };
            if (appId) headers.Appid = appId;

            const res = await fetch('/api/ai/hitems/validate', { method: 'GET', headers });
            const data = (await res.json().catch(() => ({}))) as { valid?: boolean; message?: string; detail?: string };
            const message = data.message || data.detail || `Validation returned HTTP ${res.status}.`;

            if (res.ok && data.valid) {
                localStorage.setItem(STORAGE_KEYS.HITEMS_API_KEY, effectiveHitemsKey);
                localStorage.setItem(STORAGE_KEYS.HITEMS_APP_ID, appId);
                setProviderValidation('hitems', 'valid', message);
            } else {
                setProviderValidation('hitems', 'invalid', message);
            }
        } catch (error) {
            setProviderValidation('hitems', 'invalid', error instanceof Error ? error.message : 'Validation failed.');
        }
    }, [getEffectiveHitemsKey, googleKey, hitemsAppId, meshyKey, setProviderValidation, tripoKey]);

    const handleVerifyComfyConnection = useCallback(async () => {
        setComfyConnectionCheck({
            state: 'checking',
            message: 'Checking Comfy connection...',
        });
        setComfyMissingRequirements(null);

        try {
            const result = await verifyAvailableComfyConnection({
                mode: comfyConnectionMode,
                localUrl: comfyServerUrl,
                cloudUrl: comfyCloudUrl,
                cloudApiKey: comfyCloudApiKey,
            });

            setComfyConnectionCheck({
                state: result.ok ? 'success' : 'error',
                message: result.message,
            });

            if (!result.ok) {
                return;
            }

            const catalog = await inspectComfyServerCatalog({
                connection: {
                    mode: comfyConnectionMode,
                    localUrl: comfyServerUrl,
                    cloudUrl: comfyCloudUrl,
                    cloudApiKey: comfyCloudApiKey,
                },
            });

            const workflows = catalog.records
                .filter((record) => record.missingNodeTypes.length > 0 || record.missingModels.length > 0)
                .map((record) => ({
                    workflowName: record.workflowName,
                    missingNodeTypes: record.missingNodeTypes,
                    missingModels: record.missingModels.map((model) => model.name),
                }));

            if (workflows.length === 0) {
                return;
            }

            const modelMap = new Map<string, ComfyWorkflowInstallableModel>();
            let updateInstall = false;
            for (const record of catalog.records) {
                if (record.missingNodeTypes.length > 0 && record.canAutoUpdateInstall) {
                    updateInstall = true;
                }

                for (const model of record.missingModels) {
                    modelMap.set(`${model.directory}/${model.name}`.toLowerCase(), model);
                }
            }

            setComfyMissingRequirements({
                updateInstall,
                models: Array.from(modelMap.values()),
                workflows,
            });
        } catch (error) {
            setComfyConnectionCheck({
                state: 'error',
                message: error instanceof Error ? error.message : 'Failed to verify Comfy connection.',
            });
        }
    }, [comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyServerUrl]);

    const runComfyLibraryAction = useCallback(async (
        action: 'scan' | 'install-repo' | 'update-repo' | 'update-install' | 'install-requirements',
        extraBody: Record<string, unknown> = {}
    ) => {
        setComfyLibraryCheck({
            state: 'checking',
            message: action === 'scan' ? 'Scanning Comfy workflow library...' : 'Running Comfy library action...',
        });

        try {
            const response = await fetch('/api/ai/comfy/library', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action,
                    connectionMode: comfyConnectionMode,
                    comfyServerUrl,
                    comfyCloudUrl,
                    comfyCloudApiKey,
                    installPath: comfyInstallPath,
                    customNodesPath: comfyCustomNodesPath,
                    workflowLibraryPath: comfyWorkflowLibraryPath,
                    ...extraBody,
                }),
            });

            const data = await response.json() as {
                success?: boolean;
                message?: string;
                snapshot?: ComfyLibrarySnapshot;
            };

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Comfy library action failed.');
            }

            setComfyLibrarySnapshot(data.snapshot || null);
            setComfyLibraryCheck({
                state: 'success',
                message: data.message || 'Comfy library refreshed.',
            });
        } catch (error) {
            setComfyLibraryCheck({
                state: 'error',
                message: error instanceof Error ? error.message : 'Comfy library action failed.',
            });
        }
    }, [
        comfyCloudApiKey,
        comfyCloudUrl,
        comfyConnectionMode,
        comfyCustomNodesPath,
        comfyInstallPath,
        comfyServerUrl,
        comfyWorkflowLibraryPath,
    ]);

    const handleRefreshComfyLibrary = useCallback(async () => {
        await runComfyLibraryAction('scan');
    }, [runComfyLibraryAction]);

    const loadInstallerStatus = useCallback(async () => {
        setInstallerStatusState('loading');
        setInstallerStatusMessage('');
        try {
            const status = await fetchInstallerRuntimeStatus();
            setInstallerStatus(status);
            setInstallerStatusState('success');
        } catch (error) {
            setInstallerStatusState('error');
            setInstallerStatusMessage(
                error instanceof Error ? error.message : 'Failed to load installer runtime status.',
            );
        }
    }, []);

    const handleRunInstallerWorkflow = useCallback(async (
        payload: {
            installComfy: boolean;
            installCustomBundles: boolean;
            installComfyModels: boolean;
            installOllamaModels: boolean;
            runQa: boolean;
            autoFix: boolean;
            skipTests: boolean;
            dryRun: boolean;
        },
    ) => {
        setInstallerRunState('running');
        setInstallerRunMessage('');
        setInstallerRunResult(null);
        try {
            const result = await runInstallerRuntime({
                ...payload,
                comfyModelIds: installerStatus?.comfyModels.map((model) => model.id) || [],
                ollamaModelIds: installerStatus?.ollama.configuredModels.map((model) => model.id) || [],
                force: false,
                continueOnError: false,
            });
            setInstallerRunResult(result);
            if (result.success) {
                setInstallerRunState('success');
                setInstallerRunMessage('Installer workflow completed successfully.');
            } else {
                setInstallerRunState('error');
                setInstallerRunMessage(`Installer completed with ${result.summary.failedSteps} failed step${result.summary.failedSteps === 1 ? '' : 's'}.`);
            }
            await loadInstallerStatus();
        } catch (error) {
            setInstallerRunState('error');
            setInstallerRunMessage(error instanceof Error ? error.message : 'Installer workflow failed.');
        }
    }, [installerStatus, loadInstallerStatus]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        void handleRefreshComfyLibrary();
        void loadInstallerStatus();
    }, [handleRefreshComfyLibrary, isOpen, loadInstallerStatus]);

    const handleInstallComfyRepo = useCallback(async () => {
        const repoUrl = comfyRepoUrl.trim();
        if (!repoUrl) {
            setComfyLibraryCheck({
                state: 'error',
                message: 'Paste a GitHub repository URL before installing.',
            });
            return;
        }

        await runComfyLibraryAction('install-repo', {
            repoUrl,
            repoKind: comfyRepoKind,
        });
        setComfyRepoUrl('');
    }, [comfyRepoKind, comfyRepoUrl, runComfyLibraryAction]);

    const handleUpdateComfyInstall = useCallback(async () => {
        await runComfyLibraryAction('update-install');
    }, [runComfyLibraryAction]);

    const handleUpdateManagedRepo = useCallback(async (repoPath: string) => {
        await runComfyLibraryAction('update-repo', {
            repoPath,
        });
    }, [runComfyLibraryAction]);

    const handleInstallMissingComfyRequirements = useCallback(async () => {
        if (!comfyMissingRequirements) {
            return;
        }

        const summaryParts: string[] = [];
        if (comfyMissingRequirements.updateInstall) {
            summaryParts.push('update the ComfyUI install to restore missing core nodes');
        }
        if (comfyMissingRequirements.models.length > 0) {
            summaryParts.push(`download ${comfyMissingRequirements.models.length} missing model${comfyMissingRequirements.models.length === 1 ? '' : 's'} into the default models folders`);
        }

        const confirmed = await dialog.confirm(
            `Install the detected ComfyUI requirements? This will ${summaryParts.join(' and ')}.`,
            {
                title: 'Install Missing Comfy Requirements',
            }
        );
        if (!confirmed) {
            return;
        }

        await runComfyLibraryAction('install-requirements', {
            updateInstall: comfyMissingRequirements.updateInstall,
            models: comfyMissingRequirements.models,
        });
        await handleVerifyComfyConnection();
    }, [comfyMissingRequirements, dialog, handleVerifyComfyConnection, runComfyLibraryAction]);

    const handleSave = async () => {
        setStatus('saving');

        const effectiveHitemsKey = getEffectiveHitemsKey();

        // 1. Save Local
        localStorage.setItem(STORAGE_KEYS.MESHY_API_KEY, meshyKey);
        localStorage.setItem(STORAGE_KEYS.TRIPO_API_KEY, tripoKey);
        localStorage.setItem(STORAGE_KEYS.HITEMS_API_KEY, effectiveHitemsKey);
        localStorage.setItem(STORAGE_KEYS.HITEMS_APP_ID, hitemsAppId);

        localStorage.setItem(STORAGE_KEYS.STABILITY_API_KEY, stabilityKey);
        localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, openaiKey);
        localStorage.setItem(STORAGE_KEYS.GOOGLE_API_KEY, googleKey);
        localStorage.setItem(STORAGE_KEYS.BANANA_API_KEY, bananaKey);
        localStorage.setItem(STORAGE_KEYS.IMG_GEN_PROVIDER, defaultGenerativeProvider);
        localStorage.setItem(STORAGE_KEYS.COMFY_UI_URL, comfyServerUrl.trim());
        saveLocalAiPreferences({
            ollamaBaseUrl,
            ollamaModel,
        });
        saveComfyCloudApiKey(comfyCloudApiKey);
        saveGenerativePreferences({
            defaultProvider: defaultGenerativeProvider,
            defaultWorkflow: defaultGenerativeWorkflow,
            comfyServerUrl: comfyServerUrl.trim(),
            comfyConnectionMode,
            comfyCloudUrl: comfyCloudUrl.trim(),
            comfyInstallPath: comfyInstallPath.trim(),
            comfyCustomNodesPath: comfyCustomNodesPath.trim(),
            comfyWorkflowLibraryPath: comfyWorkflowLibraryPath.trim(),
            autoStartInpaintMasking,
            showInpaintPromptDock,
        });
        saveAssetStorageSettings({
            mode: assetStorageMode,
            cloudProvider: assetCloudProvider,
            hybridUploadToCloudByDefault,
            includeLegacyServerAssetsInHybrid
        });
        saveUiPreferences({
            expandToolRailLabelsOnHover,
            suppressNumberDragHints,
        });
        saveThemePreferences({
            mode: themeMode,
            accentPreset: themeAccentPreset,
        });

        // 2. Save Server (if logged in)
        if (userId && userId !== 'Guest') {
            try {
                const keysToSave = {
                    meshy: meshyKey,
                    tripo: tripoKey,
                    hitems: effectiveHitemsKey,
                    stability: stabilityKey,
                    openai: openaiKey,
                    google: googleKey,
                    banana: bananaKey
                };

                const res = await fetch('/api/user/keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userId,
                        keys: keysToSave
                    })
                });

                if (res.ok) {
                    setSyncStatus('synced');
                } else {
                    console.error("Failed to save to server, status:", res.status);
                    setSyncStatus('local');
                }
            } catch (e) {
                console.error("Exception saving to server", e);
                setSyncStatus('local');
            }
        }

        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
    };

    const handleCheckOllama = useCallback(async () => {
        setOllamaCheck({
            state: 'checking',
            message: 'Checking Ollama runtime...',
            modelFound: undefined,
        });

        try {
            const params = new URLSearchParams({
                baseUrl: ollamaBaseUrl.trim() || DEFAULT_OLLAMA_BASE_URL,
                model: ollamaModel.trim() || DEFAULT_OLLAMA_MODEL,
            });
            const response = await fetch(`/api/ai/ollama/status?${params.toString()}`);
            const data = await response.json() as {
                success?: boolean;
                message?: string;
                count?: number;
                requestedModel?: string;
                modelFound?: boolean;
                models?: string[];
            };

            if (!response.ok || !data.success) {
                setOllamaCheck({
                    state: 'error',
                    message: data.message || 'Failed to contact Ollama.',
                    modelFound: undefined,
                });
                return;
            }

            const requestedModel = data.requestedModel || (ollamaModel.trim() || DEFAULT_OLLAMA_MODEL);
            const summary = data.modelFound
                ? `Ollama is reachable. Found ${requestedModel}${typeof data.count === 'number' ? ` (${data.count} model${data.count === 1 ? '' : 's'} installed)` : ''}.`
                : `Ollama is reachable, but ${requestedModel} is not installed yet.${Array.isArray(data.models) && data.models.length > 0 ? ` Available: ${data.models.slice(0, 3).join(', ')}${data.models.length > 3 ? '…' : ''}.` : ''}`;

            setOllamaCheck({
                state: data.modelFound ? 'success' : 'error',
                message: summary,
                modelFound: Boolean(data.modelFound),
            });
        } catch (error) {
            setOllamaCheck({
                state: 'error',
                message: error instanceof Error ? error.message : 'Failed to contact Ollama.',
                modelFound: undefined,
            });
        }
    }, [ollamaBaseUrl, ollamaModel]);

    const handleInstallOllamaModel = useCallback(async () => {
        setIsInstallingOllamaModel(true);
        setOllamaCheck({
            state: 'checking',
            message: `Installing ${ollamaModel.trim() || DEFAULT_OLLAMA_MODEL}...`,
            modelFound: false,
        });

        try {
            const result = await requestOllamaModelInstall({
                baseUrl: ollamaBaseUrl,
                model: ollamaModel,
            });
            setOllamaCheck({
                state: 'success',
                message: result.message,
                modelFound: true,
            });
            await handleCheckOllama();
        } catch (error) {
            setOllamaCheck({
                state: 'error',
                message: error instanceof Error ? error.message : 'Failed to install the Ollama model.',
                modelFound: false,
            });
        } finally {
            setIsInstallingOllamaModel(false);
        }
    }, [handleCheckOllama, ollamaBaseUrl, ollamaModel]);

    // Helper to mask key for display if it comes from env (not implemented here per se, but good for UX)
    // Here we just input what is in local storage.

    const handleToggleLog = async () => {
        if (!isLogVisible) {
            setIsLogLoading(true);
            setLogError(null);
            try {
                const res = await fetch('/api/logs/login');
                if (!res.ok) {
                    throw new Error(`Status ${res.status}`);
                }
                const text = await res.text();
                setLogContent(text);
            } catch (error) {
                console.error('Failed to load login log', error);
                setLogError('Failed to load log. Please try again later.');
                setLogContent('');
            } finally {
                setIsLogLoading(false);
            }
        }
        setIsLogVisible(prev => !prev);
    };

    const handleManualUpdateCheck = async () => {
        if (!isDesktopApp) return;
        const api = typeof window !== 'undefined' ? window.desktop : undefined;
        if (!api?.checkForUpdates) return;
        setUpdateStatus('checking');
        setUpdateMessage('Checking for updates…');
        try {
            const result = await api.checkForUpdates();
            if (result?.message) {
                setUpdateMessage(result.message);
            }
            if (result?.status && result.status !== 'restarting') {
                setUpdateStatus(result.status as DesktopUpdateStatus);
            }
        } catch (error) {
            setUpdateStatus('error');
            setUpdateMessage(error instanceof Error ? error.message : 'Unable to check for updates.');
        }
    };

    const handleInstallUpdate = async () => {
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
    };

    const handleConnectDrive = async () => {
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
    };

    const handleDisconnectDrive = async () => {
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
    };

    const executeAdminAction = async (
        targetEmail: string,
        action: 'approve' | 'reject' | 'disable' | 'enable' | 'set-roles' | 'set-rights',
        payload?: { roles?: string[]; rights?: string[] }
    ) => {
        if (!userId || userId === 'Guest') return;
        setAdminBusyUser(targetEmail);
        setAdminError(null);
        try {
            const res = await fetch('/api/user/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requesterEmail: userId,
                    targetEmail,
                    action,
                    ...(payload || {})
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setAdminError(data.message || 'Admin action failed.');
                return;
            }
            await loadAdminUsers();
        } catch (error) {
            console.error('Admin action failed', error);
            setAdminError('Admin action failed.');
        } finally {
            setAdminBusyUser(null);
        }
    };

    const parseDraftList = (value: string) =>
        value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);

    const providerHasConfiguredKey = (provider: GenerativeProviderId): boolean => {
        switch (provider) {
            case 'stability':
                return stabilityKey.trim().length > 0;
            case 'openai':
                return openaiKey.trim().length > 0;
            case 'google':
                return googleKey.trim().length > 0;
            case 'banana':
                return bananaKey.trim().length > 0;
            case 'comfy':
                if (comfyConnectionMode === 'local') {
                    return comfyServerUrl.trim().length > 0;
                }
                if (comfyConnectionMode === 'cloud') {
                    return comfyCloudUrl.trim().length > 0 && comfyCloudApiKey.trim().length > 0;
                }
                return comfyServerUrl.trim().length > 0 || (comfyCloudUrl.trim().length > 0 && comfyCloudApiKey.trim().length > 0);
            default:
                return false;
        }
    };

    useEffect(() => {
        if (isWorkflowSupportedByProvider(defaultGenerativeProvider, defaultGenerativeWorkflow)) return;
        setDefaultGenerativeWorkflow(
            resolveCompatibleWorkflowForProvider(defaultGenerativeProvider, defaultGenerativeWorkflow)
        );
    }, [defaultGenerativeProvider, defaultGenerativeWorkflow]);

    useEffect(() => {
        if (!isImplementedAssetCloudProvider(assetCloudProvider) && assetStorageMode === 'cloud') {
            setAssetStorageMode('hybrid');
        }
    }, [assetCloudProvider, assetStorageMode]);

    const selectedCloudProviderOption = ASSET_CLOUD_PROVIDER_OPTIONS.find((provider) => provider.id === assetCloudProvider)
        || ASSET_CLOUD_PROVIDER_OPTIONS[0];
    const selectedCloudProviderLabel = getAssetCloudProviderLabel(assetCloudProvider);
    const selectedCloudProviderIsImplemented = isImplementedAssetCloudProvider(assetCloudProvider);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-md max-h-[85vh] rounded-xl border border-border shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 flex flex-col">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Key size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">API Configurations</h2>
                        <div className="flex flex-col">
                            <p className="text-xs text-muted-foreground">Manage your keys for external AI services</p>
                            {userId && userId !== 'Guest' && (
                                <span className={`text-[10px] flex items-center gap-1 mt-1 ${syncStatus === 'synced' ? 'text-green-500' : 'text-amber-500'}`}>
                                    <Server size={10} />
                                    {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'synced' ? 'Synced with Account' : 'Local Storage Only'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                    {/* 3D Generation Section */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground/90 uppercase tracking-wider">
                            <Box size={16} className="text-primary" />
                            3D Services
                        </h4>

                        <div className="grid gap-3">
                            {/* Meshy */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <label className="text-xs font-semibold mb-1.5 block">Meshy AI</label>
                                <input
                                    type="password"
                                    value={meshyKey}
                                    onChange={(e) => {
                                        setMeshyKey(e.target.value);
                                        clearProviderValidation('meshy');
                                    }}
                                    placeholder="Enter Meshy API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                />
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void validateProviderKey('meshy')}
                                        className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                                    >
                                        Validate
                                    </button>
                                    {validationStatus.meshy.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                                    {validationStatus.meshy.message ? (
                                        <span className={`text-[10px] ${validationStatus.meshy.state === 'valid' ? 'text-green-500' : 'text-amber-500'}`}>
                                            {validationStatus.meshy.message}
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            {/* Tripo */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <label className="text-xs font-semibold mb-1.5 block">Tripo AI</label>
                                <input
                                    type="password"
                                    value={tripoKey}
                                    onChange={(e) => {
                                        setTripoKey(e.target.value);
                                        clearProviderValidation('tripo');
                                    }}
                                    placeholder="Enter Tripo API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                />
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void validateProviderKey('tripo')}
                                        className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                                    >
                                        Validate
                                    </button>
                                    {validationStatus.tripo.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                                    {validationStatus.tripo.message ? (
                                        <span className={`text-[10px] ${validationStatus.tripo.state === 'valid' ? 'text-green-500' : 'text-amber-500'}`}>
                                            {validationStatus.tripo.message}
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            {/* Hitem3D */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5 items-center">
                                    <label className="text-xs font-semibold">Hitem3D</label>
                                    <div className="flex gap-2 text-[10px] bg-secondary rounded p-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setHitemsMode('ak_sk')}
                                            className={`px-2 py-0.5 rounded transition-colors ${hitemsMode === 'ak_sk' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                        >
                                            AK/SK
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHitemsMode('token')}
                                            className={`px-2 py-0.5 rounded transition-colors ${hitemsMode === 'token' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                        >
                                            Token
                                        </button>
                                    </div>
                                </div>

                                {hitemsMode === 'ak_sk' ? (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={hitemsAk}
                                            onChange={(e) => {
                                                setHitemsAk(e.target.value);
                                                clearProviderValidation('hitems');
                                            }}
                                            placeholder="Access Key (ak_...)"
                                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                        />
                                        <input
                                            type="password"
                                            value={hitemsSk}
                                            onChange={(e) => {
                                                setHitemsSk(e.target.value);
                                                clearProviderValidation('hitems');
                                            }}
                                            placeholder="Secret Key (sk_...)"
                                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                        />
                                    </div>
                                ) : (
                                    <input
                                        type="password"
                                        value={hitemsKey}
                                        onChange={(e) => {
                                            setHitemsKey(e.target.value);
                                            clearProviderValidation('hitems');
                                        }}
                                        placeholder="Access Token (Bearer ...)"
                                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                    />
                                )}

                                <input
                                    type="text"
                                    value={hitemsAppId}
                                    onChange={(e) => {
                                        setHitemsAppId(e.target.value);
                                        clearProviderValidation('hitems');
                                    }}
                                    placeholder="Optional Appid (if required)"
                                    className="mt-2 w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                />
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void validateProviderKey('hitems')}
                                        className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                                        disabled={validationStatus.hitems.state === 'checking'}
                                    >
                                        Validate Setup
                                    </button>
                                    {validationStatus.hitems.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                                    {validationStatus.hitems.message ? (
                                        <span className={`text-[10px] ${validationStatus.hitems.state === 'valid' ? 'text-green-500' : 'text-amber-500'}`}>
                                            {validationStatus.hitems.message}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Image Generation Config */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground/90 uppercase tracking-wider">
                            <Cloud size={16} className="text-primary" />
                            Image & Vision
                        </h4>

                        <div className="grid gap-3">
                            {/* Stability AI */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Stability AI</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">SD3 / Core</span>
                                </div>
                                <input
                                    type="password"
                                    value={stabilityKey}
                                    onChange={(e) => setStabilityKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* OpenAI */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">OpenAI</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">DALL-E 3</span>
                                </div>
                                <input
                                    type="password"
                                    value={openaiKey}
                                    onChange={(e) => setOpenaiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* Google Nano */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Google Gemini / Vertex</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">Nano / Imagen</span>
                                </div>
                                <input
                                    type="password"
                                    value={googleKey}
                                    onChange={(e) => {
                                        setGoogleKey(e.target.value);
                                        clearProviderValidation('google');
                                    }}
                                    placeholder="Enter API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                />
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void validateProviderKey('google')}
                                        className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                                    >
                                        Validate
                                    </button>
                                    {validationStatus.google.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                                    {validationStatus.google.message ? (
                                        <span className={`text-[10px] ${validationStatus.google.state === 'valid' ? 'text-green-500' : 'text-amber-500'}`}>
                                            {validationStatus.google.message}
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            {/* Banana.dev */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Banana.dev</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">GPU Cloud</span>
                                </div>
                                <input
                                    type="password"
                                    value={bananaKey}
                                    onChange={(e) => setBananaKey(e.target.value)}
                                    placeholder="Enter API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Local AI Runtime (Ollama)</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">Local</span>
                                </div>
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={ollamaBaseUrl}
                                        onChange={(event) => {
                                            setOllamaBaseUrl(event.target.value);
                                            setOllamaCheck({ state: 'idle', message: '', modelFound: undefined });
                                        }}
                                        placeholder={DEFAULT_OLLAMA_BASE_URL}
                                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                    />
                                    <input
                                        type="text"
                                        value={ollamaModel}
                                        onChange={(event) => {
                                            setOllamaModel(event.target.value);
                                            setOllamaCheck({ state: 'idle', message: '', modelFound: undefined });
                                        }}
                                        placeholder={DEFAULT_OLLAMA_MODEL}
                                        className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                    />
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleCheckOllama()}
                                        className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                                        disabled={ollamaCheck.state === 'checking' || isInstallingOllamaModel}
                                    >
                                        Check Ollama
                                    </button>
                                    {ollamaCheck.modelFound === false ? (
                                        <button
                                            type="button"
                                            onClick={() => void handleInstallOllamaModel()}
                                            className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                                            disabled={isInstallingOllamaModel || ollamaCheck.state === 'checking'}
                                        >
                                            {isInstallingOllamaModel ? 'Installing...' : `Install ${ollamaModel.trim() || DEFAULT_OLLAMA_MODEL}`}
                                        </button>
                                    ) : null}
                                    {ollamaCheck.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                                    {ollamaCheck.message ? (
                                        <span className={`text-[10px] ${ollamaCheck.state === 'success' ? 'text-green-500' : 'text-amber-500'}`}>
                                            {ollamaCheck.message}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                    Local AI runtime URL, preferred model, and install/status checks for Ollama-based generation and critique.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 border border-border/50 rounded-lg p-3 bg-secondary/10">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h5 className="text-xs font-semibold uppercase tracking-wider text-foreground/90">
                                    Generative Defaults
                                </h5>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    Launch AI tools directly into your preferred flow so you can stay in ideation mode.
                                </p>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                                Ref-style quick fill
                            </span>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Default AI Provider</label>
                            <select
                                value={defaultGenerativeProvider}
                                onChange={(event) => setDefaultGenerativeProvider(event.target.value as GenerativeProviderId)}
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                            >
                                {GENERATIVE_PROVIDER_OPTIONS.map((provider) => (
                                    <option key={provider.id} value={provider.id}>
                                        {provider.label}{provider.status === 'coming-soon' ? ' (Coming soon)' : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-muted-foreground">
                                {GENERATIVE_PROVIDER_OPTIONS.find((provider) => provider.id === defaultGenerativeProvider)?.description}
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Default Generative Workspace</label>
                            <select
                                value={defaultGenerativeWorkflow}
                                onChange={(event) => setDefaultGenerativeWorkflow(event.target.value as GenerativeWorkflowId)}
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                            >
                                {GENERATIVE_WORKFLOW_OPTIONS
                                    .filter((workflow) => isWorkflowSupportedByProvider(defaultGenerativeProvider, workflow.id))
                                    .map((workflow) => (
                                        <option key={workflow.id} value={workflow.id}>
                                            {workflow.label}
                                        </option>
                                    ))}
                            </select>
                            <p className="text-[11px] text-muted-foreground">
                                {GENERATIVE_WORKFLOW_OPTIONS.find((workflow) => workflow.id === defaultGenerativeWorkflow)?.description}
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Comfy Connection Mode</label>
                            <select
                                value={comfyConnectionMode}
                                onChange={(event) => setComfyConnectionMode(event.target.value as ComfyConnectionMode)}
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                            >
                                <option value="auto">Auto (Local, then Cloud)</option>
                                <option value="local">Local only</option>
                                <option value="cloud">Cloud only</option>
                            </select>
                            <p className="text-[11px] text-muted-foreground">
                                Auto first probes local ComfyUI, then falls back to Comfy Cloud if local is unavailable.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Local ComfyUI URL</label>
                            <input
                                type="text"
                                value={comfyServerUrl}
                                onChange={(event) => setComfyServerUrl(event.target.value)}
                                placeholder={DEFAULT_COMFY_LOCAL_URL}
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                The app now proxies local ComfyUI requests through itself, which avoids the host/origin 403s you saw. In Docker on macOS or Windows, <code className="font-mono">localhost</code> will also retry via <code className="font-mono">host.docker.internal</code> server-side.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Comfy Cloud URL</label>
                            <input
                                type="text"
                                value={comfyCloudUrl}
                                onChange={(event) => setComfyCloudUrl(event.target.value)}
                                placeholder="https://cloud.comfy.org"
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Comfy Cloud API Key</label>
                            <input
                                type="password"
                                value={comfyCloudApiKey}
                                onChange={(event) => setComfyCloudApiKey(event.target.value)}
                                placeholder="ck-..."
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Cloud requests use the <code className="font-mono">X-API-Key</code> header and websocket token auth.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">ComfyUI Install Folder</label>
                            <input
                                type="text"
                                value={comfyInstallPath}
                                onChange={(event) => setComfyInstallPath(event.target.value)}
                                placeholder="D:\\ComfyUI"
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Optional, but needed if you want the app to pull updates for your ComfyUI install. If the app runs in Docker, use the path visible inside the container, not a host-only drive letter.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Custom Nodes Folder</label>
                            <input
                                type="text"
                                value={comfyCustomNodesPath}
                                onChange={(event) => setComfyCustomNodesPath(event.target.value)}
                                placeholder="D:\\ComfyUI\\custom_nodes"
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                GitHub node repos can be cloned here, and the manager will scan this folder for installed custom nodes. Relative paths like <code className="font-mono">custom_nodes</code> resolve from the install folder.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Custom Workflow Folder</label>
                            <input
                                type="text"
                                value={comfyWorkflowLibraryPath}
                                onChange={(event) => setComfyWorkflowLibraryPath(event.target.value)}
                                placeholder="D:\\ComfyUI\\user\\default\\workflows"
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Any JSON workflows in this folder become available in the AI modal workflow library. Relative paths like <code className="font-mono">user\default\workflows</code> resolve from the install folder.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <button
                                onClick={() => void handleVerifyComfyConnection()}
                                disabled={comfyConnectionCheck.state === 'checking'}
                                className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {comfyConnectionCheck.state === 'checking' ? (
                                    <Loader2 size={13} className="animate-spin" />
                                ) : (
                                    <Server size={13} />
                                )}
                                Verify Comfy Connection
                            </button>

                            {comfyConnectionCheck.message && (
                                <div
                                    className={`text-[11px] rounded-md border px-2.5 py-2 ${
                                        comfyConnectionCheck.state === 'success'
                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                            : comfyConnectionCheck.state === 'error'
                                                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                                : 'border-border/60 bg-background/70 text-muted-foreground'
                                    }`}
                                >
                                    {comfyConnectionCheck.message}
                                </div>
                            )}

                            {comfyMissingRequirements && (
                                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100 space-y-2">
                                    <div className="font-semibold">Missing Comfy requirements detected</div>
                                    <div>
                                        {comfyMissingRequirements.workflows.slice(0, 3).map((workflow) => (
                                            <div key={workflow.workflowName}>
                                                {workflow.workflowName}: {workflow.missingNodeTypes.length > 0 ? `nodes ${workflow.missingNodeTypes.slice(0, 3).join(', ')}` : ''}{workflow.missingNodeTypes.length > 0 && workflow.missingModels.length > 0 ? ' | ' : ''}{workflow.missingModels.length > 0 ? `models ${workflow.missingModels.slice(0, 3).join(', ')}` : ''}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => void handleInstallMissingComfyRequirements()}
                                            disabled={comfyLibraryCheck.state === 'checking' || (!comfyMissingRequirements.updateInstall && comfyMissingRequirements.models.length === 0)}
                                            className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <DownloadCloud size={13} />
                                            Install Missing Requirements
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/10 p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h5 className="text-xs font-semibold">Installer Runtime Readiness</h5>
                                    <p className="text-[11px] text-muted-foreground">
                                        Validates Super Installer targets (Comfy checkout, bundles, models, and Ollama CLI) against the current machine.
                                    </p>
                                </div>
                                <button
                                    onClick={() => void loadInstallerStatus()}
                                    disabled={installerStatusState === 'loading'}
                                    className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {installerStatusState === 'loading' ? (
                                        <Loader2 size={13} className="animate-spin" />
                                    ) : (
                                        <RefreshCcw size={13} />
                                    )}
                                    Refresh Status
                                </button>
                            </div>

                            {installerStatusState === 'error' && (
                                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
                                    {installerStatusMessage || 'Failed to load installer runtime status.'}
                                </div>
                            )}

                            {installerStatus && (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                            <div className="text-[10px] uppercase text-muted-foreground">Runtime</div>
                                            <div
                                                className={`text-sm font-semibold ${installerStatus.summary.ready ? 'text-emerald-600' : 'text-amber-600'}`}
                                                data-testid="settings-installer-ready"
                                            >
                                                {installerStatus.summary.ready ? 'Ready' : `${installerStatus.summary.missing.length} missing`}
                                            </div>
                                        </div>
                                        <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                            <div className="text-[10px] uppercase text-muted-foreground">Comfy Git</div>
                                            <div className="text-sm font-semibold">
                                                {installerStatus.comfyDirectory.gitRepo ? 'Detected' : 'Missing'}
                                            </div>
                                        </div>
                                        <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                            <div className="text-[10px] uppercase text-muted-foreground">Bundles</div>
                                            <div className="text-sm font-semibold">
                                                {installerStatus.customBundles.filter((bundle) => bundle.exists).length}/{installerStatus.customBundles.length}
                                            </div>
                                        </div>
                                        <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                            <div className="text-[10px] uppercase text-muted-foreground">Comfy Models</div>
                                            <div className="text-sm font-semibold">
                                                {installerStatus.comfyModels.filter((model) => model.exists).length}/{installerStatus.comfyModels.length}
                                            </div>
                                        </div>
                                    </div>

                                    {installerStatus.summary.missing.length > 0 ? (
                                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 space-y-1">
                                            <div className="font-semibold">Missing runtime dependencies</div>
                                            {installerStatus.summary.missing.map((item) => (
                                                <div key={item}>- {item}</div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-700">
                                            All tracked dependencies are installed.
                                        </div>
                                    )}

                                    <p className="text-[11px] text-muted-foreground">
                                        To repair missing dependencies, run <code className="font-mono">npm run install:super -- --yes</code> followed by <code className="font-mono">npm run qa:install -- --auto-fix</code>.
                                    </p>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => void handleRunInstallerWorkflow({
                                                installComfy: true,
                                                installCustomBundles: true,
                                                installComfyModels: false,
                                                installOllamaModels: false,
                                                runQa: false,
                                                autoFix: false,
                                                skipTests: false,
                                                dryRun: true,
                                            })}
                                            disabled={installerRunState === 'running'}
                                            className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {installerRunState === 'running' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
                                            Dry Run Installer
                                        </button>
                                        <button
                                            onClick={() => void handleRunInstallerWorkflow({
                                                installComfy: true,
                                                installCustomBundles: true,
                                                installComfyModels: true,
                                                installOllamaModels: true,
                                                runQa: true,
                                                autoFix: true,
                                                skipTests: false,
                                                dryRun: false,
                                            })}
                                            disabled={installerRunState === 'running'}
                                            className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {installerRunState === 'running' ? <Loader2 size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
                                            Run Installer + QA
                                        </button>
                                        <button
                                            onClick={() => void handleRunInstallerWorkflow({
                                                installComfy: false,
                                                installCustomBundles: false,
                                                installComfyModels: false,
                                                installOllamaModels: false,
                                                runQa: true,
                                                autoFix: true,
                                                skipTests: false,
                                                dryRun: false,
                                            })}
                                            disabled={installerRunState === 'running'}
                                            className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {installerRunState === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Server size={13} />}
                                            Run QA Auto-fix
                                        </button>
                                    </div>

                                    {installerRunMessage && (
                                        <div
                                            className={`text-[11px] rounded-md border px-2.5 py-2 ${
                                                installerRunState === 'success'
                                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                                    : installerRunState === 'error'
                                                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                                        : 'border-border/60 bg-background/70 text-muted-foreground'
                                            }`}
                                            data-testid="settings-installer-run-message"
                                        >
                                            {installerRunMessage}
                                        </div>
                                    )}

                                    {installerRunResult && (
                                        <div className="rounded-md border border-border/60 bg-background/70 p-2 space-y-1">
                                            <p className="text-[11px] text-muted-foreground">
                                                Completed {installerRunResult.summary.completedSteps} step(s), failed {installerRunResult.summary.failedSteps}.
                                            </p>
                                            <div className="max-h-40 overflow-y-auto space-y-1">
                                                {installerRunResult.steps.map((stepResult) => (
                                                    <div key={stepResult.id} className="rounded border border-border/50 bg-background px-2 py-1 text-[10px]">
                                                        <div className="font-semibold">
                                                            {stepResult.label} ({stepResult.success ? 'ok' : `failed: ${stepResult.exitCode}`})
                                                        </div>
                                                        {stepResult.stderr ? (
                                                            <div className="mt-0.5 text-destructive/90 whitespace-pre-wrap">{stepResult.stderr.slice(0, 500)}</div>
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/10 p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h5 className="text-xs font-semibold">Comfy Workflow Manager</h5>
                                    <p className="text-[11px] text-muted-foreground">
                                        Browse server templates, scan your custom workflow folder, and install GitHub repos into custom nodes or workflow storage.
                                    </p>
                                </div>
                                <button
                                    onClick={() => void handleRefreshComfyLibrary()}
                                    disabled={comfyLibraryCheck.state === 'checking'}
                                    className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {comfyLibraryCheck.state === 'checking' ? (
                                        <Loader2 size={13} className="animate-spin" />
                                    ) : (
                                        <RefreshCcw size={13} />
                                    )}
                                    Refresh Library
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                    <div className="text-[10px] uppercase text-muted-foreground">Server Templates</div>
                                    <div className="text-sm font-semibold">{comfyLibrarySnapshot?.serverTemplates.length || 0}</div>
                                </div>
                                <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                    <div className="text-[10px] uppercase text-muted-foreground">Custom Folder</div>
                                    <div className="text-sm font-semibold">{comfyLibrarySnapshot?.customFolderWorkflows.length || 0}</div>
                                </div>
                                <div className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                    <div className="text-[10px] uppercase text-muted-foreground">Managed Repos</div>
                                    <div className="text-sm font-semibold">{comfyLibrarySnapshot?.nodeRepos.length || 0}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                                <input
                                    type="text"
                                    value={comfyRepoUrl}
                                    onChange={(event) => setComfyRepoUrl(event.target.value)}
                                    placeholder="https://github.com/owner/repo"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono"
                                />
                                <select
                                    value={comfyRepoKind}
                                    onChange={(event) => setComfyRepoKind(event.target.value as ComfyLibraryRepoKind)}
                                    className="h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
                                >
                                    <option value="custom-nodes">Custom Nodes</option>
                                    <option value="workflow-library">Workflow Folder</option>
                                </select>
                                <button
                                    onClick={() => void handleInstallComfyRepo()}
                                    disabled={comfyLibraryCheck.state === 'checking'}
                                    className="h-9 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <DownloadCloud size={13} />
                                    Install Repo
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => void handleUpdateComfyInstall()}
                                    disabled={comfyLibraryCheck.state === 'checking' || !comfyInstallPath.trim()}
                                    className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <RefreshCcw size={13} />
                                    Update ComfyUI
                                </button>
                            </div>

                            {comfyLibraryCheck.message && (
                                <div
                                    className={`text-[11px] rounded-md border px-2.5 py-2 ${
                                        comfyLibraryCheck.state === 'success'
                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                            : comfyLibraryCheck.state === 'error'
                                                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                                : 'border-border/60 bg-background/70 text-muted-foreground'
                                    }`}
                                >
                                    {comfyLibraryCheck.message}
                                </div>
                            )}

                            {comfyLibrarySnapshot?.warnings?.length ? (
                                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700">
                                    {comfyLibrarySnapshot.warnings[0]}
                                </div>
                            ) : null}

                            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                                {(comfyLibrarySnapshot?.nodeRepos || []).map((repo) => (
                                    <div key={`${repo.repoKind}:${repo.path}`} className="rounded-md border border-border/50 bg-background/70 px-2 py-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="truncate text-xs font-semibold">{repo.name}</div>
                                                <div className="truncate text-[10px] text-muted-foreground">{repo.path}</div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    {repo.repoKind === 'custom-nodes' ? 'Custom Nodes' : 'Workflow Folder'} | {repo.gitManaged ? 'git repo' : 'plain folder'} | workflow hints: {repo.workflowHintCount}
                                                </div>
                                            </div>
                                            {repo.gitManaged && (
                                                <button
                                                    onClick={() => void handleUpdateManagedRepo(repo.path)}
                                                    disabled={comfyLibraryCheck.state === 'checking'}
                                                    className="h-7 px-2 text-[10px] font-semibold rounded border border-border hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Update
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {!comfyLibrarySnapshot?.nodeRepos?.length && (
                                    <div className="rounded-md border border-dashed border-border/60 px-2 py-3 text-[11px] text-muted-foreground">
                                        No managed custom-node or workflow repos were discovered yet.
                                    </div>
                                )}
                            </div>

                            <p className="text-[11px] text-muted-foreground">
                                New custom nodes usually need a ComfyUI restart before the connected server can expose them in its template/catalog APIs.
                            </p>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={autoStartInpaintMasking}
                                onChange={(event) => setAutoStartInpaintMasking(event.target.checked)}
                                className="rounded border-border text-primary focus:ring-primary/20"
                            />
                            Auto-start mask brush when opening Generative Fill
                        </label>

                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={showInpaintPromptDock}
                                onChange={(event) => setShowInpaintPromptDock(event.target.checked)}
                                className="rounded border-border text-primary focus:ring-primary/20"
                            />
                            Show quick prompt dock for Generative Fill
                        </label>

                        <div className="text-[11px] rounded-md border border-border/60 bg-background/70 px-2.5 py-2 text-muted-foreground">
                            Selected provider status: {isGenerativeProviderReady(defaultGenerativeProvider) ? 'runtime ready' : 'coming soon'}
                            {providerHasConfiguredKey(defaultGenerativeProvider) ? ' + configured' : ' + missing key/config (fallback applies)'}
                        </div>
                    </div>

                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-start gap-3">
                        <AlertCircle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                            Keys are stored locally in your browser. We never transmit them to our servers, only directly to the AI providers.
                        </p>
                    </div>

                    {isDesktopApp && (
                        <div className="border-t border-border/40 pt-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                        <ShieldCheck size={16} className="text-primary" />
                                        Desktop Updates
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
                        </div>
                    )}

                    <div className="border-t border-border/40 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                    <HardDrive size={16} className="text-primary" />
                                    Cloud Connections
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
                                        {isDriveBusy ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                Disconnecting...
                                            </>
                                        ) : (
                                            'Disconnect'
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleConnectDrive}
                                        className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5"
                                        disabled={isDriveBusy || !selectedCloudProviderIsImplemented}
                                    >
                                        {isDriveBusy ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                Connecting...
                                            </>
                                        ) : (
                                            'Connect'
                                        )}
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
                    </div>

                    <div className="border-t border-border/40 pt-4 space-y-3">
                        <div>
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                                <HardDrive size={16} className="text-primary" />
                                Asset Storage Strategy
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

                        <button
                            onClick={() => requestOpenSetupWizard()}
                            className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5"
                        >
                            <Key size={13} />
                            Launch Setup Wizard
                        </button>
                    </div>

                    <div className="border-t border-border/40 pt-4">
                        <div className="mb-6 border-b border-border/40 pb-6 space-y-3">
                            <div>
                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                    <Server size={16} className="text-primary" />
                                    Interface Behavior
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                    Control the global appearance mode, accent palette, and editor rail behavior.
                                </p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="settings-theme-mode" className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                        Theme mode
                                    </label>
                                    <select
                                        id="settings-theme-mode"
                                        aria-label="Theme mode"
                                        value={themeMode}
                                        onChange={(event) => setThemeMode(event.target.value as ThemePreferenceMode)}
                                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                    >
                                        {THEME_MODE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-muted-foreground">
                                        {THEME_MODE_OPTIONS.find((option) => option.value === themeMode)?.description}
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                        Accent palette
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {THEME_ACCENT_OPTIONS.map((option) => {
                                            const isActive = themeAccentPreset === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    aria-label={`Accent palette ${option.label}`}
                                                    aria-pressed={isActive}
                                                    onClick={() => setThemeAccentPreset(option.value)}
                                                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${isActive ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-secondary'}`}
                                                >
                                                    <div className="mb-2 h-3 rounded-full" style={{ backgroundImage: option.swatch }} />
                                                    <div className="text-xs font-semibold text-foreground">{option.label}</div>
                                                    <div className="text-[11px] text-muted-foreground">{option.description}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        Theme changes apply globally after saving and persist across sessions.
                                    </p>
                                </div>
                            </div>

                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={expandToolRailLabelsOnHover}
                                    onChange={(event) => setExpandToolRailLabelsOnHover(event.target.checked)}
                                    className="rounded border-border text-primary focus:ring-primary/20"
                                />
                                Expand side tool rails on hover
                            </label>

                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={suppressNumberDragHints}
                                    onChange={(event) => setSuppressNumberDragHints(event.target.checked)}
                                    className="rounded border-border text-primary focus:ring-primary/20"
                                />
                                Don’t remind me about number-drag tips
                            </label>

                            <button
                                onClick={() => {
                                    resetNumberDragHintSeen();
                                    setSuppressNumberDragHints(false);
                                    saveUiPreferences({ suppressNumberDragHints: false });
                                    setStatus('saved');
                                    window.setTimeout(() => setStatus('idle'), 1500);
                                }}
                                className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5"
                            >
                                <RefreshCcw size={13} />
                                Reset Number-Drag Hint
                            </button>
                        </div>

                        {isAdmin && userId && userId !== 'Guest' && (
                            <div className="mb-6 border-b border-border/40 pb-6 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-semibold flex items-center gap-2">
                                            <ShieldCheck size={16} className="text-primary" />
                                            User Management
                                        </h4>
                                        <p className="text-[11px] text-muted-foreground">
                                            Admin roles, approval queue, and per-user rights.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => void loadAdminUsers()}
                                        className="px-3 py-1.5 text-[11px] font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1"
                                        disabled={isAdminUsersLoading}
                                    >
                                        <RefreshCcw size={14} className={isAdminUsersLoading ? 'animate-spin' : ''} />
                                        Refresh
                                    </button>
                                </div>

                                {adminError && (
                                    <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                                        {adminError}
                                    </div>
                                )}

                                {isAdminUsersLoading ? (
                                    <div className="text-xs text-muted-foreground">Loading users...</div>
                                ) : (
                                    <div className="space-y-2">
                                        {adminUsers.map((user) => {
                                            const busy = adminBusyUser === user.email;
                                            const rolesText = adminDraftRoles[user.email] ?? (user.roles || []).join(', ');
                                            const rightsText = adminDraftRights[user.email] ?? (user.rights || []).join(', ');
                                            const isPending = user.status === 'pending';
                                            const isDisabled = user.status === 'disabled';

                                            return (
                                                <div key={user.email} className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-semibold text-foreground truncate">{user.displayName}</p>
                                                            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                                                        </div>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded ${user.status === 'approved'
                                                                ? 'bg-emerald-500/15 text-emerald-600'
                                                                : user.status === 'pending'
                                                                    ? 'bg-amber-500/15 text-amber-600'
                                                                    : 'bg-red-500/15 text-red-600'
                                                            }`}>
                                                            {user.status}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            onClick={() => void executeAdminAction(user.email, isPending ? 'approve' : 'enable')}
                                                            disabled={busy}
                                                            className="h-8 text-[11px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                        >
                                                            {isPending ? 'Approve' : 'Enable'}
                                                        </button>
                                                        <button
                                                            onClick={() => void executeAdminAction(user.email, isPending ? 'reject' : 'disable')}
                                                            disabled={busy}
                                                            className="h-8 text-[11px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                        >
                                                            {isPending ? 'Reject' : (isDisabled ? 'Disabled' : 'Disable')}
                                                        </button>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-[10px] uppercase text-muted-foreground">Roles</label>
                                                        <input
                                                            value={rolesText}
                                                            onChange={(e) => setAdminDraftRoles((prev) => ({ ...prev, [user.email]: e.target.value }))}
                                                            className="w-full h-8 px-2 rounded-md bg-background border border-border text-[11px]"
                                                            placeholder="admin, creator"
                                                        />
                                                        <button
                                                            onClick={() => void executeAdminAction(user.email, 'set-roles', { roles: parseDraftList(rolesText) })}
                                                            disabled={busy}
                                                            className="h-7 px-2 text-[10px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                        >
                                                            Save Roles
                                                        </button>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-[10px] uppercase text-muted-foreground">Rights</label>
                                                        <input
                                                            value={rightsText}
                                                            onChange={(e) => setAdminDraftRights((prev) => ({ ...prev, [user.email]: e.target.value }))}
                                                            className="w-full h-8 px-2 rounded-md bg-background border border-border text-[11px]"
                                                            placeholder="users:manage, assets:own"
                                                        />
                                                        <button
                                                            onClick={() => void executeAdminAction(user.email, 'set-rights', { rights: parseDraftList(rightsText) })}
                                                            disabled={busy}
                                                            className="h-7 px-2 text-[10px] font-semibold rounded border border-border hover:bg-secondary transition-colors"
                                                        >
                                                            Save Rights
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleToggleLog}
                            className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                            {isLogVisible ? 'Hide Login Activity Log' : 'View Login Activity Log'}
                        </button>

                        {isLogVisible && (
                            <div className="mt-3 bg-secondary/20 border border-border/60 rounded-lg p-3 max-h-48 overflow-y-auto">
                                {isLogLoading ? (
                                    <p className="text-xs text-muted-foreground">Loading log...</p>
                                ) : logError ? (
                                    <p className="text-xs text-destructive">{logError}</p>
                                ) : (
                                    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{logContent}</pre>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 flex items-center gap-2 transition-all"
                    >
                        {status === 'saved' ? 'Saved!' : 'Save Configurations'}
                        {status !== 'saved' && <Save size={16} />}
                    </button>
                </div>

                <HelpPopup
                    isOpen={!!helpType}
                    onClose={() => setHelpType(null)}
                    type={helpType || 'comfy'}
                />
            </div>
        </div>
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
