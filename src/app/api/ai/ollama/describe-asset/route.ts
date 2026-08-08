import { NextRequest, NextResponse } from 'next/server';
import { enforceJsonBody } from '@/lib/server/apiContract';
import { assertFetchableUrl } from '@/lib/server/outboundUrlPolicy';
import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';
import {
    extractBase64PayloadFromDataUrl,
    formatOllamaModelList,
    isOllamaVisionModel,
    listOllamaVisionModels,
    normalizeOllamaBaseUrl,
} from '@/lib/ollama';
import { formatOllamaAttemptedBaseUrls, fetchOllamaWithFallback } from '@/lib/ollamaServer';

const DESCRIBE_TIMEOUT_MS = 60000;

const DESCRIBE_PROMPT = [
    'You are indexing a design-tool asset library.',
    'Look at the image and reply with STRICT JSON only, no markdown, no commentary, in this exact shape:',
    '{"description": "<one factual sentence describing the image content>", "tags": ["<8-12 short lowercase search keywords: subjects, objects, style, colors, mood>"]}',
].join('\n');

type OllamaTagsPayload = {
    models?: Array<{ name?: string; model?: string }>;
};

type OllamaGeneratePayload = {
    response?: string;
    error?: string;
};

/** Pulls {description, tags} out of a model reply, tolerating markdown fences and chatter. */
function parseDescribeResponse(raw: string): { description: string; tags: string[] } | null {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
        const parsed = JSON.parse(jsonMatch[0]) as { description?: unknown; tags?: unknown };
        const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
        const tags = Array.isArray(parsed.tags)
            ? parsed.tags
                .filter((tag): tag is string => typeof tag === 'string')
                .map((tag) => tag.trim().toLowerCase())
                .filter((tag) => tag.length > 0 && tag.length <= 40)
                .slice(0, 16)
            : [];
        if (!description && tags.length === 0) return null;
        return { description, tags };
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    let payload: {
        baseUrl?: string;
        model?: string;
        imageDataUrl?: string;
    };

    try {
// Carries a base64 image, so the cap is generous - but it is a cap.
const badBody = enforceJsonBody(request, 16 * 1024 * 1024);
if (badBody) return badBody;
        payload = await request.json() as typeof payload;
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid describe request payload.' }, { status: 400 });
    }

    const requestedBaseUrl = payload.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL;
    const requestedModel = payload.model?.trim() || '';
    const imageDataUrl = payload.imageDataUrl?.trim() || '';

    if (!imageDataUrl) {
        return NextResponse.json({ success: false, message: 'Asset image is required.' }, { status: 400 });
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
            message: error instanceof Error ? error.message : 'Invalid describe request.',
        }, { status: 400 });
    }

    try {
        const tagsResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/tags', {
            method: 'GET',
            cache: 'no-store',
            timeoutMs: DESCRIBE_TIMEOUT_MS,
        });

        if (!tagsResult.ok || !tagsResult.response) {
            const attemptsSuffix = formatOllamaAttemptedBaseUrls(tagsResult.attemptedBaseUrls);
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

        // If no model was requested (or the requested one isn't vision-capable),
        // fall back to the first installed vision model so indexing "just works".
        const visionModels = listOllamaVisionModels(models);
        const model = requestedModel && models.includes(requestedModel) && isOllamaVisionModel(requestedModel)
            ? requestedModel
            : visionModels[0];

        if (!model) {
            return NextResponse.json({
                success: false,
                message: `No vision-capable model installed in Ollama at ${resolvedBaseUrl}. Installed models: ${formatOllamaModelList(models)}.`,
            }, { status: 400 });
        }

        const describeResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            timeoutMs: DESCRIBE_TIMEOUT_MS,
            body: JSON.stringify({
                model,
                stream: false,
                prompt: DESCRIBE_PROMPT,
                images: [imageBase64],
                format: 'json',
                options: { temperature: 0.1 },
            }),
        });

        if (!describeResult.ok || !describeResult.response) {
            const attemptsSuffix = formatOllamaAttemptedBaseUrls(describeResult.attemptedBaseUrls);
            return NextResponse.json({
                success: false,
                message: `${describeResult.error instanceof Error ? describeResult.error.message : 'Ollama describe request failed.'}${attemptsSuffix}`,
            }, { status: 502 });
        }

        const describePayload = await describeResult.response.json() as OllamaGeneratePayload;
        if (describePayload.error) {
            return NextResponse.json({ success: false, message: describePayload.error }, { status: 502 });
        }

        const parsed = parseDescribeResponse(describePayload.response || '');
        if (!parsed) {
            return NextResponse.json({
                success: false,
                message: 'Ollama returned an unparsable describe response.',
            }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            description: parsed.description,
            tags: parsed.tags,
            model,
        });
    } catch (error) {
        const isAbortError = error instanceof DOMException && error.name === 'AbortError';
        return NextResponse.json({
            success: false,
            message: isAbortError
                ? `Timed out contacting Ollama after ${Math.round(DESCRIBE_TIMEOUT_MS / 1000)} seconds.`
                : (error instanceof Error ? error.message : 'Failed to contact Ollama.'),
        }, { status: 502 });
    }
}
