export type ComfyTask =
    | 'generate'
    | 'img2img'
    | 'inpaint'
    | 'outpaint'
    | 'upscale'
    | 'edit'
    | 'multi-reference';

export interface ComfyPromptNode {
    class_type: string;
    inputs: Record<string, unknown>;
    _meta?: Record<string, unknown>;
}

export type ComfyPromptBlueprint = Record<string, ComfyPromptNode>;

export interface ComfyWorkflowVariableParams {
    prompt?: string;
    negativePrompt?: string;
    image?: string;
    mask?: string;
    width?: number;
    height?: number;
    strength?: number;
    seed?: number;
    steps?: number;
    cfg?: number;
    [key: string]: unknown;
}

export type ComfyWorkflowInputSource = keyof ComfyWorkflowVariableParams;

export interface WorkflowInputBinding {
    source: ComfyWorkflowInputSource;
    nodeId: string;
    inputName: string;
}

export interface ComfyNodeInputOverride {
    nodeId: string;
    inputs: Record<string, unknown>;
}

export interface ComfyModelPreset {
    id: string;
    name: string;
    description: string;
    supportedTasks?: ComfyTask[];
    inputOverrides: ComfyNodeInputOverride[];
}

export interface RegisteredWorkflow {
    id: string;
    task: ComfyTask;
    name: string;
    description: string;
    loadBlueprint: () => Promise<ComfyPromptBlueprint> | ComfyPromptBlueprint;
    inputBindings: WorkflowInputBinding[];
    outputNodeIds: string[];
    modelPresetIds: string[];
    defaultModelPresetId?: string;
}

