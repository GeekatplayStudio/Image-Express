import type { ComfyModelPreset, RegisteredWorkflow } from './registryTypes';

/**
 * Custom ComfyUI models: a checkpoint file the user already has, registered so
 * it shows up in the model picker next to the built-in presets.
 *
 * A custom model is a model preset like any other — a set of input overrides on
 * a workflow's loader node — so everything downstream (the picker, the saved
 * per-task choice, the runner) works without knowing it is custom.
 *
 * Guardrails live here rather than in the form, so they hold for anything that
 * calls this module:
 *  - a checkpoint can only be attached to workflows that load a single
 *    checkpoint file. FLUX and Qwen graphs load a UNet, text encoders and a VAE
 *    separately; pointing them at a checkpoint would fail inside ComfyUI with
 *    an error that does not name the cause.
 *  - the file must be a bare filename, not a path, with a model extension.
 *  - when the server's own list of checkpoints is known, the file must be in
 *    it — otherwise the first generation fails after the user has waited.
 */

export const COMFY_CUSTOM_MODELS_STORAGE_KEY = 'image-express-comfy-custom-models';
export const COMFY_CUSTOM_MODELS_CHANGED_EVENT = 'image-express:comfy-custom-models-changed';
export const CUSTOM_MODEL_PRESET_PREFIX = 'custom:';

/** The built-in preset whose loader node a custom checkpoint replaces. */
const CHECKPOINT_PRESET_ID = 'sdxl';
const CHECKPOINT_INPUT = 'ckpt_name';
const MODEL_FILE_PATTERN = /\.(safetensors|ckpt|sft)$/i;

export interface ComfyCustomModel {
    /** `custom:<slug>` — also the model preset id. */
    id: string;
    name: string;
    checkpointFile: string;
    createdAt: string;
}

export type CustomModelIssue =
    | 'name-required'
    | 'file-required'
    | 'file-is-path'
    | 'file-extension'
    | 'duplicate'
    | 'file-not-on-server';

export interface CustomModelDraft {
    name: string;
    checkpointFile: string;
}

const slugify = (value: string) => value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const customModelIdFor = (checkpointFile: string) => `${CUSTOM_MODEL_PRESET_PREFIX}${slugify(checkpointFile) || 'model'}`;

export const isCustomModelPresetId = (presetId: string | undefined | null): boolean => (
    typeof presetId === 'string' && presetId.startsWith(CUSTOM_MODEL_PRESET_PREFIX)
);

/**
 * Everything wrong with a draft, in the order a user should fix it.
 *
 * `availableCheckpoints` is the server's own list; pass null when the server
 * has not been reached, in which case existence cannot be checked and is not.
 */
export function validateCustomModel(
    draft: CustomModelDraft,
    existing: readonly ComfyCustomModel[],
    availableCheckpoints: readonly string[] | null = null,
): CustomModelIssue[] {
    const issues: CustomModelIssue[] = [];
    const name = draft.name.trim();
    const file = draft.checkpointFile.trim();

    if (!name) issues.push('name-required');
    if (!file) {
        issues.push('file-required');
        return issues;
    }
    // ComfyUI resolves the name inside its checkpoints folder. A path would
    // either be refused there or, worse, be an attempt to reach outside it.
    if (/[\\/]/.test(file) || file.includes('..')) {
        issues.push('file-is-path');
        return issues;
    }
    if (!MODEL_FILE_PATTERN.test(file)) issues.push('file-extension');

    const id = customModelIdFor(file);
    if (existing.some((model) => model.id === id || model.checkpointFile.toLowerCase() === file.toLowerCase())) {
        issues.push('duplicate');
    }
    if (availableCheckpoints && !availableCheckpoints.some((entry) => entry.toLowerCase() === file.toLowerCase())) {
        issues.push('file-not-on-server');
    }
    return issues;
}

export function createCustomModel(draft: CustomModelDraft, now: Date = new Date()): ComfyCustomModel {
    const checkpointFile = draft.checkpointFile.trim();
    return {
        id: customModelIdFor(checkpointFile),
        name: draft.name.trim(),
        checkpointFile,
        createdAt: now.toISOString(),
    };
}

