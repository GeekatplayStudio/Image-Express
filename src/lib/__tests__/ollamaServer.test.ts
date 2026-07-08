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
            timeoutMs: 50,
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
});