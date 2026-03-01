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
    const blueprint = cloneComfyPromptBlueprint(rawBlueprint);

    applyWorkflowInputBindings(blueprint, workflow.inputBindings, params);
    applyModelPresetToBlueprint(blueprint, modelPreset);

    return blueprint;
};

export const comfyWorkflowRegistry = new WorkflowRegistry();
