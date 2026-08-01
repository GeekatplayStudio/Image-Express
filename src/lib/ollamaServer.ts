import {
    isOllamaVisionModel,
    modelHasVisionCapability,
    resolveOllamaBaseUrlCandidates,
} from '@/lib/ollama';

export type OllamaFetchAttemptResult = {
    ok: boolean;
    baseUrl: string;
    attemptedBaseUrls: string[];
    response?: Response;
    error?: unknown;
};

export type OllamaFetchRequestInit = RequestInit & {
    timeoutMs?: number;
};

const OLLAMA_MAX_ATTEMPTS_PER_CANDIDATE = 4;
const OLLAMA_RETRY_BACKOFF_MS = 1500;

const createAbortError = (): Error => {
    try {
        return new DOMException('This operation was aborted', 'AbortError');
    } catch {
        const error = new Error('This operation was aborted');
        error.name = 'AbortError';
        return error;
    }
};

const isAbortLikeError = (error: unknown): boolean => (
    (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
);

const isRetryableNetworkError = (error: unknown): boolean => {
    if (isAbortLikeError(error)) {
        return false;
    }

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

const delay = async (ms: number): Promise<void> => {
    await new Promise((resolve) => {
        setTimeout(resolve, Math.max(0, ms));
    });
};

export async function fetchOllamaWithFallback(
    baseUrl: string,
    path: string,
    init?: OllamaFetchRequestInit,
): Promise<OllamaFetchAttemptResult> {
    const attemptedBaseUrls: string[] = [];
    const candidates = resolveOllamaBaseUrlCandidates(baseUrl);
    let lastAttempt: OllamaFetchAttemptResult | null = null;
    const { timeoutMs, signal: upstreamSignal, ...requestInit } = init ?? {};
    const deadline = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
        ? Date.now() + Math.max(1, timeoutMs)
        : null;

    for (const [candidateIndex, candidate] of candidates.entries()) {
        // Share the budget across CANDIDATES, not across every possible retry
        // slot.
        //
        // Both extremes are wrong. Dividing by candidates x attempts (the old
        // behaviour) left the first attempt with an eighth of the budget —
        // 5.6s out of 45s — which aborted real generation mid-flight and
        // reported it as if Ollama were unreachable. But handing the first
        // candidate the entire budget is also wrong: a base URL that HANGS
        // rather than refuses would consume everything and the fallback URL
        // would never be tried at all.
        //
        // Per-candidate division keeps both properties: enough time for a
        // slow model to answer, and a reserved slice so the fallback still
        // gets a turn. Retries within a candidate share that candidate's
        // slice, which is fine because retries only fire on fast network
        // errors that fail immediately.
        const candidatesLeft = candidates.length - candidateIndex;
        const candidateDeadline = deadline === null
            ? null
            : Math.min(deadline, Date.now() + Math.max(1, (deadline - Date.now()) / candidatesLeft));

        if (upstreamSignal?.aborted) {
            return lastAttempt ?? {
                ok: false,
                baseUrl: candidate,
                attemptedBaseUrls: [...attemptedBaseUrls],
                error: upstreamSignal.reason instanceof Error ? upstreamSignal.reason : createAbortError(),
            };
        }

        attemptedBaseUrls.push(candidate);

        for (let attemptNumber = 1; attemptNumber <= OLLAMA_MAX_ATTEMPTS_PER_CANDIDATE; attemptNumber += 1) {
            const remainingMs = candidateDeadline === null ? null : Math.max(0, candidateDeadline - Date.now());
            if (remainingMs !== null && remainingMs === 0) {
                lastAttempt = {
                    ok: false,
                    baseUrl: candidate,
                    attemptedBaseUrls: [...attemptedBaseUrls],
                    error: createAbortError(),
                };
                break;
            }

            // Whatever is left of this candidate's slice.
            const perAttemptTimeoutMs = remainingMs;

            const attemptController = new AbortController();
            const abortFromUpstream = (): void => {
                attemptController.abort(
                    upstreamSignal?.reason instanceof Error ? upstreamSignal.reason : createAbortError(),
                );
            };

            if (upstreamSignal) {
                upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
            }

            const timeoutId = perAttemptTimeoutMs === null
                ? null
                : setTimeout(() => {
                    attemptController.abort(createAbortError());
                }, perAttemptTimeoutMs);

            const headers = new Headers(requestInit.headers);
            if (!headers.has('Connection')) {
                headers.set('Connection', 'close');
            }

            try {
                const response = await fetch(`${candidate}${path}`, {
                    ...requestInit,
                    headers,
                    keepalive: false,
                    signal: attemptController.signal,
                });

                if (response.ok) {
                    return {
                        ok: true,
                        baseUrl: candidate,
                        attemptedBaseUrls: [...attemptedBaseUrls],
                        response,
                    };
                }

                lastAttempt = {
                    ok: false,
                    baseUrl: candidate,
                    attemptedBaseUrls: [...attemptedBaseUrls],
                    response,
                };
                break;
            } catch (error) {
                lastAttempt = {
                    ok: false,
                    baseUrl: candidate,
                    attemptedBaseUrls: [...attemptedBaseUrls],
                    error,
                };

                if (!isRetryableNetworkError(error) || attemptNumber >= OLLAMA_MAX_ATTEMPTS_PER_CANDIDATE) {
                    break;
                }

                await delay(OLLAMA_RETRY_BACKOFF_MS * attemptNumber);
            } finally {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                }
                if (upstreamSignal) {
                    upstreamSignal.removeEventListener('abort', abortFromUpstream);
                }
            }
        }
    }

    return lastAttempt ?? {
        ok: false,
        baseUrl,
        attemptedBaseUrls,
        error: new Error('Failed to contact Ollama.'),
    };
}

/** Per-model /api/show probe. Small and local, so it can be brisk. */
const OLLAMA_SHOW_TIMEOUT_MS = 4000;

export type OllamaVisionCheck = {
    supportsVision: boolean;
    /** How we know: Ollama's own capability list, or a guess from the name. */
    source: 'capabilities' | 'name-heuristic';
};

/**
 * Ask Ollama whether a model accepts images.
 *
 * /api/show returns a `capabilities` array ("completion", "tools", "vision",
 * …), which is the model's own answer and stays correct as the library grows.
 * Matching on names cannot: measured against the current library, the name
 * patterns recognise 4 of 19 vision models and miss qwen3-vl and gemma4
 * outright. The name check survives only for Ollama builds too old to report
 * capabilities, and says so via `source` so callers can hedge their wording.
 */
export async function checkOllamaModelVision(
    baseUrl: string,
    model: string,
): Promise<OllamaVisionCheck> {
    try {
        const result = await fetchOllamaWithFallback(baseUrl, '/api/show', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            timeoutMs: OLLAMA_SHOW_TIMEOUT_MS,
            body: JSON.stringify({ model }),
        });
        if (result.ok && result.response) {
            const payload = await result.response.json() as { capabilities?: unknown };
            const fromCapabilities = modelHasVisionCapability(payload.capabilities);
            if (fromCapabilities !== null) {
                return { supportsVision: fromCapabilities, source: 'capabilities' };
            }
        }
    } catch {
        // Unreachable or malformed — fall through to the name guess rather
        // than failing the whole status check over one probe.
    }
    return { supportsVision: isOllamaVisionModel(model), source: 'name-heuristic' };
}

/**
 * Which of the installed models accept images, asked model by model.
 *
 * Probes run together because each is a local round trip; a user with thirty
 * models should not wait thirty times.
 */
export async function listOllamaVisionModelsByCapability(
    baseUrl: string,
    models: string[],
): Promise<string[]> {
    const checks = await Promise.all(models.map(async (model) => ({
        model,
        vision: (await checkOllamaModelVision(baseUrl, model)).supportsVision,
    })));
    return checks.filter((entry) => entry.vision).map((entry) => entry.model);
}

export function formatOllamaAttemptedBaseUrls(attemptedBaseUrls: string[]): string {
    if (attemptedBaseUrls.length <= 1) {
        return '';
    }

    return ` Tried: ${attemptedBaseUrls.join(' -> ')}.`;
}