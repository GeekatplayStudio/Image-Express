/**
 * 3D Stamp Tool - Image Processing & Vector Filter Utilities
 * Includes Photoshop-style levels, gamma, bit-depth quantization,
 * morphological dilation, box blur, and 2D Euclidean SDF contour smoothing.
 */

/**
 * Applies a 1D horizontal and vertical box blur on a single-channel mask.
 */
export function applyBoxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number) {
    if (radius <= 0) return;
    const r = Math.round(radius);
    const temp = new Uint8ClampedArray(data.length);

    // Horizontal pass
    for (let y = 0; y < height; y++) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let count = 0;
            for (let dx = -r; dx <= r; dx++) {
                const nx = x + dx;
                if (nx >= 0 && nx < width) {
                    sum += data[rowOffset + nx];
                    count++;
                }
            }
            temp[rowOffset + x] = Math.round(sum / count);
        }
    }

    // Vertical pass
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let sum = 0;
            let count = 0;
            for (let dy = -r; dy <= r; dy++) {
                const ny = y + dy;
                if (ny >= 0 && ny < height) {
                    sum += temp[ny * width + x];
                    count++;
                }
            }
            data[y * width + x] = Math.round(sum / count);
        }
    }
}

/**
 * Remaps input luminance via Photoshop-like Levels (Black Point, White Point, Gamma)
 * and optional bit-depth / step reduction (e.g. 16, 8, 4, 2 levels).
 */
export function applyLevelsAndQuantization(
    luma: number,
    blackLevel: number = 0,
    whiteLevel: number = 255,
    gamma: number = 1.0,
    bitDepthSteps: number = 0,
    threshold: number = 128,
    isContinuous: boolean = false
): number {
    // 1. Levels input range remapping
    const inMin = Math.max(0, Math.min(254, blackLevel ?? 0));
    const inMax = Math.max(inMin + 1, Math.min(255, whiteLevel ?? 255));
    let norm = Math.max(0, Math.min(1, (luma - inMin) / (inMax - inMin)));

    // 2. Gamma curve (midtones)
    const effectiveGamma = Math.max(0.1, Math.min(4.0, gamma ?? 1.0));
    if (effectiveGamma !== 1.0) {
        norm = Math.pow(norm, 1 / effectiveGamma);
    }

    // 3. Bit depth / step quantization (16, 8, 4, 2 steps)
    if (bitDepthSteps && bitDepthSteps >= 2) {
        const steps = Math.min(256, Math.max(2, Math.round(bitDepthSteps)));
        norm = Math.round(norm * (steps - 1)) / (steps - 1);
        return Math.round(norm * 255);
    }

    // 4. Binary thresholding with anti-aliased subpixel smoothing
    if (!isContinuous) {
        const normThreshold = Math.max(0, Math.min(1, threshold / 255));
        // Anti-aliased transition band (eliminates jagged staircase stair-stepping)
        const transition = 0.04;
        const edge0 = normThreshold - transition;
        const edge1 = normThreshold + transition;
        if (norm <= edge0) return 0;
        if (norm >= edge1) return 255;
        // Smooth Hermite cubic interpolation
        const t = (norm - edge0) / (edge1 - edge0);
        return Math.round(t * t * (3 - 2 * t) * 255);
    }

    return Math.round(norm * 255);
}

/**
 * Morphological dilation using a rounded Euclidean circular kernel.
 * Uniformly expands thin text, lines, and fine details in all directions
 * without blocky square stepping artifacts.
 */
export function applyMorphologicalDilation(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    radius: number
) {
    if (radius <= 0) return;
    const r = Math.min(6, Math.round(radius));
    const temp = new Uint8ClampedArray(data.length);
    temp.set(data);

    const offsets: { dx: number; dy: number; dist: number }[] = [];
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= r + 0.4) {
                offsets.push({ dx, dy, dist });
            }
        }
    }

    for (let y = 0; y < height; y++) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
            let maxVal = temp[rowOffset + x];
            for (let i = 0; i < offsets.length; i++) {
                const { dx, dy, dist } = offsets[i];
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const neighbor = temp[ny * width + nx];
                    const falloff = dist > r ? Math.max(0, 1 - (dist - r)) : 1.0;
                    const candidate = Math.round(neighbor * falloff);
                    if (candidate > maxVal) {
                        maxVal = candidate;
                    }
                }
            }
            data[rowOffset + x] = maxVal;
        }
    }
}

