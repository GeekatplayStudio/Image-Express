'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as fabric from 'fabric';
import {
    CheckCircle2,
    Circle,
    FolderOpen,
    Loader2,
    Play,
    RefreshCcw,
    Search,
    Server,
    Settings,
    Workflow,
    X,
    XCircle,
} from 'lucide-react';

import {
    loadGenerativePreferences,
    GENERATIVE_PREFERENCES_CHANGED_EVENT,
    type GenerativePreferences,
} from '@/lib/generative-preferences';
import {
    loadComfyCloudApiKey,
    verifyAvailableComfyConnection,
    type ComfyConnectionOptions,
} from '@/lib/comfyui/connection';
import { executeComfyTask } from '@/lib/comfyui/runner';
import { comfyWorkflowRegistry, type ComfyTask } from '@/lib/comfyui/registry';
import { ensureComfyWorkflowCatalogRegistered, getBuiltInComfyWorkflowIds } from '@/lib/comfyui/workflows/catalog';
import {
    registerSerializedComfyWorkflow,
    type ComfyLibraryWorkflowEntry,
    type SerializedComfyWorkflowRegistration,
} from '@/lib/comfyui/libraryTypes';

import { useComfyWorkflowLibrary } from '@/components/comfy/useComfyWorkflowLibrary';
import ComfyMaskEditor from '@/components/comfy/ComfyMaskEditor';
import {
    buildComfyOutpaintPayload,
    captureComfySource,
    createComfySolidMaskDataUrl,
    getSelectedComfyLayerIds,
    insertComfyResultOntoCanvas,
    listComfyCanvasLayers,
    type ComfyCapturedSource,
    type ComfyOutpaintPadding,
    type ComfySourceKind,
} from '@/components/comfy/comfyCanvasSources';

interface ComfyWorkflowsModalProps {
    canvas: fabric.Canvas | null;
    onClose: () => void;
    onOpenSettings?: () => void;
}

type BrowserGroup = 'built-in' | 'official' | 'personal';

interface BrowserEntry {
    key: string;
    group: BrowserGroup;
    workflowId: string;
    name: string;
    description: string;
    task: ComfyTask;
    runnable: boolean;
    warning?: string;
    location?: string;
    registration?: SerializedComfyWorkflowRegistration;
}

type ConnectionState = { status: 'unknown' | 'checking' | 'ok' | 'error'; message: string };

const TASK_LABELS: Record<ComfyTask, string> = {
    generate: 'Text to Image',
    img2img: 'Image to Image',
    inpaint: 'Inpaint',
    outpaint: 'Outpaint',
    upscale: 'Upscale',
    edit: 'Edit',
    'multi-reference': 'Multi-Ref',
};

const TASK_FILTERS: Array<{ id: ComfyTask | 'all'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'generate', label: 'Generate' },
    { id: 'img2img', label: 'Img2Img' },
    { id: 'inpaint', label: 'Inpaint' },
    { id: 'outpaint', label: 'Outpaint' },
    { id: 'upscale', label: 'Upscale' },
    { id: 'edit', label: 'Edit' },
];

const GROUP_LABELS: Record<BrowserGroup, string> = {
    'built-in': 'Built-in Workflows',
    official: 'Official ComfyUI Templates',
    personal: 'My Workflows',
};

const taskNeedsSourceImage = (task: ComfyTask): boolean => task !== 'generate';
const taskNeedsPrompt = (task: ComfyTask): boolean => task !== 'upscale';

const toBrowserEntry = (entry: ComfyLibraryWorkflowEntry, group: BrowserGroup): BrowserEntry => ({
    key: `${group}:${entry.id}:${entry.location || ''}`,
    group,
    workflowId: entry.registration?.id || entry.id,
    name: entry.name,
    description: entry.description,
    task: entry.task || 'generate',
    runnable: Boolean(entry.registration),
    warning: entry.warning,
    location: entry.location,
    registration: entry.registration,
});

