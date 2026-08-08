/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    closeVectorDb,
    countVectors,
    deleteVectors,
    isVectorDbAvailable,
    migrateVectorsFromJson,
    readVectorAssetIds,
    readVectorMeta,
    searchVectorsInDb,
    upsertVectors,
} from '@/lib/server/vaultVectorDb';
import type { VectorRecord } from '@/features/asset-vault/domain/vectorMath';

const ORIGINAL_DATA_DIR = process.env.IMAGE_EXPRESS_DATA_DIR;
let tempDir: string;

const MODEL = 'nomic-embed-text';

const record = (assetId: string, vector: number[], over: Partial<VectorRecord> = {}): VectorRecord => ({
    assetId,
    model: MODEL,
    dims: vector.length,
    vector,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
});

/** Deterministic pseudo-random vector, so failures are reproducible. */
const pseudoVector = (seedValue: number, dims = 32): number[] => {
    let seed = seedValue;
    return Array.from({ length: dims }, () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff - 0.5;
    });
};

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-vecdb-'));
    process.env.IMAGE_EXPRESS_DATA_DIR = tempDir;
    closeVectorDb();
});

afterEach(async () => {
    closeVectorDb();
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.IMAGE_EXPRESS_DATA_DIR;
    else process.env.IMAGE_EXPRESS_DATA_DIR = ORIGINAL_DATA_DIR;
    await fs.rm(tempDir, { recursive: true, force: true });
});

// Falling back to the JSON store is supported, so absence of node:sqlite skips
// rather than fails.
const describeDb = isVectorDbAvailable() ? describe : describe.skip;

describeDb('vaultVectorDb storage', () => {
    it('stores and counts vectors', async () => {
        await upsertVectors([record('a1', [1, 0, 0]), record('a2', [0, 1, 0])]);
        expect(await countVectors()).toBe(2);
        expect(await countVectors(MODEL)).toBe(2);
    });

    it('updates in place rather than duplicating', async () => {
        await upsertVectors([record('a1', [1, 0, 0])]);
        await upsertVectors([record('a1', [0, 1, 0])]);
        expect(await countVectors()).toBe(1);
    });

    it('deletes by asset id', async () => {
        await upsertVectors([record('a1', [1, 0, 0]), record('a2', [0, 1, 0])]);
        await deleteVectors(['a1']);
        expect(await countVectors()).toBe(1);
    });

    it('lists ids for one model so backfill can skip them', async () => {
        await upsertVectors([
            record('a1', [1, 0, 0]),
            record('a2', [0, 1, 0], { model: 'other-model' }),
        ]);
        expect([...(await readVectorAssetIds(MODEL))]).toEqual(['a1']);
    });

    it('treats empty input as a no-op', async () => {
        expect(await upsertVectors([])).toBe(0);
        expect(await deleteVectors([])).toBe(0);
    });
});

