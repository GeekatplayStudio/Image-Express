import { comfyWorkflowRegistry, type ComfyTask } from '@/lib/comfyui/registry';

export interface ComfyTaskModelOption {
    id: string;
    workflowId: string;
    workflowName: string;
    modelPresetId: string;
    label: string;
    description: string;
    memoryLabel?: string;
    sortOrder: number;
}

type CuratedModelOptionDefinition = {
    label: string;
    description: string;
    memoryLabel?: string;
    sortOrder: number;
};

const CURATED_MODEL_OPTIONS: Record<string, CuratedModelOptionDefinition> = {
    'generate-basic::sdxl': {
        label: 'SDXL Base',
        description: 'Starter local text-to-image profile for general prompts, reimagine, inpaint, and outpaint flows.',
        memoryLabel: '8+ GB VRAM',
        sortOrder: 10,
    },
    'image_flux2_text_to_image::flux-dev': {
        label: 'FLUX.1 Dev',
        description: 'Higher-fidelity FLUX text-to-image stack with the full dev model set.',
        memoryLabel: '16+ GB VRAM',
        sortOrder: 20,
    },
    'image_flux2_text_to_image::flux-schnell': {
        label: 'FLUX.1 Schnell',
        description: 'Faster FLUX text-to-image profile with lower step counts and lighter encoder requirements.',
        memoryLabel: '12+ GB VRAM',
        sortOrder: 30,
    },
    'image_flux2_text_to_image_9b::default': {
        label: 'FLUX 2 9B',
        description: 'Template-driven FLUX 2 text-to-image workflow with installable model metadata baked into the graph.',
        memoryLabel: '18+ GB VRAM',
        sortOrder: 40,
    },
    'image_qwen_image_2512_with_2steps_lora::default': {
        label: 'Qwen Image 2512',
        description: 'Qwen image generation template with bundled text encoder, diffusion model, VAE, and LoRA metadata.',
        memoryLabel: '14+ GB VRAM',
        sortOrder: 50,
    },
    'img2img-sdxl::sdxl': {
        label: 'SDXL Reimage',
        description: 'General image-to-image and style-translation starting point with the SDXL base checkpoint.',
        memoryLabel: '8+ GB VRAM',
        sortOrder: 10,
    },
    'image_flux2_klein_image_edit_4b_base::default': {
        label: 'Z Image Turbo / FLUX 2 Klein 4B',
        description: 'Task-oriented image editing profile with workflow-managed Klein 4B, Z Image, and VAE downloads.',
        memoryLabel: '10+ GB VRAM',
        sortOrder: 20,
    },
    'image_flux2_klein_image_edit_9b_base::default': {
        label: 'FLUX 2 Klein 9B',
        description: 'Heavier image-edit profile for higher-capacity FLUX 2 Klein work.',
        memoryLabel: '18+ GB VRAM',
        sortOrder: 30,
    },
    'inpaint-sdxl::sdxl': {
        label: 'SDXL Inpaint',
        description: 'Mask-guided fill profile using the SDXL base checkpoint.',
        memoryLabel: '8+ GB VRAM',
        sortOrder: 10,
    },
    'outpaint-sdxl::sdxl': {
        label: 'SDXL Outpaint',
        description: 'Canvas extension profile using the SDXL base checkpoint and generated outpaint masks.',
        memoryLabel: '8+ GB VRAM',
        sortOrder: 10,
    },
    'upscale-image::default': {
        label: 'Lanczos Upscale',
        description: 'Low-complexity upscale flow for quick enlargements without an extra model download.',
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
                label: curated?.label || buildFallbackLabel(workflow.name, modelPreset.name),
                description: curated?.description || workflow.description,
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