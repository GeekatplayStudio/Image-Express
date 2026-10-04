import {
    COMFY_CUSTOM_MODELS_STORAGE_KEY,
    applyCustomModelsToRegistry,
    checkpointWorkflows,
    createCustomModel,
    customModelIdFor,
    extractCheckpointNames,
    isCustomModelPresetId,
    loadComfyCustomModels,
    saveComfyCustomModels,
    validateCustomModel,
    type ComfyCustomModel,
    type CustomModelRegistry,
} from '@/lib/comfyui/customModels';
import { comfyWorkflowRegistry } from '@/lib/comfyui/registry';
import { ensureComfyWorkflowCatalogRegistered, syncComfyCustomModels } from '@/lib/comfyui/workflows/catalog';
import { buildComfyTaskModelOptions } from '@/lib/comfyui/localModelOptions';
import type { ComfyModelPreset, RegisteredWorkflow } from '@/lib/comfyui/registryTypes';

const model = (file: string, name = file): ComfyCustomModel => createCustomModel({ name, checkpointFile: file }, new Date('2026-10-03T00:00:00Z'));

/** A registry with one checkpoint workflow and one that loads a UNet instead. */
const makeRegistry = () => {
    const presets = new Map<string, ComfyModelPreset>([
        ['default', { id: 'default', name: 'Workflow Default', description: '', inputOverrides: [] }],
        ['sdxl', {
            id: 'sdxl',
            name: 'SDXL',
            description: '',
            supportedTasks: ['generate', 'img2img'],
            inputOverrides: [{ nodeId: '4', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } }],
        }],
        ['flux-dev', { id: 'flux-dev', name: 'FLUX Dev', description: '', inputOverrides: [{ nodeId: '12', inputs: { unet_name: 'flux1-dev.safetensors' } }] }],
    ]);
    const workflow = (id: string, modelPresetIds: string[]): RegisteredWorkflow => ({
        id, task: 'generate', name: id, description: '', loadBlueprint: () => ({}), inputBindings: [], outputNodeIds: [], modelPresetIds,
    });
    const workflows = new Map<string, RegisteredWorkflow>([
        ['sdxl-graph', workflow('sdxl-graph', ['default', 'sdxl'])],
        ['flux-graph', workflow('flux-graph', ['flux-dev', 'default'])],
    ]);
    const registry: CustomModelRegistry = {
        getModelPreset: (id) => presets.get(id),
        getAllWorkflows: () => Array.from(workflows.values()),
        registerModelPreset: (preset) => { presets.set(preset.id, preset); },
        register: (entry) => { workflows.set(entry.id, entry); },
    };
    return { registry, presets, workflows };
};

describe('validateCustomModel', () => {
    it('accepts a named checkpoint file', () => {
        expect(validateCustomModel({ name: 'Juggernaut', checkpointFile: 'juggernautXL_v9.safetensors' }, [])).toEqual([]);
        expect(validateCustomModel({ name: 'Old', checkpointFile: 'legacy.ckpt' }, [])).toEqual([]);
    });

    it('asks for the missing pieces', () => {
        expect(validateCustomModel({ name: ' ', checkpointFile: ' ' }, [])).toEqual(['name-required', 'file-required']);
    });

    it('refuses a path, including one that tries to climb out of the folder', () => {
        for (const file of ['sub/model.safetensors', 'C:\\models\\model.safetensors', '..\\model.safetensors', '../../etc/passwd']) {
            expect(validateCustomModel({ name: 'x', checkpointFile: file }, [])).toEqual(['file-is-path']);
        }
    });

    it('refuses something that is not a model file', () => {
        expect(validateCustomModel({ name: 'x', checkpointFile: 'notes.txt' }, [])).toEqual(['file-extension']);
        expect(validateCustomModel({ name: 'x', checkpointFile: 'model' }, [])).toEqual(['file-extension']);
    });

    it('refuses the same checkpoint twice, whatever the case', () => {
        const existing = [model('Juggernaut.safetensors')];
        expect(validateCustomModel({ name: 'again', checkpointFile: 'juggernaut.SAFETENSORS' }, existing)).toEqual(['duplicate']);
    });

    it('checks against the server only when the server has been asked', () => {
        const draft = { name: 'x', checkpointFile: 'missing.safetensors' };
        // Unknown list: cannot be checked, so it is not held against the user.
        expect(validateCustomModel(draft, [], null)).toEqual([]);
        expect(validateCustomModel(draft, [], ['other.safetensors'])).toEqual(['file-not-on-server']);
        expect(validateCustomModel(draft, [], ['MISSING.safetensors'])).toEqual([]);
    });
});

