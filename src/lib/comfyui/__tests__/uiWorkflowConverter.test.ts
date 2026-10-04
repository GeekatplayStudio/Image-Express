/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';

import {
    ConversionError,
    convertUiWorkflow,
    processDynamicPrompt,
    uiNodeTypes,
    widgetLayout,
} from '@/lib/comfyui/uiWorkflowConverter';

/**
 * The golden fixtures are workflows from the ComfyUI templates package next to
 * what frontend 1.53.10 queues for each (`*.api.json`), with the node
 * definitions they use. They, and the hand-written cases below, come from the
 * Photoshop bridge this converter was ported from.
 */
const FIXTURES = path.join(__dirname, 'fixtures', 'convert');
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
const DEFS = read('object_info');

describe('convertUiWorkflow against the ComfyUI frontend', () => {
    const names = fs.readdirSync(FIXTURES)
        .filter((file) => file.endsWith('.api.json'))
        .map((file) => file.slice(0, -'.api.json'.length));

    it('has fixtures to check', () => {
        expect(names.length).toBeGreaterThanOrEqual(10);
    });

    it.each(names)('converts %s exactly as the frontend queues it', (name) => {
        expect(convertUiWorkflow(read(name), DEFS).prompt).toEqual(read(`${name}.api`));
    });

    it('lists the inputs the author exposed: promoted subgraph widgets, nested ones, titled primitives', () => {
        const depth = convertUiWorkflow(read('flux_depth_lora_example'), DEFS).exposed;
        const keys = depth.map((entry) => `${entry.id}/${entry.key}`);
        expect(keys).toEqual(expect.arrayContaining(['150:3/seed', '150:41:101/sigma']));
        expect(depth.find((entry) => entry.key === 'seed')).toEqual({
            id: '150:3', key: 'seed', label: 'seed', group: 'Depth to Image(Flux.1 Dev)',
        });
        expect(depth.find((entry) => entry.key === 'sigma')?.group).toBe('Lotus Depth(Subgraph)');

        const relight = convertUiWorkflow(read('templates-product_scene_relight'), DEFS).exposed;
        expect(relight.map((entry) => entry.label)).toEqual(['Describe the Product', 'Prompt Template']);
    });
});

const defs = {
    LoadImage: { input: { required: { image: [['a.png'], { image_upload: true }] } }, input_order: { required: ['image'] }, display_name: 'Load Image' },
    CLIPTextEncode: { input: { required: { text: ['STRING', { multiline: true, dynamicPrompts: true }], clip: ['CLIP'] } }, input_order: { required: ['text', 'clip'] }, display_name: 'CLIP Text Encode (Prompt)' },
    KSampler: {
        input: { required: { model: ['MODEL'], seed: ['INT', { default: 0 }], steps: ['INT', { default: 20 }], sampler_name: [['euler', 'dpmpp_2m']] } },
        input_order: { required: ['model', 'seed', 'steps', 'sampler_name'] },
        display_name: 'KSampler',
    },
    CheckpointLoaderSimple: { input: { required: { ckpt_name: [['a.safetensors']] } }, input_order: { required: ['ckpt_name'] }, display_name: 'Load Checkpoint' },
    Load3D: { input: { required: { width: ['INT', {}] } }, input_order: { required: ['width'] }, display_name: 'Load 3D' },
};

const node = (id: number, type: string, extra: Record<string, unknown> = {}) => ({ id, type, mode: 0, inputs: [], outputs: [], ...extra });
const sampler = [1, 'fixed', 1, 'euler'];

