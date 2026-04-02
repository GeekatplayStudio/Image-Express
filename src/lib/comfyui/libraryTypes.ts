import {
    comfyWorkflowRegistry,
    normalizeComfyPromptBlueprint,
    type ComfyPromptBlueprint,
    type ComfyTask,
    type RegisteredWorkflow,
    type WorkflowInputBinding,
} from '@/lib/comfyui/registry';

export type ComfyLibraryWorkflowSource = 'custom-folder' | 'server-template';
export type ComfyLibraryRepoKind = 'custom-nodes' | 'workflow-library';

export interface ComfyWorkflowManifest {
    id?: string;
    name?: string;
    description?: string;
    task?: ComfyTask;
    inputBindings?: WorkflowInputBinding[];
    outputNodeIds?: string[];
    modelPresetIds?: string[];
    defaultModelPresetId?: string;
}

export interface SerializedComfyWorkflowRegistration {
    id: string;
    task: ComfyTask;
    name: string;
    description: string;
    blueprint: ComfyPromptBlueprint;
    inputBindings: WorkflowInputBinding[];
    outputNodeIds: string[];
    modelPresetIds: string[];
    defaultModelPresetId?: string;
}

export interface ComfyLibraryWorkflowImportRef {
    templateUrl?: string;
    templatePath?: string;
}

export interface ComfyLibraryWorkflowEntry {
    id: string;
    source: ComfyLibraryWorkflowSource;
    name: string;
    description: string;
    task: ComfyTask | null;
    runnable: boolean;
    category: string;
    location?: string;
    nodeTypes: string[];
    registration?: SerializedComfyWorkflowRegistration;
    importRef?: ComfyLibraryWorkflowImportRef;
    warning?: string;
}

export interface ComfyLibraryNodeRepo {
    name: string;
    path: string;
    repoKind: ComfyLibraryRepoKind;
    gitManaged: boolean;
    workflowHintCount: number;
    requirementsFile: boolean;
}

export interface ComfyLibrarySnapshot {
    customNodesPath: string;
    workflowLibraryPath: string;
    installPath: string;
    serverTemplates: ComfyLibraryWorkflowEntry[];
    customFolderWorkflows: ComfyLibraryWorkflowEntry[];
    nodeRepos: ComfyLibraryNodeRepo[];
    warnings: string[];
}

const slugify = (value: string): string => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeId = (value: string, fallbackPrefix: string): string => {
    const normalized = slugify(value);
    if (normalized) {
        return normalized;
    }

    return `${fallbackPrefix}-${Date.now()}`;
};

const extractNodeTypes = (blueprint: ComfyPromptBlueprint): string[] => {
    const nodeTypes = new Set<string>();
    for (const node of Object.values(blueprint)) {
        if (typeof node.class_type === 'string' && node.class_type.trim().length > 0) {
            nodeTypes.add(node.class_type);
        }
    }
    return Array.from(nodeTypes);
};

const hasNodeType = (nodeTypes: string[], pattern: RegExp): boolean => (
    nodeTypes.some((nodeType) => pattern.test(nodeType))
);

const inferTaskFromNameAndBlueprint = (
    id: string,
    name: string,
    nodeTypes: string[]
): ComfyTask => {
    const fingerprint = `${id} ${name} ${nodeTypes.join(' ')}`.toLowerCase();

    if (fingerprint.includes('outpaint')) {
        return 'outpaint';
    }
    if (fingerprint.includes('inpaint') || (fingerprint.includes('mask') && fingerprint.includes('image'))) {
        return 'inpaint';
    }
    if (fingerprint.includes('upscale') || fingerprint.includes('esrgan') || fingerprint.includes('supir')) {
        return 'upscale';
    }
    if (fingerprint.includes('img2img') || fingerprint.includes('image to image')) {
        return 'img2img';
    }
    if (fingerprint.includes('edit')) {
        return 'edit';
    }
    if (fingerprint.includes('multi-reference') || fingerprint.includes('reference')) {
        return 'multi-reference';
    }
    if (hasNodeType(nodeTypes, /LoadImage/i)) {
        return 'img2img';
    }

    return 'generate';
};