/**
 * De-speckle filter: cleans up isolated 1-2px scanner dust and fills small pinholes
 * before computing the continuous distance field.
 */
export function applyVectorDeSpeckle(data: Uint8ClampedArray, width: number, height: number) {
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
            const idx = row + x;
            const center = copy[idx];

            if (center > 128) {
                let inkNeighbors = 0;
                if (copy[idx - 1] > 64) inkNeighbors++;
                if (copy[idx + 1] > 64) inkNeighbors++;
                if (copy[idx - width] > 64) inkNeighbors++;
                if (copy[idx + width] > 64) inkNeighbors++;
                if (copy[idx - width - 1] > 64) inkNeighbors++;
                if (copy[idx - width + 1] > 64) inkNeighbors++;
                if (copy[idx + width - 1] > 64) inkNeighbors++;
                if (copy[idx + width + 1] > 64) inkNeighbors++;

                if (inkNeighbors < 2) {
                    data[idx] = 0;
                }
            } else if (center < 64) {
                let inkNeighbors = 0;
                if (copy[idx - 1] > 128) inkNeighbors++;
                if (copy[idx + 1] > 128) inkNeighbors++;
                if (copy[idx - width] > 128) inkNeighbors++;
                if (copy[idx + width] > 128) inkNeighbors++;

                if (inkNeighbors >= 4) {
                    data[idx] = 255;
                }
            }
        }
    }
}

/**
 * 2D Euclidean Signed Distance Field (SDF) Vector Contour Smoother.
 * Eliminates jagged staircase stepping on diagonal lines, circular arcs,
 * and fine script connections. Reconstructs smooth vector isophotes with
 * subpixel anti-aliasing.
 */
