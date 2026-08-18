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

    /**
     * Two different models that happen to share a filename must never resolve
     * to the same stored asset. Keying the cache on the name alone meant the
     * Asset Vault — which opened every blob model as "model.glb" — served the
     * first model ever opened for all of them, and the caller then wrote that
     * URL back onto the layer, permanently repointing it at another file.
     */
    it('keeps two same-named models apart by content', async () => {
        const uploads: string[] = [];
        (global.fetch as jest.Mock).mockImplementation(async (input: unknown, init?: RequestInit) => {
            const target = String(input);
            if (target.startsWith('blob:')) {
                return { ok: true, blob: async () => new Blob([target.endsWith('a') ? 'MODEL-A' : 'A-DIFFERENT-MODEL']) };
            }
            if (init?.method === 'HEAD') return { ok: true };
            const path = `/api/assets/serve/uploads/models/upload-${uploads.length}.glb`;
            uploads.push(path);
            return { ok: true, json: async () => ({ success: true, path }) };
        });

        const first = await recoverVolatileModelSource('blob:http://localhost/a', 'model.glb', 'Guest');
        const second = await recoverVolatileModelSource('blob:http://localhost/b', 'model.glb', 'Guest');

        expect(first).not.toBe(second);
        expect(uploads).toHaveLength(2);
    });

    it('still reuses one stored asset when the same model is opened twice', async () => {
        let uploadCount = 0;
        (global.fetch as jest.Mock).mockImplementation(async (input: unknown, init?: RequestInit) => {
            if (String(input).startsWith('blob:')) {
                return { ok: true, blob: async () => new Blob(['IDENTICAL-BYTES']) };
            }
            if (init?.method === 'HEAD') return { ok: true };
            uploadCount += 1;
            return { ok: true, json: async () => ({ success: true, path: '/api/assets/serve/uploads/models/one.glb' }) };
        });

        // Different blob URLs and different names, same bytes.
        const first = await recoverVolatileModelSource('blob:http://localhost/x', 'hat.glb', 'Guest');
        const second = await recoverVolatileModelSource('blob:http://localhost/y', 'copy-of-hat.glb', 'Guest');

        expect(second).toBe(first);
        expect(uploadCount).toBe(1);
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
