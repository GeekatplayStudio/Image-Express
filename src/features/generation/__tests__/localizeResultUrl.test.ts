/**
 * @jest-environment jsdom
 */

import {
    isLocalAssetUrl,
    localizeResultUrl,
    nameHintFor,
} from '@/features/generation/application/client/localizeResultUrl';

const TRIPO_URL = 'https://tripo-data.rg1.data.tripo3d.com/tcli_abc/2026/tripo_pbr_model_2f03.glb'
    + '?Key-Pair-Id=K167&Signature=wt1Ix2Kj7LVlBBWZ2tanmARslOGW0tnB628tFpz9UVvyxDebbNXKktVr1g0a5tUk';

beforeEach(() => {
    jest.restoreAllMocks();
    global.fetch = jest.fn();
});

describe('isLocalAssetUrl', () => {
    it.each([
        '/api/assets/serve/generated/models/a.glb',
        'blob:http://localhost/abc',
        'data:model/gltf-binary;base64,AAA',
        'http://localhost/api/assets/serve/x.glb',
    ])('treats %p as loadable', (url) => {
        expect(isLocalAssetUrl(url)).toBe(true);
    });

    it.each([
        TRIPO_URL,
        'https://cdn.example.com/model.glb',
        '',
    ])('treats %p as not loadable', (url) => {
        expect(isLocalAssetUrl(url)).toBe(false);
    });
});

describe('nameHintFor', () => {
    it('drops the signature query from a signed URL', () => {
        // A filename carrying hundreds of base64 characters is not a filename.
        const name = nameHintFor(TRIPO_URL, 'tripo');
        expect(name).toBe('tripo_pbr_model_2f03.glb');
        expect(name).not.toContain('Signature');
    });

    it('adds an extension when the URL has none', () => {
        // The library decides an asset's type and thumbnail support from the
        // name; an extension-less file becomes a model nothing recognises.
        expect(nameHintFor('https://cdn.example.com/download', 'tripo', true)).toBe('tripo-result.glb');
        expect(nameHintFor('https://cdn.example.com/download', 'tripo', false)).toBe('tripo-result.png');
    });
});

describe('localizeResultUrl', () => {
    it('returns a local URL unchanged and makes no request', async () => {
        const result = await localizeResultUrl('/api/assets/serve/generated/models/a.glb');
        expect(result).toEqual({ ok: true, url: '/api/assets/serve/generated/models/a.glb', wasRemote: false });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('saves a provider URL through the server and returns the stored path', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: true, path: '/api/assets/serve/generated/models/x.glb' }),
        });

        const result = await localizeResultUrl(TRIPO_URL, { type: 'models', provider: 'tripo' });
        expect(result).toEqual({ ok: true, url: '/api/assets/serve/generated/models/x.glb', wasRemote: true });

        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(JSON.parse(init.body)).toMatchObject({
            url: TRIPO_URL,
            filename: 'tripo_pbr_model_2f03.glb',
            type: 'models',
            category: 'generated',
        });
    });

    it('never falls back to the remote URL when saving fails', async () => {
        // Returning the provider URL here is the whole bug: CORS blocks it,
        // the GLTF loader throws, and the editor is replaced by a crash page.
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ success: false, message: 'Failed to fetch from provider' }),
        });

        const result = await localizeResultUrl(TRIPO_URL);
        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).not.toContain('tripo-data');
    });

    it('reports a network failure rather than throwing', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
        await expect(localizeResultUrl(TRIPO_URL)).resolves.toEqual({ ok: false, reason: 'offline' });
    });
});
