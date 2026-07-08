import {
    normalizeComfyPromptBlueprint,
    readWorkflowInputBindingValues,
    type ComfyPromptBlueprint,
    type WorkflowInputBinding,
} from '@/lib/comfyui/registry';
import qwenGraph from '@/lib/comfyui/workflows/image_qwen_image_2512_with_2steps_lora.json';

describe('normalizeComfyPromptBlueprint (editor graph conversion)', () => {
    it('maps positional widgets_values for core nodes when inputs carry no widget entries', () => {
        // This is the exact template that ComfyUI rejected with a wall of
        // "Required input is missing" errors before the widget-order fallback.
        const prompt = normalizeComfyPromptBlueprint(
            'qwen-test',
            qwenGraph as unknown as Record<string, unknown>,
        ) as ComfyPromptBlueprint;

        // Every input ComfyUI complained about must now be present.
        expect(prompt['105'].inputs.unet_name).toBe('qwen_image_2512_fp8_e4m3fn.safetensors');
        expect(prompt['105'].inputs.weight_dtype).toBe('default');
        expect(prompt['114'].inputs.lora_name).toContain('Qwen-Image-2512-Turbo-LoRA');
        expect(prompt['114'].inputs.strength_model).toBe(1);
        expect(prompt['110'].inputs.shift).toBe(3);
        expect(prompt['104'].inputs.clip_name).toBe('qwen_2.5_vl_7b_fp8_scaled.safetensors');
        expect(prompt['104'].inputs.type).toBe('qwen_image');
        expect(typeof prompt['108'].inputs.text).toBe('string');
        expect(prompt['107'].inputs.width).toBe(1328);
        expect(prompt['107'].inputs.height).toBe(1328);
        expect(prompt['107'].inputs.batch_size).toBe(1);
        expect(prompt['106'].inputs.seed).toBe(318036859179089);
        expect(prompt['106'].inputs.steps).toBe(2);
        expect(prompt['106'].inputs.cfg).toBe(1);
        expect(prompt['106'].inputs.sampler_name).toBe('euler');
        expect(prompt['106'].inputs.scheduler).toBe('simple');
        expect(prompt['106'].inputs.denoise).toBe(1);
        expect(prompt['103'].inputs.vae_name).toBe('qwen_image_vae.safetensors');
        expect(prompt['123'].inputs.filename_prefix).toBe('Qwen-2512-2steps-LoRA');

        // "control_after_generate" is a UI-only widget and must NOT leak into the prompt.
        expect(prompt['106'].inputs.control_after_generate).toBeUndefined();

        // Linked inputs remain link tuples, not widget values.
        expect(Array.isArray(prompt['106'].inputs.model)).toBe(true);
        expect(Array.isArray(prompt['123'].inputs.images)).toBe(true);

        // UI-only notes are stripped.
        expect(prompt['94']).toBeUndefined();
        expect(prompt['67']).toBeUndefined();
    });

    it('prefers explicit widget-named inputs over the positional fallback', () => {
        const graph = {
            nodes: [
                {
                    id: 3,
                    type: 'KSampler',
                    inputs: [
                        { name: 'seed', link: null, widget: { name: 'seed' } },
                        { name: 'steps', link: null, widget: { name: 'steps' } },
                    ],
                    widgets_values: [42, 30],
                },
            ],
            links: [],
        };

        const prompt = normalizeComfyPromptBlueprint('widget-named', graph) as ComfyPromptBlueprint;
        expect(prompt['3'].inputs.seed).toBe(42);
        expect(prompt['3'].inputs.steps).toBe(30);
        // Positional fallback must not run and misassign remaining slots.
        expect(prompt['3'].inputs.cfg).toBeUndefined();
    });
});

describe('readWorkflowInputBindingValues', () => {
    it('reads the values bound into the prepared workflow nodes', () => {
        const blueprint: ComfyPromptBlueprint = {
            '3': {
                class_type: 'KSampler',
                inputs: {
                    steps: 20,
                },
            },
            '6': {
                class_type: 'CLIPTextEncode',
                inputs: {
                    text: 'young woman laying on the beach',
                },
            },
            '7': {
                class_type: 'CLIPTextEncode',
                inputs: {
                    text: 'low quality, blurry',
                },
            },
        };

        const bindings: WorkflowInputBinding[] = [
            { source: 'prompt', nodeId: '6', inputName: 'text' },
            { source: 'negativePrompt', nodeId: '7', inputName: 'text' },
            { source: 'steps', nodeId: '3', inputName: 'steps' },
        ];

        expect(readWorkflowInputBindingValues(blueprint, bindings)).toEqual({
            prompt: ['young woman laying on the beach'],
            negativePrompt: ['low quality, blurry'],
            steps: [20],
        });
    });

    it('skips bindings whose nodes or inputs are missing', () => {
        const blueprint: ComfyPromptBlueprint = {
            '6': {
                class_type: 'CLIPTextEncode',
                inputs: {
                    text: 'beach sunset',
                },
            },
        };

        const bindings: WorkflowInputBinding[] = [
            { source: 'prompt', nodeId: '6', inputName: 'text' },
            { source: 'negativePrompt', nodeId: '7', inputName: 'text' },
            { source: 'width', nodeId: '6', inputName: 'width' },
        ];

        expect(readWorkflowInputBindingValues(blueprint, bindings)).toEqual({
            prompt: ['beach sunset'],
        });
    });
});