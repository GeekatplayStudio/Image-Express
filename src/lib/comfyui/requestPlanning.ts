import type { ComfyTask, ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';
import type { ComfyDiagnosticsSnapshot } from '@/lib/comfyui/libraryTypes';

/**
 * Pure planning and formatting logic for ComfyUI requests.
 *
 * This lived inline in ImageGeneratorModal, a ~4,000 line component, where none
 * of it could be tested without mounting the modal — even though none of it
 * touches React. It decides the resolution, step count and CFG a generation
 * runs at, which is the difference between a good image and a bad one, and it
 * builds the diagnostics text users paste into bug reports.
 *
 * Everything here is deterministic except the seed in
 * `resolveComfyQualityProfile`.
 */

export const COMFY_AGENTIC_EDIT_WORKFLOW_9B = 'image_flux2_klein_image_edit_9b_base';
export const COMFY_AGENTIC_EDIT_WORKFLOW_4B = 'image_flux2_klein_image_edit_4b_base';

export interface ComfyMissingRequirementSummary {
    updateInstall: boolean;
    models: ComfyWorkflowInstallableModel[];
    workflows: string[];
}

export interface ComfyQualityProfile {
    width: number;
    height: number;
    steps: number;
    cfg: number;
    strength: number;
    seed: number;
}

/** Flatten a diagnostics snapshot into the plain text users attach to reports. */
export const formatComfyDiagnosticsText = (diagnostics: ComfyDiagnosticsSnapshot): string => {
    const lines: string[] = [];
    const pushSection = (title: string, sectionLines: string[]) => {
        lines.push(title);
        lines.push(...sectionLines);
        lines.push('');
    };

    pushSection('ComfyUI Diagnostics', [
        `Generated: ${diagnostics.generatedAt}`,
        `Server URL: ${diagnostics.connection.serverUrl}`,
        `Transport: ${diagnostics.connection.transportKind}`,
        `API Base Path: ${diagnostics.connection.apiBasePath || '/'}`,
        `History Path: ${diagnostics.connection.historyPathBase}`,
    ]);

    pushSection('Resolved Paths', diagnostics.paths.statuses.map((status) => (
        `${status.label}: ${status.path || '(not configured)'} | exists=${status.exists ? 'yes' : 'no'} | readable=${status.readable ? 'yes' : 'no'}${status.note ? ` | ${status.note}` : ''}`
    )));

    pushSection('Asset Inventory', diagnostics.assets.length > 0
        ? diagnostics.assets.flatMap((group) => [
            `${group.label} (${group.values.length})${group.expectedSubdirectory ? ` | expected folder: ${group.expectedSubdirectory}` : ''}`,
            `  Sources: ${group.sourceInputs.join(', ') || '(none)'}`,
            ...group.values.map((value) => `  - ${value}`),
        ])
        : ['No model-style asset lists were returned by ComfyUI object_info.']);

    pushSection('Custom Node Repositories', diagnostics.library.nodeRepos.length > 0
        ? diagnostics.library.nodeRepos.flatMap((repo) => [
            `${repo.name} | ${repo.repoKind} | ${repo.gitManaged ? 'git repo' : 'plain folder'} | workflow hints=${repo.workflowHintCount}`,
            `  Path: ${repo.path}`,
        ])
        : ['No custom node/workflow repositories were discovered in configured folders.']);

    pushSection('Workflow Library Files', diagnostics.library.customFolderWorkflows.length > 0
        ? diagnostics.library.customFolderWorkflows.flatMap((workflow) => [
            `${workflow.name} | runnable=${workflow.runnable ? 'yes' : 'no'} | task=${workflow.task || 'unknown'}`,
            `  Location: ${workflow.location || '(unknown)'}`,
            workflow.warning ? `  Warning: ${workflow.warning}` : '',
        ].filter(Boolean))
        : ['No workflow JSON files were discovered in the configured workflow folders.']);

    pushSection('Server Workflow Templates', diagnostics.library.serverTemplates.length > 0
        ? diagnostics.library.serverTemplates.flatMap((workflow) => [
            `${workflow.name} | runnable=${workflow.runnable ? 'yes' : 'no'} | task=${workflow.task || 'unknown'}`,
            `  Location: ${workflow.location || '(unknown)'}`,
            workflow.warning ? `  Warning: ${workflow.warning}` : '',
        ].filter(Boolean))
        : ['No importable server templates were discovered.']);

    pushSection('Available Node Types', diagnostics.runtime.nodeTypes.length > 0
        ? [
            `Count: ${diagnostics.runtime.nodeTypes.length}`,
            ...diagnostics.runtime.nodeTypes.map((nodeType) => `- ${nodeType}`),
        ]
        : ['No node types were returned by ComfyUI object_info.']);

    pushSection('Features JSON', [JSON.stringify(diagnostics.runtime.features, null, 2) || 'null']);
    pushSection('System Stats JSON', [JSON.stringify(diagnostics.runtime.systemStats, null, 2) || 'null']);

    if (diagnostics.library.warnings.length > 0) {
        pushSection('Warnings', diagnostics.library.warnings.map((warning) => `- ${warning}`));
    }

    return lines.join('\n').trim();
};

/**
 * Collapse per-workflow compatibility records into one actionable summary.
 * Returns null when nothing is installable, so the caller can skip the prompt
 * entirely rather than showing an empty one.
 */
export const buildComfyMissingRequirementSummary = (
    records: Array<{
        workflowId: string;
        missingNodeTypes: string[];
        missingModels: ComfyWorkflowInstallableModel[];
        canAutoUpdateInstall: boolean;
    }>
): ComfyMissingRequirementSummary | null => {
    const workflows = new Set<string>();
    const modelMap = new Map<string, ComfyWorkflowInstallableModel>();
    let updateInstall = false;

    for (const record of records) {
        if (record.missingNodeTypes.length === 0 && record.missingModels.length === 0) {
            continue;
        }

        workflows.add(record.workflowId);
        if (record.canAutoUpdateInstall && record.missingNodeTypes.length > 0) {
            updateInstall = true;
        }

        for (const model of record.missingModels) {
            modelMap.set(`${model.directory}/${model.name}`.toLowerCase(), model);
        }
    }

    if (!updateInstall && modelMap.size === 0) {
        return null;
    }

    return {
        updateInstall,
        models: Array.from(modelMap.values()),
        workflows: Array.from(workflows),
    };
};

/** One-line-per-workflow requirement digest, for logs and status strings. */
export const formatComfyRequirementDetails = (
    records: Array<{
        workflowId: string;
        compatible: boolean;
        missingNodeTypes: string[];
        missingModels: ComfyWorkflowInstallableModel[];
    }>
): string => records
    .map((record) => {
        if (record.compatible) {
            return `${record.workflowId}:ok`;
        }

        const detailParts: string[] = [];
        if (record.missingNodeTypes.length > 0) {
            detailParts.push(`nodes ${record.missingNodeTypes.slice(0, 3).join(', ')}`);
        }
        if (record.missingModels.length > 0) {
            detailParts.push(`models ${record.missingModels.slice(0, 3).map((model) => model.name).join(', ')}`);
        }

        return `${record.workflowId}:missing ${detailParts.join('; ') || 'requirements'}`;
    })
    .join(' | ');

export const isComfyConnectionFailureMessage = (message: string): boolean => (
    /Could not reach local ComfyUI|Local ComfyUI responded with HTTP|Local ComfyUI check .* returned a Next\.js 404 page instead of the ComfyUI API/i.test(message)
);

/** First non-blank string in a prepared-request value list. */
export const readPreparedComfyText = (values: unknown[] | undefined): string => {
    const textValue = values?.find((value): value is string => (
        typeof value === 'string' && value.trim().length > 0
    ));

    return textValue ? textValue.trim() : '';
};

export const truncateComfyPromptForStatus = (value: string, maxLength = 120): string => {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }

    return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
};

