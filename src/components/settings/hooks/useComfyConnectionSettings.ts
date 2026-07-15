'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    COMFY_CONNECTION_MODE_OPTIONS,
    DEFAULT_COMFY_LOCAL_URL,
    getComfyConnectionModeDescription,
    hydrateComfyCloudSettingsFromRuntime,
    isComfyConnectionConfigured,
    loadComfyCloudApiKey,
    saveComfyCloudApiKey,
    verifyAvailableComfyConnection,
    type ComfyConnectionMode,
} from '@/lib/comfyui/connection';
import type { ComfyDiagnosticsSnapshot } from '@/lib/comfyui/libraryTypes';
import { inspectComfyServerCatalog } from '@/lib/comfyui/runner';
import type { ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';
import {
    GENERATIVE_PROVIDER_OPTIONS,
    GENERATIVE_WORKFLOW_OPTIONS,
    isGenerativeProviderReady,
    isWorkflowSupportedByProvider,
    loadGenerativePreferences,
    resolveCompatibleWorkflowForProvider,
    saveGenerativePreferences,
    type GenerativeProviderId,
    type GenerativeWorkflowId,
} from '@/lib/generative-preferences';
import type { ComfyCatalogSnapshot } from '../settingsTypes';

/**
 * Generative provider/workflow defaults plus the Comfy connection
 * configuration (local/tunnel/cloud), verification checks, and app-specific
 * diagnostics. Also tracks which Comfy requirements (nodes/models) are
 * missing so the library manager can offer a one-click install.
 */
export function useComfyConnectionSettings(isOpen: boolean, apiKeys: { stabilityKey: string; openaiKey: string; googleKey: string; bananaKey: string }) {
    const [defaultGenerativeProvider, setDefaultGenerativeProvider] = useState<GenerativeProviderId>('comfy');
    const [defaultGenerativeWorkflow, setDefaultGenerativeWorkflow] = useState<GenerativeWorkflowId>('zone');
    const [comfyServerUrl, setComfyServerUrl] = useState(DEFAULT_COMFY_LOCAL_URL);
    const [comfyTunnelUrl, setComfyTunnelUrl] = useState('');
    const [comfyConnectionMode, setComfyConnectionMode] = useState<ComfyConnectionMode>('auto');
    const [comfyCloudUrl, setComfyCloudUrl] = useState('https://cloud.comfy.org');
    const [comfyCloudApiKey, setComfyCloudApiKey] = useState('');
    const [comfyInstallPath, setComfyInstallPath] = useState('');
    const [comfyCustomNodesPath, setComfyCustomNodesPath] = useState('');
    const [comfyWorkflowLibraryPath, setComfyWorkflowLibraryPath] = useState('');
    const [autoStartInpaintMasking, setAutoStartInpaintMasking] = useState(false);
    const [showInpaintPromptDock, setShowInpaintPromptDock] = useState(true);

    const [comfyConnectionCheck, setComfyConnectionCheck] = useState<{ state: 'idle' | 'checking' | 'success' | 'error'; message: string }>({ state: 'idle', message: '' });
    const [comfySetupCheck, setComfySetupCheck] = useState<{ state: 'idle' | 'checking' | 'success' | 'error'; message: string }>({ state: 'idle', message: '' });
    const [comfyDiagnostics, setComfyDiagnostics] = useState<ComfyDiagnosticsSnapshot | null>(null);
    const [comfyMissingRequirements, setComfyMissingRequirements] = useState<{
        updateInstall: boolean;
        models: ComfyWorkflowInstallableModel[];
        workflows: Array<{ workflowName: string; missingNodeTypes: string[]; missingModels: string[] }>;
    } | null>(null);

    useEffect(() => {
        if (!isOpen || typeof window === 'undefined') return;
        const generativePreferences = loadGenerativePreferences();
        // Loading persisted preferences into local state when the modal opens
        // (an external-storage sync, not derived-state churn).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDefaultGenerativeProvider(generativePreferences.defaultProvider);
        setDefaultGenerativeWorkflow(generativePreferences.defaultWorkflow);
        setComfyServerUrl(generativePreferences.comfyServerUrl);
        setComfyTunnelUrl(generativePreferences.comfyTunnelUrl);
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
                && (!generativePreferences.comfyCloudUrl.trim() || generativePreferences.comfyCloudUrl.trim() === 'https://cloud.comfy.org')
            ) {
                setComfyCloudUrl(runtimeConfig.cloudUrl);
            }
        });
        setAutoStartInpaintMasking(generativePreferences.autoStartInpaintMasking);
        setShowInpaintPromptDock(generativePreferences.showInpaintPromptDock);
    }, [isOpen]);

    useEffect(() => {
        if (isWorkflowSupportedByProvider(defaultGenerativeProvider, defaultGenerativeWorkflow)) return;
        // Clamping the workflow back to one the newly-selected provider
        // actually supports — a derived-value correction, not free churn.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDefaultGenerativeWorkflow(resolveCompatibleWorkflowForProvider(defaultGenerativeProvider, defaultGenerativeWorkflow));
    }, [defaultGenerativeProvider, defaultGenerativeWorkflow]);

    useEffect(() => {
        // Clear stale check results whenever the connection target changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setComfyConnectionCheck((current) => (current.state === 'idle' && !current.message ? current : { state: 'idle', message: '' }));
        setComfyMissingRequirements(null);
    }, [comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyServerUrl, comfyTunnelUrl]);

    const applyComfyCatalogRequirements = useCallback((catalog: ComfyCatalogSnapshot) => {
        const workflows = catalog.records
            .filter((record) => record.missingNodeTypes.length > 0 || record.missingModels.length > 0)
            .map((record) => ({
                workflowName: record.workflowName,
                missingNodeTypes: record.missingNodeTypes,
                missingModels: record.missingModels.map((model) => model.name),
            }));

        if (workflows.length === 0) {
            setComfyMissingRequirements(null);
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

        setComfyMissingRequirements({ updateInstall, models: Array.from(modelMap.values()), workflows });
    }, []);

    const handleVerifyComfyConnection = useCallback(async () => {
        setComfyConnectionCheck({ state: 'checking', message: 'Checking Comfy connection...' });
        setComfyMissingRequirements(null);

        try {
            const result = await verifyAvailableComfyConnection({
                mode: comfyConnectionMode,
                localUrl: comfyServerUrl,
                tunnelUrl: comfyTunnelUrl,
                cloudUrl: comfyCloudUrl,
                cloudApiKey: comfyCloudApiKey,
            });

            setComfyConnectionCheck({ state: result.ok ? 'success' : 'error', message: result.message });
            if (!result.ok) return;

            const catalog = await inspectComfyServerCatalog({
                connection: { mode: comfyConnectionMode, localUrl: comfyServerUrl, tunnelUrl: comfyTunnelUrl, cloudUrl: comfyCloudUrl, cloudApiKey: comfyCloudApiKey },
            });
            applyComfyCatalogRequirements(catalog);
        } catch (error) {
            setComfyConnectionCheck({ state: 'error', message: error instanceof Error ? error.message : 'Failed to verify Comfy connection.' });
        }
    }, [applyComfyCatalogRequirements, comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyServerUrl, comfyTunnelUrl]);

    const loadComfyDiagnostics = useCallback(async (
        connectionModeOverride: ComfyConnectionMode = comfyConnectionMode,
    ): Promise<ComfyDiagnosticsSnapshot> => {
        const response = await fetch('/api/ai/comfy/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'inspect-config',
                connectionMode: connectionModeOverride,
                comfyServerUrl,
                comfyTunnelUrl,
                comfyCloudUrl,
                comfyCloudApiKey,
                installPath: comfyInstallPath,
                customNodesPath: comfyCustomNodesPath,
                workflowLibraryPath: comfyWorkflowLibraryPath,
            }),
        });

        const data = await response.json() as { success?: boolean; message?: string; diagnostics?: ComfyDiagnosticsSnapshot };
        if (!response.ok || !data.success || !data.diagnostics) {
            throw new Error(data.message || 'Failed to inspect Comfy configuration.');
        }
        return data.diagnostics;
    }, [comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyCustomNodesPath, comfyInstallPath, comfyServerUrl, comfyTunnelUrl, comfyWorkflowLibraryPath]);

    const handleVerifyLocalComfySetup = useCallback(async (
        fetchInstallerRuntimeStatus: (installPath: string) => Promise<unknown>,
        onInstallerStatus: (status: Awaited<ReturnType<typeof fetchInstallerRuntimeStatus>>) => void,
    ) => {
        setComfySetupCheck({ state: 'checking', message: 'Checking local ComfyUI runtime and configured folders...' });
        setComfyDiagnostics(null);
        setComfyMissingRequirements(null);

        try {
            const localVerification = await verifyAvailableComfyConnection({ mode: 'local', localUrl: comfyServerUrl, tunnelUrl: comfyTunnelUrl });
            setComfyConnectionCheck({ state: localVerification.ok ? 'success' : 'error', message: localVerification.message });

            if (!localVerification.ok) {
                setComfySetupCheck({ state: 'error', message: localVerification.message });
                return;
            }

            const [nextInstallerStatus, diagnostics, catalog] = await Promise.all([
                fetchInstallerRuntimeStatus(comfyInstallPath.trim()),
                loadComfyDiagnostics('local'),
                inspectComfyServerCatalog({
                    connection: { mode: 'local', localUrl: comfyServerUrl, tunnelUrl: comfyTunnelUrl, cloudUrl: comfyCloudUrl, cloudApiKey: comfyCloudApiKey },
                }),
            ]);

            onInstallerStatus(nextInstallerStatus);
            setComfyDiagnostics(diagnostics);
            applyComfyCatalogRequirements(catalog);

            const issueKeys = new Set<string>();
            diagnostics.paths.statuses.forEach((status) => {
                if (!status.exists || !status.readable) issueKeys.add(`${status.label}:${status.path}`);
            });
            const installerStatusTyped = nextInstallerStatus as { paths: { statuses: Array<{ exists: boolean; label: string; path: string }> } };
            installerStatusTyped.paths.statuses.forEach((status) => {
                if (!status.exists) issueKeys.add(`${status.label}:${status.path}`);
            });

            const issueCount = issueKeys.size;
            setComfySetupCheck({
                state: issueCount === 0 ? 'success' : 'error',
                message: issueCount === 0
                    ? `Local ComfyUI is reachable at ${diagnostics.connection.serverUrl} and the configured folders match the app expectations.`
                    : `Local ComfyUI is reachable at ${diagnostics.connection.serverUrl}, but ${issueCount} path check${issueCount === 1 ? '' : 's'} need attention. Review the verification panels below.`,
            });
        } catch (error) {
            setComfySetupCheck({ state: 'error', message: error instanceof Error ? error.message : 'Failed to verify the local ComfyUI setup.' });
        }
    }, [applyComfyCatalogRequirements, comfyCloudApiKey, comfyCloudUrl, comfyInstallPath, comfyServerUrl, comfyTunnelUrl, loadComfyDiagnostics]);

    const providerHasConfiguredKey = useCallback((provider: GenerativeProviderId): boolean => {
        switch (provider) {
            case 'stability': return apiKeys.stabilityKey.trim().length > 0;
            case 'openai': return apiKeys.openaiKey.trim().length > 0;
            case 'google': return apiKeys.googleKey.trim().length > 0;
            case 'banana': return apiKeys.bananaKey.trim().length > 0;
            case 'comfy':
                return isComfyConnectionConfigured(comfyConnectionMode, {
                    localUrl: comfyServerUrl,
                    tunnelUrl: comfyTunnelUrl,
                    cloudUrl: comfyCloudUrl,
                    cloudApiKey: comfyCloudApiKey,
                });
            default:
                return false;
        }
    }, [apiKeys.bananaKey, apiKeys.googleKey, apiKeys.openaiKey, apiKeys.stabilityKey, comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyServerUrl, comfyTunnelUrl]);

    const buildSavePayload = useCallback(() => ({
        defaultProvider: defaultGenerativeProvider,
        defaultWorkflow: defaultGenerativeWorkflow,
        comfyServerUrl: comfyServerUrl.trim(),
        comfyTunnelUrl: comfyTunnelUrl.trim(),
        comfyConnectionMode,
        comfyCloudUrl: comfyCloudUrl.trim(),
        comfyInstallPath: comfyInstallPath.trim(),
        comfyCustomNodesPath: comfyCustomNodesPath.trim(),
        comfyWorkflowLibraryPath: comfyWorkflowLibraryPath.trim(),
        autoStartInpaintMasking,
        showInpaintPromptDock,
    }), [autoStartInpaintMasking, comfyCloudUrl, comfyConnectionMode, comfyCustomNodesPath, comfyInstallPath, comfyServerUrl, comfyTunnelUrl, comfyWorkflowLibraryPath, defaultGenerativeProvider, defaultGenerativeWorkflow, showInpaintPromptDock]);

    const saveComfySettings = useCallback(() => {
        saveComfyCloudApiKey(comfyCloudApiKey);
        saveGenerativePreferences(buildSavePayload());
    }, [buildSavePayload, comfyCloudApiKey]);

    return {
        defaultGenerativeProvider, setDefaultGenerativeProvider,
        defaultGenerativeWorkflow, setDefaultGenerativeWorkflow,
        comfyServerUrl, setComfyServerUrl,
        comfyTunnelUrl, setComfyTunnelUrl,
        comfyConnectionMode, setComfyConnectionMode,
        comfyCloudUrl, setComfyCloudUrl,
        comfyCloudApiKey, setComfyCloudApiKey,
        comfyInstallPath, setComfyInstallPath,
        comfyCustomNodesPath, setComfyCustomNodesPath,
        comfyWorkflowLibraryPath, setComfyWorkflowLibraryPath,
        autoStartInpaintMasking, setAutoStartInpaintMasking,
        showInpaintPromptDock, setShowInpaintPromptDock,
        comfyConnectionCheck, setComfyConnectionCheck,
        comfySetupCheck, setComfySetupCheck,
        comfyDiagnostics,
        comfyMissingRequirements,
        handleVerifyComfyConnection,
        handleVerifyLocalComfySetup,
        loadComfyDiagnostics,
        applyComfyCatalogRequirements,
        providerHasConfiguredKey,
        saveComfySettings,
        GENERATIVE_PROVIDER_OPTIONS,
        GENERATIVE_WORKFLOW_OPTIONS,
        COMFY_CONNECTION_MODE_OPTIONS,
        DEFAULT_COMFY_LOCAL_URL,
        getComfyConnectionModeDescription,
        isGenerativeProviderReady,
        isWorkflowSupportedByProvider,
    };
}

export type ComfyConnectionSettings = ReturnType<typeof useComfyConnectionSettings>;
