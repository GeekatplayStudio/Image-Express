import type {
    ComfyModelPreset,
    ComfyTask,
    RegisteredWorkflow,
    ResolvedWorkflowSelection,
} from './registryTypes';

export type {
    ComfyTask,
    ComfyPromptNode,
    ComfyPromptBlueprint,
    ComfyWorkflowVariableParams,
    ComfyWorkflowInputSource,
    WorkflowInputBinding,
    ComfyNodeInputOverride,
    ComfyModelPreset,
    ComfyWorkflowInstallableModel,
    ComfyWorkflowSetupRequirements,
    RegisteredWorkflow,
    ResolvedWorkflowSelection,
} from './registryTypes';

export {
    normalizeComfyPromptBlueprint,
    cloneComfyPromptBlueprint,
    setComfyNodeInputs,
    applyWorkflowInputBindings,
    readWorkflowInputBindingValues,
    applyModelPresetToBlueprint,
    prepareWorkflowBlueprint,
} from './promptBlueprint';

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

export const comfyWorkflowRegistry = new WorkflowRegistry();
