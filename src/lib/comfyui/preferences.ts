import type { ComfyTask } from '@/lib/comfyui/registry';

export interface ComfyTaskPreference {
    workflowId?: string;
    modelPresetId?: string;
}

export interface ComfyWorkflowPreferences {
    taskDefaults: Partial<Record<ComfyTask, ComfyTaskPreference>>;
}

export const COMFY_WORKFLOW_PREFERENCES_STORAGE_KEY = 'image-express-comfy-workflow-preferences';

const DEFAULT_COMFY_WORKFLOW_PREFERENCES: ComfyWorkflowPreferences = {
    taskDefaults: {},
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

export const loadComfyWorkflowPreferences = (): ComfyWorkflowPreferences => {
    if (typeof window === 'undefined') {
        return DEFAULT_COMFY_WORKFLOW_PREFERENCES;
    }

    try {
        const raw = window.localStorage.getItem(COMFY_WORKFLOW_PREFERENCES_STORAGE_KEY);
        if (!raw) {
            return DEFAULT_COMFY_WORKFLOW_PREFERENCES;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!isRecord(parsed) || !isRecord(parsed.taskDefaults)) {
            return DEFAULT_COMFY_WORKFLOW_PREFERENCES;
        }

        const taskDefaults: Partial<Record<ComfyTask, ComfyTaskPreference>> = {};

        for (const [task, value] of Object.entries(parsed.taskDefaults)) {
            if (!isRecord(value)) {
                continue;
            }

            taskDefaults[task as ComfyTask] = {
                workflowId: typeof value.workflowId === 'string' ? value.workflowId : undefined,
                modelPresetId: typeof value.modelPresetId === 'string' ? value.modelPresetId : undefined,
            };
        }

        return { taskDefaults };
    } catch {
        return DEFAULT_COMFY_WORKFLOW_PREFERENCES;
    }
};

export const saveComfyTaskPreference = (
    task: ComfyTask,
    updates: ComfyTaskPreference
): ComfyWorkflowPreferences => {
    if (typeof window === 'undefined') {
        return DEFAULT_COMFY_WORKFLOW_PREFERENCES;
    }

    const current = loadComfyWorkflowPreferences();
    const next: ComfyWorkflowPreferences = {
        taskDefaults: {
            ...current.taskDefaults,
            [task]: {
                ...current.taskDefaults[task],
                ...updates,
            },
        },
    };

    window.localStorage.setItem(COMFY_WORKFLOW_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    return next;
};

export const getComfyTaskPreference = (task: ComfyTask): ComfyTaskPreference => (
    loadComfyWorkflowPreferences().taskDefaults[task] || {}
);
