'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    fetchInstallerRuntimeStatus,
    type InstallerRuntimeStatus,
} from '@/lib/installerRuntimeStatus';
import { runInstallerRuntime, type InstallerRunResult } from '@/lib/installerRuntimeRun';
import {
    fetchDependencyRuntimeStatus,
    type DependencyRuntimeStatus,
} from '@/lib/dependencyRuntimeStatus';
import { runDependencyRuntime, type DependencyRunResult } from '@/lib/dependencyRuntimeRun';

/**
 * Local ComfyUI installer runtime status/actions (comfy dir, custom bundles,
 * models, Ollama) plus this workspace's own npm dependency maintenance
 * status/actions. Both are "one-click verify or fix my local runtime"
 * tools, so they're grouped together.
 */
export function useInstallerSettings(isOpen: boolean, activeSettingsTab: string, comfyInstallPath: string) {
    const [installerStatus, setInstallerStatus] = useState<InstallerRuntimeStatus | null>(null);
    const [installerStatusState, setInstallerStatusState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [installerStatusMessage, setInstallerStatusMessage] = useState('');
    const [installerRunState, setInstallerRunState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [installerRunMessage, setInstallerRunMessage] = useState('');
    const [installerRunResult, setInstallerRunResult] = useState<InstallerRunResult | null>(null);

    const [dependencyStatus, setDependencyStatus] = useState<DependencyRuntimeStatus | null>(null);
    const [dependencyStatusState, setDependencyStatusState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [dependencyStatusMessage, setDependencyStatusMessage] = useState('');
    const [dependencyRunState, setDependencyRunState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [dependencyRunMessage, setDependencyRunMessage] = useState('');
    const [dependencyRunResult, setDependencyRunResult] = useState<DependencyRunResult | null>(null);

    const autoDetectedComfyPathsRef = useRef({ installPath: '', customNodesPath: '', workflowLibraryPath: '' });

    /** Record a freshly-fetched installer status as a success, clearing any earlier error. */
    const applyInstallerStatus = useCallback((status: InstallerRuntimeStatus) => {
        setInstallerStatus(status);
        setInstallerStatusState('success');
        setInstallerStatusMessage('');
    }, []);

    const loadInstallerStatus = useCallback(async () => {
        setInstallerStatusState('loading');
        setInstallerStatusMessage('');
        try {
            const status = await fetchInstallerRuntimeStatus(comfyInstallPath.trim());
            applyInstallerStatus(status);
        } catch (error) {
            setInstallerStatusState('error');
            setInstallerStatusMessage(error instanceof Error ? error.message : 'Failed to load installer runtime status.');
        }
    }, [applyInstallerStatus, comfyInstallPath]);

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
                comfyDir: comfyInstallPath.trim() || undefined,
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
    }, [comfyInstallPath, installerStatus, loadInstallerStatus]);

    const loadDependencyStatus = useCallback(async () => {
        setDependencyStatusState('loading');
        setDependencyStatusMessage('');
        try {
            const status = await fetchDependencyRuntimeStatus();
            setDependencyStatus(status);
            setDependencyStatusState('success');
        } catch (error) {
            setDependencyStatusState('error');
            setDependencyStatusMessage(error instanceof Error ? error.message : 'Failed to load dependency maintenance status.');
        }
    }, []);

    const handleRunDependencyMaintenance = useCallback(async () => {
        setDependencyRunState('running');
        setDependencyRunMessage('');
        setDependencyRunResult(null);
        try {
            const result = await runDependencyRuntime({ strategy: 'latest', runBuild: true });
            setDependencyRunResult(result);
            setDependencyRunState(result.success ? 'success' : 'error');
            setDependencyRunMessage(
                result.success
                    ? `Dependency update completed. Updated ${result.summary.updatedCount} package${result.summary.updatedCount === 1 ? '' : 's'} and ran a build.`
                    : `Dependency maintenance completed with ${result.summary.failedSteps} failed step${result.summary.failedSteps === 1 ? '' : 's'}.`
            );
            await loadDependencyStatus();
        } catch (error) {
            setDependencyRunState('error');
            setDependencyRunMessage(error instanceof Error ? error.message : 'Dependency maintenance failed.');
        }
    }, [loadDependencyStatus]);

    useEffect(() => {
        if (!isOpen) return;
        // Also re-runs whenever comfyInstallPath changes (loadInstallerStatus's
        // identity depends on it), matching the original combined effect —
        // this is a deliberate re-fetch-on-config-change, not accidental churn.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadInstallerStatus();
    }, [isOpen, loadInstallerStatus]);

    useEffect(() => {
        if (
            process.env.NODE_ENV === 'production'
            || !isOpen
            || activeSettingsTab !== 'workspace'
        ) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadDependencyStatus();
    }, [activeSettingsTab, isOpen, loadDependencyStatus]);

    return {
        installerStatus, setInstallerStatus,
        installerStatusState,
        installerStatusMessage,
        installerRunState,
        installerRunMessage,
        installerRunResult,
        loadInstallerStatus,
        applyInstallerStatus,
        handleRunInstallerWorkflow,
        dependencyStatus,
        dependencyStatusState,
        dependencyStatusMessage,
        dependencyRunState,
        dependencyRunMessage,
        dependencyRunResult,
        loadDependencyStatus,
        handleRunDependencyMaintenance,
        autoDetectedComfyPathsRef,
    };
}

export type InstallerSettings = ReturnType<typeof useInstallerSettings>;
