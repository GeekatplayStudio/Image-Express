import textToImageBlueprint from '@/lib/comfyui/workflows/text_to_image.json';
import fluxTextToImageBlueprint from '@/lib/comfyui/workflows/image_flux2_text_to_image.json';
import fluxTextToImage9bBlueprint from '@/lib/comfyui/workflows/image_flux2_text_to_image_9b.json';
import fluxKleinEdit4bBlueprint from '@/lib/comfyui/workflows/image_flux2_klein_image_edit_4b_base.json';
import fluxKleinEdit9bBlueprint from '@/lib/comfyui/workflows/image_flux2_klein_image_edit_9b_base.json';
import qwenImageLoraBlueprint from '@/lib/comfyui/workflows/image_qwen_image_2512_with_2steps_lora.json';
import img2imgSdxlBlueprint from '@/lib/comfyui/workflows/image_to_image_sdxl.json';
import inpaintSdxlBlueprint from '@/lib/comfyui/workflows/inpaint_sdxl.json';
import upscaleImageBlueprint from '@/lib/comfyui/workflows/upscale_image.json';
import {
    comfyWorkflowRegistry,
    type ComfyWorkflowInstallableModel,
    type ComfyModelPreset,
    type ComfyPromptBlueprint,
    type RegisteredWorkflow,
} from '@/lib/comfyui/registry';

let builtInCatalogRegistered = false;

const SDXL_BASE_INSTALLABLE_MODEL: ComfyWorkflowInstallableModel = {
    name: 'sd_xl_base_1.0.safetensors',
    downloadUrl: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors',
    directory: 'checkpoints',
};

