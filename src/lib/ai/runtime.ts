import { GenerationParams } from './types';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';
import {
    buildOllamaSvgGenerationPrompt,
    encodeSvgDataUrl,
    formatOllamaModelList,
    normalizeOllamaBaseUrl,
    sanitizeOllamaSvgDocument,
} from '@/lib/ollama';
import { formatOllamaAttemptedBaseUrls, fetchOllamaWithFallback } from '@/lib/ollamaServer';
import { requestBananaImageGeneration } from '@/lib/server/bananaGeneration';
import { requestGoogleImageGeneration } from '@/lib/server/googleImageGeneration';

const OLLAMA_GENERATE_TIMEOUT_MS = 45000;
const OLLAMA_GENERATE_RETRY_DELAY_MS = 2000;

const delay = async (ms: number): Promise<void> => {
    await new Promise((resolve) => {
        setTimeout(resolve, Math.max(0, ms));
    });
};

const isRetryableOllamaTransportFailure = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    const causeMessage = error.cause instanceof Error ? error.cause.message.toLowerCase() : '';

    return [message, causeMessage].some((value) => (
        value.includes('fetch failed')
        || value.includes('econnreset')
        || value.includes('socket hang up')
        || value.includes('other side closed')
        || value.includes('terminated')
    ));
};

export interface GenerationResult {
    success: boolean;
    imageUrl?: string;
    promptId?: string;
    provider: string;
    output?: string;
    model?: string;
    aspectRatio?: string;
    endpoint?: string;
    message?: string;
    status?: number;
}

export interface ProviderAdapter {
    execute(params: GenerationParams): Promise<GenerationResult>;
}

// 1. Stability AI Adapter
class StabilityAdapter implements ProviderAdapter {
    async execute(params: GenerationParams): Promise<GenerationResult> {
        const { prompt, width, height, apiKey } = params;
        if (!apiKey) {
            return {
                success: false,
                provider: 'stability',
                message: 'API Key is required for remote generation.',
                status: 200,
            };
        }

        const validDimensions = [
            { w: 1024, h: 1024 },
            { w: 1152, h: 896 },
            { w: 1216, h: 832 },
            { w: 1344, h: 768 },
            { w: 1536, h: 640 },
            { w: 640, h: 1536 },
            { w: 768, h: 1344 },
            { w: 832, h: 1216 },
            { w: 896, h: 1152 },
        ];

        const targetW = width || 1024;
        const targetH = height || 1024;

        const bestDim = validDimensions.reduce((prev, curr) => {
            const prevDiff = Math.abs(prev.w - targetW) + Math.abs(prev.h - targetH);
            const currDiff = Math.abs(curr.w - targetW) + Math.abs(curr.h - targetH);
            return currDiff < prevDiff ? curr : prev;
        });

        const stabilityUrl = 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image';

        const stabilityRes = await fetch(stabilityUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                text_prompts: [{ text: prompt }],
                cfg_scale: 7,
                height: bestDim.h,
                width: bestDim.w,
                steps: 30,
                samples: 1,
            }),
        });

        if (stabilityRes.ok) {
            const data = await stabilityRes.json();
            const base64Image = data.artifacts[0].base64;
            return {
                success: true,
                imageUrl: `data:image/png;base64,${base64Image}`,
                provider: 'stability',
                status: 200,
            };
        } else {
            const data = await stabilityRes.json();
            return {
                success: false,
                provider: 'stability',
                message: data.message || 'Stability AI generation failed.',
                status: 200,
            };
        }
    }
}

// 2. OpenAI DALL-E Adapter
class OpenAIAdapter implements ProviderAdapter {
    async execute(params: GenerationParams): Promise<GenerationResult> {
        const { prompt, width, height, apiKey } = params;
        if (!apiKey) {
            return {
                success: false,
                provider: 'openai',
                message: 'API Key is required for remote generation.',
                status: 200,
            };
        }

        const ratio = width && height ? width / height : 1;
        let openAiSize = "1024x1024";
        if (ratio >= 1.3) openAiSize = "1792x1024";
        else if (ratio <= 0.7) openAiSize = "1024x1792";

        const openAiRes = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: openAiSize,
                quality: "standard",
                response_format: "url",
            }),
        });

        const data = await openAiRes.json();

        if (!openAiRes.ok) {
            const errorMsg = data.error?.message || 'OpenAI API Failed';
            console.error('OpenAI Error:', errorMsg);
            return {
                success: false,
                provider: 'openai',
                message: errorMsg,
                status: 200,
            };
        }

        return {
            success: true,
            imageUrl: data.data[0].url,
            provider: 'openai',
            status: 200,
        };
    }
}

