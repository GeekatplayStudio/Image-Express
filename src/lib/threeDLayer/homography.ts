// Planar homography math for the 3D layer's perspective unwarp/rewarp.
// Row-major 3x3 matrices as number[9]; points map as
// [x', y', w'] = H · [x, y, 1], pixel = (x'/w', y'/w').

export type Vec2 = [number, number];
export type Mat3 = number[]; // length 9, row-major

export const QUAD_CORNER_ORDER = ['tl', 'tr', 'br', 'bl'] as const;

export function applyHomography(h: Mat3, p: Vec2): Vec2 {
    const w = h[6] * p[0] + h[7] * p[1] + h[8];
    return [
        (h[0] * p[0] + h[1] * p[1] + h[2]) / w,
        (h[3] * p[0] + h[4] * p[1] + h[5]) / w,
    ];
}

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
    const out = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
        }
    }
    return out;
}

export function invertMat3(m: Mat3): Mat3 | null {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h;
    const B = -(d * i - f * g);
    const C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (!isFinite(det) || Math.abs(det) < 1e-12) return null;
    const s = 1 / det;
    return [
        A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
        B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
        C * s, -(a * h - b * g) * s, (a * e - b * d) * s,
    ];
}

// Solves the 8x8 linear system of the 4-point direct linear transform.
// Partial-pivot Gaussian elimination; returns null on a degenerate quad
// (three collinear corners, repeated points).
export function computeHomography(src: Vec2[], dst: Vec2[]): Mat3 | null {
    if (src.length !== 4 || dst.length !== 4) return null;
    const m: number[][] = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = src[i];
        const [u, v] = dst[i];
        m.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
        m.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
    }
    for (let col = 0; col < 8; col++) {
        let pivot = col;
        for (let r = col + 1; r < 8; r++) {
            if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
        }
        if (Math.abs(m[pivot][col]) < 1e-10) return null;
        if (pivot !== col) [m[col], m[pivot]] = [m[pivot], m[col]];
        for (let r = 0; r < 8; r++) {
            if (r === col) continue;
            const factor = m[r][col] / m[col][col];
            for (let c = col; c < 9; c++) m[r][c] -= factor * m[col][c];
        }
    }
    const h: Mat3 = new Array(9);
    for (let i = 0; i < 8; i++) h[i] = m[i][8] / m[i][i];
    h[8] = 1;
    return h;
}

/** Homography mapping the unit square (0,0)-(1,1) onto the quad (TL,TR,BR,BL). */
export function unitSquareToQuad(quad: Vec2[]): Mat3 | null {
    return computeHomography([[0, 0], [1, 0], [1, 1], [0, 1]], quad);
}

