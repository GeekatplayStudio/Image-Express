/** @jest-environment jsdom */

import {
    clearDurableModelSourceCachesForTests,
    materializeDurableModelSource,
    recoverVolatileModelSource,
} from '../durableModelSource';

describe('durable model sources', () => {
    beforeEach(() => {
        window.localStorage.clear();
        clearDurableModelSourceCachesForTests();
        global.fetch = jest.fn();
    });

    it('uploads a browser-owned model blob and returns a durable server route', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, path: '/api/assets/serve/uploads/models/fox.glb' }),
        });

        const result = await materializeDurableModelSource({
            cacheKey: 'local:fox',
            blob: new Blob(['glb'], { type: 'model/gltf-binary' }),
            filename: 'fox.glb',
            category: 'uploads',
            owner: 'Guest',
        });

        expect(result).toBe('/api/assets/serve/uploads/models/fox.glb');
        expect(global.fetch).toHaveBeenCalledWith('/api/assets/upload', expect.objectContaining({
            method: 'POST',
            body: expect.any(FormData),
        }));
        expect(result.startsWith('blob:')).toBe(false);
    });

    it('reuses a persisted durable route without uploading the model again', async () => {
        window.localStorage.setItem('image-express-durable-model-sources-v1', JSON.stringify({
            'local:fox': '/api/assets/serve/uploads/models/fox.glb',
        }));
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

        const result = await materializeDurableModelSource({
            cacheKey: 'local:fox',
            blob: new Blob(['glb']),
            filename: 'fox.glb',
            category: 'uploads',
            owner: 'Guest',
        });

        expect(result).toBe('/api/assets/serve/uploads/models/fox.glb');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(result, expect.objectContaining({ method: 'HEAD' }));
    });

    it('recovers an expired blob reference from a matching server asset', async () => {
        (global.fetch as jest.Mock)
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    files: [{ name: 'fox.glb', path: '/api/assets/serve/uploads/models/fox.glb' }],
                }),
            });

        await expect(recoverVolatileModelSource('blob:http://localhost/dead', 'fox.glb', 'Guest'))
            .resolves.toBe('/api/assets/serve/uploads/models/fox.glb');
    });
});
