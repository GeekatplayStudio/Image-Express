export type ComfyTask = 'upscale' | 'inpaint' | 'generate' | 'edit';
export type ModelPreset = 'flux-dev' | 'flux-schnell' | 'qwen' | 'sdxl' | 'default';

export interface ComfyWorkflowVariableParams {
    prompt?: string;
    negativePrompt?: string;
    image?: string; // base64 or filename
    mask?: string; // base64 or filename
    width?: number;
    height?: number;
    seed?: number;
    model: ModelPreset;
}

export interface RegisteredWorkflow {
    id: string;
    task: ComfyTask;
    name: string;
    description: string;
    /**
     * Load the workflow API JSON blueprint.
     */
    loadBlueprint: () => Promise<any> | any;
    /**
     * Inject variables into the raw workflow JSON to prepare it for execution.
     */
    injectVariables: (blueprint: any, params: ComfyWorkflowVariableParams) => any;
    /**
     * The node ID (or node IDs) that will generate the final image output.
     * This tells the client which nodes to wait for completion.
     */
    outputNodeIds: string[];
}

class WorkflowRegistry {
    private workflows: Map<string, RegisteredWorkflow> = new Map();

    register(workflow: RegisteredWorkflow) {
        this.workflows.set(workflow.id, workflow);
    }

    getWorkflow(id: string): RegisteredWorkflow | undefined {
        return this.workflows.get(id);
    }

    getWorkflowsForTask(task: ComfyTask): RegisteredWorkflow[] {
        return Array.from(this.workflows.values()).filter(w => w.task === task);
    }

    getAllWorkflows(): RegisteredWorkflow[] {
        return Array.from(this.workflows.values());
    }
}

export const comfyWorkflowRegistry = new WorkflowRegistry();
