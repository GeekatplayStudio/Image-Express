'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';
import type { ComfyConnectionMode } from '@/lib/comfyui/connection';
import type { SerializedComfyWorkflowRegistration, ComfyLibrarySnapshot } from '@/lib/comfyui/libraryTypes';
import type { ComfyTask } from '@/lib/comfyui/registry';

interface ComfyWorkflowLibraryPanelProps {
    connectionMode: ComfyConnectionMode;
    comfyServerUrl: string;
    comfyCloudUrl: string;
    comfyCloudApiKey: string;
    installPath: string;
    customNodesPath: string;
    workflowLibraryPath: string;
    selectedTask: ComfyTask;
    onUseWorkflow: (registration: SerializedComfyWorkflowRegistration) => void;
    onWorkflowsDiscovered?: (registrations: SerializedComfyWorkflowRegistration[]) => void;
}

interface LibraryResponseBody {
    success: boolean;
    message?: string;
    snapshot?: ComfyLibrarySnapshot;
}

const WORKFLOW_LIBRARY_PATH_SPLIT_PATTERN = /[\r\n;]+/;

const parseConfiguredWorkflowFolders = (value: string): string[] => Array.from(new Set(
    value
        .split(WORKFLOW_LIBRARY_PATH_SPLIT_PATTERN)
        .map((entry) => entry.trim())
        .filter(Boolean)
));

const TASK_LABELS: Record<ComfyTask, string> = {
    generate: 'Generate',
    img2img: 'Img2Img',
    inpaint: 'Inpaint',
    outpaint: 'Outpaint',
    upscale: 'Upscale',
    edit: 'Edit',
    'multi-reference': 'Multi-Ref',
};

export default function ComfyWorkflowLibraryPanel(props: ComfyWorkflowLibraryPanelProps) {
    const {
        connectionMode,
        comfyServerUrl,
        comfyCloudUrl,
        comfyCloudApiKey,
        installPath,
        customNodesPath,
        workflowLibraryPath,
        selectedTask,
        onUseWorkflow,
        onWorkflowsDiscovered,
    } = props;

    const [snapshot, setSnapshot] = useState<ComfyLibrarySnapshot | null>(null);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const refreshLibrary = useCallback(async () => {
        setIsLoading(true);
        setMessage('');

        try {
            const response = await fetch('/api/ai/comfy/library', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'scan',
                    connectionMode,
                    comfyServerUrl,
                    comfyCloudUrl,
                    comfyCloudApiKey,
                    installPath,
                    customNodesPath,
                    workflowLibraryPath,
                }),
            });

            const body = await response.json() as LibraryResponseBody;
            if (!response.ok || !body.success || !body.snapshot) {
                throw new Error(body.message || 'Failed to refresh the Comfy workflow library.');
            }

            setSnapshot(body.snapshot);
            const discoveredRegistrations = [
                ...(body.snapshot.serverTemplates || []),
                ...(body.snapshot.customFolderWorkflows || []),
            ].flatMap((entry) => entry.registration ? [entry.registration] : []);

            if (discoveredRegistrations.length > 0) {
                onWorkflowsDiscovered?.(discoveredRegistrations);
            }

            if (body.snapshot.warnings.length > 0) {
                setMessage(body.snapshot.warnings[0]);
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Failed to refresh the Comfy workflow library.');
            setSnapshot(null);
        } finally {
            setIsLoading(false);
        }
    }, [
        comfyCloudApiKey,
        comfyCloudUrl,
        comfyServerUrl,
        connectionMode,
        customNodesPath,
        installPath,
        onWorkflowsDiscovered,
        workflowLibraryPath,
    ]);

    useEffect(() => {
        void refreshLibrary();
    }, [refreshLibrary]);

    const configuredWorkflowFolders = useMemo(() => {
        if (snapshot?.workflowLibraryPaths && snapshot.workflowLibraryPaths.length > 0) {
            return snapshot.workflowLibraryPaths;
        }

        return parseConfiguredWorkflowFolders(workflowLibraryPath);
    }, [snapshot, workflowLibraryPath]);

    const visibleEntries = useMemo(() => {
        const entries = [
            ...(snapshot?.serverTemplates || []),
            ...(snapshot?.customFolderWorkflows || []),
        ];

        const matchingTask = entries.filter((entry) => entry.task === selectedTask && entry.registration);
        const fallback = entries.filter((entry) => entry.registration);
        return (matchingTask.length > 0 ? matchingTask : fallback).slice(0, 10);
    }, [selectedTask, snapshot]);

    return (
        <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-2">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Workflow Library</div>
                    <div className="text-[10px] text-muted-foreground">
                        Server templates: {snapshot?.serverTemplates.length || 0} | Workflow files: {snapshot?.customFolderWorkflows.length || 0}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void refreshLibrary()}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
                    Refresh
                </button>
            </div>

            {(configuredWorkflowFolders.length > 0 || customNodesPath || installPath) && (
                <div className="text-[10px] text-muted-foreground rounded border border-border/40 bg-secondary/20 px-2 py-1">
                    {configuredWorkflowFolders.length > 0
                        ? `Workflow folders: ${configuredWorkflowFolders.join(' | ')}`
                        : 'Add one or more workflow folders in Settings to scan local JSON workflows.'}
                </div>
            )}

            {message && (
                <div className="text-[10px] text-muted-foreground rounded border border-border/40 bg-secondary/20 px-2 py-1">
                    {message}
                </div>
            )}

            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {visibleEntries.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground rounded border border-dashed border-border/60 px-2 py-3">
                        No runnable server/workflow-folder entries were discovered yet. Connect ComfyUI, or add workflow folder(s) in Settings.
                    </div>
                ) : (
                    visibleEntries.map((entry) => (
                        <div key={`${entry.source}:${entry.id}:${entry.location || ''}`} className="rounded border border-border/60 bg-secondary/10 px-2 py-2">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="truncate text-xs font-medium">{entry.name}</div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {entry.source === 'server-template' ? 'Server template' : (entry.category || 'Workflow folder')} | {TASK_LABELS[entry.task || 'generate']}
                                    </div>
                                </div>
                                {entry.registration ? (
                                    <button
                                        type="button"
                                        onClick={() => onUseWorkflow(entry.registration as SerializedComfyWorkflowRegistration)}
                                        className="rounded border border-border px-2 py-1 text-[10px] font-medium hover:bg-secondary"
                                    >
                                        Use
                                    </button>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground">View only</span>
                                )}
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">{entry.description}</div>
                            {entry.warning && (
                                <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300">{entry.warning}</div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
