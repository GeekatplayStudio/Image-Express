import {
    ComfyUIClient,
    type ComfyExecutionResult,
} from '@/lib/comfyui/client';
import {
    resolveAvailableComfyTransport,
} from '@/lib/comfyui/connection';
import {
    comfyWorkflowRegistry,
    prepareWorkflowBlueprint,
    readWorkflowInputBindingValues,
    type ComfyPromptBlueprint,
    type ComfyWorkflowVariableParams,
} from '@/lib/comfyui/registry';
import { ensureComfyWorkflowCatalogRegistered } from '@/lib/comfyui/workflows/catalog';
import {
    detectComfyVersion,
    extractNodeTypesFromWorkflowJson,
    findMissingInstallableModels,
    findMissingNodeTypes,
    isRecord,
    resolveModelPresetForWorkflow,
} from '@/lib/comfyui/workflowInspection';
import type {
    ComfyServerCatalogSnapshot,
    ComfyWorkflowCompatibilityRecord,
    ExecuteComfyTaskOptions,
    ExecuteComfyTaskResult,
    PrepareComfyTaskOptions,
    PreparedComfyTaskExecution,
    RecoverComfyTaskOptions,
} from '@/lib/comfyui/runnerTypes';

export type {
    PrepareComfyTaskOptions,
    PreparedComfyTaskExecution,
    PreparedComfyTaskDiagnostics,
    ExecuteComfyTaskOptions,
    ExecuteComfyTaskResult,
    ComfyWorkflowCompatibilityRecord,
    ComfyServerCatalogSnapshot,
    RecoverComfyTaskOptions,
} from '@/lib/comfyui/runnerTypes';

const uploadAssetIfNeeded = async (
    client: ComfyUIClient,
    value: unknown,
    filename: string
): Promise<unknown> => {
    if (typeof value !== 'string' || !value.startsWith('data:')) {
        return value;
    }

    return client.uploadImage(value, filename);
};

export const prepareComfyTask = async (options: PrepareComfyTaskOptions): Promise<PreparedComfyTaskExecution> => {
    ensureComfyWorkflowCatalogRegistered();

    const resolvedTransport = await resolveAvailableComfyTransport(
        options.connection || {
            mode: 'local',
            localUrl: options.serverUrl,
        }
    );
    const client = new ComfyUIClient(resolvedTransport);
    const canAutoFallbackWorkflow = !options.workflowId;
    let selection = comfyWorkflowRegistry.resolveWorkflowSelection({
        task: options.task,
        workflowId: options.workflowId,
        modelPresetId: options.modelPresetId,
    });

    const params: ComfyWorkflowVariableParams = {
        ...options.params,
    };

    params.image = await uploadAssetIfNeeded(client, params.image, 'image-express-input.png') as string | undefined;
    params.mask = await uploadAssetIfNeeded(client, params.mask, 'image-express-mask.png') as string | undefined;

    let workflowJson = await prepareWorkflowBlueprint(selection.workflow, params, selection.modelPreset);

    const objectInfo = await client.getObjectInfoSnapshot();
    if (objectInfo && typeof objectInfo === 'object') {
        const missingNodeTypes = findMissingNodeTypes(workflowJson, objectInfo);

        if (missingNodeTypes.length > 0) {
            let resolvedFallback = false;
            if (canAutoFallbackWorkflow) {
                const candidates = comfyWorkflowRegistry.getWorkflowsForTask(options.task)
                    .filter((workflow) => workflow.id !== selection.workflow.id);

                for (const candidateWorkflow of candidates) {
                    const candidateModelPreset = resolveModelPresetForWorkflow(candidateWorkflow, options.modelPresetId);
                    const candidateBlueprint = await prepareWorkflowBlueprint(candidateWorkflow, params, candidateModelPreset);
                    const candidateMissing = findMissingNodeTypes(candidateBlueprint, objectInfo);
                    if (candidateMissing.length === 0) {
                        selection = {
                            workflow: candidateWorkflow,
                            modelPreset: candidateModelPreset,
                        };
                        workflowJson = candidateBlueprint;
                        resolvedFallback = true;
                        break;
                    }
                }
            }

            if (!resolvedFallback) {
                const missingSummary = missingNodeTypes.slice(0, 5).join(', ');
                throw new Error(
                    `Selected ComfyUI workflow "${selection.workflow.id}" requires missing node types: ${missingSummary}. `
                    + 'Install the required custom nodes/models in ComfyUI, or choose a compatible workflow from the list.'
                );
            }
        }
    }

    return {
        client,
        workflow: selection.workflow,
        modelPreset: selection.modelPreset,
        workflowJson,
    };
};

