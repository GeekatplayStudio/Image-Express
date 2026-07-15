'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ComfyConnectionMode } from '@/lib/comfyui/connection';
import type { ComfyLibraryRepoKind, ComfyLibrarySnapshot } from '@/lib/comfyui/libraryTypes';
import type { ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';
import type { useDialog } from '@/providers/DialogProvider';

type ComfyMissingRequirements = {
    updateInstall: boolean;
    models: ComfyWorkflowInstallableModel[];
    workflows: Array<{ workflowName: string; missingNodeTypes: string[]; missingModels: string[] }>;
} | null;

/**
 * Comfy workflow/custom-node library: scanning, installing GitHub repos,
 * updating the managed install, and one-click-installing detected missing
 * requirements (nodes/models) once a connection check finds gaps.
 */
export function useComfyLibrarySettings(
    isOpen: boolean,
    connection: {
        comfyConnectionMode: ComfyConnectionMode;
        comfyServerUrl: string;
        comfyTunnelUrl: string;
        comfyCloudUrl: string;
        comfyCloudApiKey: string;
        comfyInstallPath: string;
        comfyCustomNodesPath: string;
        comfyWorkflowLibraryPath: string;
    },
    comfyMissingRequirements: ComfyMissingRequirements,
    handleVerifyComfyConnection: () => Promise<void>,
    dialog: ReturnType<typeof useDialog>,
) {
    const [comfyLibrarySnapshot, setComfyLibrarySnapshot] = useState<ComfyLibrarySnapshot | null>(null);
    const [comfyLibraryCheck, setComfyLibraryCheck] = useState<{ state: 'idle' | 'checking' | 'success' | 'error'; message: string }>({ state: 'idle', message: '' });
    const [comfyRepoUrl, setComfyRepoUrl] = useState('');
    const [comfyRepoKind, setComfyRepoKind] = useState<ComfyLibraryRepoKind>('custom-nodes');

    const {
        comfyConnectionMode, comfyServerUrl, comfyTunnelUrl, comfyCloudUrl, comfyCloudApiKey,
        comfyInstallPath, comfyCustomNodesPath, comfyWorkflowLibraryPath,
    } = connection;

    useEffect(() => {
        setComfyLibraryCheck((current) => (current.state === 'idle' && !current.message ? current : { state: 'idle', message: '' }));
    }, [comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyCustomNodesPath, comfyInstallPath, comfyServerUrl, comfyTunnelUrl, comfyWorkflowLibraryPath]);

    const runComfyLibraryAction = useCallback(async (
        action: 'scan' | 'install-repo' | 'update-repo' | 'update-install' | 'install-requirements',
        extraBody: Record<string, unknown> = {},
    ) => {
        setComfyLibraryCheck({ state: 'checking', message: action === 'scan' ? 'Scanning Comfy workflow library...' : 'Running Comfy library action...' });
        try {
            const response = await fetch('/api/ai/comfy/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    connectionMode: comfyConnectionMode,
                    comfyServerUrl,
                    comfyTunnelUrl,
                    comfyCloudUrl,
                    comfyCloudApiKey,
                    installPath: comfyInstallPath,
                    customNodesPath: comfyCustomNodesPath,
                    workflowLibraryPath: comfyWorkflowLibraryPath,
                    ...extraBody,
                }),
            });

            const data = await response.json() as { success?: boolean; message?: string; snapshot?: ComfyLibrarySnapshot };
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Comfy library action failed.');
            }

            setComfyLibrarySnapshot(data.snapshot || null);
            setComfyLibraryCheck({ state: 'success', message: data.message || 'Comfy library refreshed.' });
        } catch (error) {
            setComfyLibraryCheck({ state: 'error', message: error instanceof Error ? error.message : 'Comfy library action failed.' });
        }
    }, [comfyCloudApiKey, comfyCloudUrl, comfyConnectionMode, comfyCustomNodesPath, comfyInstallPath, comfyServerUrl, comfyTunnelUrl, comfyWorkflowLibraryPath]);

    const handleRefreshComfyLibrary = useCallback(async () => {
        await runComfyLibraryAction('scan');
    }, [runComfyLibraryAction]);

    useEffect(() => {
        if (!isOpen) return;
        // Also re-runs whenever any connection field changes (handleRefreshComfyLibrary's
        // identity depends on them), matching the original combined effect.
        void handleRefreshComfyLibrary();
    }, [isOpen, handleRefreshComfyLibrary]);

    const handleInstallComfyRepo = useCallback(async () => {
        const repoUrl = comfyRepoUrl.trim();
        if (!repoUrl) {
            setComfyLibraryCheck({ state: 'error', message: 'Paste a GitHub repository URL before installing.' });
            return;
        }
        await runComfyLibraryAction('install-repo', { repoUrl, repoKind: comfyRepoKind });
        setComfyRepoUrl('');
    }, [comfyRepoKind, comfyRepoUrl, runComfyLibraryAction]);

    const handleUpdateComfyInstall = useCallback(async () => {
        await runComfyLibraryAction('update-install');
    }, [runComfyLibraryAction]);

    const handleUpdateManagedRepo = useCallback(async (repoPath: string) => {
        await runComfyLibraryAction('update-repo', { repoPath });
    }, [runComfyLibraryAction]);

    const handleInstallMissingComfyRequirements = useCallback(async () => {
        if (!comfyMissingRequirements) return;

        const summaryParts: string[] = [];
        if (comfyMissingRequirements.updateInstall) {
            summaryParts.push('update the ComfyUI install to restore missing core nodes');
        }
        if (comfyMissingRequirements.models.length > 0) {
            summaryParts.push(`download ${comfyMissingRequirements.models.length} missing model${comfyMissingRequirements.models.length === 1 ? '' : 's'} into the default models folders`);
        }

        const confirmed = await dialog.confirm(
            `Install the detected ComfyUI requirements? This will ${summaryParts.join(' and ')}.`,
            { title: 'Install Missing Comfy Requirements' },
        );
        if (!confirmed) return;

        await runComfyLibraryAction('install-requirements', {
            updateInstall: comfyMissingRequirements.updateInstall,
            models: comfyMissingRequirements.models,
        });
        await handleVerifyComfyConnection();
    }, [comfyMissingRequirements, dialog, handleVerifyComfyConnection, runComfyLibraryAction]);

    return {
        comfyLibrarySnapshot,
        comfyLibraryCheck,
        comfyRepoUrl, setComfyRepoUrl,
        comfyRepoKind, setComfyRepoKind,
        handleRefreshComfyLibrary,
        handleInstallComfyRepo,
        handleUpdateComfyInstall,
        handleUpdateManagedRepo,
        handleInstallMissingComfyRequirements,
    };
}

export type ComfyLibrarySettings = ReturnType<typeof useComfyLibrarySettings>;
