import type { WorkflowInputBinding } from './registry';

export const workflowRequiresPositivePrompt = (bindings: WorkflowInputBinding[]): boolean => (
    bindings.some((binding) => binding.source === 'prompt')
);