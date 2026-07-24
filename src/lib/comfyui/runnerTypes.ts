import type {
    ComfyExecutionProgress,
    ComfyExecutionResult,
    ComfyUIClient,
} from '@/lib/comfyui/client';
import type { ComfyConnectionOptions } from '@/lib/comfyui/connection';
import type {
    ComfyModelPreset,
    ComfyTask,
    ComfyWorkflowInputSource,
    ComfyWorkflowInstallableModel,
    ComfyWorkflowVariableParams,
    RegisteredWorkflow,
} from '@/lib/comfyui/registry';

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

export interface PreparedComfyTaskDiagnostics extends PreparedComfyTaskExecution {
    boundInputValues: Partial<Record<ComfyWorkflowInputSource, unknown[]>>;
}

export interface ExecuteComfyTaskOptions extends PrepareComfyTaskOptions {
    onProgress?: (progress: ComfyExecutionProgress) => void;
    onQueued?: (promptId: string) => void;
    onPrepared?: (prepared: PreparedComfyTaskDiagnostics) => void;
}

export interface ExecuteComfyTaskResult {
    workflow: RegisteredWorkflow;
    modelPreset: ComfyModelPreset;
    result: ComfyExecutionResult;
}

export interface ComfyWorkflowCompatibilityRecord {
    workflowId: string;
    workflowName: string;
    task: ComfyTask;
    requiredNodeTypes: string[];
    missingNodeTypes: string[];
    missingModels: ComfyWorkflowInstallableModel[];
    compatible: boolean;
    canAutoUpdateInstall: boolean;
}

export interface ComfyServerCatalogSnapshot {
    serverUrl: string;
    transportKind: 'local' | 'cloud';
    detectedVersion: string;
    workflowCount: number;
    compatibleWorkflowCount: number;
    records: ComfyWorkflowCompatibilityRecord[];
}

export interface RecoverComfyTaskOptions {
    connection?: ComfyConnectionOptions;
    serverUrl?: string;
    promptId: string;
    workflowId?: string;
    onProgress?: (progress: ComfyExecutionProgress) => void;
}
