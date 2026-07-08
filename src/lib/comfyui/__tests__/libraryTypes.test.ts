import {
    createComfyLibraryWorkflowEntry,
    registerSerializedComfyWorkflow,
} from '@/lib/comfyui/libraryTypes';
import { comfyWorkflowRegistry } from '@/lib/comfyui/registry';
import { ensureComfyWorkflowCatalogRegistered } from '@/lib/comfyui/workflows/catalog';

describe('comfy workflow library helpers', () => {
    beforeEach(() => {
        ensureComfyWorkflowCatalogRegistered();
    });

    it('infers a runnable upscale workflow from generic JSON', () => {
        const entry = createComfyLibraryWorkflowEntry({
            idSeed: 'custom-upscale',
            source: 'custom-folder',
            name: 'Custom Upscaler',
            blueprint: {
                '10': {
                    class_type: 'LoadImage',
                    inputs: {
                        image: 'input.png',
                    },
                },
                '11': {
                    class_type: 'ImageScale',
                    inputs: {
                        image: ['10', 0],
                        width: 2048,
                        height: 2048,
                    },
                },
                '12': {
                    class_type: 'SaveImage',
                    inputs: {
                        images: ['11', 0],
                        filename_prefix: 'ComfyUI',
                    },
                },
            },
        });

        expect(entry.runnable).toBe(true);
        expect(entry.task).toBe('upscale');
        expect(entry.registration?.outputNodeIds).toEqual(['12']);
        expect(entry.registration?.inputBindings).toEqual(expect.arrayContaining([
            expect.objectContaining({ source: 'image', nodeId: '10', inputName: 'image' }),
            expect.objectContaining({ source: 'width', nodeId: '11', inputName: 'width' }),
            expect.objectContaining({ source: 'height', nodeId: '11', inputName: 'height' }),
        ]));
    });

    it('registers imported workflows into the shared registry', () => {
        const entry = createComfyLibraryWorkflowEntry({
            idSeed: 'server-generate',
            source: 'server-template',
            name: 'Server Generate',
            blueprint: {
                '1': {
                    class_type: 'CLIPTextEncode',
                    inputs: {
                        text: 'prompt',
                    },
                },
                '2': {
                    class_type: 'EmptyLatentImage',
                    inputs: {
                        width: 1024,
                        height: 1024,
                    },
                },
                '3': {
                    class_type: 'SaveImage',
                    inputs: {
                        images: ['2', 0],
                        filename_prefix: 'ComfyUI',
                    },
                },
            },
        });

        registerSerializedComfyWorkflow(entry.registration!);

        const registered = comfyWorkflowRegistry.getWorkflow(entry.id);
        expect(registered?.name).toBe('Server Generate');
        expect(registered?.task).toBe('generate');
    });
});
