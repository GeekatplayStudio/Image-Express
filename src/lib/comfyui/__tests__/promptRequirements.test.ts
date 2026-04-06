import { workflowRequiresPositivePrompt } from '@/lib/comfyui/promptRequirements';
import type { WorkflowInputBinding } from '@/lib/comfyui/registry';

describe('workflowRequiresPositivePrompt', () => {
    it('returns true when the workflow binds a positive prompt input', () => {
        const bindings: WorkflowInputBinding[] = [
            { source: 'prompt', nodeId: '6', inputName: 'text' },
            { source: 'negativePrompt', nodeId: '7', inputName: 'text' },
        ];

        expect(workflowRequiresPositivePrompt(bindings)).toBe(true);
    });

    it('returns false for promptless workflows such as image-only upscale flows', () => {
        const bindings: WorkflowInputBinding[] = [
            { source: 'image', nodeId: '30', inputName: 'image' },
            { source: 'width', nodeId: '31', inputName: 'width' },
            { source: 'height', nodeId: '31', inputName: 'height' },
        ];

        expect(workflowRequiresPositivePrompt(bindings)).toBe(false);
    });
});