const inferOutputNodeIds = (blueprint: ComfyPromptBlueprint): string[] => {
    const preferredNodeIds = Object.entries(blueprint)
        .filter(([, node]) => /(?:save|preview).*(?:image|video)|VHS_VideoCombine/i.test(node.class_type))
        .map(([nodeId]) => nodeId);

    if (preferredNodeIds.length > 0) {
        return preferredNodeIds;
    }

    const lastNodeId = Object.keys(blueprint).slice(-1);
    return lastNodeId;
};

const inferPromptBindings = (blueprint: ComfyPromptBlueprint): WorkflowInputBinding[] => {
    const bindings: WorkflowInputBinding[] = [];

    for (const [nodeId, node] of Object.entries(blueprint)) {
        const classType = node.class_type.toLowerCase();
        const title = typeof node._meta?.title === 'string' ? node._meta.title.toLowerCase() : '';
        const inputNames = Object.keys(node.inputs);

        const promptish = /prompt|textencode|cliptextencode|encode/i.test(classType)
            || inputNames.some((inputName) => ['text', 'prompt', 'positive', 'negative', 't5xxl', 'clip_l'].includes(inputName));
        if (!promptish) {
            continue;
        }

        for (const inputName of inputNames) {
            const normalizedInputName = inputName.toLowerCase();
            if (['text', 'prompt', 'positive', 'positive_prompt', 't5xxl', 'clip_l'].includes(normalizedInputName)) {
                bindings.push({
                    source: title.includes('negative') ? 'negativePrompt' : 'prompt',
                    nodeId,
                    inputName,
                });
            } else if (['negative', 'negative_prompt', 'negative_text'].includes(normalizedInputName)) {
                bindings.push({
                    source: 'negativePrompt',
                    nodeId,
                    inputName,
                });
            }
        }
    }

    return bindings;
};

const inferImageBindings = (blueprint: ComfyPromptBlueprint): WorkflowInputBinding[] => {
    const bindings: WorkflowInputBinding[] = [];

    for (const [nodeId, node] of Object.entries(blueprint)) {
        const classType = node.class_type.toLowerCase();
        const inputNames = Object.keys(node.inputs);

        if (/loadimagemask|mask/i.test(classType) && inputNames.includes('image')) {
            bindings.push({ source: 'mask', nodeId, inputName: 'image' });
            continue;
        }

        if (/loadimage|image/i.test(classType) && inputNames.includes('image')) {
            bindings.push({ source: 'image', nodeId, inputName: 'image' });
        }
    }

    return bindings;
};

const inferSamplerBindings = (blueprint: ComfyPromptBlueprint): WorkflowInputBinding[] => {
    const bindings: WorkflowInputBinding[] = [];

    for (const [nodeId, node] of Object.entries(blueprint)) {
        const classType = node.class_type.toLowerCase();
        const inputNames = Object.keys(node.inputs);
        if (!/(ksampler|sampler|scheduler)/i.test(classType)) {
            continue;
        }

        if (inputNames.includes('seed')) {
            bindings.push({ source: 'seed', nodeId, inputName: 'seed' });
        }
        if (inputNames.includes('noise_seed')) {
            bindings.push({ source: 'seed', nodeId, inputName: 'noise_seed' });
        }
        if (inputNames.includes('steps')) {
            bindings.push({ source: 'steps', nodeId, inputName: 'steps' });
        }
        if (inputNames.includes('cfg')) {
            bindings.push({ source: 'cfg', nodeId, inputName: 'cfg' });
        }
        if (inputNames.includes('guidance')) {
            bindings.push({ source: 'cfg', nodeId, inputName: 'guidance' });
        }
        if (inputNames.includes('denoise')) {
            bindings.push({ source: 'strength', nodeId, inputName: 'denoise' });
        }
    }

    return bindings;
};

