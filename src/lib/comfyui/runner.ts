import {
    ComfyUIClient,
    type ComfyExecutionProgress,
    type ComfyExecutionResult,
} from '@/lib/comfyui/client';
import {
    resolveAvailableComfyTransport,
    type ComfyConnectionOptions,
} from '@/lib/comfyui/connection';
import {
    comfyWorkflowRegistry,
    prepareWorkflowBlueprint,
    type ComfyModelPreset,
    type ComfyTask,
    type ComfyWorkflowVariableParams,
    type RegisteredWorkflow,
} from '@/lib/comfyui/registry';
import { ensureComfyWorkflowCatalogRegistered } from '@/lib/comfyui/workflows/catalog';

export interface PrepareComfyTaskOptions {
    serverUrl?: string;
    connection?: ComfyConnectionOptions;
    task: ComfyTask;
    workflowId?: string;
    modelPresetId?: string;
    params: ComfyWorkflowVariableParams;
}

export interface PreparedComfyTaskExecution {
    client: ComfyUIClient;
    workflow: RegisteredWorkflow;
    modelPreset: ComfyModelPreset;
    workflowJson: Record<string, unknown>;
}

export interface ExecuteComfyTaskOptions extends PrepareComfyTaskOptions {
    onProgress?: (progress: ComfyExecutionProgress) => void;
    onQueued?: (promptId: string) => void;
}

export interface ExecuteComfyTaskResult {
    workflow: RegisteredWorkflow;
    modelPreset: ComfyModelPreset;
    result: ComfyExecutionResult;
}

const extractRequiredNodeTypesFromWorkflowJson = (workflowJson: Record<string, unknown>): string[] => {
    const required = new Set<string>();

    for (const rawNode of Object.values(workflowJson)) {
        if (typeof rawNode !== 'object' || rawNode === null) {
            continue;
        }

        const classType = (rawNode as { class_type?: unknown }).class_type;
        if (typeof classType === 'string' && classType.trim().length > 0) {
            required.add(classType);
        }
    }

    return Array.from(required);
};

const findMissingNodeTypes = (
    workflowJson: Record<string, unknown>,
    objectInfo: Record<string, unknown>
): string[] => {
    const availableNodeTypes = new Set(Object.keys(objectInfo));
    return extractRequiredNodeTypesFromWorkflowJson(workflowJson)
        .filter((nodeType) => !availableNodeTypes.has(nodeType));
};

const resolveModelPresetForWorkflow = (
    workflow: RegisteredWorkflow,
    preferredModelPresetId?: string
): ComfyModelPreset => {
    const presets = comfyWorkflowRegistry.getModelPresetsForWorkflow(workflow.id)
        .filter((preset) => !preset.supportedTasks || preset.supportedTasks.includes(workflow.task));

    const preferred = preferredModelPresetId
        ? presets.find((preset) => preset.id === preferredModelPresetId)
        : undefined;
    const workflowDefault = workflow.defaultModelPresetId
        ? presets.find((preset) => preset.id === workflow.defaultModelPresetId)
        : undefined;

    const selected = preferred || workflowDefault || presets[0];
    if (!selected) {
        throw new Error(`Workflow "${workflow.id}" does not have a compatible model preset.`);
    }

    return selected;
};

export interface ComfyWorkflowCompatibilityRecord {
    workflowId: string;
    workflowName: string;
    task: ComfyTask;
    requiredNodeTypes: string[];
    missingNodeTypes: string[];
    compatible: boolean;
}

export interface ComfyServerCatalogSnapshot {
    serverUrl: string;
    transportKind: 'local' | 'cloud';
    detectedVersion: string;
    workflowCount: number;
    compatibleWorkflowCount: number;
    records: ComfyWorkflowCompatibilityRecord[];
}

const extractNodeTypesFromWorkflowJson = (workflowJson: Record<string, unknown>): string[] => {
    const nodeTypes = new Set<string>();
    for (const rawNode of Object.values(workflowJson)) {
        if (typeof rawNode !== 'object' || rawNode === null) {
            continue;
        }

        const classType = (rawNode as { class_type?: unknown }).class_type;
        if (typeof classType === 'string' && classType.trim().length > 0) {
            nodeTypes.add(classType);
        }
    }

    return Array.from(nodeTypes);
};

const detectComfyVersion = (
    features: Record<string, unknown> | null,
    systemStats: Record<string, unknown> | null
): string => {
    const fromFeatures = features?.version;
    if (typeof fromFeatures === 'string' && fromFeatures.trim().length > 0) {
        return fromFeatures;
    }

    const fromSystemStats = (systemStats?.system as { comfyui_version?: unknown } | undefined)?.comfyui_version;
    if (typeof fromSystemStats === 'string' && fromSystemStats.trim().length > 0) {
        return fromSystemStats;
    }

    return 'unknown';
};

const uploadAssetIfNeeded = async (
    client: ComfyUIClient,
    value: unknown,
    filename: string
): Promise<unknown> => {
    if (typeof value !== 'string' || !value.startsWith('data:')) {
        return value;
    }

    return client.uploadImage(value, filename);
};

