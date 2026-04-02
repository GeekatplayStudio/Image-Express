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
    type ComfyWorkflowInstallableModel,
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

interface WorkflowNodeDescriptor {
    classType: string;
    inputs: Record<string, unknown>;
}

interface EditorGraphInputDescriptor {
    name?: unknown;
    widget?: {
        name?: unknown;
    };
    link?: unknown;
}

interface EditorGraphNodeDescriptor {
    type?: unknown;
    inputs?: unknown;
    widgets_values?: unknown;
    properties?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

const isEditorGraphBlueprint = (value: unknown): value is Record<string, unknown> => (
    isRecord(value)
    && Array.isArray(value.nodes)
    && Array.isArray(value.links)
);

const collectEditorSubgraphMap = (
    graph: Record<string, unknown>,
    subgraphs = new Map<string, Record<string, unknown>>()
): Map<string, Record<string, unknown>> => {
    const definitions = isRecord(graph.definitions) ? graph.definitions as Record<string, unknown> : null;
    const nestedSubgraphs = Array.isArray(definitions?.subgraphs)
        ? definitions.subgraphs as Array<Record<string, unknown>>
        : [];

    for (const subgraph of nestedSubgraphs) {
        const subgraphId = typeof subgraph.id === 'string' ? subgraph.id : '';
        if (!subgraphId || subgraphs.has(subgraphId)) {
            continue;
        }

        subgraphs.set(subgraphId, subgraph);
        collectEditorSubgraphMap(subgraph, subgraphs);
    }

    return subgraphs;
};

const resolveEditorGraphNodeClassType = (rawNode: EditorGraphNodeDescriptor): string => {
    const properties = isRecord(rawNode.properties) ? rawNode.properties as Record<string, unknown> : null;
    const searchAndReplaceName = typeof properties?.['Node name for S&R'] === 'string'
        ? properties['Node name for S&R'].trim()
        : '';
    if (searchAndReplaceName.length > 0) {
        return searchAndReplaceName;
    }

    return typeof rawNode.type === 'string' ? rawNode.type.trim() : '';
};

const extractEditorGraphNodeInputs = (rawNode: EditorGraphNodeDescriptor): Record<string, unknown> => {
    const nodeInputs = Array.isArray(rawNode.inputs) ? rawNode.inputs as EditorGraphInputDescriptor[] : [];
    const widgetValues = Array.isArray(rawNode.widgets_values) ? rawNode.widgets_values : [];
    const inputs: Record<string, unknown> = {};
    let widgetValueIndex = 0;

    for (const input of nodeInputs) {
        const inputName = typeof input.name === 'string' ? input.name : null;
        if (!inputName) {
            continue;
        }

        if (input.link !== null && input.link !== undefined && Number.isFinite(Number(input.link))) {
            continue;
        }

        const widgetName = typeof input.widget?.name === 'string' ? input.widget.name : null;
        if (!widgetName) {
            continue;
        }

        const widgetValue = widgetValues[widgetValueIndex];
        widgetValueIndex += 1;
        if (widgetValue !== undefined) {
            inputs[inputName] = widgetValue;
        }
    }

    return inputs;
};

const extractWorkflowNodesFromEditorGraph = (
    graph: Record<string, unknown>,
    subgraphMap = collectEditorSubgraphMap(graph),
    visitedSubgraphs = new Set<string>()
): WorkflowNodeDescriptor[] => {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes as EditorGraphNodeDescriptor[] : [];
    const workflowNodes: WorkflowNodeDescriptor[] = [];

    for (const rawNode of nodes) {
        const rawType = typeof rawNode.type === 'string' ? rawNode.type.trim() : '';
        if (!rawType || rawType === 'MarkdownNote') {
            continue;
        }

        const subgraph = subgraphMap.get(rawType);
        if (subgraph) {
            if (visitedSubgraphs.has(rawType)) {
                continue;
            }

            visitedSubgraphs.add(rawType);
            workflowNodes.push(...extractWorkflowNodesFromEditorGraph(subgraph, subgraphMap, visitedSubgraphs));
            visitedSubgraphs.delete(rawType);
            continue;
        }

        const classType = resolveEditorGraphNodeClassType(rawNode);
        if (!classType) {
            continue;
        }

        workflowNodes.push({
            classType,
            inputs: extractEditorGraphNodeInputs(rawNode),
        });
    }

    return workflowNodes;
};

const extractWorkflowNodesFromPromptBlueprint = (workflowJson: Record<string, unknown>): WorkflowNodeDescriptor[] => {
    const workflowNodes: WorkflowNodeDescriptor[] = [];

    for (const rawNode of Object.values(workflowJson)) {
        if (!isRecord(rawNode)) {
            continue;
        }

        const classType = typeof rawNode.class_type === 'string' ? rawNode.class_type.trim() : '';
        const inputs = isRecord(rawNode.inputs) ? rawNode.inputs as Record<string, unknown> : null;
        if (!classType || !inputs) {
            continue;
        }

        workflowNodes.push({ classType, inputs });
    }

    return workflowNodes;
};

const extractWorkflowNodes = (workflowBlueprint: Record<string, unknown>): WorkflowNodeDescriptor[] => (
    isEditorGraphBlueprint(workflowBlueprint)
        ? extractWorkflowNodesFromEditorGraph(workflowBlueprint)
        : extractWorkflowNodesFromPromptBlueprint(workflowBlueprint)
);

const extractRequiredNodeTypesFromWorkflowJson = (workflowJson: Record<string, unknown>): string[] => {
    const required = new Set<string>();

    for (const node of extractWorkflowNodes(workflowJson)) {
        if (node.classType.trim().length > 0) {
            required.add(node.classType);
        }
    }

    return Array.from(required);
};

const MODEL_INPUT_NAME_PATTERN = /(?:^|_)(?:ckpt|checkpoint|model|unet|clip|vae|lora|controlnet|text_encoder|diffusion_model)(?:_|$)|name$/i;

const extractStringChoices = (inputDefinition: unknown): string[] => {
    if (!Array.isArray(inputDefinition)) {
        return [];
    }

    const directChoices = inputDefinition.find((entry) => (
        Array.isArray(entry) && entry.every((item) => typeof item === 'string')
    )) as string[] | undefined;
    if (directChoices && directChoices.length > 0) {
        return directChoices;
    }

    const objectEntry = inputDefinition.find((entry) => isRecord(entry));
    if (!objectEntry || !isRecord(objectEntry)) {
        return [];
    }

    const candidate = objectEntry.choices
        || objectEntry.options
        || objectEntry.values
        || objectEntry.items;

    if (Array.isArray(candidate) && candidate.every((item) => typeof item === 'string')) {
        return candidate;
    }

    return [];
};

const findMissingInstallableModels = (
    workflowJson: Record<string, unknown>,
    objectInfo: Record<string, unknown>,
    installableModels: ComfyWorkflowInstallableModel[]
): ComfyWorkflowInstallableModel[] => {
    if (installableModels.length === 0) {
        return [];
    }

    const installableByName = new Map(installableModels.map((model) => [model.name, model]));
    const missing = new Map<string, ComfyWorkflowInstallableModel>();

    for (const node of extractWorkflowNodes(workflowJson)) {
        const classType = node.classType;
        const inputs = node.inputs;
        if (!classType || !inputs) {
            continue;
        }

        const nodeInfo = isRecord(objectInfo[classType]) ? objectInfo[classType] as Record<string, unknown> : null;
        const inputInfo = nodeInfo && isRecord(nodeInfo.input) ? nodeInfo.input as Record<string, unknown> : null;
        if (!inputInfo) {
            continue;
        }

        const allInputDefs: Record<string, unknown> = {
            ...(isRecord(inputInfo.required) ? inputInfo.required as Record<string, unknown> : {}),
            ...(isRecord(inputInfo.optional) ? inputInfo.optional as Record<string, unknown> : {}),
        };

        for (const [inputName, configuredValue] of Object.entries(inputs)) {
            if (typeof configuredValue !== 'string' || !MODEL_INPUT_NAME_PATTERN.test(inputName)) {
                continue;
            }

            const installableModel = installableByName.get(configuredValue);
            if (!installableModel) {
                continue;
            }

            const choices = extractStringChoices(allInputDefs[inputName]);
            if (choices.length === 0 || choices.includes(configuredValue)) {
                continue;
            }

            missing.set(`${installableModel.directory}/${installableModel.name}`.toLowerCase(), installableModel);
        }
    }

    return Array.from(missing.values());
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
    missingModels: ComfyWorkflowInstallableModel[];
    compatible: boolean;
    canAutoUpdateInstall: boolean;
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
    for (const node of extractWorkflowNodes(workflowJson)) {
        if (node.classType.trim().length > 0) {
            nodeTypes.add(node.classType);
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

        const rawBlueprint = await workflow.loadBlueprint() as unknown;
        const blueprint = isRecord(rawBlueprint)
            ? rawBlueprint as Record<string, unknown>
            : await prepareWorkflowBlueprint(workflow, {}, modelPreset);
        const requiredNodeTypes = extractNodeTypesFromWorkflowJson(blueprint);
        const missingNodeTypes = requiredNodeTypes.filter((nodeType) => !availableNodeTypes.has(nodeType));
        const missingModels = objectInfo && typeof objectInfo === 'object'
            ? findMissingInstallableModels(blueprint, objectInfo, workflow.setupRequirements?.models || [])
            : [];

        records.push({
            workflowId: workflow.id,
            workflowName: workflow.name,
            task: workflow.task,
            requiredNodeTypes,
            missingNodeTypes,
            missingModels,
            compatible: missingNodeTypes.length === 0 && missingModels.length === 0,
            canAutoUpdateInstall: Boolean(workflow.setupRequirements?.updateInstallForMissingNodes),
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
