import { requestBananaImageGeneration, resolveBananaOutputBuffer } from '@/lib/server/bananaGeneration';

describe('bananaGeneration', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        delete process.env.BANANA_GENERATE_URL;
        delete process.env.BANANA_EDIT_URL;
        delete process.env.BANANA_MODEL;
    });

    it('normalizes a base64 image response from a Banana endpoint', async () => {
        process.env.BANANA_GENERATE_URL = 'https://banana.example/run';
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                outputs: [
                    {
                        image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6p5xQAAAAASUVORK5CYII=',
                    },
                ],
            }),
        })) as typeof global.fetch;

        const result = await requestBananaImageGeneration({
            apiKey: 'banana-key',
            prompt: 'Minimal poster',
        });

        expect(result.imageUrl).toMatch(/^data:image\/png;base64,/);
        expect(result.endpoint).toBe('https://banana.example/run');
        expect(result.model).toBe('nanobanana-2');
    });

    it('downloads an http output into a buffer', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
        })) as typeof global.fetch;

        const buffer = await resolveBananaOutputBuffer('https://banana.example/output.png');
        expect(Array.from(buffer.values())).toEqual([1, 2, 3, 4]);
    });
});