export default function ComfyWorkflowsModal({ canvas, onClose, onOpenSettings }: ComfyWorkflowsModalProps) {
    const [preferences, setPreferences] = useState<GenerativePreferences>(() => loadGenerativePreferences());

    useEffect(() => {
        const reload = () => setPreferences(loadGenerativePreferences());
        window.addEventListener(GENERATIVE_PREFERENCES_CHANGED_EVENT, reload);
        return () => window.removeEventListener(GENERATIVE_PREFERENCES_CHANGED_EVENT, reload);
    }, []);

    const connectionOptions = useMemo<ComfyConnectionOptions>(() => ({
        mode: preferences.comfyConnectionMode,
        localUrl: preferences.comfyServerUrl,
        tunnelUrl: preferences.comfyTunnelUrl,
        cloudUrl: preferences.comfyCloudUrl,
        cloudApiKey: loadComfyCloudApiKey(),
    }), [preferences]);

    const library = useComfyWorkflowLibrary(preferences);

    const [connection, setConnection] = useState<ConnectionState>({ status: 'unknown', message: '' });

    const verifyConnection = useCallback(async () => {
        setConnection({ status: 'checking', message: 'Checking ComfyUI connection...' });
        try {
            const result = await verifyAvailableComfyConnection(connectionOptions);
            setConnection({ status: result.ok ? 'ok' : 'error', message: result.message });
        } catch (error) {
            setConnection({
                status: 'error',
                message: error instanceof Error ? error.message : 'ComfyUI connection check failed.',
            });
        }
    }, [connectionOptions]);

    useEffect(() => {
        void verifyConnection();
    }, [verifyConnection]);

    // --- Workflow browser ---
    const [searchQuery, setSearchQuery] = useState('');
    const [taskFilter, setTaskFilter] = useState<ComfyTask | 'all'>('all');
    const [selectedKey, setSelectedKey] = useState('');

    const builtInEntries = useMemo<BrowserEntry[]>(() => {
        ensureComfyWorkflowCatalogRegistered();
        return getBuiltInComfyWorkflowIds()
            .map((workflowId) => comfyWorkflowRegistry.getWorkflow(workflowId))
            .filter((workflow): workflow is NonNullable<typeof workflow> => Boolean(workflow))
            .map((workflow) => ({
                key: `built-in:${workflow.id}`,
                group: 'built-in' as const,
                workflowId: workflow.id,
                name: workflow.name,
                description: workflow.description,
                task: workflow.task,
                runnable: true,
            }));
    }, []);

    const allEntries = useMemo<BrowserEntry[]>(() => [
        ...builtInEntries,
        ...library.officialEntries.map((entry) => toBrowserEntry(entry, 'official')),
        ...library.personalEntries.map((entry) => toBrowserEntry(entry, 'personal')),
    ], [builtInEntries, library.officialEntries, library.personalEntries]);

    const visibleEntries = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return allEntries.filter((entry) => {
            if (taskFilter !== 'all' && entry.task !== taskFilter) return false;
            if (!query) return true;
            return `${entry.name} ${entry.description} ${entry.workflowId}`.toLowerCase().includes(query);
        });
    }, [allEntries, searchQuery, taskFilter]);

    const groupedEntries = useMemo(() => {
        const groups: Array<{ group: BrowserGroup; entries: BrowserEntry[] }> = [];
        for (const group of ['built-in', 'official', 'personal'] as BrowserGroup[]) {
            const entries = visibleEntries.filter((entry) => entry.group === group);
            if (entries.length > 0) {
                groups.push({ group, entries });
            }
        }
        return groups;
    }, [visibleEntries]);

    const selectedEntry = useMemo(
        () => allEntries.find((entry) => entry.key === selectedKey) || null,
        [allEntries, selectedKey],
    );

    const selectEntry = useCallback((entry: BrowserEntry) => {
        if (entry.registration) {
            registerSerializedComfyWorkflow(entry.registration);
        }
        setSelectedKey(entry.key);
    }, []);

    // --- Source selection ---
    const [sourceKind, setSourceKind] = useState<ComfySourceKind>('selection');
    const [chosenLayerIds, setChosenLayerIds] = useState<string[]>([]);
    const [layerOptions, setLayerOptions] = useState(() => listComfyCanvasLayers(canvas));
    const selectedLayerCount = useMemo(() => getSelectedComfyLayerIds(canvas).length, [canvas]);

    const refreshLayers = useCallback(() => {
        setLayerOptions(listComfyCanvasLayers(canvas));
    }, [canvas]);

    const toggleChosenLayer = useCallback((layerId: string) => {
        setChosenLayerIds((previous) => (
            previous.includes(layerId)
                ? previous.filter((id) => id !== layerId)
                : [...previous, layerId]
        ));
    }, []);

    // --- Run form ---
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [steps, setSteps] = useState(20);
    const [cfg, setCfg] = useState(7);
    const [strength, setStrength] = useState(0.6);
    const [seedInput, setSeedInput] = useState('');
    const [generateWidth, setGenerateWidth] = useState(1024);
    const [generateHeight, setGenerateHeight] = useState(1024);
    const [outpaintPadding, setOutpaintPadding] = useState<ComfyOutpaintPadding>({
        top: 128,
        right: 128,
        bottom: 128,
        left: 128,
    });
    const [modelPresetId, setModelPresetId] = useState('');

    // --- Inpaint mask ---
    const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
    const [maskSource, setMaskSource] = useState<ComfyCapturedSource | null>(null);
    const [showMaskEditor, setShowMaskEditor] = useState(false);

    // A painted mask only fits the source it was painted over.
    useEffect(() => {
        setMaskDataUrl(null);
        setMaskSource(null);
        setShowMaskEditor(false);
    }, [sourceKind, chosenLayerIds]);

    const openMaskEditor = useCallback(() => {
        const source = maskSource || captureComfySource(canvas, sourceKind, chosenLayerIds);
        if (!source) {
            setStatusMessage(
                sourceKind === 'selection'
                    ? 'Select one or more layers on the canvas first, then paint the mask.'
                    : 'Could not capture the chosen source. Pick at least one layer or use the whole canvas.'
            );
            return;
        }
        setMaskSource(source);
        setShowMaskEditor(true);
    }, [canvas, chosenLayerIds, maskSource, sourceKind]);

    const clearMask = useCallback(() => {
        setMaskDataUrl(null);
        setMaskSource(null);
    }, []);

    const modelPresets = useMemo(() => (
        selectedEntry ? comfyWorkflowRegistry.getModelPresetsForWorkflow(selectedEntry.workflowId) : []
    ), [selectedEntry]);

    useEffect(() => {
        if (!selectedEntry) return;
        const workflow = comfyWorkflowRegistry.getWorkflow(selectedEntry.workflowId);
        setModelPresetId(workflow?.defaultModelPresetId || modelPresets[0]?.id || 'default');
    }, [modelPresets, selectedEntry]);

    // --- Execution ---
    const [isRunning, setIsRunning] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [resultDataUrl, setResultDataUrl] = useState('');
    const runTokenRef = useRef(0);
    const lastSourceRef = useRef<ComfyCapturedSource | null>(null);

    const cancelRun = useCallback(() => {
        runTokenRef.current += 1;
        setIsRunning(false);
        setStatusMessage('Run cancelled. A job already queued on the ComfyUI server keeps rendering there.');
    }, []);

    const runWorkflow = useCallback(async () => {
        if (!selectedEntry || isRunning) return;

        const task = selectedEntry.task;
        if (taskNeedsPrompt(task) && !prompt.trim()) {
            setStatusMessage('Enter a prompt before running this workflow.');
            return;
        }

        const runToken = runTokenRef.current + 1;
        runTokenRef.current = runToken;
        setIsRunning(true);
        setResultDataUrl('');
        setStatusMessage('Preparing workflow...');

        try {
            const params: Record<string, unknown> = {
                prompt: prompt.trim(),
                negativePrompt: negativePrompt.trim(),
                width: generateWidth,
                height: generateHeight,
                steps,
                cfg,
                seed: seedInput.trim() ? Number(seedInput.trim()) : Math.floor(Math.random() * 1_000_000_000_000),
            };

            lastSourceRef.current = null;

            if (taskNeedsSourceImage(task)) {
                // A painted inpaint mask only matches the snapshot it was painted over,
                // so reuse that snapshot instead of re-capturing.
                const usePaintedMask = task === 'inpaint' && Boolean(maskDataUrl && maskSource);
                const source = usePaintedMask
                    ? maskSource
                    : captureComfySource(canvas, sourceKind, chosenLayerIds);
                if (!source) {
                    throw new Error(
                        sourceKind === 'selection'
                            ? 'Select one or more layers on the canvas first, or switch the source to specific layers or the whole canvas.'
                            : 'Could not capture the chosen source. Pick at least one layer or use the whole canvas.'
                    );
                }

                lastSourceRef.current = source;
                params.image = source.dataUrl;
                params.width = source.width;
                params.height = source.height;

                if (task === 'img2img' || task === 'inpaint' || task === 'outpaint') {
                    params.strength = strength;
                }

                if (task === 'inpaint') {
                    const mask = usePaintedMask
                        ? maskDataUrl
                        : createComfySolidMaskDataUrl(source.width, source.height);
                    if (mask) params.mask = mask;
                }

                if (task === 'outpaint') {
                    const payload = await buildComfyOutpaintPayload(source, outpaintPadding);
                    if (!payload) {
                        throw new Error('Failed to build the outpaint image and mask. Give at least one side some padding.');
                    }
                    params.image = payload.imageDataUrl;
                    params.mask = payload.maskDataUrl;
                    params.width = payload.width;
                    params.height = payload.height;
                }

                if (task === 'upscale') {
                    params.width = Math.max(64, Math.round(source.width * 2));
                    params.height = Math.max(64, Math.round(source.height * 2));
                }
            }

            const execution = await executeComfyTask({
                connection: connectionOptions,
                task,
                workflowId: selectedEntry.workflowId,
                modelPresetId: modelPresetId || undefined,
                params,
                onProgress: (progress) => {
                    if (runToken !== runTokenRef.current) return;
                    const seconds = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
                    setStatusMessage(progress.message
                        ? `${progress.message} • ${seconds}s`
                        : `Running (${progress.stage}) • ${seconds}s`);
                },
            });

            if (runToken !== runTokenRef.current) return;

            if (!execution.result.dataUrl) {
                throw new Error('ComfyUI finished but returned no image output.');
            }

            setResultDataUrl(execution.result.dataUrl);
            setStatusMessage(`Done with "${execution.workflow.name}". Insert the result below.`);
        } catch (error) {
            if (runToken !== runTokenRef.current) return;
            setStatusMessage(`Error: ${error instanceof Error ? error.message : 'ComfyUI run failed.'}`);
        } finally {
            if (runToken === runTokenRef.current) {
                setIsRunning(false);
            }
        }
    }, [
        canvas,
        cfg,
        chosenLayerIds,
        connectionOptions,
        generateHeight,
        generateWidth,
        isRunning,
        maskDataUrl,
        maskSource,
        modelPresetId,
        negativePrompt,
        outpaintPadding,
        prompt,
        seedInput,
        selectedEntry,
        sourceKind,
        steps,
        strength,
    ]);

    const insertResult = useCallback(async (replaceSourceLayers: boolean) => {
        if (!canvas || !resultDataUrl) return;
        try {
            await insertComfyResultOntoCanvas(canvas, resultDataUrl, lastSourceRef.current, { replaceSourceLayers });
            setStatusMessage(replaceSourceLayers ? 'Source layers replaced with the result.' : 'Result inserted as a new layer.');
            refreshLayers();
        } catch {
            setStatusMessage('Error: failed to insert the result onto the canvas.');
        }
    }, [canvas, refreshLayers, resultDataUrl]);

    const needsSource = selectedEntry ? taskNeedsSourceImage(selectedEntry.task) : false;
    const isOutpaint = selectedEntry?.task === 'outpaint';
    const isGenerate = selectedEntry?.task === 'generate';
    const usesStrength = selectedEntry ? ['img2img', 'inpaint', 'outpaint'].includes(selectedEntry.task) : false;

    const connectionIcon = connection.status === 'ok'
        ? <CheckCircle2 size={13} className="text-green-500" />
        : connection.status === 'error'
            ? <XCircle size={13} className="text-destructive" />
            : connection.status === 'checking'
                ? <Loader2 size={13} className="animate-spin text-muted-foreground" />
                : <Circle size={13} className="text-muted-foreground" />;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
            <div className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Workflow size={18} className="shrink-0 text-primary" />
                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold text-foreground">ComfyUI Workflows</h2>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                {connectionIcon}
                                <span className="truncate" title={connection.message}>
                                    {connection.status === 'ok'
                                        ? connection.message
                                        : connection.status === 'error'
                                            ? 'Not connected'
                                            : 'Checking connection...'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void verifyConnection()}
                            disabled={connection.status === 'checking'}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
                        >
                            <Server size={12} />
                            Verify
                        </button>
                        {onOpenSettings && (
                            <button
                                type="button"
                                onClick={onOpenSettings}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                                title="Connection and workflow folder settings"
                            >
                                <Settings size={12} />
                                Settings
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label="Close ComfyUI workflows"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {connection.status === 'error' && (
                    <div className="border-b border-border bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
                        {connection.message}
                    </div>
                )}

                <div className="flex min-h-0 flex-1">
                    {/* Left: workflow browser */}
                    <div className="flex w-80 shrink-0 flex-col border-r border-border">
                        <div className="space-y-2 border-b border-border p-3">
                            <div className="relative">
                                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder="Search workflows..."
                                    aria-label="Search workflows"
                                    className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {TASK_FILTERS.map((filter) => (
                                    <button
                                        key={filter.id}
                                        type="button"
                                        onClick={() => setTaskFilter(filter.id)}
                                        aria-pressed={taskFilter === filter.id}
                                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${taskFilter === filter.id
                                            ? 'border-primary/40 bg-primary/10 text-foreground'
                                            : 'border-border/60 bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
                                        }`}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>{visibleEntries.length} of {allEntries.length} workflows</span>
                                <button
                                    type="button"
                                    onClick={() => void library.refresh()}
                                    disabled={library.isLoading}
                                    className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-medium hover:bg-secondary disabled:opacity-60"
                                >
                                    {library.isLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCcw size={10} />}
                                    Rescan
                                </button>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-2">
                            {library.error && (
                                <div className="mb-2 rounded border border-border/60 bg-secondary/20 px-2 py-1.5 text-[10px] text-muted-foreground">
                                    {library.error}
                                </div>
                            )}
                            {groupedEntries.length === 0 && !library.isLoading && (
                                <div className="rounded border border-dashed border-border/60 px-3 py-6 text-center text-[11px] text-muted-foreground">
                                    No workflows match. Connect ComfyUI for official templates, or add workflow folders in Settings.
                                </div>
                            )}
                            {groupedEntries.map(({ group, entries }) => (
                                <div key={group} className="mb-3">
                                    <div className="flex items-center gap-1.5 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {group === 'personal' ? <FolderOpen size={11} /> : <Server size={11} />}
                                        {GROUP_LABELS[group]} ({entries.length})
                                    </div>
                                    <div className="space-y-1">
                                        {entries.map((entry) => (
                                            <button
                                                key={entry.key}
                                                type="button"
                                                onClick={() => selectEntry(entry)}
                                                disabled={!entry.runnable}
                                                className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${selectedKey === entry.key
                                                    ? 'border-primary/50 bg-primary/10'
                                                    : 'border-border/60 bg-background hover:bg-secondary/50'
                                                } ${entry.runnable ? '' : 'cursor-not-allowed opacity-50'}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-xs font-medium text-foreground">{entry.name}</span>
                                                    <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                                                        {TASK_LABELS[entry.task]}
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{entry.description}</div>
                                                {!entry.runnable && (
                                                    <div className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-300">View only — no runnable output detected.</div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: run form */}
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {!selectedEntry ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                                <Workflow size={32} className="opacity-40" />
                                <p className="text-sm font-medium">Pick a workflow to get started</p>
                                <p className="max-w-sm text-xs">
                                    Built-in workflows run out of the box. Official templates come from your connected
                                    ComfyUI server, and My Workflows are scanned from the folders set in Settings.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-semibold text-foreground">{selectedEntry.name}</h3>
                                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                            {TASK_LABELS[selectedEntry.task]}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">{selectedEntry.description}</p>
                                    {selectedEntry.warning && (
                                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">{selectedEntry.warning}</p>
                                    )}
                                </div>

                                {needsSource && (
                                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source image</span>
                                            <button
                                                type="button"
                                                onClick={refreshLayers}
                                                className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary"
                                            >
                                                <RefreshCcw size={10} />
                                                Refresh layers
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {([
                                                ['selection', `Selected layers (${selectedLayerCount})`],
                                                ['layers', 'Choose layers'],
                                                ['canvas', 'Whole canvas'],
                                            ] as Array<[ComfySourceKind, string]>).map(([kind, label]) => (
                                                <button
                                                    key={kind}
                                                    type="button"
                                                    onClick={() => setSourceKind(kind)}
                                                    aria-pressed={sourceKind === kind}
                                                    className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${sourceKind === kind
                                                        ? 'border-primary/50 bg-primary/10 text-foreground'
                                                        : 'border-border/60 bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
                                                    }`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        {sourceKind === 'layers' && (
                                            <div className="max-h-36 space-y-1 overflow-y-auto rounded border border-border/60 bg-background p-2">
                                                {layerOptions.length === 0 && (
                                                    <div className="text-[11px] text-muted-foreground">The canvas has no layers yet.</div>
                                                )}
                                                {layerOptions.map((layer) => (
                                                    <label key={layer.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-secondary/50">
                                                        <input
                                                            type="checkbox"
                                                            checked={chosenLayerIds.includes(layer.id)}
                                                            onChange={() => toggleChosenLayer(layer.id)}
                                                            aria-label={`Use layer ${layer.label}`}
                                                        />
                                                        <span className="truncate text-foreground">{layer.label}</span>
                                                        {layer.isSelected && <span className="text-[9px] text-primary">selected</span>}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                        {selectedEntry.task === 'inpaint' && (
                                            <div className="space-y-1.5 rounded border border-border/60 bg-background p-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {maskDataUrl
                                                            ? 'Mask painted — only the painted areas will be regenerated.'
                                                            : 'No mask yet — the whole source area will be regenerated.'}
                                                    </span>
                                                    <div className="flex shrink-0 gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={openMaskEditor}
                                                            className="rounded border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-secondary"
                                                        >
                                                            {maskDataUrl ? 'Edit Mask' : 'Paint Mask'}
                                                        </button>
                                                        {maskDataUrl && (
                                                            <button
                                                                type="button"
                                                                onClick={clearMask}
                                                                className="rounded border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary"
                                                            >
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {maskDataUrl && (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img
                                                        src={maskDataUrl}
                                                        alt="Painted inpaint mask preview"
                                                        className="h-16 rounded border border-border/60 bg-black object-contain"
                                                    />
                                                )}
                                            </div>
                                        )}
                                        {isOutpaint && (
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-medium uppercase text-muted-foreground">Expand by (px)</span>
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {([
                                                        ['top', 'Top'],
                                                        ['right', 'Right'],
                                                        ['bottom', 'Bottom'],
                                                        ['left', 'Left'],
                                                    ] as Array<[keyof ComfyOutpaintPadding, string]>).map(([side, label]) => (
                                                        <label key={side} className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                                                            {label}
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={1024}
                                                                step={16}
                                                                value={outpaintPadding[side]}
                                                                onChange={(event) => {
                                                                    const value = Math.max(0, Math.min(1024, Number(event.target.value) || 0));
                                                                    setOutpaintPadding((previous) => ({ ...previous, [side]: value }));
                                                                }}
                                                                aria-label={`Outpaint ${label.toLowerCase()} padding`}
                                                                className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                                                            />
                                                        </label>
                                                    ))}
                                                </div>
                                                <p className="text-[10px] text-muted-foreground">
                                                    Set a side to 0 to keep that edge unchanged.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {taskNeedsPrompt(selectedEntry.task) && (
                                    <div className="space-y-2">
                                        <textarea
                                            value={prompt}
                                            onChange={(event) => setPrompt(event.target.value)}
                                            placeholder="Describe what to generate..."
                                            aria-label="Workflow prompt"
                                            className="min-h-[72px] w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary"
                                        />
                                        <input
                                            type="text"
                                            value={negativePrompt}
                                            onChange={(event) => setNegativePrompt(event.target.value)}
                                            placeholder="Negative prompt (optional)"
                                            aria-label="Negative prompt"
                                            className="h-8 w-full rounded-md border border-border bg-background px-3 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                                        />
                                    </div>
                                )}

                                <details className="rounded-lg border border-border/60 bg-background/40">
                                    <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Advanced settings
                                    </summary>
                                    <div className="grid grid-cols-2 gap-3 px-3 pb-3 pt-1 sm:grid-cols-3">
                                        {modelPresets.length > 1 && (
                                            <label className="col-span-2 flex flex-col gap-1 text-[10px] font-medium uppercase text-muted-foreground sm:col-span-3">
                                                Model preset
                                                <select
                                                    value={modelPresetId}
                                                    onChange={(event) => setModelPresetId(event.target.value)}
                                                    className="h-8 rounded-md border border-border bg-background px-2 text-xs font-normal normal-case text-foreground outline-none focus:border-primary"
                                                >
                                                    {modelPresets.map((preset) => (
                                                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        )}
                                        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                                            Steps
                                            <input
                                                type="number"
                                                min={1}
                                                max={150}
                                                value={steps}
                                                onChange={(event) => setSteps(Math.max(1, Math.min(150, Number(event.target.value) || 20)))}
                                                className="h-8 rounded-md border border-border bg-background px-2 text-xs font-normal text-foreground outline-none focus:border-primary"
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                                            CFG
                                            <input
                                                type="number"
                                                min={1}
                                                max={30}
                                                step={0.5}
                                                value={cfg}
                                                onChange={(event) => setCfg(Math.max(1, Math.min(30, Number(event.target.value) || 7)))}
                                                className="h-8 rounded-md border border-border bg-background px-2 text-xs font-normal text-foreground outline-none focus:border-primary"
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                                            Seed (blank = random)
                                            <input
                                                type="text"
                                                value={seedInput}
                                                onChange={(event) => setSeedInput(event.target.value.replace(/[^0-9]/g, ''))}
                                                placeholder="random"
                                                className="h-8 rounded-md border border-border bg-background px-2 text-xs font-normal text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                                            />
                                        </label>
                                        {usesStrength && (
                                            <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                                                Strength ({strength.toFixed(2)})
                                                <input
                                                    type="range"
                                                    min={0.05}
                                                    max={1}
                                                    step={0.05}
                                                    value={strength}
                                                    onChange={(event) => setStrength(Number(event.target.value))}
                                                    className="h-8"
                                                />
                                            </label>
                                        )}
                                        {isGenerate && (
                                            <>
                                                <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                                                    Width
                                                    <input
                                                        type="number"
                                                        min={64}
                                                        max={4096}
                                                        step={64}
                                                        value={generateWidth}
                                                        onChange={(event) => setGenerateWidth(Math.max(64, Math.min(4096, Number(event.target.value) || 1024)))}
                                                        className="h-8 rounded-md border border-border bg-background px-2 text-xs font-normal text-foreground outline-none focus:border-primary"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                                                    Height
                                                    <input
                                                        type="number"
                                                        min={64}
                                                        max={4096}
                                                        step={64}
                                                        value={generateHeight}
                                                        onChange={(event) => setGenerateHeight(Math.max(64, Math.min(4096, Number(event.target.value) || 1024)))}
                                                        className="h-8 rounded-md border border-border bg-background px-2 text-xs font-normal text-foreground outline-none focus:border-primary"
                                                    />
                                                </label>
                                            </>
                                        )}
                                    </div>
                                </details>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void runWorkflow()}
                                        disabled={isRunning || !selectedEntry.runnable}
                                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isRunning ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                                        {isRunning ? 'Running on ComfyUI...' : 'Run Workflow'}
                                    </button>
                                    {isRunning && (
                                        <button
                                            type="button"
                                            onClick={cancelRun}
                                            className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>

                                {statusMessage && (
                                    <div className={`rounded-md px-3 py-2 text-xs ${statusMessage.startsWith('Error')
                                        ? 'bg-destructive/10 text-destructive'
                                        : 'bg-secondary text-secondary-foreground'
                                    }`}>
                                        {statusMessage}
                                    </div>
                                )}

                                {resultDataUrl && (
                                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={resultDataUrl}
                                            alt="ComfyUI workflow result"
                                            className="max-h-72 w-full rounded-md border border-border object-contain"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void insertResult(false)}
                                                className="flex-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
                                            >
                                                Insert as New Layer
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void insertResult(true)}
                                                disabled={!lastSourceRef.current || lastSourceRef.current.layerIds.length === 0}
                                                className="flex-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Replace Source Layers
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {showMaskEditor && maskSource && (
                    <ComfyMaskEditor
                        sourceDataUrl={maskSource.dataUrl}
                        width={maskSource.width}
                        height={maskSource.height}
                        initialMaskDataUrl={maskDataUrl}
                        onApply={(nextMask) => {
                            setMaskDataUrl(nextMask);
                            setShowMaskEditor(false);
                        }}
                        onCancel={() => setShowMaskEditor(false)}
                    />
                )}
            </div>
        </div>
    );
}
