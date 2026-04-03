describe('/api/ai/ollama/status', () => {
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
    let GET: typeof import('@/app/api/ai/ollama/status/route').GET;

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
        ({ GET } = await import('@/app/api/ai/ollama/status/route'));
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

    it('falls back to host.docker.internal when localhost is unreachable from Docker', async () => {
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

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const request = {
            nextUrl: new URL('http://localhost:3000/api/ai/ollama/status?baseUrl=http%3A%2F%2Flocalhost%3A11434&model=qwen2.5%3A7b'),
        };
        const response = await GET(request as never);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            baseUrl: 'http://host.docker.internal:11434',
            requestedModel: 'qwen2.5:7b',
            modelFound: true,
            visionCapable: false,
            visionModels: [],
        }));
        expect(payload.attemptedBaseUrls).toEqual([
            'http://localhost:11434',
            'http://host.docker.internal:11434',
        ]);
    });
});