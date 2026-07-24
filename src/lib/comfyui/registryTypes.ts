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

export interface ComfyWorkflowInstallableModel {
    name: string;
    downloadUrl: string;
    directory: string;
}

export interface ComfyWorkflowSetupRequirements {
    models?: ComfyWorkflowInstallableModel[];
    updateInstallForMissingNodes?: boolean;
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
    setupRequirements?: ComfyWorkflowSetupRequirements;
}

export interface ResolvedWorkflowSelection {
    workflow: RegisteredWorkflow;
    modelPreset: ComfyModelPreset;
}