const isCustomModel = (value: unknown): value is ComfyCustomModel => {
    if (typeof value !== 'object' || value === null) return false;
    const model = value as Record<string, unknown>;
    return typeof model.id === 'string'
        && model.id.startsWith(CUSTOM_MODEL_PRESET_PREFIX)
        && typeof model.name === 'string'
        && typeof model.checkpointFile === 'string'
        && !/[\\/]/.test(model.checkpointFile);
};

export function loadComfyCustomModels(): ComfyCustomModel[] {
    if (typeof window === 'undefined') return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(COMFY_CUSTOM_MODELS_STORAGE_KEY) || '[]') as unknown;
        return Array.isArray(parsed) ? parsed.filter(isCustomModel) : [];
    } catch {
        return [];
    }
}

export function saveComfyCustomModels(models: readonly ComfyCustomModel[]): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COMFY_CUSTOM_MODELS_STORAGE_KEY, JSON.stringify(models));
    window.dispatchEvent(new Event(COMFY_CUSTOM_MODELS_CHANGED_EVENT));
}

/** The slice of the registry this module needs; lets tests pass a small fake. */
export interface CustomModelRegistry {
    getModelPreset: (id: string) => ComfyModelPreset | undefined;
    getAllWorkflows: () => RegisteredWorkflow[];
    registerModelPreset: (preset: ComfyModelPreset) => void;
    register: (workflow: RegisteredWorkflow) => void;
}

/** Workflows that load one checkpoint file, and so can take a custom one. */
export function checkpointWorkflows(registry: CustomModelRegistry): RegisteredWorkflow[] {
    return registry.getAllWorkflows().filter((workflow) => workflow.modelPresetIds.includes(CHECKPOINT_PRESET_ID));
}

/**
 * Make the registry reflect exactly `models`: register each as a preset on
 * every checkpoint workflow, and drop presets for models that were removed.
 * Idempotent — it is called on startup and again after every change.
 */
export function applyCustomModelsToRegistry(registry: CustomModelRegistry, models: readonly ComfyCustomModel[]): void {
    const template = registry.getModelPreset(CHECKPOINT_PRESET_ID);
    // No checkpoint preset means no workflow here knows how to load one.
    if (!template) return;

    for (const model of models) {
        registry.registerModelPreset({
            id: model.id,
            name: model.name,
            description: `Custom checkpoint: ${model.checkpointFile}`,
            supportedTasks: template.supportedTasks,
            // Same nodes the built-in checkpoint preset patches, with this
            // file — so a workflow's loader node id is never guessed here.
            inputOverrides: template.inputOverrides.map((override) => ({
                nodeId: override.nodeId,
                inputs: CHECKPOINT_INPUT in override.inputs
                    ? { ...override.inputs, [CHECKPOINT_INPUT]: model.checkpointFile }
                    : { ...override.inputs },
            })),
        });
    }

    const wanted = models.map((model) => model.id);
    for (const workflow of checkpointWorkflows(registry)) {
        const builtIn = workflow.modelPresetIds.filter((id) => !isCustomModelPresetId(id));
        const next = [...builtIn, ...wanted];
        if (next.length !== workflow.modelPresetIds.length || next.some((id, index) => id !== workflow.modelPresetIds[index])) {
            registry.register({ ...workflow, modelPresetIds: next });
        }
    }
}

/**
 * Checkpoint files ComfyUI reports it can load, read from its node catalog.
 * Null when the catalog has no checkpoint loader, i.e. the answer is unknown.
 */
export function extractCheckpointNames(objectInfo: unknown): string[] | null {
    if (typeof objectInfo !== 'object' || objectInfo === null) return null;
    const loader = (objectInfo as Record<string, unknown>).CheckpointLoaderSimple as
        { input?: { required?: Record<string, unknown> } } | undefined;
    const spec = loader?.input?.required?.[CHECKPOINT_INPUT];
    const choices = Array.isArray(spec) ? spec[0] : null;
    return Array.isArray(choices) ? choices.filter((entry): entry is string => typeof entry === 'string') : null;
}
