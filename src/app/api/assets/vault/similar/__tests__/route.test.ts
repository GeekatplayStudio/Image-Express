/**
 * @jest-environment node
 */

const ASSETS = ['seed', 'n1', 'n2', 'n3'].map((id) => ({
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    type: 'images',
    category: 'uploads',
    sizeBytes: 10,
    origin: { connector: 'local', uri: `file://d:/pics/${id}.png`, displayPath: `d:/pics/${id}.png` },
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
}));

const readVaultCatalog = jest.fn(async () => ({ version: 1, updatedAt: '', assets: ASSETS }));
const readVaultAssetsByIds = jest.fn(async (ids: string[]) => ASSETS.filter((asset) => ids.includes(asset.id)));
const searchEmbeddings = jest.fn();
const readEmbeddingForAsset = jest.fn();

jest.mock('@/lib/server/vault-store', () => ({
    readVaultCatalog: (...args: unknown[]) => readVaultCatalog(...(args as [])),
    readVaultAssetsByIds: (ids: string[]) => readVaultAssetsByIds(ids),
    readBookcaseStore: jest.fn(async () => ({ version: 1, bookcases: [] })),
    writeBookcaseStore: jest.fn(),
}));
jest.mock('@/lib/server/vaultWatchStore', () => ({
    readEmbeddingForAsset: (id: string) => readEmbeddingForAsset(id),
    searchEmbeddings: (...args: unknown[]) => searchEmbeddings(...args),
    upsertVectorRecords: jest.fn(async () => undefined),
}));
jest.mock('@/lib/server/ollamaEmbeddings', () => ({
    resolveEmbedModel: () => 'nomic-embed-text',
    // Ollama unavailable: the hash fallback, which the route must not store.
    embedTextWithOllama: jest.fn(async () => ({ model: 'hash-text-v1', vector: [0, 1] })),
}));

import { POST } from '@/app/api/assets/vault/similar/route';

const post = (body: unknown) => POST(new Request('http://localhost/api/assets/vault/similar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
}));

describe('POST /api/assets/vault/similar', () => {
    beforeEach(() => jest.clearAllMocks());

    it('answers from the index without loading the whole catalog', async () => {
        readEmbeddingForAsset.mockResolvedValue({ assetId: 'seed', model: 'nomic-embed-text', dims: 2, vector: [1, 0] });
        searchEmbeddings.mockResolvedValue([
            { assetId: 'seed', score: 1 },
            { assetId: 'n2', score: 0.9 },
            { assetId: 'n1', score: 0.8 },
        ]);

        const response = await post({ assetId: 'seed', limit: 5 });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.source).toBe('indexed');
        // Ranked by the index, with the seed itself removed.
        expect(body.results.map((entry: { asset: { id: string } }) => entry.asset.id)).toEqual(['n2', 'n1']);
        // The point of the change: at 200k assets this was a 900 ms full read.
        expect(readVaultCatalog).not.toHaveBeenCalled();
        expect(readVaultAssetsByIds).toHaveBeenCalledWith(['seed']);
        expect(readVaultAssetsByIds).toHaveBeenCalledWith(['n2', 'n1']);
    });

    it('loads the catalog only for the metadata tier, when nothing is indexed', async () => {
        readEmbeddingForAsset.mockResolvedValue(null);

        const response = await post({ assetId: 'seed', limit: 5 });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.source).toBe('metadata');
        expect(readVaultCatalog).toHaveBeenCalledTimes(1);
        expect(searchEmbeddings).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown seed without touching the index', async () => {
        const response = await post({ assetId: 'does-not-exist', limit: 5 });
        expect(response.status).toBe(404);
        expect(searchEmbeddings).not.toHaveBeenCalled();
        expect(readVaultCatalog).not.toHaveBeenCalled();
    });

    it('drops an indexed hit whose asset no longer exists', async () => {
        readEmbeddingForAsset.mockResolvedValue({ assetId: 'seed', model: 'nomic-embed-text', dims: 2, vector: [1, 0] });
        searchEmbeddings.mockResolvedValue([{ assetId: 'deleted', score: 0.95 }, { assetId: 'n3', score: 0.7 }]);

        const body = await (await post({ assetId: 'seed', limit: 5 })).json();

        expect(body.results.map((entry: { asset: { id: string } }) => entry.asset.id)).toEqual(['n3']);
    });
});
