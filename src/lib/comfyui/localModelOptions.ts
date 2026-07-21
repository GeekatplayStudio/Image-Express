import { comfyWorkflowRegistry, type ComfyTask } from '@/lib/comfyui/registry';

export interface ComfyTaskModelOption {
    id: string;
    workflowId: string;
    workflowName: string;
    modelPresetId: string;
    /** Model name (SDXL Base, FLUX.1 Dev, …) — a proper noun, never translated. */
    label: string;
    /**
     * Description to render. Curated entries carry a dictionary key; anything
     * discovered at runtime falls back to the workflow's own English text,
     * which has no key because it comes from the installed workflow file.
     */
    descriptionKey?: string;
    description: string;
    memoryLabel?: string;
    sortOrder: number;
}

type CuratedModelOptionDefinition = {
    modelName: string;
    descriptionKey: string;
    memoryLabel?: string;
    sortOrder: number;
};

const CURATED_MODEL_OPTIONS: Record<string, CuratedModelOptionDefinition> = {
    'generate-basic::sdxl': {
        modelName: 'SDXL Base',
        descriptionKey: 'comfyModel.sdxlBase',
        memoryLabel: '8+ GB VRAM',
        sortOrder: 10,
    },
    'image_flux2_text_to_image::flux-dev': {
        modelName: 'FLUX.1 Dev',
        descriptionKey: 'comfyModel.fluxDev',
        memoryLabel: '16+ GB VRAM',
        sortOrder: 20,
    },
    'image_flux2_text_to_image::flux-schnell': {
        modelName: 'FLUX.1 Schnell',
        descriptionKey: 'comfyModel.fluxSchnell',
        memoryLabel: '12+ GB VRAM',
        sortOrder: 30,
    },
    'image_flux2_text_to_image_9b::default': {
        modelName: 'FLUX 2 9B',
        descriptionKey: 'comfyModel.flux2_9b',
        memoryLabel: '18+ GB VRAM',
        sortOrder: 40,
    },
    'image_qwen_image_2512_with_2steps_lora::default': {
        modelName: 'Qwen Image 2512',
        descriptionKey: 'comfyModel.qwen2512',
        memoryLabel: '14+ GB VRAM',
        sortOrder: 50,
    },
    'img2img-sdxl::sdxl': {
        modelName: 'SDXL Reimage',
        descriptionKey: 'comfyModel.sdxlReimage',
        memoryLabel: '8+ GB VRAM',
        sortOrder: 10,
    },
    'image_flux2_klein_image_edit_4b_base::default': {
        modelName: 'Z Image Turbo / FLUX 2 Klein 4B',
        descriptionKey: 'comfyModel.klein4b',
        memoryLabel: '10+ GB VRAM',
        sortOrder: 20,
    },
    'image_flux2_klein_image_edit_9b_base::default': {
        modelName: 'FLUX 2 Klein 9B',
        descriptionKey: 'comfyModel.klein9b',
        memoryLabel: '18+ GB VRAM',
        sortOrder: 30,
    },
    'inpaint-sdxl::sdxl': {
        modelName: 'SDXL Inpaint',
        descriptionKey: 'comfyModel.sdxlInpaint',
        memoryLabel: '8+ GB VRAM',
        sortOrder: 10,
    },
    'outpaint-sdxl::sdxl': {
        modelName: 'SDXL Outpaint',
        descriptionKey: 'comfyModel.sdxlOutpaint',
        memoryLabel: '8+ GB VRAM',
        sortOrder: 10,
    },
    'upscale-image::default': {
        modelName: 'Lanczos Upscale',
        descriptionKey: 'comfyModel.lanczos',
        memoryLabel: 'Low VRAM',
        sortOrder: 10,
    },
};

const buildFallbackLabel = (workflowName: string, modelPresetName: string): string => {
    if (modelPresetName === 'Workflow Default') {
        return workflowName;
    }

    return `${workflowName} - ${modelPresetName}`;
};

export const buildComfyTaskModelOptions = (
    task: ComfyTask,
    workflowIds: string[],
): ComfyTaskModelOption[] => {
    const resolvedWorkflowIds = workflowIds.length > 0
        ? workflowIds
        : comfyWorkflowRegistry.getWorkflowsForTask(task).map((workflow) => workflow.id);

    const options: ComfyTaskModelOption[] = [];
    for (const workflowId of resolvedWorkflowIds) {
        const workflow = comfyWorkflowRegistry.getWorkflow(workflowId);
        if (!workflow) {
            continue;
        }

        for (const modelPreset of comfyWorkflowRegistry.getModelPresetsForWorkflow(workflowId)) {
            const optionId = `${workflow.id}::${modelPreset.id}`;
            const curated = CURATED_MODEL_OPTIONS[optionId];

            options.push({
                id: optionId,
                workflowId: workflow.id,
                workflowName: workflow.name,
                modelPresetId: modelPreset.id,
                label: curated?.modelName || buildFallbackLabel(workflow.name, modelPreset.name),
                descriptionKey: curated?.descriptionKey,
                description: workflow.description,
                memoryLabel: curated?.memoryLabel,
                sortOrder: curated?.sortOrder ?? 1000,
            });
        }
    }

    return options.sort((left, right) => {
        const orderDelta = left.sortOrder - right.sortOrder;
        if (orderDelta !== 0) {
            return orderDelta;
        }

        return left.label.localeCompare(right.label);
    });
};

export const findComfyTaskModelOption = (
    task: ComfyTask,
    workflowIds: string[],
    workflowId: string,
    modelPresetId: string,
): ComfyTaskModelOption | null => (
    buildComfyTaskModelOptions(task, workflowIds)
        .find((option) => option.workflowId === workflowId && option.modelPresetId === modelPresetId)
        || null
);