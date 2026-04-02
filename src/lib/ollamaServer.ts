import { resolveOllamaBaseUrlCandidates } from '@/lib/ollama';

export type OllamaFetchAttemptResult = {
    ok: boolean;
    baseUrl: string;
    attemptedBaseUrls: string[];
    response?: Response;
    error?: unknown;
};

export async function fetchOllamaWithFallback(
    baseUrl: string,
    path: string,
    init?: RequestInit,
): Promise<OllamaFetchAttemptResult> {
    const attemptedBaseUrls: string[] = [];
    const candidates = resolveOllamaBaseUrlCandidates(baseUrl);
    let lastAttempt: OllamaFetchAttemptResult | null = null;

    for (const candidate of candidates) {
        attemptedBaseUrls.push(candidate);

        try {
            const response = await fetch(`${candidate}${path}`, init);
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
        } catch (error) {
            lastAttempt = {
                ok: false,
                baseUrl: candidate,
                attemptedBaseUrls: [...attemptedBaseUrls],
                error,
            };
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