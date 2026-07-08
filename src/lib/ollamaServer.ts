import { resolveOllamaBaseUrlCandidates } from '@/lib/ollama';

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
    const totalAttemptSlots = candidates.length * OLLAMA_MAX_ATTEMPTS_PER_CANDIDATE;
    let consumedAttemptSlots = 0;

    for (const candidate of candidates) {
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
            const remainingMs = deadline === null ? null : Math.max(0, deadline - Date.now());
            if (remainingMs !== null && remainingMs === 0) {
                lastAttempt = {
                    ok: false,
                    baseUrl: candidate,
                    attemptedBaseUrls: [...attemptedBaseUrls],
                    error: createAbortError(),
                };
                break;
            }

            const remainingAttemptSlots = Math.max(1, totalAttemptSlots - consumedAttemptSlots);
            const perAttemptTimeoutMs = remainingMs === null
                ? null
                : Math.max(1, Math.ceil(remainingMs / remainingAttemptSlots));

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
                consumedAttemptSlots += 1;

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
                consumedAttemptSlots += 1;
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

export function formatOllamaAttemptedBaseUrls(attemptedBaseUrls: string[]): string {
    if (attemptedBaseUrls.length <= 1) {
        return '';
    }

    return ` Tried: ${attemptedBaseUrls.join(' -> ')}.`;
}