// 3. Google Imagen Adapter
class GoogleAdapter implements ProviderAdapter {
    async execute(params: GenerationParams): Promise<GenerationResult> {
        const { prompt, width, height, apiKey } = params;
        if (!apiKey) {
            return {
                success: false,
                provider: 'google',
                message: 'API Key is required for remote generation.',
                status: 200,
            };
        }

        try {
            const result = await requestGoogleImageGeneration({
                apiKey,
                prompt: typeof prompt === 'string' ? prompt : '',
                width: width || undefined,
                height: height || undefined,
            });
            return {
                success: true,
                imageUrl: result.imageUrl,
                provider: 'google',
                model: result.model,
                aspectRatio: result.aspectRatio,
                status: 200,
            };
        } catch (error) {
            return {
                success: false,
                provider: 'google',
                message: error instanceof Error ? error.message : 'Google image generation failed.',
                status: 502,
            };
        }
    }
}

// 4. Banana.dev Adapter
class BananaAdapter implements ProviderAdapter {
    async execute(params: GenerationParams): Promise<GenerationResult> {
        const { prompt, width, height, apiKey } = params;
        if (!apiKey) {
            return {
                success: false,
                provider: 'banana',
                message: 'API Key is required for remote generation.',
                status: 200,
            };
        }

        try {
            const result = await requestBananaImageGeneration({
                apiKey,
                prompt: typeof prompt === 'string' ? prompt : '',
                width: width || undefined,
                height: height || undefined,
                mode: 'generate',
            });
            return {
                success: true,
                imageUrl: result.imageUrl,
                provider: 'banana',
                model: result.model,
                endpoint: result.endpoint,
                status: 200,
            };
        } catch (error) {
            return {
                success: false,
                provider: 'banana',
                message: error instanceof Error ? error.message : 'Banana image generation failed.',
                status: 502,
            };
        }
    }
}

// 5. Local Ollama SVG Generator Adapter
class OllamaAdapter implements ProviderAdapter {
    async execute(params: GenerationParams): Promise<GenerationResult> {
        const { prompt, width, height, localAiBaseUrl, localAiModel } = params;
        const targetWidth = Math.max(64, width || 1024);
        const targetHeight = Math.max(64, height || 1024);
        const requestedBaseUrl = localAiBaseUrl && localAiBaseUrl.trim().length > 0
            ? localAiBaseUrl.trim()
            : DEFAULT_OLLAMA_BASE_URL;
        const requestedModel = localAiModel && localAiModel.trim().length > 0
            ? localAiModel.trim()
            : DEFAULT_OLLAMA_MODEL;

        let resolvedBaseUrl: string;
        try {
            resolvedBaseUrl = normalizeOllamaBaseUrl(requestedBaseUrl);
        } catch (error) {
            return {
                success: false,
                provider: 'ollama',
                message: error instanceof Error ? error.message : 'Invalid Ollama URL.',
                status: 400,
            };
        }

        try {
            const tagsResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/tags', {
                method: 'GET',
                cache: 'no-store',
                timeoutMs: OLLAMA_GENERATE_TIMEOUT_MS,
            });

            if (!tagsResult.ok || !tagsResult.response) {
                const attemptsSuffix = formatOllamaAttemptedBaseUrls(tagsResult.attemptedBaseUrls);
                if (tagsResult.response) {
                    return {
                        success: false,
                        provider: 'ollama',
                        message: `Ollama responded with ${tagsResult.response.status} ${tagsResult.response.statusText} while checking models.${attemptsSuffix}`,
                        status: 502,
                    };
                }

                return {
                    success: false,
                    provider: 'ollama',
                    message: `${tagsResult.error instanceof Error ? tagsResult.error.message : 'Failed to contact Ollama.'}${attemptsSuffix}`,
                    status: 502,
                };
            }

