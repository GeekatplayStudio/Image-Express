import type { ComfyPromptBlueprint } from '@/lib/comfyui/registryTypes';
import {
    detectWorkflowBindings,
    findWorkflowTargets,
    isPromptLink,
    resolveWorkflowBindings,
} from '@/lib/comfyui/workflowTargets';

const sdxl: ComfyPromptBlueprint = {
    3: { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 7, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'a.safetensors' } },
    5: { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: 'a cat', clip: ['4', 1] }, _meta: { title: 'Positive' } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: 'blurry', clip: ['4', 1] }, _meta: { title: 'Some other title' } },
    8: { class_type: 'CLIPTextEncode', inputs: { text: 'unused note', clip: ['4', 1] } },
};

describe('findWorkflowTargets', () => {
    it('sends the prompt to the text that feeds the sampler’s positive input, whatever the nodes are called', () => {
        const targets = findWorkflowTargets(sdxl);
        expect(targets.prompt.map((slot) => slot.id)).toEqual(['6']);
        expect(targets.negativePrompt.map((slot) => slot.id)).toEqual(['7']);
        // A text node nothing reads gets neither.
        expect([...targets.prompt, ...targets.negativePrompt].some((slot) => slot.id === '8')).toBe(false);
    });

    it('keeps positive and negative apart through a node that passes both along', () => {
        const api: ComfyPromptBlueprint = {
            1: { class_type: 'CLIPTextEncode', inputs: { text: 'pos' } },
            2: { class_type: 'CLIPTextEncode', inputs: { text: 'neg' } },
            3: { class_type: 'ControlNetApplyAdvanced', inputs: { positive: ['1', 0], negative: ['2', 0], strength: 1 } },
            4: { class_type: 'KSampler', inputs: { positive: ['3', 0], negative: ['3', 1], seed: 5 } },
        };
        const targets = findWorkflowTargets(api);
        expect(targets.prompt.map((slot) => slot.id)).toEqual(['1']);
        expect(targets.negativePrompt.map((slot) => slot.id)).toEqual(['2']);
    });

    it('follows a single conditioning into a guider, as FLUX graphs are built', () => {
        const api: ComfyPromptBlueprint = {
            '76:1': { class_type: 'CLIPTextEncode', inputs: { text: 'a lighthouse' } },
            '76:2': { class_type: 'FluxGuidance', inputs: { conditioning: ['76:1', 0], guidance: 3.5 } },
            '76:3': { class_type: 'BasicGuider', inputs: { conditioning: ['76:2', 0] } },
            '76:4': { class_type: 'RandomNoise', inputs: { noise_seed: 9 } },
        };
        expect(findWorkflowTargets(api).prompt).toEqual([{ id: '76:1', key: 'text', label: 'CLIPTextEncode (#76:1)' }]);
    });

    it('gives the image to a loader that something reads, and never to a node that takes a link', () => {
        const api: ComfyPromptBlueprint = {
            1: { class_type: 'LoadImage', inputs: { image: 'in.png' } },
            2: { class_type: 'LoadImage', inputs: { image: 'unused.png' } },
            3: { class_type: 'ImageScale', inputs: { image: ['1', 0], width: 512, height: 512 } },
            4: { class_type: 'LoadImageMask', inputs: { image: 'mask.png', channel: 'alpha' } },
            5: { class_type: 'SetLatentNoiseMask', inputs: { samples: ['3', 0], mask: ['4', 0] } },
            6: { class_type: 'PreviewImage', inputs: { images: ['2', 0] } },
        };
        const targets = findWorkflowTargets(api);
        expect(targets.image.map((slot) => slot.id)).toEqual(['1']);
        expect(targets.mask.map((slot) => slot.id)).toEqual(['4']);
    });
});

describe('detectWorkflowBindings', () => {
    it('binds prompt, negative prompt, seed and canvas size, and leaves the sampler’s tuning alone', () => {
        const sources = detectWorkflowBindings(sdxl).map((binding) => `${binding.source}@${binding.nodeId}.${binding.inputName}`);
        expect(sources).toEqual([
            'prompt@6.text',
            'negativePrompt@7.text',
            'seed@3.seed',
            'width@5.width',
            'height@5.height',
        ]);
    });

    it('does not bind a seed that is a link', () => {
        const api: ComfyPromptBlueprint = {
            1: { class_type: 'PrimitiveInt', inputs: { value: 4 } },
            2: { class_type: 'KSampler', inputs: { seed: ['1', 0] } },
        };
        expect(detectWorkflowBindings(api)).toEqual([]);
    });
});

describe('resolveWorkflowBindings', () => {
    it('fills in everything for a workflow that declares nothing', () => {
        expect(resolveWorkflowBindings(sdxl, []).map((binding) => binding.source))
            .toEqual(['prompt', 'negativePrompt', 'seed', 'width', 'height']);
    });

    it('keeps what the workflow declares and adds only the sources it does not cover', () => {
        const declared = [
            { source: 'prompt' as const, nodeId: '8', inputName: 'text' },
            { source: 'steps' as const, nodeId: '3', inputName: 'steps' },
        ];
        const resolved = resolveWorkflowBindings(sdxl, declared);
        expect(resolved.filter((binding) => binding.source === 'prompt')).toEqual([declared[0]]);
        expect(resolved).toContainEqual(declared[1]);
        expect(resolved.some((binding) => binding.source === 'seed')).toBe(true);
    });

    it('drops a declared binding whose node is not in the prepared prompt', () => {
        const resolved = resolveWorkflowBindings(sdxl, [{ source: 'prompt', nodeId: '999', inputName: 'text' }]);
        expect(resolved.filter((binding) => binding.source === 'prompt').map((binding) => binding.nodeId)).toEqual(['6']);
    });
});

describe('isPromptLink', () => {
    it('recognises an API link and nothing else', () => {
        expect(isPromptLink(['4', 0])).toBe(true);
        expect(isPromptLink(['76:4', 1])).toBe(true);
        expect(isPromptLink('file.png')).toBe(false);
        expect(isPromptLink([1, 2])).toBe(false);
        expect(isPromptLink({ __value__: [1, 2] })).toBe(false);
    });
});
