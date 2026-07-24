import {
    comfyWorkflowRegistry,
    type ComfyModelPreset,
    type ComfyWorkflowInstallableModel,
    type RegisteredWorkflow,
} from '@/lib/comfyui/registry';

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

export const isRecord = (value: unknown): value is Record<string, unknown> => (
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

export const findMissingInstallableModels = (
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

export const findMissingNodeTypes = (
    workflowJson: Record<string, unknown>,
    objectInfo: Record<string, unknown>
): string[] => {
    const availableNodeTypes = new Set(Object.keys(objectInfo));
    return extractRequiredNodeTypesFromWorkflowJson(workflowJson)
        .filter((nodeType) => !availableNodeTypes.has(nodeType));
};

export const resolveModelPresetForWorkflow = (
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

export const extractNodeTypesFromWorkflowJson = (workflowJson: Record<string, unknown>): string[] => {
    const nodeTypes = new Set<string>();
    for (const node of extractWorkflowNodes(workflowJson)) {
        if (node.classType.trim().length > 0) {
            nodeTypes.add(node.classType);
        }
    }

    return Array.from(nodeTypes);
};

export const detectComfyVersion = (
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
