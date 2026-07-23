import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';
import { formatOllamaAttemptedBaseUrls, fetchOllamaWithFallback } from '@/lib/ollamaServer';
import { formatOllamaModelList, normalizeOllamaBaseUrl } from '@/lib/ollama';
import { authorizeLocalRuntimeCapability } from '@/lib/server/runtimeProfile';

const OLLAMA_INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

type OllamaTagsPayload = {
    models?: Array<{ name?: string; model?: string }>;
};

type OllamaPullPayload = {
    status?: string;
    error?: string;
};

const extractModelNames = (payload: OllamaTagsPayload): string[] => (
    Array.isArray(payload.models)
        ? payload.models
            .map((entry) => entry.name || entry.model || '')
            .filter((entry) => entry.trim().length > 0)
        : []
);

export async function POST(request: NextRequest) {
    const unauthorized = authorizeLocalRuntimeCapability(request, 'runtime:install');
    if (unauthorized) return unauthorized;
    let payload: { baseUrl?: string; model?: string };

    try {
        payload = await request.json() as typeof payload;
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid Ollama install request payload.' }, { status: 400 });
    }

    const requestedBaseUrl = payload.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL;
    const requestedModel = payload.model?.trim() || DEFAULT_OLLAMA_MODEL;

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
            timeoutMs: OLLAMA_INSTALL_TIMEOUT_MS,
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

        resolvedBaseUrl = tagsResult.baseUrl;
        const tagsPayload = await tagsResult.response.json() as OllamaTagsPayload;
        const models = extractModelNames(tagsPayload);

        if (models.includes(requestedModel)) {
            return NextResponse.json({
                success: true,
                message: `Model "${requestedModel}" is already installed in Ollama at ${resolvedBaseUrl}.`,
                baseUrl: resolvedBaseUrl,
                attemptedBaseUrls: tagsResult.attemptedBaseUrls,
                model: requestedModel,
                models,
                alreadyInstalled: true,
            });
        }

        const pullResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/pull', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            timeoutMs: OLLAMA_INSTALL_TIMEOUT_MS,
            body: JSON.stringify({
                model: requestedModel,
                stream: false,
            }),
        });

        if (!pullResult.ok || !pullResult.response) {
            const attemptsSuffix = formatOllamaAttemptedBaseUrls(pullResult.attemptedBaseUrls);
            if (pullResult.response) {
                return NextResponse.json({
                    success: false,
                    message: `Ollama responded with ${pullResult.response.status} ${pullResult.response.statusText} while installing ${requestedModel}.${attemptsSuffix}`,
                }, { status: 502 });
            }

            return NextResponse.json({
                success: false,
                message: `${pullResult.error instanceof Error ? pullResult.error.message : 'Failed to install Ollama model.'}${attemptsSuffix}`,
            }, { status: 502 });
        }

        resolvedBaseUrl = pullResult.baseUrl;
        const pullPayload = await pullResult.response.json() as OllamaPullPayload;
        if (pullPayload.error) {
            return NextResponse.json({
                success: false,
                message: `Ollama could not install "${requestedModel}": ${pullPayload.error}`,
            }, { status: 502 });
        }

        const verifyResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/tags', {
            method: 'GET',
            cache: 'no-store',
            timeoutMs: OLLAMA_INSTALL_TIMEOUT_MS,
        });

        if (!verifyResult.ok || !verifyResult.response) {
            const attemptsSuffix = formatOllamaAttemptedBaseUrls(verifyResult.attemptedBaseUrls);
            return NextResponse.json({
                success: false,
                message: `Installed "${requestedModel}", but failed to verify models afterwards.${attemptsSuffix}`,
            }, { status: 502 });
        }

        resolvedBaseUrl = verifyResult.baseUrl;
        const verifyPayload = await verifyResult.response.json() as OllamaTagsPayload;
        const verifiedModels = extractModelNames(verifyPayload);

        if (!verifiedModels.includes(requestedModel)) {
            return NextResponse.json({
                success: false,
                message: `Ollama finished the install request, but "${requestedModel}" still does not appear in the installed model list at ${resolvedBaseUrl}. Available models: ${formatOllamaModelList(verifiedModels)}.`,
            }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            message: `Installed "${requestedModel}" in Ollama at ${resolvedBaseUrl}.`,
            baseUrl: resolvedBaseUrl,
            attemptedBaseUrls: verifyResult.attemptedBaseUrls,
            model: requestedModel,
            models: verifiedModels,
            alreadyInstalled: false,
        });
    } catch (error) {
        const isAbortError = error instanceof DOMException && error.name === 'AbortError';
        return NextResponse.json({
            success: false,
            message: isAbortError
                ? `Timed out installing the Ollama model after ${Math.round(OLLAMA_INSTALL_TIMEOUT_MS / 60000)} minutes.`
                : (error instanceof Error ? error.message : 'Failed to install Ollama model.'),
        }, { status: 502 });
    }
}
