import { fetchOllamaWithFallback } from '@/lib/ollamaServer';

describe('ollamaServer', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.clearAllMocks();
    });

    it('retries the fallback candidate when the first attempt times out', async () => {
        global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input) === 'http://host.docker.internal:11434/api/generate') {
                return new Promise<Response>((_, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(new DOMException('This operation was aborted', 'AbortError'));
                    }, { once: true });
                });
            }

            if (String(input) === 'http://localhost:11434/api/generate') {
                return Promise.resolve({ ok: true } as Response);
            }

            return Promise.reject(new Error(`Unexpected fetch call: ${String(input)}`));
        }) as typeof global.fetch;

        const result = await fetchOllamaWithFallback('http://host.docker.internal:11434', '/api/generate', {
            method: 'POST',
            timeoutMs: 300,
        });

        expect(result.ok).toBe(true);
        expect(result.baseUrl).toBe('http://localhost:11434');
        expect(result.attemptedBaseUrls).toEqual([
            'http://host.docker.internal:11434',
            'http://localhost:11434',
        ]);
    });

    it('retries the same candidate when Ollama returns a transient fetch failure', async () => {
        let hostAttempts = 0;

        global.fetch = jest.fn((input: RequestInfo | URL) => {
            if (String(input) === 'http://host.docker.internal:11434/api/generate') {
                hostAttempts += 1;

                if (hostAttempts === 1) {
                    return Promise.reject(new TypeError('fetch failed'));
                }

                return Promise.resolve({ ok: true } as Response);
            }

            return Promise.reject(new Error(`Unexpected fetch call: ${String(input)}`));
        }) as typeof global.fetch;

        const result = await fetchOllamaWithFallback('http://host.docker.internal:11434', '/api/generate', {
            method: 'POST',
            timeoutMs: 10000,
        });

        expect(result.ok).toBe(true);
        expect(result.baseUrl).toBe('http://host.docker.internal:11434');
        expect(result.attemptedBaseUrls).toEqual(['http://host.docker.internal:11434']);
        expect(hostAttempts).toBe(2);
    });

    /**
     * Regression: the timeout budget used to be divided across every possible
     * retry slot (candidates x attempts), so a caller asking for 45s gave the
     * first attempt only ~5.6s. Local vision generation takes far longer than
     * that on a cold start, so critiques aborted mid-flight and reported
     * "This operation was aborted" as if Ollama were down.
     *
     * The budget is now divided per CANDIDATE, which keeps the fallback
     * behaviour above while leaving a usable slice for real work.
     */
    it('lets a slow call run well past the old per-slot fraction of the budget', async () => {
        // 20s of work against a 45s budget across two candidates: the first
        // candidate's slice is 22.5s, so this must survive. Under the old
        // division the abort was armed at ~5.6s and killed it.
        global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => (
            new Promise<Response>((resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    reject(new DOMException('This operation was aborted', 'AbortError'));
                }, { once: true });
                setTimeout(() => resolve({ ok: true, json: async () => ({ response: 'ok' }) } as Response), 20_000);
            })
        )) as unknown as typeof global.fetch;

        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        try {
            const promise = fetchOllamaWithFallback('http://localhost:11434', '/api/generate', {
                method: 'POST',
                timeoutMs: 45_000,
            });
            await jest.advanceTimersByTimeAsync(21_000);
            const result = await promise;
            expect(result.ok).toBe(true);
            expect(result.error).toBeUndefined();
        } finally {
            jest.useRealTimers();
        }
    });

    it('still reserves budget for the fallback candidate when the first one hangs', async () => {
        // The first candidate never answers. The second must still get a turn
        // inside the same overall budget.
        global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes('host.docker.internal')) {
                return new Promise<Response>((_, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(new DOMException('This operation was aborted', 'AbortError'));
                    }, { once: true });
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({ response: 'ok' }) } as Response);
        }) as unknown as typeof global.fetch;

        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        try {
            const promise = fetchOllamaWithFallback('http://host.docker.internal:11434', '/api/generate', {
                method: 'POST',
                timeoutMs: 45_000,
            });
            await jest.advanceTimersByTimeAsync(46_000);
            const result = await promise;
            expect(result.ok).toBe(true);
            expect(result.baseUrl).toBe('http://localhost:11434');
        } finally {
            jest.useRealTimers();
        }
    });
});