describeDb('vaultVectorDb search', () => {
    it('ranks the nearest vector first', async () => {
        await upsertVectors([
            record('east', [1, 0, 0]),
            record('north', [0, 1, 0]),
            record('up', [0, 0, 1]),
        ]);

        const hits = await searchVectorsInDb([0.9, 0.1, 0], { model: MODEL });
        expect(hits[0].assetId).toBe('east');
    });

    it('scores an identical vector as 1, because storage is unit-length', async () => {
        await upsertVectors([record('a1', [3, 4, 0])]);
        const hits = await searchVectorsInDb([3, 4, 0], { model: MODEL });
        // The rerank uses exact float32, so this is a real cosine, not an
        // approximation from the quantised pass.
        expect(hits[0].score).toBeCloseTo(1, 5);
    });

    it('scores magnitude-independently', async () => {
        await upsertVectors([record('a1', [1, 1, 0])]);
        const small = await searchVectorsInDb([1, 1, 0], { model: MODEL });
        const large = await searchVectorsInDb([100, 100, 0], { model: MODEL });
        expect(small[0].score).toBeCloseTo(large[0].score, 5);
    });

    it('drops results below the score floor', async () => {
        await upsertVectors([record('east', [1, 0, 0]), record('north', [0, 1, 0])]);
        // Orthogonal scores 0, so only the aligned vector survives.
        const hits = await searchVectorsInDb([1, 0, 0], { model: MODEL, minScore: 0.5 });
        expect(hits.map((h) => h.assetId)).toEqual(['east']);
    });

    it('honours the limit', async () => {
        await upsertVectors(Array.from({ length: 20 }, (_, i) => record(`a${i}`, pseudoVector(i + 1))));
        expect(await searchVectorsInDb(pseudoVector(1), { model: MODEL, limit: 5 })).toHaveLength(5);
    });

    it('never compares across models', async () => {
        await upsertVectors([
            record('mine', [1, 0, 0]),
            record('theirs', [1, 0, 0], { model: 'other-model' }),
        ]);
        const hits = await searchVectorsInDb([1, 0, 0], { model: MODEL });
        expect(hits.map((h) => h.assetId)).toEqual(['mine']);
    });

    it('never compares across dimensions', async () => {
        // A 3-dim query must not match a 4-dim vector; cosine over mismatched
        // lengths is meaningless rather than merely inaccurate.
        await upsertVectors([record('four', [1, 0, 0, 0])]);
        expect(await searchVectorsInDb([1, 0, 0], { model: MODEL })).toEqual([]);
    });

    it('returns empty for an empty store or an empty query', async () => {
        expect(await searchVectorsInDb([1, 0, 0], { model: MODEL })).toEqual([]);
        await upsertVectors([record('a1', [1, 0, 0])]);
        expect(await searchVectorsInDb([], { model: MODEL })).toEqual([]);
    });

    it('handles a zero query without returning NaN scores', async () => {
        await upsertVectors([record('a1', [1, 0, 0])]);
        const hits = await searchVectorsInDb([0, 0, 0], { model: MODEL });
        expect(hits.every((h) => Number.isFinite(h.score))).toBe(true);
    });

    it('sees a vector added after an earlier search', async () => {
        // The in-memory index is cached; a write that did not invalidate it
        // would make new assets permanently unsearchable.
        await upsertVectors([record('first', [1, 0, 0])]);
        await searchVectorsInDb([1, 0, 0], { model: MODEL });

        await upsertVectors([record('second', [0.95, 0.05, 0])]);
        const hits = await searchVectorsInDb([1, 0, 0], { model: MODEL });
        expect(hits.map((h) => h.assetId).sort()).toEqual(['first', 'second']);
    });

    it('stops returning a deleted vector', async () => {
        await upsertVectors([record('a1', [1, 0, 0]), record('a2', [0.9, 0.1, 0])]);
        await searchVectorsInDb([1, 0, 0], { model: MODEL });

        await deleteVectors(['a1']);
        const hits = await searchVectorsInDb([1, 0, 0], { model: MODEL });
        expect(hits.map((h) => h.assetId)).toEqual(['a2']);
    });

    it('matches an exhaustive exact search on a realistic set', async () => {
        // The property the whole two-stage design rests on: the lossy int8 pass
        // must not change the answer. Pinned against brute-force cosine.
        const DIMS = 64;
        const COUNT = 300;
        const records = Array.from({ length: COUNT }, (_, i) => record(`a${i}`, pseudoVector(i + 1, DIMS)));
        await upsertVectors(records);

        const query = pseudoVector(7, DIMS);
        const cosine = (v: number[]) => {
            let dot = 0; let na = 0; let nb = 0;
            for (let i = 0; i < DIMS; i += 1) { dot += query[i] * v[i]; na += query[i] ** 2; nb += v[i] ** 2; }
            return dot / (Math.sqrt(na) * Math.sqrt(nb));
        };
        const expected = records
            .map((r) => ({ assetId: r.assetId, score: cosine(r.vector) }))
            .filter((e) => e.score > 0.05)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map((e) => e.assetId);

        const hits = await searchVectorsInDb(query, { model: MODEL, limit: 10 });
        expect(hits.map((h) => h.assetId)).toEqual(expected);
    });
});

describeDb('migrateVectorsFromJson', () => {
    it('imports once and records a marker', async () => {
        const records = [record('a1', [1, 0, 0]), record('a2', [0, 1, 0])];

        expect(await migrateVectorsFromJson(records)).toEqual({ migrated: true, count: 2 });
        expect(await readVectorMeta('migrated_from_json')).toBeTruthy();

        const second = await migrateVectorsFromJson(records);
        expect(second.migrated).toBe(false);
        expect(await countVectors()).toBe(2);
    });

    it('imports an empty legacy store without marking it un-migrated', async () => {
        expect(await migrateVectorsFromJson([])).toEqual({ migrated: true, count: 0 });
        expect((await migrateVectorsFromJson([record('a1', [1, 0, 0])])).migrated).toBe(false);
    });
});
