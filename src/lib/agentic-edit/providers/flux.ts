import type { ModelProvider, ProviderGeneratePayload, ProviderGenerateResult } from '@/lib/agentic-edit/providers/types';
import { executeComfyTask } from '@/lib/comfyui/runner';
import type { ComfyConnectionMode } from '@/lib/comfyui/connection';
import type { ComfyTask } from '@/lib/comfyui/registry';

const bufferToDataUrl = (buffer: Buffer, mimeType = 'image/png'): string => (
    `data:${mimeType};base64,${buffer.toString('base64')}`
);

const dataUrlToBuffer = (dataUrl: string): Buffer => {
    const splitIndex = dataUrl.indexOf(',');
    if (splitIndex < 0) {
        throw new Error('Invalid ComfyUI output data URL.');
    }

    return Buffer.from(dataUrl.slice(splitIndex + 1), 'base64');
};

const resolveComfyTask = (value: unknown): ComfyTask => {
    if (value === 'generate' || value === 'img2img' || value === 'inpaint' || value === 'outpaint' || value === 'upscale') {
        return value;
    }
    return 'img2img';
};

const resolveComfyMode = (value: unknown): ComfyConnectionMode => {
    if (value === 'auto' || value === 'local' || value === 'cloud') {
        return value;
    }
    return 'auto';
};

const asFiniteNumber = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDimension = (value: number): number => Math.max(512, Math.round(value / 64) * 64);

export class FluxProvider implements ModelProvider {
    name = 'flux';

    supports = {
        img2img: true,
        inpaint: true,
        multiReference: true,
        controlPose: true,
        mask: true,
    };

    async generate(payload: ProviderGeneratePayload): Promise<ProviderGenerateResult> {
        const params = payload.params || {};
        const connection = (typeof params.connection === 'object' && params.connection)
            ? (params.connection as Record<string, unknown>)
            : {};

        const comfyTask = resolveComfyTask(params.comfyTask);
        const workflowId = typeof params.workflowId === 'string' && params.workflowId.trim().length > 0
            ? params.workflowId
            : 'image_flux2_klein_image_edit_9b_base';
        const modelPresetId = typeof params.modelPresetId === 'string' && params.modelPresetId.trim().length > 0
            ? params.modelPresetId
            : 'default';

        const additionalNotesText = typeof params.additionalNotesText === 'string'
            ? params.additionalNotesText
            : '';

        const referenceRoles = Array.isArray(params.referenceRoles)
            ? params.referenceRoles.filter((role): role is string => typeof role === 'string')
            : [];
        const referenceCount = asFiniteNumber(params.referenceCount, payload.references?.length || 0);

        const qualityWidth = normalizeDimension(asFiniteNumber(params.width, 1024));
        const qualityHeight = normalizeDimension(asFiniteNumber(params.height, 1024));
        const qualitySteps = Math.max(8, Math.round(asFiniteNumber(params.steps, 32)));
        const qualityCfg = Math.max(1, asFiniteNumber(params.cfg, 4.5));
        const qualityStrength = Math.max(0.1, Math.min(1, asFiniteNumber(params.strength, 0.72)));
        const qualitySeed = Math.max(1, Math.round(asFiniteNumber(params.seed, Math.floor(Math.random() * 2147483647))));

        const referenceGuidance = referenceCount > 0
            ? `\n\nReference composition guidance (${referenceCount} refs): combine and replace target objects using roles [${referenceRoles.join(', ')}], while preserving perspective, shadows, and material consistency.`
            : '';

        const mergedPrompt = additionalNotesText.trim().length > 0
            ? `${payload.promptPositive}\n\nAdditional Notes:\n${additionalNotesText}${referenceGuidance}`
            : `${payload.promptPositive}${referenceGuidance}`;

        const execution = await executeComfyTask({
            connection: {
                mode: resolveComfyMode(connection.mode),
                localUrl: typeof connection.localUrl === 'string' ? connection.localUrl : undefined,
                cloudUrl: typeof connection.cloudUrl === 'string' ? connection.cloudUrl : undefined,
                cloudApiKey: typeof connection.cloudApiKey === 'string' ? connection.cloudApiKey : undefined,
            },
            task: comfyTask,
            workflowId,
            modelPresetId,
            params: {
                prompt: mergedPrompt,
                negativePrompt: payload.promptNegative,
                image: bufferToDataUrl(payload.originalImage),
                mask: payload.maskImage ? bufferToDataUrl(payload.maskImage) : undefined,
                notesOverlay: payload.notesOverlay ? bufferToDataUrl(payload.notesOverlay) : undefined,
                width: qualityWidth,
                height: qualityHeight,
                steps: qualitySteps,
                cfg: qualityCfg,
                strength: qualityStrength,
                seed: qualitySeed,
            },
        });

        if (!execution.result.dataUrl) {
            throw new Error(execution.result.error || 'ComfyUI completed without returning image output.');
        }

        return {
            outputImage: dataUrlToBuffer(execution.result.dataUrl),
            meta: {
                provider: 'flux',
                status: 'completed',
                workflowId,
                workflowName: execution.workflow.name,
                modelPresetId,
                comfyTask,
                resolution: `${qualityWidth}x${qualityHeight}`,
                steps: qualitySteps,
                cfg: qualityCfg,
            },
        };
    }
}
