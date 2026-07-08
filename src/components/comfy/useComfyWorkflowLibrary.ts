'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { GenerativePreferences } from '@/lib/generative-preferences';
import { loadComfyCloudApiKey } from '@/lib/comfyui/connection';
import {
    registerSerializedComfyWorkflow,
    type ComfyLibrarySnapshot,
    type ComfyLibraryWorkflowEntry,
} from '@/lib/comfyui/libraryTypes';

interface LibraryResponseBody {
    success: boolean;
    message?: string;
    snapshot?: ComfyLibrarySnapshot;
}

export interface ComfyWorkflowLibraryState {
    snapshot: ComfyLibrarySnapshot | null;
    officialEntries: ComfyLibraryWorkflowEntry[];
    personalEntries: ComfyLibraryWorkflowEntry[];
    isLoading: boolean;
    error: string;
    warnings: string[];
    refresh: () => Promise<void>;
}

/**
 * Scans the connected ComfyUI server for official workflow templates and the
 * configured local folders for personal workflows, registering every runnable
 * entry in the client-side workflow registry.
 */
export function useComfyWorkflowLibrary(preferences: GenerativePreferences): ComfyWorkflowLibraryState {
    const [snapshot, setSnapshot] = useState<ComfyLibrarySnapshot | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const requestSeqRef = useRef(0);

    const {
        comfyConnectionMode,
        comfyServerUrl,
        comfyTunnelUrl,
        comfyCloudUrl,
        comfyInstallPath,
        comfyCustomNodesPath,
        comfyWorkflowLibraryPath,
    } = preferences;

    const refresh = useCallback(async () => {
        const requestSeq = requestSeqRef.current + 1;
        requestSeqRef.current = requestSeq;
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch('/api/ai/comfy/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'scan',
                    connectionMode: comfyConnectionMode,
                    comfyServerUrl,
                    comfyTunnelUrl,
                    comfyCloudUrl,
                    comfyCloudApiKey: loadComfyCloudApiKey(),
                    installPath: comfyInstallPath,
                    customNodesPath: comfyCustomNodesPath,
                    workflowLibraryPath: comfyWorkflowLibraryPath,
                }),
            });

            const body = await response.json() as LibraryResponseBody;
            if (requestSeq !== requestSeqRef.current) return;

            if (!response.ok || !body.success || !body.snapshot) {
                throw new Error(body.message || 'Failed to scan the ComfyUI workflow library.');
            }

            for (const entry of [...body.snapshot.serverTemplates, ...body.snapshot.customFolderWorkflows]) {
                if (entry.registration) {
                    registerSerializedComfyWorkflow(entry.registration);
                }
            }

            setSnapshot(body.snapshot);
        } catch (scanError) {
            if (requestSeq !== requestSeqRef.current) return;
            setError(scanError instanceof Error ? scanError.message : 'Failed to scan the ComfyUI workflow library.');
        } finally {
            if (requestSeq === requestSeqRef.current) {
                setIsLoading(false);
            }
        }
    }, [
        comfyConnectionMode,
        comfyCustomNodesPath,
        comfyInstallPath,
        comfyServerUrl,
        comfyTunnelUrl,
        comfyCloudUrl,
        comfyWorkflowLibraryPath,
    ]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return {
        snapshot,
        officialEntries: snapshot?.serverTemplates || [],
        personalEntries: snapshot?.customFolderWorkflows || [],
        isLoading,
        error,
        warnings: snapshot?.warnings || [],
        refresh,
    };
}
