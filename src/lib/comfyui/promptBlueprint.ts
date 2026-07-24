import type {
    ComfyModelPreset,
    ComfyPromptBlueprint,
    ComfyWorkflowInputSource,
    ComfyWorkflowVariableParams,
    RegisteredWorkflow,
    WorkflowInputBinding,
} from './registryTypes';

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

/**
 * Marker for widgets_values slots that exist in the editor graph but are not
 * API inputs (e.g. the "control_after_generate" dropdown next to seed).
 */
const WIDGET_SKIP = '__skip__';

/**
 * Widget order for ComfyUI core nodes. Newer editor-graph exports list only
 * LINKED inputs in a node's `inputs` array — widget-backed inputs are implied
 * by `widgets_values` order. Without this table those values are dropped and
 * the server rejects the prompt with "Required input is missing".
 */
const CORE_NODE_WIDGET_ORDER: Record<string, string[]> = {
    KSampler: ['seed', WIDGET_SKIP, 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'],
    KSamplerAdvanced: ['add_noise', 'noise_seed', WIDGET_SKIP, 'steps', 'cfg', 'sampler_name', 'scheduler', 'start_at_step', 'end_at_step', 'return_with_leftover_noise'],
    RandomNoise: ['noise_seed', WIDGET_SKIP],
    BasicScheduler: ['scheduler', 'steps', 'denoise'],
    KSamplerSelect: ['sampler_name'],
    CLIPTextEncode: ['text'],
    CLIPLoader: ['clip_name', 'type', 'device'],
    DualCLIPLoader: ['clip_name1', 'clip_name2', 'type', 'device'],
    TripleCLIPLoader: ['clip_name1', 'clip_name2', 'clip_name3'],
    UNETLoader: ['unet_name', 'weight_dtype'],
    VAELoader: ['vae_name'],
    CheckpointLoaderSimple: ['ckpt_name'],
    LoraLoader: ['lora_name', 'strength_model', 'strength_clip'],
    LoraLoaderModelOnly: ['lora_name', 'strength_model'],
    EmptyLatentImage: ['width', 'height', 'batch_size'],
    EmptySD3LatentImage: ['width', 'height', 'batch_size'],
    SaveImage: ['filename_prefix'],
    LoadImage: ['image', WIDGET_SKIP],
    LoadImageMask: ['image', 'channel', WIDGET_SKIP],
    ModelSamplingAuraFlow: ['shift'],
    ModelSamplingSD3: ['shift'],
    ModelSamplingFlux: ['max_shift', 'base_shift', 'width', 'height'],
    FluxGuidance: ['guidance'],
    ImageScale: ['upscale_method', 'width', 'height', 'crop'],
    ImageScaleBy: ['upscale_method', 'scale_by'],
    CLIPSetLastLayer: ['stop_at_clip_layer'],
    ConditioningSetTimestepRange: ['start', 'end'],
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

        // Newer editor-graph exports list only linked inputs; widget values are
        // implied by position. Map them via the core-node widget order so the
        // API prompt keeps seed/steps/text/model names instead of dropping them.
        if (widgetValueIndex === 0 && widgetValues.length > 0) {
            const widgetOrder = CORE_NODE_WIDGET_ORDER[classType];
            if (widgetOrder) {
                widgetOrder.forEach((widgetName, index) => {
                    if (widgetName === WIDGET_SKIP) return;
                    if (inputs[widgetName] !== undefined) return; // linked input wins
                    const widgetValue = widgetValues[index];
                    if (widgetValue !== undefined) {
                        inputs[widgetName] = widgetValue;
                    }
                });
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

export const readWorkflowInputBindingValues = (
    blueprint: ComfyPromptBlueprint,
    bindings: WorkflowInputBinding[]
): Partial<Record<ComfyWorkflowInputSource, unknown[]>> => {
    const values: Partial<Record<ComfyWorkflowInputSource, unknown[]>> = {};

    for (const binding of bindings) {
        const node = blueprint[binding.nodeId];
        if (!node) {
            continue;
        }

        const value = node.inputs[binding.inputName];
        if (value === undefined) {
            continue;
        }

        const currentValues = values[binding.source] || [];
        values[binding.source] = [...currentValues, value];
    }

    return values;
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
