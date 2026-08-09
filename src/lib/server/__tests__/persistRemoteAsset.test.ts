/**
 * @jest-environment node
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let assetsDir: string;
jest.mock('@/lib/server/appPaths', () => ({
    getAssetsDir: () => assetsDir,
    getDataDir: () => assetsDir,
}));

const upsertAssetMetadata = jest.fn(async () => {});
jest.mock('@/lib/server/asset-metadata', () => ({
    VALID_ASSET_TYPES: ['images', 'models', 'videos', 'audio'],
    VALID_ASSET_CATEGORIES: ['uploads', 'generated'],
    upsertAssetMetadata: (...args: unknown[]) => upsertAssetMetadata(...args as []),
}));

import { assetPublicPath, persistRemoteAsset, resultFileName } from '@/lib/server/persistRemoteAsset';

const TRIPO_URL = 'https://tripo-data.rg1.data.tripo3d.com/tcli_abc/20260809/2f03813f/tripo_pbr_model_2f03813f.glb'
    + '?Key-Pair-Id=K1676C64NMVM2J&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly90cmlwby1kYXRh'
    + '&Signature=wt1Ix2Kj7LVlBBWZ2tanmARslOGW0tnB628tFpz9UVvyxDebbNXKktVr1g0a5tUk9IUA57Lv2k~hTti4qpDqte9iibG8VTru';

beforeEach(async () => {
    assetsDir = await mkdtemp(path.join(tmpdir(), 'persist-remote-'));
    jest.clearAllMocks();
});

afterEach(async () => {
    await rm(assetsDir, { recursive: true, force: true });
});

describe('resultFileName', () => {
    it('ignores the query string of a signed URL', () => {
        // The Signature is hundreds of base64 characters; including it would
        // produce a name no filesystem accepts.
        const name = resultFileName(TRIPO_URL, 'tripo-image-to-3d');
        expect(name).toContain('tripo_pbr_model_2f03813f.glb');
        expect(name).not.toContain('Signature');
        expect(name.length).toBeLessThan(120);
    });

    it('falls back to the hint plus a content-type extension', () => {
        const name = resultFileName('https://cdn.example.com/download', 'tripo-image-to-3d', 'model/gltf-binary');
        expect(name).toMatch(/tripo-image-to-3d\.glb$/);
    });

    it('uses .bin rather than guessing when the type is unknown', () => {
        const name = resultFileName('https://cdn.example.com/download', 'x', 'application/octet-stream');
        expect(name).toMatch(/\.bin$/);
    });

    it('survives a URL that does not parse', () => {
        expect(() => resultFileName('not a url', 'fallback')).not.toThrow();
        expect(resultFileName('not a url', 'fallback')).toContain('fallback');
    });

    it('strips characters that are illegal in a filename', () => {
        const name = resultFileName('https://cdn.example.com/a b:c*d.glb', 'hint');
        expect(name).not.toMatch(/[ :*]/);
    });
});

describe('persistRemoteAsset', () => {
    const okResponse = (body: string, contentType = 'model/gltf-binary') => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': contentType }),
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    });

    it('stores the bytes and returns an app-local path', async () => {
        global.fetch = jest.fn(async () => okResponse('GLB-BYTES')) as unknown as typeof fetch;

        const stored = await persistRemoteAsset({
            url: TRIPO_URL,
            nameHint: 'tripo-image-to-3d',
            type: 'models',
            category: 'generated',
            owner: 'alice',
        });

        expect(stored.path.startsWith('/api/assets/serve/generated/models/')).toBe(true);
        const onDisk = await readFile(path.join(assetsDir, 'generated', 'models', stored.name), 'utf8');
        expect(onDisk).toBe('GLB-BYTES');
    });

    it('registers the asset so it appears in the collection', async () => {
        // A file on disk the catalog does not know about is invisible — this
        // is why a "saved" generation could not be found afterwards.
        global.fetch = jest.fn(async () => okResponse('X')) as unknown as typeof fetch;

        await persistRemoteAsset({ url: TRIPO_URL, nameHint: 'h', owner: 'alice' });

        expect(upsertAssetMetadata).toHaveBeenCalledWith(expect.objectContaining({
            category: 'generated',
            type: 'models',
            owner: 'alice',
        }));
    });

    it('defaults to models/generated for a provider result', async () => {
        global.fetch = jest.fn(async () => okResponse('X')) as unknown as typeof fetch;
        const stored = await persistRemoteAsset({ url: TRIPO_URL, nameHint: 'h' });
        expect(stored.type).toBe('models');
        expect(stored.category).toBe('generated');
    });

    it('throws when the provider responds with an error', async () => {
        global.fetch = jest.fn(async () => ({
            ok: false, status: 403, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0),
        })) as unknown as typeof fetch;

        // 403 is what an *expired* signed URL returns; failing loudly beats
        // storing an error page as if it were a model.
        await expect(persistRemoteAsset({ url: TRIPO_URL, nameHint: 'h' })).rejects.toThrow(/403/);
    });

    it('refuses an address the outbound policy blocks', async () => {
        global.fetch = jest.fn(async () => okResponse('X')) as unknown as typeof fetch;
        // Link-local is refused in every runtime profile; the server must not
        // become a fetcher for internal addresses.
        await expect(persistRemoteAsset({
            url: 'http://169.254.169.254/latest/meta-data/',
            nameHint: 'h',
        })).rejects.toThrow();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('refuses a result larger than the cap before buffering it', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-length': String(512 * 1024 * 1024) }),
            arrayBuffer: async () => { throw new Error('should not buffer'); },
        })) as unknown as typeof fetch;

        await expect(persistRemoteAsset({ url: TRIPO_URL, nameHint: 'h' })).rejects.toThrow(/too large/);
    });
});

describe('assetPublicPath', () => {
    it('matches the route that serves assets', () => {
        expect(assetPublicPath('generated', 'models', 'a.glb'))
            .toBe('/api/assets/serve/generated/models/a.glb');
    });
});