export const prepareComfyTask = async (options: PrepareComfyTaskOptions): Promise<PreparedComfyTaskExecution> => {
    ensureComfyWorkflowCatalogRegistered();

    const resolvedTransport = await resolveAvailableComfyTransport(
        options.connection || {
            mode: 'local',
            localUrl: options.serverUrl,
        }
    );
    const client = new ComfyUIClient(resolvedTransport);
    let selection = comfyWorkflowRegistry.resolveWorkflowSelection({
        task: options.task,
        workflowId: options.workflowId,
        modelPresetId: options.modelPresetId,
    });

    const params: ComfyWorkflowVariableParams = {
        ...options.params,
    };

    params.image = await uploadAssetIfNeeded(client, params.image, 'image-express-input.png') as string | undefined;
    params.mask = await uploadAssetIfNeeded(client, params.mask, 'image-express-mask.png') as string | undefined;

    let workflowJson = await prepareWorkflowBlueprint(selection.workflow, params, selection.modelPreset);

    const objectInfo = await client.getObjectInfoSnapshot();
    if (objectInfo && typeof objectInfo === 'object') {
        const missingNodeTypes = findMissingNodeTypes(workflowJson, objectInfo);

        if (missingNodeTypes.length > 0) {
            const candidates = comfyWorkflowRegistry.getWorkflowsForTask(options.task)
                .filter((workflow) => workflow.id !== selection.workflow.id);

            let resolvedFallback = false;
            for (const candidateWorkflow of candidates) {
                const candidateModelPreset = resolveModelPresetForWorkflow(candidateWorkflow, options.modelPresetId);
                const candidateBlueprint = await prepareWorkflowBlueprint(candidateWorkflow, params, candidateModelPreset);
                const candidateMissing = findMissingNodeTypes(candidateBlueprint, objectInfo);
                if (candidateMissing.length === 0) {
                    selection = {
                        workflow: candidateWorkflow,
                        modelPreset: candidateModelPreset,
                    };
                    workflowJson = candidateBlueprint;
                    resolvedFallback = true;
                    break;
                }
            }

            if (!resolvedFallback) {
                const missingSummary = missingNodeTypes.slice(0, 5).join(', ');
                throw new Error(
                    `Selected ComfyUI workflow "${selection.workflow.id}" requires missing node types: ${missingSummary}. `
                    + 'Install the required custom nodes/models in ComfyUI, or choose a compatible workflow from the list.'
                );
            }
        }
    }

    return {
        client,
        workflow: selection.workflow,
        modelPreset: selection.modelPreset,
        workflowJson,
    };
};

export const executeComfyTask = async (options: ExecuteComfyTaskOptions): Promise<ExecuteComfyTaskResult> => {
    const prepared = await prepareComfyTask(options);
    const result = await prepared.client.executeWorkflow(
        prepared.workflowJson,
        prepared.workflow.outputNodeIds,
        options.onProgress,
        options.onQueued
    );

    return {
        workflow: prepared.workflow,
        modelPreset: prepared.modelPreset,
        result,
    };
};

export const inspectComfyServerCatalog = async (
    options: Omit<PrepareComfyTaskOptions, 'task' | 'params'>
): Promise<ComfyServerCatalogSnapshot> => {
    ensureComfyWorkflowCatalogRegistered();

    const resolvedTransport = await resolveAvailableComfyTransport(
        options.connection || {
            mode: 'local',
            localUrl: options.serverUrl,
        }
    );

    const client = new ComfyUIClient(resolvedTransport);
    const [features, systemStats, objectInfo] = await Promise.all([
        client.getFeaturesSnapshot(),
        client.getSystemStatsSnapshot(),
        client.getObjectInfoSnapshot(),
    ]);

    const availableNodeTypes = new Set<string>(
        objectInfo && typeof objectInfo === 'object'
            ? Object.keys(objectInfo)
            : []
    );

    const workflows = comfyWorkflowRegistry.getAllWorkflows();
    const records: ComfyWorkflowCompatibilityRecord[] = [];

    for (const workflow of workflows) {
        const modelPresets = comfyWorkflowRegistry.getModelPresetsForWorkflow(workflow.id);
        const modelPreset = modelPresets.find((preset) => preset.id === workflow.defaultModelPresetId)
            || modelPresets[0]
            || {
                id: 'default',
                name: 'default',
                description: 'Default',
                inputOverrides: [],
            };

        const blueprint = await prepareWorkflowBlueprint(workflow, {}, modelPreset);
        const requiredNodeTypes = extractNodeTypesFromWorkflowJson(blueprint);
        const missingNodeTypes = requiredNodeTypes.filter((nodeType) => !availableNodeTypes.has(nodeType));

        records.push({
            workflowId: workflow.id,
            workflowName: workflow.name,
            task: workflow.task,
            requiredNodeTypes,
            missingNodeTypes,
            compatible: missingNodeTypes.length === 0,
        });
    }

    return {
        serverUrl: resolvedTransport.baseUrl,
        transportKind: resolvedTransport.kind,
        detectedVersion: detectComfyVersion(features, systemStats),
        workflowCount: records.length,
        compatibleWorkflowCount: records.filter((record) => record.compatible).length,
        records,
    };
};

export interface RecoverComfyTaskOptions {
    connection?: ComfyConnectionOptions;
    serverUrl?: string;
    promptId: string;
    workflowId?: string;
    onProgress?: (progress: ComfyExecutionProgress) => void;
}

export const recoverComfyTaskByPromptId = async (
    options: RecoverComfyTaskOptions
): Promise<ComfyExecutionResult> => {
    ensureComfyWorkflowCatalogRegistered();

    const resolvedTransport = await resolveAvailableComfyTransport(
        options.connection || {
            mode: 'local',
            localUrl: options.serverUrl,
        }
    );

    const client = new ComfyUIClient(resolvedTransport);
    const workflow = options.workflowId
        ? comfyWorkflowRegistry.getWorkflow(options.workflowId)
        : null;
    const outputNodeIds = workflow?.outputNodeIds || [];

    return client.waitForHistoryOutput(
        options.promptId,
        outputNodeIds,
        1800000,
        1000,
        options.onProgress,
        Date.now()
    );
};