export function quadArea(quad: Vec2[]): number {
    let area = 0;
    for (let i = 0; i < quad.length; i++) {
        const [x1, y1] = quad[i];
        const [x2, y2] = quad[(i + 1) % quad.length];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
}

/** Quad is usable when it covers a meaningful area and is convex. */
export function isQuadValid(quad: Vec2[], minAreaRatio = 0.0001): boolean {
    if (quad.length !== 4) return false;
    if (quadArea(quad) < minAreaRatio) return false;
    let sign = 0;
    for (let i = 0; i < 4; i++) {
        const [ax, ay] = quad[i];
        const [bx, by] = quad[(i + 1) % 4];
        const [cx, cy] = quad[(i + 2) % 4];
        const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (cross === 0) continue;
        const s = Math.sign(cross);
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
    }
    return sign !== 0;
}

/**
 * Rescale a homography so it consumes/produces coordinates in a differently
 * sized space, instead of resizing the images themselves. Given H mapping
 * srcSize-space to dstSize-space, returns the H for srcSize2/dstSize2 spaces.
 */
export function rescaleHomography(
    h: Mat3,
    srcSize: { width: number; height: number },
    srcSize2: { width: number; height: number },
    dstSize: { width: number; height: number },
    dstSize2: { width: number; height: number },
): Mat3 {
    const preScale: Mat3 = [srcSize.width / srcSize2.width, 0, 0, 0, srcSize.height / srcSize2.height, 0, 0, 0, 1];
    const postScale: Mat3 = [dstSize2.width / dstSize.width, 0, 0, 0, dstSize2.height / dstSize.height, 0, 0, 0, 1];
    return multiplyMat3(postScale, multiplyMat3(h, preScale));
}

/** Mean opposite-edge-length aspect (W/H) of a quad in pixel coordinates. */
export function autoAspect(quadPx: Vec2[]): number {
    const len = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [tl, tr, br, bl] = quadPx;
    const w = (len(tl, tr) + len(bl, br)) / 2;
    const h = (len(tl, bl) + len(tr, br)) / 2;
    return h > 1e-6 ? w / h : 1;
}

/**
 * Metric (true physical) aspect ratio of the world rectangle imaged as
 * `quadPx`, after Zhang & He's single-view rectification. Intrinsics are a
 * centered principal point and a focal derived from a 35mm-equivalent length:
 * f_px = f35 / 36 * imageWidth. Returns null when degenerate (fall back to
 * autoAspect).
 */
export function metricAspect(
    quadPx: Vec2[],
    imageSize: { width: number; height: number },
    focal35 = 35,
): number | null {
    const { width, height } = imageSize;
    if (width <= 0 || height <= 0 || focal35 <= 0) return null;
    const f = (focal35 / 36) * width;
    const cx = width / 2;
    const cy = height / 2;
    // Homogeneous image points of corners m1..m4 = TL, TR, BL, BR (paper order).
    const [tl, tr, br, bl] = quadPx;
    const pts = [tl, tr, bl, br].map(([x, y]) => [x - cx, y - cy, 1] as const);
    const [m1, m2, m3, m4] = pts;
    const cross = (a: readonly number[], b: readonly number[]) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    // k2 = (m1 x m4)·m3 / (m2 x m4)·m3 ; k3 = (m1 x m4)·m2 / (m3 x m4)·m2
    const d24 = dot(cross(m2, m4), m3);
    const d34 = dot(cross(m3, m4), m2);
    if (Math.abs(d24) < 1e-9 || Math.abs(d34) < 1e-9) return null;
    const k2 = dot(cross(m1, m4), m3) / d24;
    const k3 = dot(cross(m1, m4), m2) / d34;
    const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
    const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
    // ratio² = n2ᵀ W n2 / n3ᵀ W n3 with W = K⁻ᵀK⁻¹ = diag(1/f², 1/f², 1)
    const wNorm = (n: number[]) => (n[0] * n[0] + n[1] * n[1]) / (f * f) + n[2] * n[2];
    const den = wNorm(n3);
    if (den < 1e-12) return null;
    const ratioSq = wNorm(n2) / den;
    if (!isFinite(ratioSq) || ratioSq <= 0) return null;
    return Math.sqrt(ratioSq);
}

/**
 * Output pixel size of the flat (unwarped) image: height from the longer
 * vertical edge, width from aspect; clamped to sane bounds.
 */
export function flatSizeForQuad(
    quadPx: Vec2[],
    aspect: number,
    maxDim = 4096,
): { width: number; height: number } {
    const len = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [tl, tr, br, bl] = quadPx;
    const h = Math.max(len(tl, bl), len(tr, br), 8);
    const w = Math.max(h * aspect, 8);
    const scale = Math.min(1, maxDim / Math.max(w, h));
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * Vanishing-point-preserving edge drag: moving edge (a,b) to pass through
 * `target` while keeping its direction aimed at the vanishing point formed
 * with the opposite edge; the moved corners are re-intersections with the
 * adjacent edges ("rails"). Returns the two updated corners, or null when
 * lines are parallel beyond recovery.
 */
export function dragEdgePreservingPerspective(
    quad: Vec2[],
    edgeIndex: number, // 0: tl-tr, 1: tr-br, 2: br-bl, 3: bl-tl
    target: Vec2,
): { corners: [Vec2, Vec2] } | null {
    const a = quad[edgeIndex];
    const b = quad[(edgeIndex + 1) % 4];
    const prev = quad[(edgeIndex + 3) % 4];
    const next = quad[(edgeIndex + 2) % 4];
    const oppA = quad[(edgeIndex + 3) % 4];
    const oppB = quad[(edgeIndex + 2) % 4];

    // Direction of the moved edge: toward its vanishing point with the
    // opposite edge, or parallel translate when edges are parallel.
    const vp = lineIntersection(a, b, oppB, oppA);
    const dir: Vec2 = vp
        ? [vp[0] - target[0], vp[1] - target[1]]
        : [b[0] - a[0], b[1] - a[1]];
    if (Math.hypot(dir[0], dir[1]) < 1e-9) return null;
    const t2: Vec2 = [target[0] + dir[0], target[1] + dir[1]];

    const newA = lineIntersection(target, t2, prev, a);
    const newB = lineIntersection(target, t2, next, b);
    if (!newA || !newB) return null;
    return { corners: [newA, newB] };
}

/** Intersection of infinite lines (p1,p2) and (p3,p4); null when parallel. */
export function lineIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
    const d1x = p2[0] - p1[0];
    const d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0];
    const d2y = p4[1] - p3[1];
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denom;
    return [p1[0] + t * d1x, p1[1] + t * d1y];
}