export const executeComfyTask = async (options: ExecuteComfyTaskOptions): Promise<ExecuteComfyTaskResult> => {
    const prepared = await prepareComfyTask(options);
    options.onPrepared?.({
        ...prepared,
        boundInputValues: readWorkflowInputBindingValues(
            prepared.workflowJson as ComfyPromptBlueprint,
            prepared.workflow.inputBindings
        ),
    });

    const result = await prepared.client.executeWorkflow(
        prepared.workflowJson,
        prepared.workflow.outputNodeIds,
        options.onProgress,
        options.onQueued
    );

    return {
        workflow: prepared.workflow,
        modelPreset: prepared.modelPreset,
        result,
    };
};

export const inspectComfyServerCatalog = async (
    options: Omit<PrepareComfyTaskOptions, 'task' | 'params'>
): Promise<ComfyServerCatalogSnapshot> => {
    ensureComfyWorkflowCatalogRegistered();

    const resolvedTransport = await resolveAvailableComfyTransport(
        options.connection || {
            mode: 'local',
            localUrl: options.serverUrl,
        }
    );

    const client = new ComfyUIClient(resolvedTransport);
    const [features, systemStats, objectInfo] = await Promise.all([
        client.getFeaturesSnapshot(),
        client.getSystemStatsSnapshot(),
        client.getObjectInfoSnapshot(),
    ]);

    const availableNodeTypes = new Set<string>(
        objectInfo && typeof objectInfo === 'object'
            ? Object.keys(objectInfo)
            : []
    );

    const workflows = comfyWorkflowRegistry.getAllWorkflows();
    const records: ComfyWorkflowCompatibilityRecord[] = [];

    for (const workflow of workflows) {
        const modelPresets = comfyWorkflowRegistry.getModelPresetsForWorkflow(workflow.id);
        const modelPreset = modelPresets.find((preset) => preset.id === workflow.defaultModelPresetId)
            || modelPresets[0]
            || {
                id: 'default',
                name: 'default',
                description: 'Default',
                inputOverrides: [],
            };

        const rawBlueprint = await workflow.loadBlueprint() as unknown;
        const blueprint = isRecord(rawBlueprint)
            ? rawBlueprint as Record<string, unknown>
            : await prepareWorkflowBlueprint(workflow, {}, modelPreset);
        const requiredNodeTypes = extractNodeTypesFromWorkflowJson(blueprint);
        const missingNodeTypes = requiredNodeTypes.filter((nodeType) => !availableNodeTypes.has(nodeType));
        const missingModels = objectInfo && typeof objectInfo === 'object'
            ? findMissingInstallableModels(blueprint, objectInfo, workflow.setupRequirements?.models || [])
            : [];

        records.push({
            workflowId: workflow.id,
            workflowName: workflow.name,
            task: workflow.task,
            requiredNodeTypes,
            missingNodeTypes,
            missingModels,
            compatible: missingNodeTypes.length === 0 && missingModels.length === 0,
            canAutoUpdateInstall: Boolean(workflow.setupRequirements?.updateInstallForMissingNodes),
        });
    }

    return {
        serverUrl: resolvedTransport.baseUrl,
        transportKind: resolvedTransport.kind,
        detectedVersion: detectComfyVersion(features, systemStats),
        workflowCount: records.length,
        compatibleWorkflowCount: records.filter((record) => record.compatible).length,
        records,
    };
};

export const recoverComfyTaskByPromptId = async (
    options: RecoverComfyTaskOptions
): Promise<ComfyExecutionResult> => {
    ensureComfyWorkflowCatalogRegistered();

    const resolvedTransport = await resolveAvailableComfyTransport(
        options.connection || {
            mode: 'local',
            localUrl: options.serverUrl,
        }
    );

    const client = new ComfyUIClient(resolvedTransport);
    const workflow = options.workflowId
        ? comfyWorkflowRegistry.getWorkflow(options.workflowId)
        : null;
    const outputNodeIds = workflow?.outputNodeIds || [];

    return client.waitForHistoryOutput(
        options.promptId,
        outputNodeIds,
        1800000,
        1000,
        options.onProgress,
        Date.now()
    );
};