describe('convertUiWorkflow', () => {
    it('lays widgets out like the frontend: a seed control slot, the upload button last', () => {
        expect(widgetLayout(defs.KSampler, () => undefined).map((widget) => widget?.name ?? null)).toEqual(['seed', null, 'steps', 'sampler_name']);
        expect(widgetLayout(defs.LoadImage, () => undefined).map((widget) => widget?.name ?? null)).toEqual(['image', null]);
    });

    it('carries widget values and links, and leaves notes out', () => {
        const ui = {
            last_node_id: 4,
            nodes: [
                node(1, 'CheckpointLoaderSimple', { outputs: [{ type: 'MODEL', links: [1] }], widgets_values: ['a.safetensors'] }),
                node(2, 'KSampler', { inputs: [{ name: 'model', type: 'MODEL', link: 1 }], widgets_values: [42, 'randomize', 30, 'dpmpp_2m'] }),
                node(3, 'LoadImage', { widgets_values: ['layer.png', 'image'] }),
                node(4, 'Note', { widgets_values: ['just a note'] }),
            ],
            links: [[1, 1, 0, 2, 0, 'MODEL']],
        };
        expect(convertUiWorkflow(ui, defs).prompt).toEqual({
            1: { inputs: { ckpt_name: 'a.safetensors' }, class_type: 'CheckpointLoaderSimple', _meta: { title: 'Load Checkpoint' } },
            2: { inputs: { seed: 42, steps: 30, sampler_name: 'dpmpp_2m', model: ['1', 0] }, class_type: 'KSampler', _meta: { title: 'KSampler' } },
            3: { inputs: { image: 'layer.png' }, class_type: 'LoadImage', _meta: { title: 'Load Image' } },
        });
    });

    it('expands a subgraph into its nodes, with ids that carry the path', () => {
        const ui = {
            last_node_id: 2,
            nodes: [
                node(1, 'CheckpointLoaderSimple', { outputs: [{ type: 'MODEL', links: [1] }], widgets_values: ['a.safetensors'] }),
                node(2, 'sub-a', { inputs: [{ name: 'model', type: 'MODEL', link: 1 }] }),
            ],
            links: [[1, 1, 0, 2, 0, 'MODEL']],
            definitions: {
                subgraphs: [{
                    id: 'sub-a',
                    name: 'Sample',
                    inputs: [{ name: 'model', type: 'MODEL' }],
                    outputs: [],
                    nodes: [node(5, 'KSampler', { inputs: [{ name: 'model', type: 'MODEL', link: 9 }], widgets_values: [7, 'fixed', 12, 'euler'] })],
                    links: [{ id: 9, origin_id: -10, origin_slot: 0, target_id: 5, target_slot: 0, type: 'MODEL' }],
                }],
            },
        };
        const prompt = convertUiWorkflow(ui, defs).prompt;
        // No node whose class is the subgraph id — that is what the old converter produced.
        expect(Object.values(prompt).map((entry) => entry.class_type).sort()).toEqual(['CheckpointLoaderSimple', 'KSampler']);
        expect(prompt['2:5'].inputs).toEqual({ seed: 7, steps: 12, sampler_name: 'euler', model: ['1', 0] });
    });

    it('falls back to the link that really ends at an input when the saved reference is stale', () => {
        const ui = {
            nodes: [
                node(1, 'CheckpointLoaderSimple', { outputs: [{ type: 'MODEL', links: [7] }], widgets_values: ['a.safetensors'] }),
                node(2, 'KSampler', { inputs: [{ name: 'model', type: 'MODEL', link: 99 }], widgets_values: sampler }),
                node(3, 'KSampler', { widgets_values: sampler }),
            ],
            links: [[99, 1, 0, 3, 0, 'MODEL'], [7, 1, 0, 2, 0, 'MODEL']],
        };
        expect(convertUiWorkflow(ui, defs).prompt[2].inputs.model).toEqual(['1', 0]);
    });

    it('resolves Set/Get nodes, reroutes and primitives to real nodes and values', () => {
        const ui = {
            nodes: [
                node(1, 'CheckpointLoaderSimple', { outputs: [{ type: 'MODEL', links: [1] }], widgets_values: ['a.safetensors'] }),
                node(2, 'SetNode', { inputs: [{ name: 'MODEL', type: 'MODEL', link: 1 }], widgets_values: ['model'] }),
                node(3, 'GetNode', { outputs: [{ type: 'MODEL', links: [2] }], widgets_values: ['model'] }),
                node(4, 'Reroute', { inputs: [{ name: '', type: '*', link: 2 }], outputs: [{ type: 'MODEL', links: [3] }] }),
                node(5, 'PrimitiveNode', { outputs: [{ type: 'INT', links: [4], widget: { name: 'steps' } }], widgets_values: [12, 'fixed'] }),
                node(6, 'KSampler', {
                    inputs: [{ name: 'model', type: 'MODEL', link: 3 }, { name: 'steps', type: 'INT', widget: { name: 'steps' }, link: 4 }],
                    widgets_values: [5, 'fixed', 20, 'euler'],
                }),
            ],
            links: [[1, 1, 0, 2, 0, 'MODEL'], [2, 3, 0, 4, 0, 'MODEL'], [3, 4, 0, 6, 0, 'MODEL'], [4, 5, 0, 6, 1, 'INT']],
        };
        const prompt = convertUiWorkflow(ui, defs).prompt;
        expect(Object.keys(prompt).sort()).toEqual(['1', '6']);
        expect(prompt[6].inputs).toEqual({ seed: 5, steps: 12, sampler_name: 'euler', model: ['1', 0] });
    });

    it('drops muted nodes and passes a bypassed node’s input through', () => {
        const ui = {
            nodes: [
                node(1, 'CheckpointLoaderSimple', { outputs: [{ type: 'MODEL', links: [1] }], widgets_values: ['a.safetensors'] }),
                node(2, 'KSampler', { mode: 4, inputs: [{ name: 'model', type: 'MODEL', link: 1 }], outputs: [{ type: 'MODEL', links: [2] }], widgets_values: sampler }),
                node(3, 'KSampler', { inputs: [{ name: 'model', type: 'MODEL', link: 2 }], widgets_values: sampler }),
                node(4, 'KSampler', { mode: 2, outputs: [{ type: 'MODEL', links: [3] }], widgets_values: sampler }),
                node(5, 'KSampler', { inputs: [{ name: 'model', type: 'MODEL', link: 3 }], widgets_values: sampler }),
            ],
            links: [[1, 1, 0, 2, 0, 'MODEL'], [2, 2, 0, 3, 0, 'MODEL'], [3, 4, 0, 5, 0, 'MODEL']],
        };
        const prompt = convertUiWorkflow(ui, defs).prompt;
        expect(Object.keys(prompt).sort()).toEqual(['1', '3', '5']);
        expect(prompt[3].inputs.model).toEqual(['1', 0]);
        expect(prompt[5].inputs.model).toBeUndefined();
    });

    it('processes dynamic prompts like the frontend', () => {
        expect(processDynamicPrompt('a {red|blue} fox // comment', () => 0.9)).toBe('a blue fox ');
        const ui = { nodes: [node(1, 'CLIPTextEncode', { widgets_values: ['a {cute|fluffy} fennec'] })], links: [] };
        expect(convertUiWorkflow(ui, defs, () => 0).prompt[1].inputs.text).toBe('a cute fennec');
    });

    it('skips and reports a missing node nothing depends on, and names one that is needed', () => {
        const leaf = { nodes: [node(1, 'LoadImage', { widgets_values: ['x.png'] }), node(2, 'Fast Groups Bypasser (rgthree)')], links: [] };
        expect(convertUiWorkflow(leaf, defs).skipped).toEqual(['Fast Groups Bypasser (rgthree)']);

        const needed = {
            nodes: [
                node(1, 'MissingLoader', { title: 'My Loader', outputs: [{ type: 'MODEL', links: [1] }] }),
                node(2, 'KSampler', { inputs: [{ name: 'model', type: 'MODEL', link: 1 }] }),
            ],
            links: [[1, 1, 0, 2, 0, 'MODEL']],
        };
        let error: unknown;
        try {
            convertUiWorkflow(needed, defs);
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(ConversionError);
        expect((error as ConversionError).message).toBe('Node "My Loader" (MissingLoader) is not installed on this ComfyUI server.');
        expect((error as ConversionError).missingNodeType).toBe('MissingLoader');
    });

    it('refuses nodes it cannot read and legacy group nodes, saying what to do instead', () => {
        expect(() => convertUiWorkflow({ nodes: [node(1, 'Load3D', { widgets_values: [512] })], links: [] }, defs)).toThrow(/Export \(API\)/);
        expect(() => convertUiWorkflow({ nodes: [], links: [], extra: { groupNodes: { g: {} } } }, defs)).toThrow(/group nodes/);
    });

    it('lists the classes inside subgraphs, not the subgraph ids', () => {
        const ui = {
            nodes: [node(1, 'sub-1'), node(2, 'KSampler')],
            links: [],
            definitions: { subgraphs: [{ id: 'sub-1', nodes: [node(3, 'CLIPTextEncode')], links: [] }] },
        };
        expect(uiNodeTypes(ui).sort()).toEqual(['CLIPTextEncode', 'KSampler']);
    });
});