const FLUX_DEV_INSTALLABLE_MODELS: ComfyWorkflowInstallableModel[] = [
    {
        name: 'ae.safetensors',
        downloadUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors',
        directory: 'vae',
    },
    {
        name: 'clip_l.safetensors',
        downloadUrl: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors',
        directory: 'clip',
    },
    {
        name: 't5xxl_fp16.safetensors',
        downloadUrl: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors',
        directory: 'clip',
    },
    {
        name: 'flux1-dev.safetensors',
        downloadUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors',
        directory: 'unet',
    },
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

const collectInstallableModelsFromGraph = (
    graph: Record<string, unknown>,
    models: Map<string, ComfyWorkflowInstallableModel>,
    visitedSubgraphs: Set<string>
) => {
    const nodes = Array.isArray(graph.nodes)
        ? graph.nodes as Array<Record<string, unknown>>
        : [];

    for (const node of nodes) {
        const properties = isRecord(node.properties)
            ? node.properties as Record<string, unknown>
            : null;
        const modelEntries = Array.isArray(properties?.models)
            ? properties.models as Array<Record<string, unknown>>
            : [];

        for (const entry of modelEntries) {
            const name = typeof entry.name === 'string' ? entry.name.trim() : '';
            const downloadUrl = typeof entry.url === 'string' ? entry.url.trim() : '';
            const directory = typeof entry.directory === 'string' ? entry.directory.trim() : '';

            if (!name || !downloadUrl || !directory) {
                continue;
            }

            const key = `${directory}/${name}`.toLowerCase();
            if (!models.has(key)) {
                models.set(key, { name, downloadUrl, directory });
            }
        }
    }

    const subgraphs = isRecord(graph.definitions) && Array.isArray(graph.definitions.subgraphs)
        ? graph.definitions.subgraphs as Array<Record<string, unknown>>
        : [];

    for (const subgraph of subgraphs) {
        const subgraphId = typeof subgraph.id === 'string' ? subgraph.id : '';
        if (subgraphId && visitedSubgraphs.has(subgraphId)) {
            continue;
        }
        if (subgraphId) {
            visitedSubgraphs.add(subgraphId);
        }

        collectInstallableModelsFromGraph(subgraph, models, visitedSubgraphs);
    }
};

const extractInstallableModelsFromEditorGraph = (graph: unknown): ComfyWorkflowInstallableModel[] => {
    if (!isRecord(graph)) {
        return [];
    }

    const models = new Map<string, ComfyWorkflowInstallableModel>();
    collectInstallableModelsFromGraph(graph, models, new Set<string>());

    return Array.from(models.values());
};

const BUILT_IN_MODEL_PRESETS: ComfyModelPreset[] = [
    {
        id: 'default',
        name: 'Workflow Default',
        description: 'Use the checkpoint already baked into the workflow JSON.',
        inputOverrides: [],
    },
    {
        id: 'sdxl',
        name: 'SDXL',
        description: 'Patch the workflow to use an SDXL checkpoint.',
        supportedTasks: ['generate', 'img2img', 'inpaint', 'outpaint', 'upscale'],
        inputOverrides: [
            {
                nodeId: '4',
                inputs: {
                    ckpt_name: 'sd_xl_base_1.0.safetensors',
                },
            },
        ],
    },
    {
        id: 'flux-dev',
        name: 'FLUX Dev',
        description: 'Patch the FLUX workflow to use the full FLUX dev loader stack.',
        supportedTasks: ['generate'],
        inputOverrides: [
            {
                nodeId: '10',
                inputs: {
                    vae_name: 'ae.safetensors',
                },
            },
            {
                nodeId: '11',
                inputs: {
                    clip_name1: 't5xxl_fp16.safetensors',
                    clip_name2: 'clip_l.safetensors',
                    type: 'flux',
                },
            },
            {
                nodeId: '12',
                inputs: {
                    unet_name: 'flux1-dev.safetensors',
                    weight_dtype: 'default',
                },
            },
        ],
    },
    {
        id: 'flux-schnell',
        name: 'FLUX Schnell',
        description: 'Patch the FLUX workflow to use the faster FLUX Schnell loader stack.',
        supportedTasks: ['generate'],
        inputOverrides: [
            {
                nodeId: '10',
                inputs: {
                    vae_name: 'ae.safetensors',
                },
            },
            {
                nodeId: '11',
                inputs: {
                    clip_name1: 't5xxl_fp8_e4m3fn.safetensors',
                    clip_name2: 'clip_l.safetensors',
                    type: 'flux',
                },
            },
            {
                nodeId: '12',
                inputs: {
                    unet_name: 'flux1-schnell.safetensors',
                    weight_dtype: 'default',
                },
            },
            {
                nodeId: '16',
                inputs: {
                    steps: 4,
                },
            },
        ],
    },
];

const BUILT_IN_WORKFLOWS: RegisteredWorkflow[] = [
    {
        id: 'generate-basic',
        task: 'generate',
        name: 'Basic Text To Image',
        description: 'Starter text-to-image pipeline for prompt + zone generation.',
        loadBlueprint: () => textToImageBlueprint as ComfyPromptBlueprint,
        inputBindings: [
            { source: 'seed', nodeId: '3', inputName: 'seed' },
            { source: 'steps', nodeId: '3', inputName: 'steps' },
            { source: 'cfg', nodeId: '3', inputName: 'cfg' },
            { source: 'width', nodeId: '5', inputName: 'width' },
            { source: 'height', nodeId: '5', inputName: 'height' },
            { source: 'prompt', nodeId: '6', inputName: 'text' },
            { source: 'negativePrompt', nodeId: '7', inputName: 'text' },
        ],
        outputNodeIds: ['9'],
        modelPresetIds: ['default', 'sdxl'],
        defaultModelPresetId: 'sdxl',
        setupRequirements: {
            models: [SDXL_BASE_INSTALLABLE_MODEL],
        },
    },
    {
        id: 'image_flux2_text_to_image',
        task: 'generate',
        name: 'FLUX Text To Image',
        description: 'ComfyUI FLUX graph using DualCLIP, diffusion-model, and VAE loaders instead of a checkpoint loader.',
        loadBlueprint: () => fluxTextToImageBlueprint as ComfyPromptBlueprint,
        inputBindings: [
            { source: 'seed', nodeId: '13', inputName: 'noise_seed' },
            { source: 'steps', nodeId: '16', inputName: 'steps' },
            { source: 'cfg', nodeId: '17', inputName: 'guidance' },
            { source: 'width', nodeId: '14', inputName: 'width' },
            { source: 'height', nodeId: '14', inputName: 'height' },
            { source: 'prompt', nodeId: '17', inputName: 't5xxl' },
        ],
        outputNodeIds: ['21'],
        modelPresetIds: ['flux-dev', 'flux-schnell', 'default'],
        defaultModelPresetId: 'flux-dev',
        setupRequirements: {
            models: FLUX_DEV_INSTALLABLE_MODELS,
        },
    },
    {
        id: 'img2img-sdxl',
        task: 'img2img',
        name: 'SDXL Image To Image',
        description: 'Transforms a selected source image with prompt guidance using SDXL.',
        loadBlueprint: () => img2imgSdxlBlueprint as ComfyPromptBlueprint,
        inputBindings: [
            { source: 'image', nodeId: '30', inputName: 'image' },
            { source: 'seed', nodeId: '3', inputName: 'seed' },
            { source: 'steps', nodeId: '3', inputName: 'steps' },
            { source: 'cfg', nodeId: '3', inputName: 'cfg' },
            { source: 'strength', nodeId: '3', inputName: 'denoise' },
            { source: 'prompt', nodeId: '6', inputName: 'text' },
            { source: 'negativePrompt', nodeId: '7', inputName: 'text' },
        ],
        outputNodeIds: ['9'],
        modelPresetIds: ['default', 'sdxl'],
        defaultModelPresetId: 'sdxl',
        setupRequirements: {
            models: [SDXL_BASE_INSTALLABLE_MODEL],
        },
    },
    {
        id: 'inpaint-sdxl',
        task: 'inpaint',
        name: 'SDXL Inpaint',
        description: 'Inpaints a selected source image using mask-guided latent editing.',
        loadBlueprint: () => inpaintSdxlBlueprint as ComfyPromptBlueprint,
        inputBindings: [
            { source: 'image', nodeId: '30', inputName: 'image' },
            { source: 'mask', nodeId: '32', inputName: 'image' },
            { source: 'seed', nodeId: '3', inputName: 'seed' },
            { source: 'steps', nodeId: '3', inputName: 'steps' },
            { source: 'cfg', nodeId: '3', inputName: 'cfg' },
            { source: 'prompt', nodeId: '6', inputName: 'text' },
            { source: 'negativePrompt', nodeId: '7', inputName: 'text' },
        ],
        outputNodeIds: ['9'],
        modelPresetIds: ['default', 'sdxl'],
        defaultModelPresetId: 'sdxl',
        setupRequirements: {
            models: [SDXL_BASE_INSTALLABLE_MODEL],
        },
    },
    {
        id: 'outpaint-sdxl',
        task: 'outpaint',
        name: 'SDXL Outpaint',
        description: 'Extends content beyond the source bounds using an automatically generated outpaint mask.',
        loadBlueprint: () => inpaintSdxlBlueprint as ComfyPromptBlueprint,
        inputBindings: [
            { source: 'image', nodeId: '30', inputName: 'image' },
            { source: 'mask', nodeId: '32', inputName: 'image' },
            { source: 'seed', nodeId: '3', inputName: 'seed' },
            { source: 'steps', nodeId: '3', inputName: 'steps' },
            { source: 'cfg', nodeId: '3', inputName: 'cfg' },
            { source: 'prompt', nodeId: '6', inputName: 'text' },
            { source: 'negativePrompt', nodeId: '7', inputName: 'text' },
        ],
        outputNodeIds: ['9'],
        modelPresetIds: ['default', 'sdxl'],
        defaultModelPresetId: 'sdxl',
        setupRequirements: {
            models: [SDXL_BASE_INSTALLABLE_MODEL],
        },
    },
    {
        id: 'upscale-image',
        task: 'upscale',
        name: 'Image Upscale (Lanczos)',
        description: 'Upscales the selected source image to the requested output size with image scaling.',
        loadBlueprint: () => upscaleImageBlueprint as ComfyPromptBlueprint,
        inputBindings: [
            { source: 'image', nodeId: '30', inputName: 'image' },
            { source: 'width', nodeId: '31', inputName: 'width' },
            { source: 'height', nodeId: '31', inputName: 'height' },
        ],
        outputNodeIds: ['9'],
        modelPresetIds: ['default'],
        defaultModelPresetId: 'default',
    },
    {
        id: 'image_flux2_text_to_image_9b',
        task: 'generate',
        name: 'FLUX 2 Text To Image (9B Template)',
        description: 'FLUX 2 template imported from Comfy workflow graph. Requires matching Comfy custom nodes/models.',
        loadBlueprint: () => fluxTextToImage9bBlueprint as unknown as ComfyPromptBlueprint,
        inputBindings: [],
        outputNodeIds: ['9'],
        modelPresetIds: ['default'],
        defaultModelPresetId: 'default',
        setupRequirements: {
            models: extractInstallableModelsFromEditorGraph(fluxTextToImage9bBlueprint),
            updateInstallForMissingNodes: true,
        },
    },
    {
        id: 'image_flux2_klein_image_edit_4b_base',
        task: 'img2img',
        name: 'Z Image Turbo / FLUX 2 Klein Image Edit (4B Template)',
        description: 'Z Image Turbo-backed FLUX 2 Klein 4B image-edit template. Requires matching Comfy custom nodes/models.',
        loadBlueprint: () => fluxKleinEdit4bBlueprint as unknown as ComfyPromptBlueprint,
        inputBindings: [],
        outputNodeIds: ['9'],
        modelPresetIds: ['default'],
        defaultModelPresetId: 'default',
        setupRequirements: {
            models: extractInstallableModelsFromEditorGraph(fluxKleinEdit4bBlueprint),
            updateInstallForMissingNodes: true,
        },
    },
    {
        id: 'image_flux2_klein_image_edit_9b_base',
        task: 'img2img',
        name: 'FLUX 2 Klein Image Edit (9B Template)',
        description: 'FLUX 2 Klein 9B image-edit template. Requires matching Comfy custom nodes/models.',
        loadBlueprint: () => fluxKleinEdit9bBlueprint as unknown as ComfyPromptBlueprint,
        inputBindings: [],
        outputNodeIds: ['9'],
        modelPresetIds: ['default'],
        defaultModelPresetId: 'default',
        setupRequirements: {
            models: extractInstallableModelsFromEditorGraph(fluxKleinEdit9bBlueprint),
            updateInstallForMissingNodes: true,
        },
    },
    {
        id: 'image_qwen_image_2512_with_2steps_lora',
        task: 'generate',
        name: 'Qwen Image 2512 (Template)',
        description: 'Qwen template imported from Comfy workflow graph. Requires matching Comfy custom nodes/models.',
        loadBlueprint: () => qwenImageLoraBlueprint as unknown as ComfyPromptBlueprint,
        // Steps/cfg stay unbound on purpose: this is a 2-step turbo-LoRA graph
        // and overriding its tuned sampler values would break the output.
        inputBindings: [
            { source: 'prompt', nodeId: '108', inputName: 'text' },
            { source: 'seed', nodeId: '106', inputName: 'seed' },
            { source: 'width', nodeId: '107', inputName: 'width' },
            { source: 'height', nodeId: '107', inputName: 'height' },
        ],
        outputNodeIds: ['123'],
        modelPresetIds: ['default'],
        defaultModelPresetId: 'default',
        setupRequirements: {
            models: extractInstallableModelsFromEditorGraph(qwenImageLoraBlueprint),
            updateInstallForMissingNodes: true,
        },
    },
];

export const getBuiltInComfyWorkflowIds = (): string[] => BUILT_IN_WORKFLOWS.map((workflow) => workflow.id);

export const ensureComfyWorkflowCatalogRegistered = () => {
    if (builtInCatalogRegistered) {
        return;
    }

    for (const modelPreset of BUILT_IN_MODEL_PRESETS) {
        comfyWorkflowRegistry.registerModelPreset(modelPreset);
    }

    for (const workflow of BUILT_IN_WORKFLOWS) {
        comfyWorkflowRegistry.register(workflow);
    }

    builtInCatalogRegistered = true;
};
