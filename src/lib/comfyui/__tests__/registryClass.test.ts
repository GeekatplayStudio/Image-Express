/** @jest-environment node */
import { comfyWorkflowRegistry } from '../registry';
import type { ComfyModelPreset, RegisteredWorkflow } from '../registry';

function makeWorkflow(overrides: Partial<RegisteredWorkflow> = {}): RegisteredWorkflow {
  return {
    id: 'wf-test',
    task: 'generate',
    name: 'Test workflow',
    description: '',
    loadBlueprint: () => ({}),
    inputBindings: [],
    outputNodeIds: [],
    modelPresetIds: ['preset-a', 'preset-b'],
    defaultModelPresetId: 'preset-b',
    ...overrides,
  };
}

function makePreset(id: string, overrides: Partial<ComfyModelPreset> = {}): ComfyModelPreset {
  return {
    id,
    name: id,
    description: '',
    inputOverrides: [],
    ...overrides,
  };
}

describe('comfyWorkflowRegistry', () => {
  it('registers and retrieves workflows by id and task', () => {
    const workflow = makeWorkflow({ id: 'wf-generate', task: 'generate' });
    comfyWorkflowRegistry.register(workflow);
    expect(comfyWorkflowRegistry.getWorkflow('wf-generate')).toBe(workflow);
    expect(comfyWorkflowRegistry.getWorkflowsForTask('generate')).toContain(workflow);
  });

  it('returns only presets referenced by a workflow', () => {
    comfyWorkflowRegistry.registerModelPreset(makePreset('preset-a'));
    comfyWorkflowRegistry.registerModelPreset(makePreset('preset-b'));
    comfyWorkflowRegistry.registerModelPreset(makePreset('preset-unrelated'));
    comfyWorkflowRegistry.register(makeWorkflow({ id: 'wf-presets', modelPresetIds: ['preset-a', 'preset-b'] }));

    const ids = comfyWorkflowRegistry.getModelPresetsForWorkflow('wf-presets').map((preset) => preset.id);
    expect(ids).toEqual(['preset-a', 'preset-b']);
  });

  it('prefers the requested preset, then the default, then the first compatible', () => {
    comfyWorkflowRegistry.registerModelPreset(makePreset('preset-a'));
    comfyWorkflowRegistry.registerModelPreset(makePreset('preset-b'));
    comfyWorkflowRegistry.register(makeWorkflow({ id: 'wf-select', task: 'img2img' }));

    expect(comfyWorkflowRegistry.resolveWorkflowSelection({ task: 'img2img', workflowId: 'wf-select', modelPresetId: 'preset-a' }).modelPreset.id).toBe('preset-a');
    expect(comfyWorkflowRegistry.resolveWorkflowSelection({ task: 'img2img', workflowId: 'wf-select' }).modelPreset.id).toBe('preset-b');
  });

  it('throws when no workflow is registered for a task', () => {
    expect(() => comfyWorkflowRegistry.resolveWorkflowSelection({ task: 'outpaint', workflowId: 'missing' }))
      .toThrow('No ComfyUI workflow is registered');
  });
});