/** Diffusion models expect multiples of 64; anything else is resampled badly. */
export const snapToComfyGrid = (value: number): number => Math.max(64, Math.round(value / 64) * 64);

/**
 * Fit a canvas onto the grid without distorting it.
 *
 * Both bounds matter: too large exhausts VRAM, too small loses detail the user
 * drew. The order is deliberate — scale the long edge to fit, then rescue the
 * short edge if that pushed it under the minimum, then re-check the long edge,
 * because the rescue can push it back over.
 */
export const resolveAdaptiveComfyDimensions = (
    baseWidth: number,
    baseHeight: number,
    maxSide: number,
    minSide = 512
): { width: number; height: number } => {
    const safeBaseWidth = Math.max(64, Math.round(baseWidth || 1024));
    const safeBaseHeight = Math.max(64, Math.round(baseHeight || 1024));
    const safeMaxSide = Math.max(minSide, Math.round(maxSide));

    const longest = Math.max(safeBaseWidth, safeBaseHeight);
    const scaleFromLongest = Math.max(minSide, Math.min(safeMaxSide, longest)) / longest;

    let width = safeBaseWidth * scaleFromLongest;
    let height = safeBaseHeight * scaleFromLongest;

    const shortest = Math.min(width, height);
    if (shortest < minSide) {
        const scaleFromShortest = minSide / shortest;
        width *= scaleFromShortest;
        height *= scaleFromShortest;
    }

    width = snapToComfyGrid(width);
    height = snapToComfyGrid(height);

    const normalizedLongest = Math.max(width, height);
    if (normalizedLongest > safeMaxSide) {
        const downScale = safeMaxSide / normalizedLongest;
        width = snapToComfyGrid(width * downScale);
        height = snapToComfyGrid(height * downScale);
    }

    return {
        width: Math.max(64, width),
        height: Math.max(64, height),
    };
};

