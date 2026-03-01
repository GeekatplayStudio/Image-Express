import {
    ComfyUIClient,
    type ComfyExecutionProgress,
    type ComfyExecutionResult,
} from '@/lib/comfyui/client';
import {
    resolveAvailableComfyTransport,
    type ComfyConnectionOptions,
} from '@/lib/comfyui/connection';
import {
    comfyWorkflowRegistry,
    prepareWorkflowBlueprint,
    type ComfyModelPreset,
    type ComfyTask,
    type ComfyWorkflowVariableParams,
    type RegisteredWorkflow,
} from '@/lib/comfyui/registry';
import { ensureComfyWorkflowCatalogRegistered } from '@/lib/comfyui/workflows/catalog';

export interface PrepareComfyTaskOptions {
    serverUrl?: string;
    connection?: ComfyConnectionOptions;
    task: ComfyTask;
    workflowId?: string;
    modelPresetId?: string;
    params: ComfyWorkflowVariableParams;
}

export interface PreparedComfyTaskExecution {
    client: ComfyUIClient;
    workflow: RegisteredWorkflow;
    modelPreset: ComfyModelPreset;
    workflowJson: Record<string, unknown>;
}

export interface ExecuteComfyTaskOptions extends PrepareComfyTaskOptions {
    onProgress?: (progress: ComfyExecutionProgress) => void;
}

export interface ExecuteComfyTaskResult {
    workflow: RegisteredWorkflow;
    modelPreset: ComfyModelPreset;
    result: ComfyExecutionResult;
}

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
    const selection = comfyWorkflowRegistry.resolveWorkflowSelection({
        task: options.task,
        workflowId: options.workflowId,
        modelPresetId: options.modelPresetId,
    });

    const params: ComfyWorkflowVariableParams = {
        ...options.params,
    };

    params.image = await uploadAssetIfNeeded(client, params.image, 'image-express-input.png') as string | undefined;
    params.mask = await uploadAssetIfNeeded(client, params.mask, 'image-express-mask.png') as string | undefined;

    const workflowJson = await prepareWorkflowBlueprint(selection.workflow, params, selection.modelPreset);

    return {
        client,
        workflow: selection.workflow,
        modelPreset: selection.modelPreset,
        workflowJson,
    };
};

export const executeComfyTask = async (options: ExecuteComfyTaskOptions): Promise<ExecuteComfyTaskResult> => {
    const prepared = await prepareComfyTask(options);
    const result = await prepared.client.executeWorkflow(
        prepared.workflowJson,
        prepared.workflow.outputNodeIds,
        options.onProgress
    );

    return {
        workflow: prepared.workflow,
        modelPreset: prepared.modelPreset,
        result,
    };
};
