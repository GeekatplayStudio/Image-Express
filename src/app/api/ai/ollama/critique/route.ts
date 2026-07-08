import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';
import {
    buildOllamaCritiquePrompt,
    extractBase64PayloadFromDataUrl,
    formatOllamaModelList,
    isOllamaVisionModel,
    listOllamaVisionModels,
    normalizeOllamaBaseUrl,
} from '@/lib/ollama';
import { formatOllamaAttemptedBaseUrls, fetchOllamaWithFallback } from '@/lib/ollamaServer';

const OLLAMA_CRITIQUE_TIMEOUT_MS = 45000;

type OllamaTagsPayload = {
    models?: Array<{ name?: string; model?: string }>;
};

type OllamaGeneratePayload = {
    response?: string;
    error?: string;
};

export async function POST(request: NextRequest) {
    let payload: {
        baseUrl?: string;
        model?: string;
        imageDataUrl?: string;
        target?: 'selection' | 'canvas';
        targetLabel?: string;
        focus?: string;
    };

    try {
        payload = await request.json() as typeof payload;
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid critique request payload.' }, { status: 400 });
    }

    const requestedBaseUrl = payload.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL;
    const requestedModel = payload.model?.trim() || DEFAULT_OLLAMA_MODEL;
    const target = payload.target === 'selection' ? 'selection' : 'canvas';
    const targetLabel = payload.targetLabel?.trim() || (target === 'selection' ? 'Selected layer' : 'Full canvas');
    const focus = payload.focus?.trim() || '';
    const imageDataUrl = payload.imageDataUrl?.trim() || '';

    if (!imageDataUrl) {
        return NextResponse.json({ success: false, message: 'Critique image is required.' }, { status: 400 });
    }

    let resolvedBaseUrl: string;
    let imageBase64: string;
    try {
        resolvedBaseUrl = normalizeOllamaBaseUrl(requestedBaseUrl);
        imageBase64 = extractBase64PayloadFromDataUrl(imageDataUrl);
    } catch (error) {
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Invalid critique request.',
        }, { status: 400 });
    }

    try {
        const tagsResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/tags', {
            method: 'GET',
            cache: 'no-store',
            timeoutMs: OLLAMA_CRITIQUE_TIMEOUT_MS,
        });

        if (!tagsResult.ok || !tagsResult.response) {
            const attemptsSuffix = formatOllamaAttemptedBaseUrls(tagsResult.attemptedBaseUrls);
            if (tagsResult.response) {
                return NextResponse.json({
                    success: false,
                    message: `Ollama responded with ${tagsResult.response.status} ${tagsResult.response.statusText} while checking models.${attemptsSuffix}`,
                }, { status: 502 });
            }

            return NextResponse.json({
                success: false,
                message: `${tagsResult.error instanceof Error ? tagsResult.error.message : 'Failed to contact Ollama.'}${attemptsSuffix}`,
            }, { status: 502 });
        }

        const tagsPayload = await tagsResult.response.json() as OllamaTagsPayload;
        const models = Array.isArray(tagsPayload.models)
            ? tagsPayload.models
                .map((entry) => entry.name || entry.model || '')
                .filter((entry) => entry.trim().length > 0)
            : [];

        resolvedBaseUrl = tagsResult.baseUrl;

        if (!models.includes(requestedModel)) {
            return NextResponse.json({
                success: false,
                message: `Model "${requestedModel}" is not installed in Ollama at ${resolvedBaseUrl}. Available models: ${formatOllamaModelList(models)}.`,
            }, { status: 400 });
        }

        if (!isOllamaVisionModel(requestedModel)) {
            const visionModels = listOllamaVisionModels(models);
            return NextResponse.json({
                success: false,
                message: `Model "${requestedModel}" is installed in Ollama at ${resolvedBaseUrl}, but it does not appear to support image input. AI Critique requires a vision-capable model. Available vision models: ${formatOllamaModelList(visionModels)}.`,
            }, { status: 400 });
        }

        const critiqueResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            timeoutMs: OLLAMA_CRITIQUE_TIMEOUT_MS,
            body: JSON.stringify({
                model: requestedModel,
                stream: false,
                prompt: buildOllamaCritiquePrompt({
                    target,
                    targetLabel,
                    focus,
                }),
                images: [imageBase64],
                options: {
                    temperature: 0.2,
                },
            }),
        });

        if (!critiqueResult.ok || !critiqueResult.response) {
            const attemptsSuffix = formatOllamaAttemptedBaseUrls(critiqueResult.attemptedBaseUrls);
            if (critiqueResult.response) {
                return NextResponse.json({
                    success: false,
                    message: `Ollama critique failed with ${critiqueResult.response.status} ${critiqueResult.response.statusText}.${attemptsSuffix}`,
                }, { status: 502 });
            }

            return NextResponse.json({
                success: false,
                message: `${critiqueResult.error instanceof Error ? critiqueResult.error.message : 'Failed to contact Ollama.'}${attemptsSuffix}`,
            }, { status: 502 });
        }

        resolvedBaseUrl = critiqueResult.baseUrl;
        const critiquePayload = await critiqueResult.response.json() as OllamaGeneratePayload;
        if (critiquePayload.error) {
            return NextResponse.json({
                success: false,
                message: critiquePayload.error,
            }, { status: 502 });
        }

        const critique = critiquePayload.response?.trim();
        if (!critique) {
            return NextResponse.json({
                success: false,
                message: 'Ollama returned an empty critique response.',
            }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            critique,
            model: requestedModel,
            baseUrl: resolvedBaseUrl,
            target,
            targetLabel,
        });
    } catch (error) {
        const isAbortError = error instanceof DOMException && error.name === 'AbortError';
        return NextResponse.json({
            success: false,
            message: isAbortError
                ? `Timed out contacting Ollama after ${Math.round(OLLAMA_CRITIQUE_TIMEOUT_MS / 1000)} seconds.`
                : (error instanceof Error ? error.message : 'Failed to contact Ollama.'),
        }, { status: 502 });
    }
}