/**
 * The sampler settings a generation actually runs at.
 *
 * Flux needs far lower CFG than SD-style models — leaving it at 6.5 produces
 * burnt output — and upscaling trades steps for resolution. Seed is random by
 * design: repeat generations should differ unless the user pins one.
 */
export const resolveComfyQualityProfile = (
    workflowId: string,
    modelPresetId: string,
    baseWidth: number,
    baseHeight: number,
    task: ComfyTask
): ComfyQualityProfile => {
    const lowerWorkflowId = workflowId.toLowerCase();
    const lowerModelPreset = modelPresetId.toLowerCase();

    let maxSide = 1344;
    let steps = task === 'generate' ? 36 : 30;
    let cfg = 6.5;
    let strength = task === 'img2img' ? 0.68 : 0.75;

    if (lowerWorkflowId.includes('flux2_klein') || lowerWorkflowId.includes('flux2') || lowerModelPreset.includes('flux')) {
        maxSide = 1024;
        steps = lowerWorkflowId.includes('9b') ? 42 : 34;
        cfg = 3.5;
        strength = task === 'img2img' ? 0.72 : 0.8;
    }

    if (task === 'upscale') {
        maxSide = 2048;
        steps = 16;
        cfg = 4.5;
        strength = 0.5;
    }

    const adaptiveDimensions = resolveAdaptiveComfyDimensions(baseWidth, baseHeight, maxSide, 512);

    return {
        width: adaptiveDimensions.width,
        height: adaptiveDimensions.height,
        steps,
        cfg,
        strength,
        seed: Math.floor(Math.random() * 2147483647),
    };
};

/** Prefer the 9B edit workflow, then 4B, then whatever is installed. */
export const getPreferredComfyAgenticWorkflow = (workflowIds: string[]): string => (
    workflowIds.find((workflowId) => workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_9B)
    || workflowIds.find((workflowId) => workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_4B)
    || workflowIds[0]
    || ''
);

export const resolveFluxModelFromWorkflowId = (workflowId: string): string => {
    if (workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_4B) {
        return 'flux.2-klein-4b';
    }
    if (workflowId === COMFY_AGENTIC_EDIT_WORKFLOW_9B) {
        return 'flux.2-klein-9b';
    }
    return 'flux-kontext';
};
