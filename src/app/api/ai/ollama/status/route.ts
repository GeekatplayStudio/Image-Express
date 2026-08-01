import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';
import {
    formatOllamaAttemptedBaseUrls,
    fetchOllamaWithFallback,
    checkOllamaModelVision,
    listOllamaVisionModelsByCapability,
} from '@/lib/ollamaServer';
import { normalizeOllamaBaseUrl } from '@/lib/ollama';

const OLLAMA_STATUS_TIMEOUT_MS = 5000;

export async function GET(request: NextRequest) {
    const requestedBaseUrl = request.nextUrl.searchParams.get('baseUrl')?.trim() || DEFAULT_OLLAMA_BASE_URL;
    const requestedModel = request.nextUrl.searchParams.get('model')?.trim() || DEFAULT_OLLAMA_MODEL;

    let resolvedBaseUrl: string;
    try {
        resolvedBaseUrl = normalizeOllamaBaseUrl(requestedBaseUrl);
    } catch (error) {
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Invalid Ollama URL.',
        }, { status: 400 });
    }

    try {
        const tagsResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/tags', {
            method: 'GET',
            cache: 'no-store',
            timeoutMs: OLLAMA_STATUS_TIMEOUT_MS,
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

        const payload = await tagsResult.response.json() as {
            models?: Array<{ name?: string; model?: string }>;
        };
        const models = Array.isArray(payload.models)
            ? payload.models
                .map((entry) => entry.name || entry.model || '')
                .filter((entry) => entry.trim().length > 0)
            : [];
        const modelFound = models.includes(requestedModel);
        // Ask Ollama what each model can do rather than guessing from its
        // name — the name patterns miss most of the current library.
        const [visionCheck, visionModels] = await Promise.all([
            modelFound
                ? checkOllamaModelVision(tagsResult.baseUrl, requestedModel)
                : Promise.resolve({ supportsVision: false, source: 'capabilities' as const }),
            listOllamaVisionModelsByCapability(tagsResult.baseUrl, models),
        ]);

        return NextResponse.json({
            success: true,
            baseUrl: tagsResult.baseUrl,
            attemptedBaseUrls: tagsResult.attemptedBaseUrls,
            requestedModel,
            modelFound,
            visionCapable: modelFound && visionCheck.supportsVision,
            /** 'capabilities' when Ollama answered; 'name-heuristic' on old builds. */
            visionSource: visionCheck.source,
            visionModels,
            models,
            count: models.length,
        });
    } catch (error) {
        const isAbortError = error instanceof DOMException && error.name === 'AbortError';
        return NextResponse.json({
            success: false,
            message: isAbortError
                ? `Timed out contacting Ollama after ${Math.round(OLLAMA_STATUS_TIMEOUT_MS / 1000)} seconds.`
                : (error instanceof Error ? error.message : 'Failed to contact Ollama.'),
        }, { status: 502 });
    }
}