export interface ResolvedWorkflowSelection {
    workflow: RegisteredWorkflow;
    modelPreset: ComfyModelPreset;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

interface EditorGraphInput {
    name?: unknown;
    link?: unknown;
    widget?: {
        name?: unknown;
    };
}

interface EditorGraphNode {
    id?: unknown;
    type?: unknown;
    title?: unknown;
    inputs?: unknown;
    widgets_values?: unknown;
}

interface ParsedEditorGraphLink {
    id: number;
    fromNodeId: string;
    fromOutputSlot: number;
    toNodeId: string;
    toInputSlot: number;
}

const parseEditorGraphLink = (link: unknown): ParsedEditorGraphLink | null => {
    if (Array.isArray(link) && link.length >= 5) {
        const [idRaw, fromNodeRaw, fromSlotRaw, toNodeRaw, toSlotRaw] = link;
        const id = Number(idRaw);
        const fromOutputSlot = Number(fromSlotRaw);
        const toInputSlot = Number(toSlotRaw);
        if (!Number.isFinite(id) || !Number.isFinite(fromOutputSlot) || !Number.isFinite(toInputSlot)) {
            return null;
        }

        return {
            id,
            fromNodeId: String(fromNodeRaw),
            fromOutputSlot,
            toNodeId: String(toNodeRaw),
            toInputSlot,
        };
    }

    if (!isRecord(link)) {
        return null;
    }

    const id = Number(link.id);
    const fromNodeId = String(link.origin_id ?? link.from_id ?? '');
    const fromOutputSlot = Number(link.origin_slot ?? link.from_slot ?? 0);
    const toNodeId = String(link.target_id ?? link.to_id ?? '');
    const toInputSlot = Number(link.target_slot ?? link.to_slot ?? 0);

    if (!Number.isFinite(id) || !fromNodeId || !toNodeId || !Number.isFinite(fromOutputSlot) || !Number.isFinite(toInputSlot)) {
        return null;
    }

    return {
        id,
        fromNodeId,
        fromOutputSlot,
        toNodeId,
        toInputSlot,
    };
};

const convertEditorGraphToPromptBlueprint = (workflowId: string, blueprint: Record<string, unknown>): ComfyPromptBlueprint => {
    const rawNodes = (blueprint as { nodes?: unknown }).nodes;
    const rawLinks = (blueprint as { links?: unknown }).links;
    if (!Array.isArray(rawNodes)) {
        throw new Error(`ComfyUI workflow "${workflowId}" graph is invalid: missing nodes array.`);
    }

    const parsedLinks = Array.isArray(rawLinks)
        ? rawLinks.map(parseEditorGraphLink).filter((item): item is ParsedEditorGraphLink => Boolean(item))
        : [];
    const linkMap = new Map<number, ParsedEditorGraphLink>(parsedLinks.map((link) => [link.id, link]));

    const prompt: ComfyPromptBlueprint = {};

    for (const rawNode of rawNodes) {
        const node = rawNode as EditorGraphNode;
        const nodeId = node.id;
        const classType = node.type;
        if ((typeof nodeId !== 'number' && typeof nodeId !== 'string') || typeof classType !== 'string' || !classType.trim()) {
            continue;
        }

        if (classType === 'MarkdownNote') {
            continue;
        }

        const nodeInputs = Array.isArray(node.inputs) ? node.inputs as EditorGraphInput[] : [];
        const widgetValues = Array.isArray(node.widgets_values) ? node.widgets_values : [];
        let widgetValueIndex = 0;
        const inputs: Record<string, unknown> = {};

        for (const input of nodeInputs) {
            const inputName = typeof input.name === 'string' ? input.name : null;
            if (!inputName) {
                continue;
            }

            const linkId = Number(input.link);
            if (Number.isFinite(linkId) && linkMap.has(linkId)) {
                const connection = linkMap.get(linkId) as ParsedEditorGraphLink;
                inputs[inputName] = [connection.fromNodeId, connection.fromOutputSlot];
                continue;
            }

            const widgetName = typeof input.widget?.name === 'string' ? input.widget.name : null;
            if (widgetName) {
                const widgetValue = widgetValues[widgetValueIndex];
                widgetValueIndex += 1;
                if (widgetValue !== undefined) {
                    inputs[inputName] = widgetValue;
                }
            }
        }

        prompt[String(nodeId)] = {
            class_type: classType,
            inputs,
            _meta: {
                title: typeof node.title === 'string' ? node.title : classType,
            },
        };
    }

    if (Object.keys(prompt).length === 0) {
        throw new Error(
            `ComfyUI workflow "${workflowId}" graph conversion failed: no executable nodes were produced. `
            + 'Export the workflow in API format, or remove UI-only graph nodes.'
        );
    }

    return prompt;
};

const assertPromptBlueprintShape: (
    workflowId: string,
    blueprint: unknown
) => asserts blueprint is ComfyPromptBlueprint = (
    workflowId: string,
    blueprint: unknown
): asserts blueprint is ComfyPromptBlueprint => {
    if (!isRecord(blueprint)) {
        throw new Error(`ComfyUI workflow "${workflowId}" is invalid: blueprint must be an object.`);
    }

    const hasGraphShape = Array.isArray((blueprint as { nodes?: unknown }).nodes)
        && Array.isArray((blueprint as { links?: unknown }).links);

    if (hasGraphShape) {
        throw new Error(
            `ComfyUI workflow "${workflowId}" is in editor graph format, not API prompt format. `
            + 'Export the workflow in API format before registering it in this app.'
        );
    }

    const entries = Object.entries(blueprint);
    if (entries.length === 0) {
        throw new Error(`ComfyUI workflow "${workflowId}" is empty.`);
    }

    for (const [nodeId, node] of entries) {
        if (!isRecord(node) || typeof node.class_type !== 'string' || !isRecord(node.inputs)) {
            throw new Error(
                `ComfyUI workflow "${workflowId}" has an invalid node shape at "${nodeId}". `
                + 'Each node must include class_type and inputs.'
            );
        }
    }
};

const normalizePromptBlueprint = (workflowId: string, blueprint: unknown): ComfyPromptBlueprint => {
    if (!isRecord(blueprint)) {
        throw new Error(`ComfyUI workflow "${workflowId}" is invalid: blueprint must be an object.`);
    }

    const hasGraphShape = Array.isArray((blueprint as { nodes?: unknown }).nodes)
        && Array.isArray((blueprint as { links?: unknown }).links);

    if (hasGraphShape) {
        const converted = convertEditorGraphToPromptBlueprint(workflowId, blueprint);
        assertPromptBlueprintShape(workflowId, converted);
        return converted;
    }

    assertPromptBlueprintShape(workflowId, blueprint);
    return blueprint;
};

export const normalizeComfyPromptBlueprint = normalizePromptBlueprint;

class WorkflowRegistry {
    private workflows: Map<string, RegisteredWorkflow> = new Map();
    private modelPresets: Map<string, ComfyModelPreset> = new Map();

    register(workflow: RegisteredWorkflow) {
        this.workflows.set(workflow.id, workflow);
    }

    registerModelPreset(preset: ComfyModelPreset) {
        this.modelPresets.set(preset.id, preset);
    }

