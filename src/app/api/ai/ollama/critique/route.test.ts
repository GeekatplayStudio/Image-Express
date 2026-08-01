describe('/api/ai/ollama/critique', () => {
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
    let POST: typeof import('@/app/api/ai/ollama/critique/route').POST;

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
        ({ POST } = await import('@/app/api/ai/ollama/critique/route'));
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

    it('returns a critique response when the configured Ollama model is available', async () => {
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'http://localhost:11434/api/tags') {
                return {
                    ok: true,
                    json: async () => ({ models: [{ name: 'llava:7b' }] }),
                } as Response;
            }

            if (String(input) === 'http://localhost:11434/api/generate') {
                return {
                    ok: true,
                    json: async () => ({ response: 'Summary\nClear focal point.\n\nNext Edits\nIncrease text contrast.' }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/ollama/critique', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: 'http://localhost:11434',
                model: 'llava:7b',
                target: 'canvas',
                targetLabel: 'Full canvas',
                focus: 'Focus on readability.',
                imageDataUrl: 'data:image/png;base64,AAAAAA==',
            }),
        });

        const response = await POST(request as never);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            critique: expect.stringContaining('Clear focal point'),
            model: 'llava:7b',
            target: 'canvas',
        }));
    });

    it('returns a setup error when the configured Ollama model is missing', async () => {
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'http://localhost:11434/api/tags') {
                return {
                    ok: true,
                    json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/ollama/critique', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: 'http://localhost:11434',
                model: 'llava:7b',
                target: 'selection',
                targetLabel: 'Hero Layer',
                imageDataUrl: 'data:image/png;base64,AAAAAA==',
            }),
        });

        const response = await POST(request as never);
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual(expect.objectContaining({
            success: false,
            message: expect.stringContaining('llava:7b'),
        }));
    });

    it('rejects text-only models for critique even when they are installed', async () => {
        // Vision support comes from Ollama's own /api/show capabilities, so the
        // mock answers per model rather than relying on the name.
        global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input) === 'http://localhost:11434/api/tags') {
                return {
                    ok: true,
                    json: async () => ({ models: [{ name: 'qwen2.5:7b' }, { name: 'llava:7b' }] }),
                } as Response;
            }

            if (String(input) === 'http://localhost:11434/api/show') {
                const asked = JSON.parse(String(init?.body ?? '{}')).model as string;
                return {
                    ok: true,
                    json: async () => ({
                        capabilities: asked === 'llava:7b'
                            ? ['completion', 'vision']
                            : ['completion', 'tools'],
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/ollama/critique', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: 'http://localhost:11434',
                model: 'qwen2.5:7b',
                target: 'canvas',
                targetLabel: 'Full canvas',
                imageDataUrl: 'data:image/png;base64,AAAAAA==',
            }),
        });

        const response = await POST(request as never);
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual(expect.objectContaining({
            success: false,
            reason: 'model_not_vision_capable',
            requestedModel: 'qwen2.5:7b',
            visionSource: 'capabilities',
            // The installed vision model is offered as the fix, so the UI can
            // switch to it without the user guessing a model name.
            visionModels: ['llava:7b'],
        }));
        expect(payload.message).toContain('cannot read images');
    });

    it('trusts capabilities over the model name in both directions', async () => {
        // A vision model whose name matches nothing in the old pattern list
        // must still be accepted — that list misses most of the current library.
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'http://localhost:11434/api/tags') {
                return { ok: true, json: async () => ({ models: [{ name: 'qwen3-vl:8b' }] }) } as Response;
            }
            if (String(input) === 'http://localhost:11434/api/show') {
                return { ok: true, json: async () => ({ capabilities: ['completion', 'vision'] }) } as Response;
            }
            if (String(input) === 'http://localhost:11434/api/generate') {
                return { ok: true, json: async () => ({ response: 'Summary\nLooks good.' }) } as Response;
            }
            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/ollama/critique', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: 'http://localhost:11434',
                model: 'qwen3-vl:8b',
                target: 'canvas',
                targetLabel: 'Full canvas',
                imageDataUrl: 'data:image/png;base64,AAAAAA==',
            }),
        });

        const response = await POST(request as never);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({ success: true, model: 'qwen3-vl:8b' }));
    });

    it('falls back from host.docker.internal to localhost when the app is running outside Docker', async () => {
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'http://host.docker.internal:11434/api/tags') {
                throw new Error('getaddrinfo ENOTFOUND host.docker.internal');
            }

            if (String(input) === 'http://localhost:11434/api/tags') {
                return {
                    ok: true,
                    json: async () => ({ models: [{ name: 'llava:7b' }] }),
                } as Response;
            }

            if (String(input) === 'http://localhost:11434/api/generate') {
                return {
                    ok: true,
                    json: async () => ({ response: 'Summary\nGood layout.' }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/ollama/critique', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: 'http://host.docker.internal:11434',
                model: 'llava:7b',
                target: 'canvas',
                targetLabel: 'Full canvas',
                imageDataUrl: 'data:image/png;base64,AAAAAA==',
            }),
        });

        const response = await POST(request as never);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            baseUrl: 'http://localhost:11434',
            critique: expect.stringContaining('Good layout'),
        }));
    });
});