import { NextRequest, NextResponse } from 'next/server';
import { enforceJsonBody } from '@/lib/server/apiContract';
import { assertFetchableUrl } from '@/lib/server/outboundUrlPolicy';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';
import {
    buildOllamaCritiquePrompt,
    extractBase64PayloadFromDataUrl,
    formatOllamaModelList,
    normalizeOllamaBaseUrl,
} from '@/lib/ollama';
import {
    formatOllamaAttemptedBaseUrls,
    fetchOllamaWithFallback,
    checkOllamaModelVision,
    listOllamaVisionModelsByCapability,
} from '@/lib/ollamaServer';
import { buildVisionCatalog } from '@/lib/server/ollamaVisionCatalog';

/**
 * Budget for a local vision critique.
 *
 * Generous on purpose. The first request after installing a model pays to
 * load several gigabytes into memory before a single token is produced —
 * measured at ~40s for a 4B model on a trivial 64x64 image, and a real canvas
 * with a full critique prompt takes considerably longer. The old 45s budget
 * meant a freshly installed model reliably failed on its first use, which
 * reads as "the feature is broken" rather than "the model is still loading".
 */
const OLLAMA_CRITIQUE_TIMEOUT_MS = 4 * 60 * 1000;
/** Listing installed models is a metadata call and should never take this long. */
const OLLAMA_TAGS_TIMEOUT_MS = 10000;

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
// Carries a base64 image, so the cap is generous - but it is a cap.
const badBody = enforceJsonBody(request, 16 * 1024 * 1024);
if (badBody) return badBody;
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
        // normalizeOllamaBaseUrl only checks the scheme. Loopback stays
        // allowed here — that is where Ollama actually runs — but the
        // metadata endpoint and, on self-hosted, the private network do not.
        assertFetchableUrl(resolvedBaseUrl);
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
            timeoutMs: OLLAMA_TAGS_TIMEOUT_MS,
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

        // Ollama's own capability list, not a guess from the model's name.
        const visionCheck = await checkOllamaModelVision(resolvedBaseUrl, requestedModel);
        if (!visionCheck.supportsVision) {
            const visionModels = await listOllamaVisionModelsByCapability(resolvedBaseUrl, models);
            const catalog = await buildVisionCatalog();
            const installable = catalog.suggestions.filter((entry) => entry.stillListed !== false);
            return NextResponse.json({
                success: false,
                // The structured fields let the UI offer a fix; the message is
                // the fallback for anywhere that only shows text.
                message: visionModels.length > 0
                    ? `Model "${requestedModel}" cannot read images. Switch to one of your installed vision models: ${formatOllamaModelList(visionModels)}.`
                    : `Model "${requestedModel}" cannot read images, and no installed model can. Install one, for example ${installable.slice(0, 3).map((entry) => `${entry.model} (${entry.size})`).join(', ')}.`,
                reason: 'model_not_vision_capable',
                requestedModel,
                baseUrl: resolvedBaseUrl,
                visionModels,
                suggestions: installable,
                visionSource: visionCheck.source,
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
                // Say what is probably happening. A first run after install
                // spends most of its time loading the model, not generating.
                ? `Ollama did not finish within ${Math.round(OLLAMA_CRITIQUE_TIMEOUT_MS / 60000)} minutes. A newly installed model loads into memory on its first use — try once more, or pick a smaller vision model.`
                : (error instanceof Error ? error.message : 'Failed to contact Ollama.'),
        }, { status: 502 });
    }
}
