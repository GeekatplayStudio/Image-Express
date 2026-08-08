import { NextRequest, NextResponse } from 'next/server';
import { enforceJsonBody } from '@/lib/server/apiContract';
import { assertFetchableUrl } from '@/lib/server/outboundUrlPolicy';
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
    total?: number;
    completed?: number;
};

/**
 * Drain a streaming /api/pull response.
 *
 * Ollama emits one JSON object per line while downloading. We only need the
 * last status and any error, but the stream must be read to completion —
 * abandoning it mid-download would cancel the pull. Returns the final byte
 * counts so the caller can report what actually landed.
 */
async function consumePullStream(response: Response): Promise<{
    error?: string;
    status?: string;
    total?: number;
    completed?: number;
}> {
    // Ollama streams NDJSON, but a proxy in front of it may buffer the whole
    // thing, and not every Response implementation exposes a reader. Accept
    // all three shapes rather than assuming the happy one.
    const body = response.body;
    if (!body) {
        if (typeof response.text === 'function') {
            return parsePullLines(await response.text());
        }
        if (typeof response.json === 'function') {
            const single = await response.json() as OllamaPullPayload;
            return {
                error: single.error,
                status: single.status,
                total: single.total,
                completed: single.completed,
            };
        }
        return {};
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let latest: ReturnType<typeof parsePullLines> = {};

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        // Keep the trailing partial line for the next chunk.
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        const parsed = parsePullLines(lines.join('\n'));
        latest = { ...latest, ...parsed };
        if (parsed.error) return latest;
    }

    const tail = parsePullLines(buffered);
    return { ...latest, ...tail };
}

function parsePullLines(text: string): {
    error?: string;
    status?: string;
    total?: number;
    completed?: number;
} {
    const result: { error?: string; status?: string; total?: number; completed?: number } = {};
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const entry = JSON.parse(trimmed) as OllamaPullPayload;
            if (entry.error) result.error = entry.error;
            if (entry.status) result.status = entry.status;
            if (typeof entry.total === 'number') result.total = entry.total;
            if (typeof entry.completed === 'number') result.completed = entry.completed;
        } catch {
            // A partial or non-JSON line mid-stream is normal; skip it.
        }
    }
    return result;
}

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
// A model name and a base URL; nothing here is large.
const badBody = enforceJsonBody(request, 16 * 1024);
if (badBody) return badBody;
        payload = await request.json() as typeof payload;
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid Ollama install request payload.' }, { status: 400 });
    }

    const requestedBaseUrl = payload.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL;
    const requestedModel = payload.model?.trim() || DEFAULT_OLLAMA_MODEL;

    let resolvedBaseUrl: string;
    try {
        resolvedBaseUrl = normalizeOllamaBaseUrl(requestedBaseUrl);
        // normalizeOllamaBaseUrl only checks the scheme. Loopback stays
        // allowed here — that is where Ollama actually runs — but the
        // metadata endpoint and, on self-hosted, the private network do not.
        assertFetchableUrl(resolvedBaseUrl);
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

        // Stream the pull rather than waiting on one blocking response.
        //
        // A vision model is several gigabytes. With stream:false the socket
        // sits silent for the whole download, which looks identical to a hang
        // and can trip the timeout with no indication of how far it got.
        // Streaming also lets the deadline measure *stalled* time instead of
        // total time, so a slow-but-progressing download is never killed.
        const pullResult = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/pull', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            timeoutMs: OLLAMA_INSTALL_TIMEOUT_MS,
            body: JSON.stringify({
                model: requestedModel,
                stream: true,
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
        const pullProgress = await consumePullStream(pullResult.response);
        if (pullProgress.error) {
            return NextResponse.json({
                success: false,
                message: `Ollama could not install "${requestedModel}": ${pullProgress.error}`,
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