const inferDimensionBindings = (blueprint: ComfyPromptBlueprint): WorkflowInputBinding[] => {
    const bindings: WorkflowInputBinding[] = [];

    for (const [nodeId, node] of Object.entries(blueprint)) {
        const classType = node.class_type.toLowerCase();
        const inputNames = Object.keys(node.inputs);
        if (!inputNames.includes('width') || !inputNames.includes('height')) {
            continue;
        }

        if (/(empty|latent|scale|resize|image|resolution)/i.test(classType)) {
            bindings.push({ source: 'width', nodeId, inputName: 'width' });
            bindings.push({ source: 'height', nodeId, inputName: 'height' });
            break;
        }
    }

    return bindings;
};

const dedupeBindings = (bindings: WorkflowInputBinding[]): WorkflowInputBinding[] => {
    const seen = new Set<string>();
    return bindings.filter((binding) => {
        const key = `${binding.source}:${binding.nodeId}:${binding.inputName}`;
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
};

const inferBindings = (blueprint: ComfyPromptBlueprint): WorkflowInputBinding[] => dedupeBindings([
    ...inferPromptBindings(blueprint),
    ...inferImageBindings(blueprint),
    ...inferSamplerBindings(blueprint),
    ...inferDimensionBindings(blueprint),
]);

interface CreateWorkflowEntryOptions {
    idSeed: string;
    source: ComfyLibraryWorkflowSource;
    name: string;
    description?: string;
    category?: string;
    location?: string;
    blueprint: unknown;
    manifest?: ComfyWorkflowManifest | null;
    importRef?: ComfyLibraryWorkflowImportRef;
}

export const createComfyLibraryWorkflowEntry = (
    options: CreateWorkflowEntryOptions
): ComfyLibraryWorkflowEntry => {
    const manifest = options.manifest || {};
    const workflowId = normalizeId(manifest.id || options.idSeed || options.name, options.source);
    const workflowName = manifest.name || options.name || workflowId;
    const description = manifest.description || options.description || 'Imported ComfyUI workflow.';
    const normalizedBlueprint = normalizeComfyPromptBlueprint(workflowId, options.blueprint);
    const nodeTypes = extractNodeTypes(normalizedBlueprint);
    const task = manifest.task || inferTaskFromNameAndBlueprint(workflowId, workflowName, nodeTypes);
    const outputNodeIds = manifest.outputNodeIds && manifest.outputNodeIds.length > 0
        ? manifest.outputNodeIds
        : inferOutputNodeIds(normalizedBlueprint);
    const inputBindings = manifest.inputBindings && manifest.inputBindings.length > 0
        ? manifest.inputBindings
        : inferBindings(normalizedBlueprint);
    const modelPresetIds = manifest.modelPresetIds && manifest.modelPresetIds.length > 0
        ? manifest.modelPresetIds
        : ['default'];
    const runnable = outputNodeIds.length > 0;

    return {
        id: workflowId,
        source: options.source,
        name: workflowName,
        description,
        task,
        runnable,
        category: options.category || 'Imported',
        location: options.location,
        nodeTypes,
        importRef: options.importRef,
        registration: runnable ? {
            id: workflowId,
            task,
            name: workflowName,
            description,
            blueprint: normalizedBlueprint,
            inputBindings,
            outputNodeIds,
            modelPresetIds,
            defaultModelPresetId: manifest.defaultModelPresetId || modelPresetIds[0],
        } : undefined,
    };
};

export const registerSerializedComfyWorkflow = (
    registration: SerializedComfyWorkflowRegistration
): RegisteredWorkflow => {
    const workflow: RegisteredWorkflow = {
        id: registration.id,
        task: registration.task,
        name: registration.name,
        description: registration.description,
        loadBlueprint: () => registration.blueprint,
        inputBindings: registration.inputBindings,
        outputNodeIds: registration.outputNodeIds,
        modelPresetIds: registration.modelPresetIds,
        defaultModelPresetId: registration.defaultModelPresetId,
    };

    comfyWorkflowRegistry.register(workflow);
    return workflow;
};
