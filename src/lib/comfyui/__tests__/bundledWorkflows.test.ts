/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';

import { prepareWorkflowBlueprint } from '@/lib/comfyui/promptBlueprint';
import type { ComfyModelPreset, RegisteredWorkflow } from '@/lib/comfyui/registryTypes';
import { convertUiWorkflow, isUiWorkflow, uiNodeTypes } from '@/lib/comfyui/uiWorkflowConverter';
import { resolveWorkflowBindings } from '@/lib/comfyui/workflowTargets';

/**
 * The workflows this app ships as saved (editor) graphs.
 *
 * They used to go through a converter that could not expand a subgraph, so
 * the FLUX 2 Klein templates came out with node classes that were subgraph
 * ids, and they declare no input bindings, so a prompt never reached them.
 * These tests run each one through the real conversion against node
 * definitions and check that what comes out is something ComfyUI can queue
 * and the app can drive.
 */
const WORKFLOW_DIR = path.join(__dirname, '..', 'workflows');
const DEFS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'convert', 'object_info.json'), 'utf8'));

const savedGraphs = fs.readdirSync(WORKFLOW_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ file, graph: JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8')) }))
    .filter(({ graph }) => isUiWorkflow(graph));

/**
 * Definitions for every node a graph uses. The fixture set covers core nodes;
 * for anything else a definition is synthesised from the graph itself, which
 * is enough to exercise link and subgraph resolution (widget values of such
 * nodes are not asserted).
 */
const defsFor = (graph: { nodes?: unknown[] }) => {
    const defs: Record<string, unknown> = { ...DEFS };
    for (const type of uiNodeTypes(graph)) {
        if (!defs[type]) defs[type] = { input: { required: {} }, input_order: { required: [] }, display_name: type };
    }
    return defs;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const defaultPreset: ComfyModelPreset = { id: 'default', name: 'default', description: '', inputOverrides: [] };

describe('bundled saved-graph workflows', () => {
    it('are present', () => {
        expect(savedGraphs.map(({ file }) => file)).toEqual(expect.arrayContaining([
            'image_flux2_klein_image_edit_9b_base.json',
            'image_flux2_klein_image_edit_4b_base.json',
        ]));
    });

    it.each(savedGraphs.map(({ file, graph }) => [file, graph] as const))(
        '%s converts to real node classes with its subgraphs expanded',
        (_file, graph) => {
            const { prompt } = convertUiWorkflow(graph, defsFor(graph));
            const classes = Object.values(prompt).map((node) => node.class_type);
            expect(classes.length).toBeGreaterThan(3);
            expect(classes.filter((type) => UUID.test(type))).toEqual([]);
            // Every link points at a node that exists in the prompt.
            for (const node of Object.values(prompt)) {
                for (const value of Object.values(node.inputs)) {
                    if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') {
                        expect(prompt[value[0]]).toBeDefined();
                    }
                }
            }
        },
    );

    it.each(savedGraphs.map(({ file, graph }) => [file, graph] as const))(
        '%s has somewhere for the prompt to go',
        (_file, graph) => {
            const { prompt } = convertUiWorkflow(graph, defsFor(graph));
            const sources = resolveWorkflowBindings(prompt, []).map((binding) => binding.source);
            expect(sources).toContain('prompt');
        },
    );

    it('delivers the prompt and the uploaded image to an edit template that declares no bindings', async () => {
        const { graph } = savedGraphs.find(({ file }) => file === 'image_flux2_klein_image_edit_9b_base.json')!;
        const workflow = {
            id: 'klein-edit',
            loadBlueprint: () => graph,
            inputBindings: [],
        } as unknown as RegisteredWorkflow;

        const prepared = await prepareWorkflowBlueprint(
            workflow,
            { prompt: 'make the sky stormy', image: 'image-express-input-abc.png', seed: 1234 },
            defaultPreset,
            defsFor(graph),
        );

        const nodes = Object.values(prepared);
        expect(nodes.some((node) => Object.values(node.inputs).includes('make the sky stormy'))).toBe(true);
        expect(nodes.some((node) => /LoadImage/.test(node.class_type) && node.inputs.image === 'image-express-input-abc.png')).toBe(true);
    });

    it('falls back to the table-driven conversion when the server’s definitions are not known', async () => {
        const workflow = {
            id: 'plain',
            loadBlueprint: () => ({
                nodes: [{ id: 1, type: 'CLIPTextEncode', inputs: [], widgets_values: ['hello'] }],
                links: [],
            }),
            inputBindings: [],
        } as unknown as RegisteredWorkflow;
        const prepared = await prepareWorkflowBlueprint(workflow, {}, defaultPreset, null);
        expect(prepared['1']).toMatchObject({ class_type: 'CLIPTextEncode', inputs: { text: 'hello' } });
    });
});
