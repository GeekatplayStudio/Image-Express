describe('/api/ai/ollama/install', () => {
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
    let POST: typeof import('@/app/api/ai/ollama/install/route').POST;

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
        ({ POST } = await import('@/app/api/ai/ollama/install/route'));
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

    it('pulls a missing Ollama model and verifies that it becomes available', async () => {
        let tagsCalls = 0;
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'http://localhost:11434/api/tags') {
                tagsCalls += 1;
                return {
                    ok: true,
                    json: async () => ({
                        models: tagsCalls === 1
                            ? [{ name: 'qwen2.5-coder:7b' }]
                            : [{ name: 'qwen2.5-coder:7b' }, { name: 'qwen2.5:7b' }],
                    }),
                } as Response;
            }

            if (String(input) === 'http://localhost:11434/api/pull') {
                return {
                    ok: true,
                    json: async () => ({ status: 'success' }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = new Request('http://localhost:3000/api/ai/ollama/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: 'http://localhost:11434',
                model: 'qwen2.5:7b',
            }),
        });

        const response = await POST(request as never);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            model: 'qwen2.5:7b',
            alreadyInstalled: false,
            message: expect.stringContaining('Installed "qwen2.5:7b"'),
        }));
    });
});