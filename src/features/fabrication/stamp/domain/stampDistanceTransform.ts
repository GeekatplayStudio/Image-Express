/**
 * 3D Stamp Tool - Exact Euclidean Distance Transform & Signed Distance Field
 * Implements linear-time 1D/2D Euclidean distance transform (Felzenszwalb & Huttenlocher)
 * and sub-pixel edge refined SDF for smooth, anti-aliased relief taper walls.
 */

/**
 * One-dimensional squared-distance transform (Felzenszwalb & Huttenlocher).
 *
 * Computes `d[q] = min over p of (f[p] + (q - p)^2)` in linear time by walking the lower
 * envelope of the parabolas rooted at each sample. Running it down the columns and then
 * across the rows yields the *exact* 2D Euclidean distance transform.
 */
export function squaredDistanceTransform1d(
    f: Float64Array,
    n: number,
    d: Float64Array,
    v: Int32Array,
    z: Float64Array
): void {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;

    for (let q = 1; q < n; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (k > 0 && s <= z[k]) {
            k--;
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = Infinity;
    }

    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const delta = q - v[k];
        d[q] = delta * delta + f[v[k]];
    }
}

/** Exact Euclidean distance (in pixels) from every sample to the nearest seed. */
export function euclideanDistance(seeds: Float64Array, width: number, height: number): Float64Array {
    const grid = Float64Array.from(seeds);
    const maxSpan = Math.max(width, height);
    const column = new Float64Array(maxSpan);
    const result = new Float64Array(maxSpan);
    const v = new Int32Array(maxSpan);
    const z = new Float64Array(maxSpan + 1);

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) column[y] = grid[y * width + x];
        squaredDistanceTransform1d(column, height, result, v, z);
        for (let y = 0; y < height; y++) grid[y * width + x] = result[y];
    }

    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) column[x] = grid[row + x];
        squaredDistanceTransform1d(column, width, result, v, z);
        for (let x = 0; x < width; x++) grid[row + x] = Math.sqrt(result[x]);
    }

    return grid;
}

/**
 * Signed distance in pixels from the artwork edge, positive inside.
 *
 * Computed at the artwork's own raster resolution and with an exact transform, because both
 * choices show up directly in the printed letterforms:
 *
 * - **Exact, not chamfer.** The old two-pass 3-4 chamfer sweep is only an approximation of
 *   Euclidean distance and is anisotropic: its level sets are octagons, not circles, so every
 *   curve and diagonal picked up a faint faceting that read as "not clean".
 * - **At raster resolution, not grid resolution.** Thresholding the artwork onto the coarse
 *   extrusion grid first throws away the sub-pixel edge position, and no amount of smoothing
 *   afterwards can put it back — that is what produced stair-stepped letter outlines. A
 *   distance field is smooth and band-limited, so it is the thing that downsamples cleanly.
 *
 * Anti-aliased coverage refines the result near the edge: where a sample sits inside the
 * transition band, its coverage gives the sub-pixel crossing directly, which is far more
 * accurate than the half-pixel guess a binary threshold allows.
 */
export function signedDistanceFieldPx(mask: Float32Array, width: number, height: number): Float32Array {
    const size = width * height;
    const INF = 1e10;

    const insideSeeds = new Float64Array(size);
    const outsideSeeds = new Float64Array(size);
    for (let i = 0; i < size; i++) {
        const isInside = mask[i] >= 0.5;
        // Seed sets are each other's complement: distance-to-outside is measured from the
        // outside samples, and vice versa.
        insideSeeds[i] = isInside ? INF : 0;
        outsideSeeds[i] = isInside ? 0 : INF;
    }

    const distanceToOutside = euclideanDistance(insideSeeds, width, height);
    const distanceToInside = euclideanDistance(outsideSeeds, width, height);

    const sdf = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        const coverage = mask[i];
        const isInside = coverage >= 0.5;

        // Sub-pixel refinement inside the anti-aliased band: coverage is very nearly a
        // linear ramp across the edge, so it locates the crossing to a fraction of a pixel.
        const fromHalf = coverage - 0.5;
        if (Math.abs(fromHalf) < 0.48) {
            sdf[i] = fromHalf * 2;
            continue;
        }

        // Elsewhere the transform is authoritative; the half-pixel shift accounts for the
        // edge lying between a sample and its neighbour rather than on either one.
        // An inside sample measures out to the nearest outside sample, and vice versa.
        sdf[i] = isInside
            ? Math.max(0, distanceToOutside[i] - 0.5)
            : -Math.max(0, distanceToInside[i] - 0.5);
    }

    return sdf;
}

/** Bilinear sample of a scalar field, with clamped edges. */
export function sampleField(field: Float32Array, width: number, height: number, fx: number, fy: number): number {
    const x = Math.max(0, Math.min(width - 1, fx));
    const y = Math.max(0, Math.min(height - 1, fy));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const dx = x - x0;
    const dy = y - y0;

    const top = field[y0 * width + x0] * (1 - dx) + field[y0 * width + x1] * dx;
    const bottom = field[y1 * width + x0] * (1 - dx) + field[y1 * width + x1] * dx;
    return top * (1 - dy) + bottom * dy;
}