    getWorkflow(id: string): RegisteredWorkflow | undefined {
        return this.workflows.get(id);
    }

    getWorkflowsForTask(task: ComfyTask): RegisteredWorkflow[] {
        return Array.from(this.workflows.values()).filter((workflow) => workflow.task === task);
    }

    getAllWorkflows(): RegisteredWorkflow[] {
        return Array.from(this.workflows.values());
    }

    getModelPreset(id: string): ComfyModelPreset | undefined {
        return this.modelPresets.get(id);
    }

    getAllModelPresets(): ComfyModelPreset[] {
        return Array.from(this.modelPresets.values());
    }

    getModelPresetsForWorkflow(workflowId: string): ComfyModelPreset[] {
        const workflow = this.getWorkflow(workflowId);
        if (!workflow) return [];

        return workflow.modelPresetIds
            .map((presetId) => this.getModelPreset(presetId))
            .filter((preset): preset is ComfyModelPreset => Boolean(preset));
    }

    resolveWorkflowSelection(options: {
        task: ComfyTask;
        workflowId?: string;
        modelPresetId?: string;
    }): ResolvedWorkflowSelection {
        const workflow = options.workflowId
            ? this.getWorkflow(options.workflowId)
            : this.getWorkflowsForTask(options.task)[0];

        if (!workflow) {
            throw new Error(`No ComfyUI workflow is registered for task "${options.task}".`);
        }

        const compatibleModelPresets = this.getModelPresetsForWorkflow(workflow.id)
            .filter((preset) => !preset.supportedTasks || preset.supportedTasks.includes(workflow.task));

        const preferredModelPreset = options.modelPresetId
            ? compatibleModelPresets.find((preset) => preset.id === options.modelPresetId)
            : undefined;

        const defaultModelPreset = workflow.defaultModelPresetId
            ? compatibleModelPresets.find((preset) => preset.id === workflow.defaultModelPresetId)
            : undefined;

        const modelPreset = preferredModelPreset || defaultModelPreset || compatibleModelPresets[0];

        if (!modelPreset) {
            throw new Error(`Workflow "${workflow.id}" does not have a compatible model preset.`);
        }

        return { workflow, modelPreset };
    }
}

export const cloneComfyPromptBlueprint = (blueprint: ComfyPromptBlueprint): ComfyPromptBlueprint => (
    JSON.parse(JSON.stringify(blueprint)) as ComfyPromptBlueprint
);

export const setComfyNodeInputs = (
    blueprint: ComfyPromptBlueprint,
    nodeId: string,
    inputs: Record<string, unknown>
): ComfyPromptBlueprint => {
    const node = blueprint[nodeId];
    if (!node) {
        throw new Error(`ComfyUI workflow is missing node "${nodeId}".`);
    }

    node.inputs = {
        ...node.inputs,
        ...inputs,
    };

    return blueprint;
};

export const applyWorkflowInputBindings = (
    blueprint: ComfyPromptBlueprint,
    bindings: WorkflowInputBinding[],
    params: ComfyWorkflowVariableParams
): ComfyPromptBlueprint => {
    for (const binding of bindings) {
        const value = params[binding.source];
        if (value === undefined || value === null || value === '') {
            continue;
        }

        setComfyNodeInputs(blueprint, binding.nodeId, {
            [binding.inputName]: value,
        });
    }

    return blueprint;
};

export const applyModelPresetToBlueprint = (
    blueprint: ComfyPromptBlueprint,
    modelPreset: ComfyModelPreset
): ComfyPromptBlueprint => {
    for (const override of modelPreset.inputOverrides) {
        setComfyNodeInputs(blueprint, override.nodeId, override.inputs);
    }

    return blueprint;
};

export const prepareWorkflowBlueprint = async (
    workflow: RegisteredWorkflow,
    params: ComfyWorkflowVariableParams,
    modelPreset: ComfyModelPreset
): Promise<ComfyPromptBlueprint> => {
    const rawBlueprint = await workflow.loadBlueprint();
    const normalizedBlueprint = normalizePromptBlueprint(workflow.id, rawBlueprint);
    const blueprint = cloneComfyPromptBlueprint(normalizedBlueprint);

    applyWorkflowInputBindings(blueprint, workflow.inputBindings, params);
    applyModelPresetToBlueprint(blueprint, modelPreset);

    return blueprint;
};

export const comfyWorkflowRegistry = new WorkflowRegistry();
