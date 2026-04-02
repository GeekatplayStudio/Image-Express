import { NanoBananaProvider } from '@/lib/agentic-edit/providers/nanobanana';

describe('NanoBananaProvider', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        delete process.env.BANANA_EDIT_URL;
    });

    it('calls the Banana edit endpoint and returns the generated image buffer', async () => {
        process.env.BANANA_EDIT_URL = 'https://banana.example/edit';
        global.fetch = jest.fn(async (input: RequestInfo | URL) => {
            if (String(input) === 'https://banana.example/edit') {
                return {
                    ok: true,
                    json: async () => ({
                        imageUrl: 'data:image/png;base64,AQIDBA==',
                    }),
                } as Response;
            }

            throw new Error(`Unexpected fetch call: ${String(input)}`);
        }) as typeof global.fetch;

        const provider = new NanoBananaProvider();
        const result = await provider.generate({
            originalImage: Buffer.from([1, 2, 3]),
            promptPositive: 'Replace jacket with a red coat',
            params: {
                apiKey: 'banana-key',
                model: 'nanobanana-2',
            },
        });

        expect(Array.from(result.outputImage.values())).toEqual([1, 2, 3, 4]);
        expect(result.meta).toEqual(expect.objectContaining({
            provider: 'nanobanana',
            status: 'completed',
            model: 'nanobanana-2',
        }));
    });
});