describe('ids and storage', () => {
    beforeEach(() => window.localStorage.clear());

    it('derives a stable preset id from the file name', () => {
        expect(customModelIdFor('Juggernaut XL v9.safetensors')).toBe('custom:juggernaut-xl-v9');
        expect(isCustomModelPresetId('custom:juggernaut-xl-v9')).toBe(true);
        expect(isCustomModelPresetId('sdxl')).toBe(false);
        expect(isCustomModelPresetId(undefined)).toBe(false);
    });

    it('round-trips through storage and announces the change', () => {
        const heard = jest.fn();
        window.addEventListener('image-express:comfy-custom-models-changed', heard);
        saveComfyCustomModels([model('a.safetensors', 'A')]);
        expect(loadComfyCustomModels()).toEqual([model('a.safetensors', 'A')]);
        expect(heard).toHaveBeenCalledTimes(1);
        window.removeEventListener('image-express:comfy-custom-models-changed', heard);
    });

    it('ignores stored entries that are malformed or carry a path', () => {
        window.localStorage.setItem(COMFY_CUSTOM_MODELS_STORAGE_KEY, JSON.stringify([
            model('good.safetensors'),
            { id: 'custom:evil', name: 'evil', checkpointFile: '../../evil.safetensors' },
            { id: 'sdxl', name: 'shadows a built-in', checkpointFile: 'x.safetensors' },
            'nonsense',
        ]));
        expect(loadComfyCustomModels().map((entry) => entry.id)).toEqual(['custom:good']);

        window.localStorage.setItem(COMFY_CUSTOM_MODELS_STORAGE_KEY, '{not json');
        expect(loadComfyCustomModels()).toEqual([]);
    });
});

describe('applyCustomModelsToRegistry', () => {
    it('adds the model to checkpoint workflows only', () => {
        const { registry, workflows } = makeRegistry();
        applyCustomModelsToRegistry(registry, [model('mine.safetensors', 'Mine')]);

        expect(workflows.get('sdxl-graph')?.modelPresetIds).toEqual(['default', 'sdxl', 'custom:mine']);
        // The guardrail: a FLUX graph loads a UNet, not a checkpoint.
        expect(workflows.get('flux-graph')?.modelPresetIds).toEqual(['flux-dev', 'default']);
        expect(checkpointWorkflows(registry).map((workflow) => workflow.id)).toEqual(['sdxl-graph']);
    });

    it('patches the same loader node the built-in checkpoint preset does', () => {
        const { registry, presets } = makeRegistry();
        applyCustomModelsToRegistry(registry, [model('mine.safetensors', 'Mine')]);
        const preset = presets.get('custom:mine');
        expect(preset?.name).toBe('Mine');
        expect(preset?.inputOverrides).toEqual([{ nodeId: '4', inputs: { ckpt_name: 'mine.safetensors' } }]);
        expect(preset?.supportedTasks).toEqual(['generate', 'img2img']);
        // The built-in preset it was copied from is left alone.
        expect(presets.get('sdxl')?.inputOverrides[0].inputs.ckpt_name).toBe('sd_xl_base_1.0.safetensors');
    });

    it('is idempotent and removes a model that was unregistered', () => {
        const { registry, workflows } = makeRegistry();
        const both = [model('a.safetensors'), model('b.safetensors')];
        applyCustomModelsToRegistry(registry, both);
        applyCustomModelsToRegistry(registry, both);
        expect(workflows.get('sdxl-graph')?.modelPresetIds).toEqual(['default', 'sdxl', 'custom:a', 'custom:b']);

        applyCustomModelsToRegistry(registry, [both[1]]);
        expect(workflows.get('sdxl-graph')?.modelPresetIds).toEqual(['default', 'sdxl', 'custom:b']);

        applyCustomModelsToRegistry(registry, []);
        expect(workflows.get('sdxl-graph')?.modelPresetIds).toEqual(['default', 'sdxl']);
    });
});

describe('with the real workflow catalog', () => {
    beforeEach(() => {
        window.localStorage.clear();
        syncComfyCustomModels();
    });

    it('shows a registered model in the picker for SDXL tasks, and not for FLUX', () => {
        ensureComfyWorkflowCatalogRegistered();
        saveComfyCustomModels([model('juggernautXL.safetensors', 'Juggernaut XL')]);
        syncComfyCustomModels();

        const labels = buildComfyTaskModelOptions('generate', []).map((option) => `${option.workflowId}::${option.modelPresetId}`);
        expect(labels).toContain('generate-basic::custom:juggernautxl');
        expect(labels.filter((label) => label.includes('custom:')).every((label) => !label.includes('flux'))).toBe(true);

        const selection = comfyWorkflowRegistry.resolveWorkflowSelection({
            task: 'generate',
            workflowId: 'generate-basic',
            modelPresetId: 'custom:juggernautxl',
        });
        expect(selection.modelPreset.inputOverrides[0].inputs.ckpt_name).toBe('juggernautXL.safetensors');
    });

    it('falls back to the workflow default once the model is removed', () => {
        saveComfyCustomModels([model('juggernautXL.safetensors')]);
        syncComfyCustomModels();
        saveComfyCustomModels([]);
        syncComfyCustomModels();

        const selection = comfyWorkflowRegistry.resolveWorkflowSelection({
            task: 'generate',
            workflowId: 'generate-basic',
            modelPresetId: 'custom:juggernautxl',
        });
        // A saved choice of a removed model must not break generation.
        expect(isCustomModelPresetId(selection.modelPreset.id)).toBe(false);
    });
});

describe('extractCheckpointNames', () => {
    it('reads the list from the checkpoint loader node', () => {
        expect(extractCheckpointNames({
            CheckpointLoaderSimple: { input: { required: { ckpt_name: [['a.safetensors', 'b.ckpt'], {}] } } },
        })).toEqual(['a.safetensors', 'b.ckpt']);
    });

    it('reports unknown, not empty, when the server did not say', () => {
        expect(extractCheckpointNames(null)).toBeNull();
        expect(extractCheckpointNames({})).toBeNull();
        expect(extractCheckpointNames({ CheckpointLoaderSimple: { input: { required: { ckpt_name: ['COMBO'] } } } })).toBeNull();
    });
});
