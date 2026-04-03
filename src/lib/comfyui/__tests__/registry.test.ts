import {
    readWorkflowInputBindingValues,
    type ComfyPromptBlueprint,
    type WorkflowInputBinding,
} from '@/lib/comfyui/registry';

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