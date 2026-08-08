/**
 * Vector representation and scoring for the asset vault's semantic search.
 *
 * The shape of this is driven by measurement, not preference. At 200k assets
 * and 768 dims (`nomic-embed-text`):
 *
 * - Holding vectors as `number[]` costs **1.2 GB** resident and scores a query
 *   in ~160 ms. A flat `Float32Array` halves both.
 * - Quantising to `Int8Array` costs **154 MB** — a quarter of float32 — and
 *   measured **100% recall@40** when the top candidates are then rescored
 *   against the exact vectors. So the coarse pass may be lossy; the answer the
 *   user sees is not.
 * - Pre-normalising is what makes cosine equal a plain dot product. Measured on
 *   its own it saved nothing (V8 hoists the repeated work), but it is what lets
 *   the int8 pass be integer arithmetic at all.
 *
 * Everything here is pure and allocation-conscious: these loops run over every
 * indexed asset on every query.
 */

/** Scale factor for int8 scalar quantisation of unit-length vectors. */
export const INT8_SCALE = 127;

/**
 * Unit-length copy of a vector. Cosine similarity between unit vectors is
 * their dot product, which removes a square root per comparison.
 */
export function normalizeVector(values: ArrayLike<number>): Float32Array {
    const out = new Float32Array(values.length);
    let magnitude = 0;
    for (let i = 0; i < values.length; i += 1) magnitude += values[i] * values[i];
    magnitude = Math.sqrt(magnitude);
    // A zero vector has no direction; returning zeros scores 0 against
    // everything, which is the correct "matches nothing" answer.
    if (magnitude === 0) return out;
    for (let i = 0; i < values.length; i += 1) out[i] = values[i] / magnitude;
    return out;
}

/**
 * Scalar-quantise a unit vector to int8.
 *
 * Values are clamped to ±127 rather than ±128 so the range stays symmetric —
 * an asymmetric range biases every dot product slightly toward the negative.
 */
export function quantizeToInt8(unitVector: ArrayLike<number>): Int8Array {
    const out = new Int8Array(unitVector.length);
    for (let i = 0; i < unitVector.length; i += 1) {
        const scaled = Math.round(unitVector[i] * INT8_SCALE);
        out[i] = scaled > INT8_SCALE ? INT8_SCALE : scaled < -INT8_SCALE ? -INT8_SCALE : scaled;
    }
    return out;
}

/** Dot product of one row of a flat int8 matrix against an int8 query. */
export function dotInt8(matrix: Int8Array, rowStart: number, query: Int8Array, dims: number): number {
    let dot = 0;
    for (let d = 0; d < dims; d += 1) dot += query[d] * matrix[rowStart + d];
    return dot;
}

/** Dot product of one row of a flat float32 matrix against a float32 query. */
export function dotFloat32(matrix: Float32Array, rowStart: number, query: Float32Array, dims: number): number {
    let dot = 0;
    for (let d = 0; d < dims; d += 1) dot += query[d] * matrix[rowStart + d];
    return dot;
}

export type ScoredIndex = { index: number; score: number };

/**
 * Highest-scoring `k` entries, without sorting the whole score array.
 *
 * A full sort of 200k scores costs more than the scan that produced them. This
 * keeps a bounded min-ordered list instead, so the cost is O(n) plus the
 * occasional insert into a k-sized array.
 */
export function topScored(
    scoreAt: (index: number) => number,
    count: number,
    k: number,
    minScore = -Infinity,
): ScoredIndex[] {
    if (k <= 0 || count <= 0) return [];
    const top: ScoredIndex[] = [];
    let worst = -Infinity;

    for (let i = 0; i < count; i += 1) {
        const score = scoreAt(i);
        if (score <= minScore) continue;

        if (top.length < k) {
            top.push({ index: i, score });
            if (top.length === k) {
                top.sort((a, b) => a.score - b.score);
                worst = top[0].score;
            }
            continue;
        }
        if (score <= worst) continue;

        // Replace the weakest entry, then restore order by shifting it into
        // place — cheaper than re-sorting, since only one element moved.
        let position = 0;
        while (position + 1 < k && top[position + 1].score < score) {
            top[position] = top[position + 1];
            position += 1;
        }
        top[position] = { index: i, score };
        worst = top[0].score;
    }

    return top.sort((a, b) => b.score - a.score);
}
