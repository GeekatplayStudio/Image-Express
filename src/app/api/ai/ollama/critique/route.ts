import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';
import {
    buildOllamaCritiquePrompt,
    extractBase64PayloadFromDataUrl,
    formatOllamaModelList,
    normalizeOllamaBaseUrl,
} from '@/lib/ollama';

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

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), OLLAMA_CRITIQUE_TIMEOUT_MS);

    try {
        const tagsResponse = await fetch(`${resolvedBaseUrl}/api/tags`, {
            method: 'GET',
            cache: 'no-store',
            signal: abortController.signal,
        });

        if (!tagsResponse.ok) {
            return NextResponse.json({
                success: false,
                message: `Ollama responded with ${tagsResponse.status} ${tagsResponse.statusText} while checking models.`,
            }, { status: 502 });
        }

        const tagsPayload = await tagsResponse.json() as OllamaTagsPayload;
        const models = Array.isArray(tagsPayload.models)
            ? tagsPayload.models
                .map((entry) => entry.name || entry.model || '')
                .filter((entry) => entry.trim().length > 0)
            : [];

        if (!models.includes(requestedModel)) {
            return NextResponse.json({
                success: false,
                message: `Model "${requestedModel}" is not installed in Ollama at ${resolvedBaseUrl}. Available models: ${formatOllamaModelList(models)}.`,
            }, { status: 400 });
        }

        const critiqueResponse = await fetch(`${resolvedBaseUrl}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            signal: abortController.signal,
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

        const critiquePayload = await critiqueResponse.json() as OllamaGeneratePayload;
        if (!critiqueResponse.ok || critiquePayload.error) {
            return NextResponse.json({
                success: false,
                message: critiquePayload.error || `Ollama critique failed with ${critiqueResponse.status} ${critiqueResponse.statusText}.`,
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
    } finally {
        clearTimeout(timeoutId);
    }
}