            const tagsPayload = await tagsResult.response.json() as { models?: Array<{ name?: string; model?: string }> };
            const models = Array.isArray(tagsPayload.models)
                ? tagsPayload.models
                    .map((entry) => entry.name || entry.model || '')
                    .filter((entry) => entry.trim().length > 0)
                : [];

            resolvedBaseUrl = tagsResult.baseUrl;

            if (!models.includes(requestedModel)) {
                return {
                    success: false,
                    provider: 'ollama',
                    message: `Model "${requestedModel}" is not installed in Ollama at ${resolvedBaseUrl}. Available models: ${formatOllamaModelList(models)}.`,
                    status: 400,
                };
            }

            const generationRequestBody = JSON.stringify({
                model: requestedModel,
                prompt: buildOllamaSvgGenerationPrompt({
                    prompt: typeof prompt === 'string' ? prompt : '',
                    width: targetWidth,
                    height: targetHeight,
                }),
                stream: false,
                keep_alive: '15m',
                options: {
                    temperature: 0.2,
                },
            });

            const requestGeneration = async () => fetchOllamaWithFallback(resolvedBaseUrl, '/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                timeoutMs: OLLAMA_GENERATE_TIMEOUT_MS,
                body: generationRequestBody,
            });

            let generationResult = await requestGeneration();

            if (!generationResult.ok && !generationResult.response && isRetryableOllamaTransportFailure(generationResult.error)) {
                await delay(OLLAMA_GENERATE_RETRY_DELAY_MS);
                generationResult = await requestGeneration();
            }

            if (!generationResult.ok || !generationResult.response) {
                const attemptsSuffix = formatOllamaAttemptedBaseUrls(generationResult.attemptedBaseUrls);
                if (generationResult.response) {
                    return {
                        success: false,
                        provider: 'ollama',
                        message: `Ollama responded with ${generationResult.response.status} ${generationResult.response.statusText}.${attemptsSuffix}`,
                        status: 502,
                    };
                }

                return {
                    success: false,
                    provider: 'ollama',
                    message: `${generationResult.error instanceof Error ? generationResult.error.message : 'Failed to contact Ollama.'}${attemptsSuffix}`,
                    status: 502,
                };
            }

            const generationPayload = await generationResult.response.json() as { response?: string; error?: string };

            if (generationPayload.error) {
                return {
                    success: false,
                    provider: 'ollama',
                    message: generationPayload.error,
                    status: 502,
                };
            }

            if (!generationPayload.response || generationPayload.response.trim().length === 0) {
                return {
                    success: false,
                    provider: 'ollama',
                    message: 'Ollama returned an empty image response.',
                    status: 502,
                };
            }

            const sanitizedSvg = sanitizeOllamaSvgDocument(generationPayload.response, targetWidth, targetHeight);
            return {
                success: true,
                imageUrl: encodeSvgDataUrl(sanitizedSvg),
                provider: 'ollama',
                output: 'svg',
                status: 200,
            };
        } catch (error) {
            const isAbortError = error instanceof DOMException && error.name === 'AbortError';
            return {
                success: false,
                provider: 'ollama',
                message: isAbortError
                    ? `Timed out contacting Ollama after ${Math.round(OLLAMA_GENERATE_TIMEOUT_MS / 1000)} seconds.`
                    : (error instanceof Error ? error.message : 'Failed to contact Ollama.'),
                status: 502,
            };
        }
    }
}

// Polymorphic Registry Map
const adapters: Record<string, ProviderAdapter> = {
    stability: new StabilityAdapter(),
    openai: new OpenAIAdapter(),
    google: new GoogleAdapter(),
    banana: new BananaAdapter(),
    ollama: new OllamaAdapter(),
};

export class AiRuntimeManager {
    static async generateImage(params: GenerationParams): Promise<GenerationResult> {
        // Enforce mock mode if active
        if (params.mockMode) {
            return {
                success: true,
                imageUrl: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`,
                provider: params.specificProvider || params.provider,
                status: 200,
            };
        }

        const mode = params.specificProvider || params.provider;
        
        // Find registered adapter
        const adapter = adapters[mode];
        if (!adapter) {
            return {
                success: false,
                provider: mode,
                message: `Unsupported generative provider mode: ${mode}`,
                status: 400,
            };
        }

        return await adapter.execute(params);
    }
}
