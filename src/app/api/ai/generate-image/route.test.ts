describe('/api/ai/generate-image', () => {
    const originalFetch = global.fetch;
    const originalRequest = global.Request;
    const originalResponse = global.Response;
    const originalHeaders = global.Headers;
    const originalTextEncoder = global.TextEncoder;
    const originalTextDecoder = global.TextDecoder;
    const originalReadableStream = global.ReadableStream;
    const originalTransformStream = global.TransformStream;
    const originalMessagePort = global.MessagePort;
    const originalMessageChannel = global.MessageChannel;
    let POST: typeof import('@/app/api/ai/generate-image/route').POST;

    beforeEach(async () => {
        jest.clearAllMocks();
        if (!global.TextEncoder || !global.TextDecoder) {
            const { TextEncoder, TextDecoder } = await import('util');
            Object.assign(global, { TextEncoder, TextDecoder });
        }
        if (!global.ReadableStream || !global.TransformStream) {
            const { ReadableStream, TransformStream } = await import('stream/web');
            Object.assign(global, { ReadableStream, TransformStream });
        }
        if (!global.MessagePort || !global.MessageChannel) {
            const { MessagePort, MessageChannel } = await import('worker_threads');
            Object.assign(global, { MessagePort, MessageChannel });
        }
        if (!global.Request || !global.Response || !global.Headers) {
            const { Request, Response, Headers } = await import('undici');
            Object.assign(global, { Request, Response, Headers });
        }
        ({ POST } = await import('@/app/api/ai/generate-image/route'));
    });

    afterAll(() => {
        global.fetch = originalFetch;
        global.Request = originalRequest;
        global.Response = originalResponse;
        global.Headers = originalHeaders;
        global.TextEncoder = originalTextEncoder;
        global.TextDecoder = originalTextDecoder;
        global.ReadableStream = originalReadableStream;
        global.TransformStream = originalTransformStream;
        global.MessagePort = originalMessagePort;
        global.MessageChannel = originalMessageChannel;
    });

    it('returns an SVG data URL for the Ollama provider path', async () => {
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'http://localhost:11434/api/tags') {
                return {
                    ok: true,
                    json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
                } as Response;
            }

            if (String(input) === 'http://localhost:11434/api/generate') {
                return {
                    ok: true,
                    json: async () => ({
                        response: '```svg\n<svg width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#112233" /><circle cx="320" cy="240" r="120" fill="#ffee88" /></svg>\n```',
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'A bold abstract sunrise',
                width: 640,
                height: 480,
                provider: 'remote',
                specificProvider: 'ollama',
                localAiBaseUrl: 'http://localhost:11434',
                localAiModel: 'qwen2.5:7b',
            }),
        });

        const response = await POST(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            provider: 'ollama',
            output: 'svg',
        }));
        expect(payload.imageUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('returns a clear setup error when the configured Ollama model is missing', async () => {
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'http://localhost:11434/api/tags') {
                return {
                    ok: true,
                    json: async () => ({ models: [{ name: 'llava:7b' }] }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'A bold abstract sunrise',
                width: 640,
                height: 480,
                provider: 'remote',
                specificProvider: 'ollama',
                localAiBaseUrl: 'http://localhost:11434',
                localAiModel: 'qwen2.5:7b',
            }),
        });

        const response = await POST(request);
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual(expect.objectContaining({
            success: false,
            message: expect.stringContaining('qwen2.5:7b'),
        }));
    });

    it('falls back to host.docker.internal for Ollama when localhost is unreachable', async () => {
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'http://localhost:11434/api/tags') {
                throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
            }

            if (String(input) === 'http://host.docker.internal:11434/api/tags') {
                return {
                    ok: true,
                    json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
                } as Response;
            }

            if (String(input) === 'http://host.docker.internal:11434/api/generate') {
                return {
                    ok: true,
                    json: async () => ({
                        response: '<svg width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#112233" /></svg>',
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'A bold abstract sunrise',
                width: 640,
                height: 480,
                provider: 'remote',
                specificProvider: 'ollama',
                localAiBaseUrl: 'http://localhost:11434',
                localAiModel: 'qwen2.5:7b',
            }),
        });

        const response = await POST(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            provider: 'ollama',
            output: 'svg',
        }));
    });

    it('retries Ollama generation once more after a transient transport failure', async () => {
        let generateCalls = 0;

        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'http://ollama.internal:11434/api/tags') {
                return {
                    ok: true,
                    json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
                } as Response;
            }

            if (String(input) === 'http://ollama.internal:11434/api/generate') {
                generateCalls += 1;

                if (generateCalls <= 4) {
                    throw new TypeError('fetch failed');
                }

                return {
                    ok: true,
                    json: async () => ({
                        response: '<svg width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#112233" /></svg>',
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'A bold abstract sunrise',
                width: 640,
                height: 480,
                provider: 'remote',
                specificProvider: 'ollama',
                localAiBaseUrl: 'http://ollama.internal:11434',
                localAiModel: 'qwen2.5:7b',
            }),
        });

        const response = await POST(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            provider: 'ollama',
            output: 'svg',
        }));
        expect(generateCalls).toBe(5);
    }, 20000);

    it('returns an image data URL for the Google provider path', async () => {
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            expect(String(input)).toContain('generativelanguage.googleapis.com');
            return {
                ok: true,
                json: async () => ({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    { text: 'Created with Gemini.' },
                                    {
                                        inlineData: {
                                            mimeType: 'image/png',
                                            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6p5xQAAAAASUVORK5CYII=',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }),
            } as Response;
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'A minimal poster with bold geometric shapes',
                width: 1536,
                height: 1024,
                provider: 'remote',
                specificProvider: 'google',
                apiKey: 'AIza-test-key',
            }),
        });

        const response = await POST(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            provider: 'google',
            model: expect.any(String),
            aspectRatio: '3:2',
        }));
        expect(payload.imageUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('returns a Banana image when the server endpoint is configured', async () => {
        process.env.BANANA_GENERATE_URL = 'https://banana.example/run';

        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            expect(String(input)).toBe('https://banana.example/run');
            return {
                ok: true,
                json: async () => ({
                    imageUrl: 'data:image/png;base64,AQIDBA==',
                }),
            } as Response;
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'A minimal poster with bold geometric shapes',
                width: 1536,
                height: 1024,
                provider: 'remote',
                specificProvider: 'banana',
                apiKey: 'banana-key',
            }),
        });

        const response = await POST(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            provider: 'banana',
            model: 'nanobanana-2',
            endpoint: 'https://banana.example/run',
        }));
        expect(payload.imageUrl).toBe('data:image/png;base64,AQIDBA==');
    });
});