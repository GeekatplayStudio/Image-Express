/** @jest-environment node */
import {
    detectComfyVersion,
    extractNodeTypesFromWorkflowJson,
    findMissingInstallableModels,
    findMissingNodeTypes,
    isRecord,
} from '../workflowInspection';

describe('workflowInspection', () => {
    const promptBlueprint = {
        '1': { class_type: 'KSampler', inputs: { seed: 1 } },
        '2': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd.safetensors' } },
    } as Record<string, unknown>;

    describe('isRecord', () => {
        it('distinguishes plain objects from primitives and null', () => {
            expect(isRecord({})).toBe(true);
            expect(isRecord(null)).toBe(false);
            expect(isRecord('x')).toBe(false);
        });
    });

    describe('extractNodeTypesFromWorkflowJson', () => {
        it('returns the distinct class types from a prompt blueprint', () => {
            expect(extractNodeTypesFromWorkflowJson(promptBlueprint).sort())
                .toEqual(['CheckpointLoaderSimple', 'KSampler']);
        });

        it('reads class types out of an editor-graph blueprint', () => {
            const graph = {
                nodes: [{ type: 'KSampler', widgets_values: [] }, { type: 'MarkdownNote' }],
                links: [],
            } as Record<string, unknown>;
            expect(extractNodeTypesFromWorkflowJson(graph)).toEqual(['KSampler']);
        });
    });

    describe('findMissingNodeTypes', () => {
        it('flags required node types absent from the server object info', () => {
            const objectInfo = { KSampler: {} } as Record<string, unknown>;
            expect(findMissingNodeTypes(promptBlueprint, objectInfo)).toEqual(['CheckpointLoaderSimple']);
        });
    });

    describe('findMissingInstallableModels', () => {
        it('returns installable models whose value is not an available choice', () => {
            const objectInfo = {
                CheckpointLoaderSimple: {
                    input: { required: { ckpt_name: [['other.safetensors']] } },
                },
            } as Record<string, unknown>;
            const installable = [{ name: 'sd.safetensors', downloadUrl: 'http://x', directory: 'checkpoints' }];
            const missing = findMissingInstallableModels(promptBlueprint, objectInfo, installable);
            expect(missing).toHaveLength(1);
            expect(missing[0].name).toBe('sd.safetensors');
        });

        it('returns nothing when there are no installable models', () => {
            expect(findMissingInstallableModels(promptBlueprint, {}, [])).toEqual([]);
        });
    });

    describe('detectComfyVersion', () => {
        it('prefers the features version, then system stats, then unknown', () => {
            expect(detectComfyVersion({ version: '1.2.3' }, null)).toBe('1.2.3');
            expect(detectComfyVersion(null, { system: { comfyui_version: '9.9' } })).toBe('9.9');
            expect(detectComfyVersion(null, null)).toBe('unknown');
        });
    });
});
