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
    type ComfyModelPreset,
    type ComfyPromptBlueprint,
    type RegisteredWorkflow,
} from '@/lib/comfyui/registry';

let builtInCatalogRegistered = false;

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
        defaultModelPresetId: 'default',
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
        description: 'Imported workflow template from ComfyUI editor graph. Export in API format to execute.',
        loadBlueprint: () => fluxTextToImage9bBlueprint as unknown as ComfyPromptBlueprint,
        inputBindings: [],
        outputNodeIds: ['9'],
        modelPresetIds: ['default'],
        defaultModelPresetId: 'default',
    },
    {
        id: 'image_flux2_klein_image_edit_4b_base',
        task: 'img2img',
        name: 'FLUX 2 Klein Image Edit (4B Template)',
        description: 'Imported workflow template from ComfyUI editor graph. Export in API format to execute.',
        loadBlueprint: () => fluxKleinEdit4bBlueprint as unknown as ComfyPromptBlueprint,
        inputBindings: [],
        outputNodeIds: ['9'],
        modelPresetIds: ['default'],
        defaultModelPresetId: 'default',
    },
    {
        id: 'image_flux2_klein_image_edit_9b_base',
        task: 'img2img',
        name: 'FLUX 2 Klein Image Edit (9B Template)',
        description: 'Imported workflow template from ComfyUI editor graph. Export in API format to execute.',
        loadBlueprint: () => fluxKleinEdit9bBlueprint as unknown as ComfyPromptBlueprint,
        inputBindings: [],
        outputNodeIds: ['9'],
        modelPresetIds: ['default'],
        defaultModelPresetId: 'default',
    },
    {
        id: 'image_qwen_image_2512_with_2steps_lora',
        task: 'generate',
        name: 'Qwen Image 2512 (Template)',
        description: 'Imported workflow template from ComfyUI editor graph. Export in API format to execute.',
        loadBlueprint: () => qwenImageLoraBlueprint as unknown as ComfyPromptBlueprint,
        inputBindings: [],
        outputNodeIds: ['128'],
        modelPresetIds: ['default'],
        defaultModelPresetId: 'default',
    },
];

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
