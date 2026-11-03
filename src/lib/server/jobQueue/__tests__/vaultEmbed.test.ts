/**
 * @jest-environment node
 */

import type { QueueHandlerContext, QueueJobRecord } from '@/lib/server/jobQueue/types';

/**
 * The embedding job used to read the whole catalog to find what was not yet
 * indexed. It must now work from the id list and fetch only the records it
 * embeds: this mock offers no whole-catalog read at all, so a regression is a
 * TypeError rather than a slower pass.
 */

const catalog = new Map<string, { id: string; name: string; type: string; origin: { displayPath: string } }>();
const readVaultAssetsByIds = jest.fn(async (ids: string[]) => ids.flatMap((id) => {
    const asset = catalog.get(id);
    return asset ? [asset] : [];
}));
jest.mock('@/lib/server/vault-store', () => ({
    readVaultAssetIds: async () => Array.from(catalog.keys()).sort(),
    readVaultAssetsByIds: (ids: string[]) => readVaultAssetsByIds(ids),
}));

let embedded = new Set<string>();
const upserted: Array<{ assetId: string }> = [];
jest.mock('@/lib/server/vaultWatchStore', () => ({
    readEmbeddedAssetIds: async () => embedded,
    upsertVectorRecords: async (records: Array<{ assetId: string }>) => { upserted.push(...records); },
}));

const embedTextsWithOllama = jest.fn(async ({ texts }: { texts: string[] }) => ({
    model: 'nomic-embed-text',
    vectors: texts.map(() => [1, 0, 0]),
}));
jest.mock('@/lib/server/ollamaEmbeddings', () => ({
    resolveEmbedModel: () => 'nomic-embed-text',
    embedTextsWithOllama: (args: { texts: string[] }) => embedTextsWithOllama(args),
}));

const enqueue = jest.fn();
jest.mock('@/lib/server/jobQueue', () => ({ getQueue: () => ({ enqueue }) }));

import { runVaultEmbedJob } from '@/lib/server/jobQueue/handlers/vaultEmbed';

const makeCtx = (payload: Record<string, unknown> = {}): QueueHandlerContext => ({
    job: { id: 'job_1', kind: 'vault-embed', lane: 'local-cpu', label: 'Indexing', priority: -10, payload } as unknown as QueueJobRecord,
    update: jest.fn(async () => undefined),
    stopRequested: () => false,
} as unknown as QueueHandlerContext);

describe('runVaultEmbedJob', () => {
    beforeEach(() => {
        catalog.clear();
        embedded = new Set();
        upserted.length = 0;
        readVaultAssetsByIds.mockClear();
        embedTextsWithOllama.mockClear();
        enqueue.mockClear();
        for (let i = 0; i < 100; i += 1) {
            const id = `a${String(i).padStart(3, '0')}`;
            catalog.set(id, { id, name: `${id}.png`, type: 'images', origin: { displayPath: `d:/pics/${id}.png` } });
        }
    });

    it('fetches only the records it embeds, never the ones already indexed', async () => {
        for (let i = 0; i < 10; i += 1) embedded.add(`a${String(i).padStart(3, '0')}`);
        await runVaultEmbedJob(makeCtx());

        const fetched = readVaultAssetsByIds.mock.calls.flatMap(([ids]) => ids);
        expect(fetched).toHaveLength(90);
        expect(fetched.some((id) => embedded.has(id))).toBe(false);
        expect(upserted.map((r) => r.assetId)).toEqual(fetched);
        // 90 pending at 64 per batch is two Ollama round-trips.
        expect(embedTextsWithOllama).toHaveBeenCalledTimes(2);
    });

    it('skips an asset deleted between listing the ids and fetching its record', async () => {
        const ctx = makeCtx();
        readVaultAssetsByIds.mockImplementationOnce(async (ids: string[]) => ids.filter((id) => id !== 'a050').map((id) => catalog.get(id)!));
        await runVaultEmbedJob(ctx);
        expect(upserted.map((r) => r.assetId)).not.toContain('a050');
        expect(upserted).toHaveLength(99);
    });

    it('reports when everything is already indexed without touching a record', async () => {
        for (const id of catalog.keys()) embedded.add(id);
        const ctx = makeCtx();
        await runVaultEmbedJob(ctx);
        expect(readVaultAssetsByIds).not.toHaveBeenCalled();
        expect(ctx.update).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Everything is already indexed.' }));
    });
});