export function applyVectorContourSmoothing(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    smoothness: number = 1.6,
    dilationPx: number = 0
) {
    const size = width * height;
    const INF = 1e4;
    const dInside = new Float32Array(size);
    const dOutside = new Float32Array(size);

    dInside.fill(INF);
    dOutside.fill(INF);

    // 1. Initialize boundary seeds using subpixel boundary estimation
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            const idx = row + x;
            const val = data[idx];
            const isInside = val >= 128;

            let isBoundary = false;
            if (x > 0 && (data[idx - 1] >= 128) !== isInside) isBoundary = true;
            else if (x < width - 1 && (data[idx + 1] >= 128) !== isInside) isBoundary = true;
            else if (y > 0 && (data[idx - width] >= 128) !== isInside) isBoundary = true;
            else if (y < height - 1 && (data[idx + width] >= 128) !== isInside) isBoundary = true;

            if (isBoundary) {
                const frac = Math.max(0.05, Math.min(0.95, val / 255.0));
                if (isInside) {
                    dInside[idx] = 1.0 - frac;
                    dOutside[idx] = 0;
                } else {
                    dOutside[idx] = frac;
                    dInside[idx] = 0;
                }
            } else if (isInside) {
                dOutside[idx] = 0;
            } else {
                dInside[idx] = 0;
            }
        }
    }

    // 2. 8-Neighbor Chamfer Distance Propagation (Fast 2-pass Euclidean approximation)
    const SQRT2 = Math.SQRT2;
    // Forward pass: top-left to bottom-right
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            const idx = row + x;
            if (x > 0) {
                const left = idx - 1;
                if (dInside[left] + 1 < dInside[idx]) dInside[idx] = dInside[left] + 1;
                if (dOutside[left] + 1 < dOutside[idx]) dOutside[idx] = dOutside[left] + 1;
            }
            if (y > 0) {
                const top = idx - width;
                if (dInside[top] + 1 < dInside[idx]) dInside[idx] = dInside[top] + 1;
                if (dOutside[top] + 1 < dOutside[idx]) dOutside[idx] = dOutside[top] + 1;

                if (x > 0) {
                    const topLeft = top - 1;
                    if (dInside[topLeft] + SQRT2 < dInside[idx]) dInside[idx] = dInside[topLeft] + SQRT2;
                    if (dOutside[topLeft] + SQRT2 < dOutside[idx]) dOutside[idx] = dOutside[topLeft] + SQRT2;
                }
                if (x < width - 1) {
                    const topRight = top + 1;
                    if (dInside[topRight] + SQRT2 < dInside[idx]) dInside[idx] = dInside[topRight] + SQRT2;
                    if (dOutside[topRight] + SQRT2 < dOutside[idx]) dOutside[idx] = dOutside[topRight] + SQRT2;
                }
            }
        }
    }

    // Backward pass: bottom-right to top-left
    for (let y = height - 1; y >= 0; y--) {
        const row = y * width;
        for (let x = width - 1; x >= 0; x--) {
            const idx = row + x;
            if (x < width - 1) {
                const right = idx + 1;
                if (dInside[right] + 1 < dInside[idx]) dInside[idx] = dInside[right] + 1;
                if (dOutside[right] + 1 < dOutside[idx]) dOutside[idx] = dOutside[right] + 1;
            }
            if (y < height - 1) {
                const bottom = idx + width;
                if (dInside[bottom] + 1 < dInside[idx]) dInside[idx] = dInside[bottom] + 1;
                if (dOutside[bottom] + 1 < dOutside[idx]) dOutside[idx] = dOutside[bottom] + 1;

                if (x > 0) {
                    const bottomLeft = bottom - 1;
                    if (dInside[bottomLeft] + SQRT2 < dInside[idx]) dInside[idx] = dInside[bottomLeft] + SQRT2;
                    if (dOutside[bottomLeft] + SQRT2 < dOutside[idx]) dOutside[idx] = dOutside[bottomLeft] + SQRT2;
                }
                if (x < width - 1) {
                    const bottomRight = bottom + 1;
                    if (dInside[bottomRight] + SQRT2 < dInside[idx]) dInside[idx] = dInside[bottomRight] + SQRT2;
                    if (dOutside[bottomRight] + SQRT2 < dOutside[idx]) dOutside[idx] = dOutside[bottomRight] + SQRT2;
                }
            }
        }
    }

    // 3. Signed Distance Field with optional dilation: + inside, - outside
    const sdf = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        const rawDist = (data[i] >= 128) ? dInside[i] : -dOutside[i];
        sdf[i] = rawDist + dilationPx;
    }

    // 4. Low-pass filter the SDF to eliminate staircase ripples along diagonals and circles
    const filterRadius = Math.max(1, Math.min(4, Math.round(smoothness)));
    const sigma = Math.max(0.6, filterRadius * 0.7);
    const kernelWeights: number[] = [];
    let weightSum = 0;
    for (let d = -filterRadius; d <= filterRadius; d++) {
        const w = Math.exp(-(d * d) / (2 * sigma * sigma));
        kernelWeights.push(w);
        weightSum += w;
    }
    for (let i = 0; i < kernelWeights.length; i++) {
        kernelWeights[i] /= weightSum;
    }

    // Separable 1D Gaussian smoothing
    const tempSdf = new Float32Array(size);
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let d = -filterRadius; d <= filterRadius; d++) {
                const nx = Math.max(0, Math.min(width - 1, x + d));
                sum += sdf[row + nx] * kernelWeights[d + filterRadius];
            }
            tempSdf[row + x] = sum;
        }
    }

    const smoothedSdf = new Float32Array(size);
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            let sum = 0;
            for (let d = -filterRadius; d <= filterRadius; d++) {
                const ny = Math.max(0, Math.min(height - 1, y + d));
                sum += tempSdf[ny * width + x] * kernelWeights[d + filterRadius];
            }
            smoothedSdf[y * width + x] = sum;
        }
    }

    // 5. Reconstruct smooth vector contour with cubic Hermite subpixel anti-aliasing
    const edgeBand = Math.max(0.6, smoothness * 0.85);
    for (let i = 0; i < size; i++) {
        const dist = smoothedSdf[i];
        if (dist >= edgeBand) {
            data[i] = 255;
        } else if (dist <= -edgeBand) {
            data[i] = 0;
        } else {
            // Normalized transition [0..1]
            const norm = (dist + edgeBand) / (2 * edgeBand);
            // Smooth Hermite cubic curve: 3x^2 - 2x^3 (smooth derivatives at 0 and 1)
            const t = norm * norm * (3 - 2 * norm);
            data[i] = Math.round(t * 255);
        }
    }
}
