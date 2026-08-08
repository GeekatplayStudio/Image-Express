/**
 * @jest-environment node
 */

import {
    INT8_SCALE,
    dotFloat32,
    dotInt8,
    normalizeVector,
    quantizeToInt8,
    topScored,
} from '@/features/asset-vault/domain/vectorQuantization';

describe('normalizeVector', () => {
    it('returns a unit-length vector', () => {
        const unit = normalizeVector([3, 4]);
        expect(Math.hypot(unit[0], unit[1])).toBeCloseTo(1, 6);
        // Float32 storage, so compare approximately — 0.6 has no exact float32
        // representation and an equality assertion here would be wrong, not strict.
        expect(unit[0]).toBeCloseTo(0.6, 6);
        expect(unit[1]).toBeCloseTo(0.8, 6);
    });

    it('preserves direction', () => {
        const a = normalizeVector([1, 2, 3]);
        const b = normalizeVector([10, 20, 30]);
        for (let i = 0; i < a.length; i += 1) expect(a[i]).toBeCloseTo(b[i], 6);
    });

    it('returns zeros for a zero vector rather than NaN', () => {
        // NaN would poison every score it touched and sort unpredictably.
        expect(Array.from(normalizeVector([0, 0, 0]))).toEqual([0, 0, 0]);
    });

    it('handles an empty vector', () => {
        expect(normalizeVector([])).toHaveLength(0);
    });

    it('makes the dot product equal cosine similarity', () => {
        const a = normalizeVector([1, 2, 3, 4]);
        const b = normalizeVector([4, 3, 2, 1]);
        // cosine of the originals, computed the long way
        const dot = 1 * 4 + 2 * 3 + 3 * 2 + 4 * 1;
        const cosine = dot / (Math.hypot(1, 2, 3, 4) * Math.hypot(4, 3, 2, 1));
        expect(dotFloat32(a, 0, b, 4)).toBeCloseTo(cosine, 6);
    });
});

describe('quantizeToInt8', () => {
    it('maps the unit range onto the full int8 scale', () => {
        expect(Array.from(quantizeToInt8([1, -1, 0]))).toEqual([INT8_SCALE, -INT8_SCALE, 0]);
    });

    it('clamps symmetrically, never reaching -128', () => {
        // An asymmetric range would bias every dot product negative.
        const q = quantizeToInt8([2, -2]);
        expect(Array.from(q)).toEqual([INT8_SCALE, -INT8_SCALE]);
        expect(Math.min(...Array.from(q))).toBeGreaterThanOrEqual(-INT8_SCALE);
    });

    it('keeps ordering between components', () => {
        const q = quantizeToInt8([0.1, 0.5, 0.9]);
        expect(q[0]).toBeLessThan(q[1]);
        expect(q[1]).toBeLessThan(q[2]);
    });
});

describe('dotInt8', () => {
    it('scores the requested row of a flat matrix', () => {
        // Two rows of 3 dims, laid out flat.
        const matrix = Int8Array.from([1, 2, 3, 10, 20, 30]);
        const query = Int8Array.from([1, 1, 1]);
        expect(dotInt8(matrix, 0, query, 3)).toBe(6);
        expect(dotInt8(matrix, 3, query, 3)).toBe(60);
    });

    it('ranks a quantised match above a quantised mismatch', () => {
        const target = quantizeToInt8(normalizeVector([1, 0, 0]));
        const other = quantizeToInt8(normalizeVector([0, 1, 0]));
        const matrix = new Int8Array(6);
        matrix.set(target, 0);
        matrix.set(other, 3);
        const query = quantizeToInt8(normalizeVector([1, 0, 0]));
        expect(dotInt8(matrix, 0, query, 3)).toBeGreaterThan(dotInt8(matrix, 3, query, 3));
    });
});

describe('topScored', () => {
    const from = (values: number[], k: number, minScore?: number) =>
        topScored((i) => values[i], values.length, k, minScore);

    it('returns the highest scores, best first', () => {
        expect(from([0.1, 0.9, 0.5, 0.7], 2)).toEqual([
            { index: 1, score: 0.9 },
            { index: 3, score: 0.7 },
        ]);
    });

    it('agrees with a full sort on a larger random set', () => {
        // The bounded-heap path is easy to get subtly wrong; pin it against the
        // obvious implementation rather than against hand-picked cases.
        const values = Array.from({ length: 500 }, (_, i) => Math.sin(i) * 100);
        const expected = values
            .map((score, index) => ({ index, score }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 25);
        expect(from(values, 25)).toEqual(expected);
    });

    it('drops entries at or below the floor', () => {
        expect(from([0.9, 0.01, 0.5], 5, 0.05).map((e) => e.index)).toEqual([0, 2]);
    });

    it('returns everything above the floor when k exceeds the count', () => {
        expect(from([0.3, 0.4], 10)).toHaveLength(2);
    });

    it('returns empty for k of zero, an empty set, or an all-filtered set', () => {
        expect(from([0.5], 0)).toEqual([]);
        expect(from([], 5)).toEqual([]);
        expect(from([0.01, 0.02], 5, 0.5)).toEqual([]);
    });

    it('handles ties without losing entries', () => {
        expect(from([0.5, 0.5, 0.5], 2)).toHaveLength(2);
    });

    it('handles negative scores', () => {
        expect(from([-5, -1, -3], 2)).toEqual([
            { index: 1, score: -1 },
            { index: 2, score: -3 },
        ]);
    });
});

describe('quantisation fidelity', () => {
    it('keeps the exact ranking of a clearly separated set', () => {
        // The property the two-stage search depends on: the coarse int8 pass
        // must surface the right candidates, even though it is lossy.
        const dims = 64;
        const make = (seedValue: number) => {
            let seed = seedValue;
            const next = () => {
                seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                return seed / 0x7fffffff - 0.5;
            };
            return normalizeVector(Array.from({ length: dims }, next));
        };

        const query = make(1);
        const near = normalizeVector(Array.from(query, (v, i) => v + (i % 7 === 0 ? 0.02 : 0)));
        const far = make(999);

        const matrix = new Int8Array(dims * 2);
        matrix.set(quantizeToInt8(near), 0);
        matrix.set(quantizeToInt8(far), dims);
        const q8 = quantizeToInt8(query);

        expect(dotInt8(matrix, 0, q8, dims)).toBeGreaterThan(dotInt8(matrix, dims, q8, dims));
    });
});
