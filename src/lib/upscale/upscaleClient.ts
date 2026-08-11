import * as fabric from 'fabric';
import { loadComfyCloudApiKey } from '@/lib/comfyui/cloudConfig';
import { executeComfyTask } from '@/lib/comfyui/runner';
import { ensureComfyWorkflowCatalogRegistered } from '@/lib/comfyui/workflows/catalog';
import { loadGenerativePreferences } from '@/lib/generative-preferences';
import type { ExtendedFabricObject } from '@/types';
import { getUpscaleProvider, type UpscaleProviderId } from '@/lib/upscale/upscaleProviders';

/**
 * Client-side upscale execution: routes a source image through the chosen
 * service (local ComfyUI directly, everything else via the server proxy) and
 * lands the result on the canvas as a new, named layer.
 */

export type UpscaleRunRequest = {
    provider: UpscaleProviderId;
    image: string;
    scale: number;
    creativity: number;
    prompt?: string;
    sourceWidth: number;
    sourceHeight: number;
    onStatus?: (message: string) => void;
};

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const readStoredKey = (storageKey: string): string => {
    if (typeof window === 'undefined' || !storageKey) return '';
    return (window.localStorage.getItem(storageKey) || '').trim();
};

export const getUpscaleApiKey = (provider: UpscaleProviderId): string => {
    const definition = getUpscaleProvider(provider);
    if (!definition || definition.isLocal) return '';
    return readStoredKey(definition.apiKeyStorageKey);
};

type ProxyResponse = {
    success?: boolean;
    status?: string;
    image?: string;
    taskId?: string;
    message?: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runStabilityUpscale = async (request: UpscaleRunRequest, apiKey: string): Promise<string> => {
    const blob = await (await fetch(request.image)).blob();
    const formData = new FormData();
    formData.append('image', blob, 'source.png');
    if (request.prompt) formData.append('prompt', request.prompt);

    const response = await fetch('/api/ai/stability/upscale?type=conservative', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
    });
    const data = await response.json() as ProxyResponse;
    if (!response.ok || !data.success || !data.image) {
        throw new Error(data.message || 'Stability upscale failed.');
    }
    // The Stability route returns raw base64 without the data URL prefix.
    return data.image.startsWith('data:') ? data.image : `data:image/png;base64,${data.image}`;
};

const runProxyUpscale = async (request: UpscaleRunRequest, apiKey: string): Promise<string> => {
    const response = await fetch('/api/ai/upscale', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            provider: request.provider,
            image: request.image,
            scale: request.scale,
            creativity: request.creativity,
            prompt: request.prompt,
            sourceWidth: request.sourceWidth,
            sourceHeight: request.sourceHeight,
        }),
    });
    let data = await response.json() as ProxyResponse;
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'Upscale request failed.');
    }

    const startedAt = Date.now();
    while (data.status === 'IN_PROGRESS' && data.taskId) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            throw new Error('Upscale task timed out. Try again or check the provider dashboard.');
        }
        request.onStatus?.('Provider is processing the upscale…');
        await wait(POLL_INTERVAL_MS);
        const pollResponse = await fetch(
            `/api/ai/upscale/poll?provider=${encodeURIComponent(request.provider)}&id=${encodeURIComponent(data.taskId)}`,
            { headers: { Authorization: `Bearer ${apiKey}` } },
        );
        data = await pollResponse.json() as ProxyResponse;
        if (!pollResponse.ok || !data.success) {
            throw new Error(data.message || 'Upscale polling failed.');
        }
    }

    if (!data.image) {
        throw new Error('The provider returned no upscaled image.');
    }
    return data.image;
};

const runComfyUpscale = async (request: UpscaleRunRequest): Promise<string> => {
    ensureComfyWorkflowCatalogRegistered();
    const preferences = loadGenerativePreferences();
    request.onStatus?.('Running the upscale workflow on ComfyUI…');
    const execution = await executeComfyTask({
        connection: {
            mode: preferences.comfyConnectionMode,
            localUrl: preferences.comfyServerUrl,
            tunnelUrl: preferences.comfyTunnelUrl,
            cloudUrl: preferences.comfyCloudUrl,
            cloudApiKey: loadComfyCloudApiKey(),
        },
        task: 'upscale',
        params: {
            image: request.image,
            width: Math.round(request.sourceWidth * request.scale),
            height: Math.round(request.sourceHeight * request.scale),
        },
        onProgress: (progress) => {
            if (progress.message) request.onStatus?.(progress.message);
        },
    });
    if (execution.result.error || !execution.result.dataUrl) {
        throw new Error(execution.result.error || 'ComfyUI returned no upscaled image.');
    }
    return execution.result.dataUrl;
};

export const runUpscale = async (request: UpscaleRunRequest): Promise<string> => {
    if (request.provider === 'comfy') {
        return runComfyUpscale(request);
    }
    const apiKey = getUpscaleApiKey(request.provider);
    if (!apiKey) {
        throw new Error('No API key configured for this service. Add one in Settings → Services.');
    }
    if (request.provider === 'stability') {
        return runStabilityUpscale(request, apiKey);
    }
    return runProxyUpscale(request, apiKey);
};

export type UpscaleSourcePlacement = {
    left: number;
    top: number;
    /** Visual size the layer should occupy (the source's on-canvas footprint). */
    width: number;
    height: number;
} | null;

/**
 * Add the upscaled result as a new layer. When the source was a canvas
 * object, the layer covers the same footprint (full resolution retained in
 * the underlying image); otherwise it is centered at 80% of the artboard.
 */
export const insertUpscaledLayer = async (
    canvas: fabric.Canvas,
    resultImage: string,
    options: { provider: UpscaleProviderId; scale: number; placement: UpscaleSourcePlacement },
): Promise<ExtendedFabricObject> => {
    const image = await fabric.Image.fromURL(resultImage, {}) as ExtendedFabricObject & fabric.Image;
    image.name = `Upscaled ${options.scale}x`;
    image.aiGenerated = true;
    image.aiProvider = options.provider;

    if (options.placement && image.width && image.height) {
        image.set({
            left: options.placement.left,
            top: options.placement.top,
            scaleX: options.placement.width / image.width,
            scaleY: options.placement.height / image.height,
        });
    } else {
        const artboard = (canvas as fabric.Canvas & { artboard?: { width: number; height: number } }).artboard
            || { width: canvas.width || 800, height: canvas.height || 600 };
        if (image.width && image.height) {
            const fit = Math.min((artboard.width * 0.8) / image.width, (artboard.height * 0.8) / image.height, 1);
            image.scale(fit);
        }
        canvas.centerObject(image);
    }

    canvas.add(image);
    canvas.setActiveObject(image);
    canvas.requestRenderAll();
    return image;
};
