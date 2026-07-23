import {
    applyHomography,
    autoAspect,
    computeHomography,
    dragEdgePreservingPerspective,
    flatSizeForQuad,
    invertMat3,
    isQuadValid,
    lineIntersection,
    metricAspect,
    multiplyMat3,
    rescaleHomography,
    unitSquareToQuad,
    type Vec2,
} from '../threeDLayer/homography';

const closeTo = (a: Vec2, b: Vec2, eps = 1e-6) => {
    expect(Math.abs(a[0] - b[0])).toBeLessThan(eps);
    expect(Math.abs(a[1] - b[1])).toBeLessThan(eps);
};

describe('computeHomography', () => {
    it('maps the four correspondences exactly', () => {
        const src: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
        const dst: Vec2[] = [[120, 80], [520, 130], [560, 420], [90, 380]];
        const h = computeHomography(src, dst)!;
        expect(h).not.toBeNull();
        src.forEach((p, i) => closeTo(applyHomography(h, p), dst[i], 1e-4));
    });

    it('is identity for identical quads', () => {
        const q: Vec2[] = [[3, 4], [9, 4], [9, 11], [3, 11]];
        const h = computeHomography(q, q)!;
        closeTo(applyHomography(h, [5, 7]), [5, 7]);
    });

    it('returns null for degenerate (collinear) corners', () => {
        expect(computeHomography(
            [[0, 0], [1, 1], [2, 2], [3, 3]],
            [[0, 0], [1, 0], [1, 1], [0, 1]],
        )).toBeNull();
    });

    it('round-trips through the inverse', () => {
        const h = unitSquareToQuad([[50, 60], [400, 90], [420, 300], [40, 280]])!;
        const inv = invertMat3(h)!;
        const p: Vec2 = [0.3, 0.7];
        closeTo(applyHomography(inv, applyHomography(h, p)), p, 1e-6);
        // H·H⁻¹ ≈ I (up to scale; h8 normalized to 1 keeps it exact-ish)
        const id = multiplyMat3(h, inv);
        expect(Math.abs(id[0] - 1)).toBeLessThan(1e-6);
        expect(Math.abs(id[4] - 1)).toBeLessThan(1e-6);
        expect(Math.abs(id[8] - 1)).toBeLessThan(1e-6);
    });
});

describe('rescaleHomography', () => {
    it('samples an upscaled edit without resizing it', () => {
        const flatSize = { width: 100, height: 50 };
        const editSize = { width: 400, height: 200 }; // 4x upscaled edit
        const orig = { width: 800, height: 600 };
        const h = computeHomography(
            [[0, 0], [flatSize.width, 0], [flatSize.width, flatSize.height], [0, flatSize.height]],
            [[100, 100], [700, 150], [650, 500], [120, 450]],
        )!;
        const h2 = rescaleHomography(h, flatSize, editSize, orig, orig);
        // The same original-space point maps from proportional coordinates.
        closeTo(applyHomography(h2, [200, 100]), applyHomography(h, [50, 25]), 1e-4);
    });
});

describe('aspect estimation', () => {
    it('autoAspect of an axis-aligned rectangle equals w/h', () => {
        expect(autoAspect([[0, 0], [200, 0], [200, 100], [0, 100]])).toBeCloseTo(2);
    });

    it('metricAspect recovers the true ratio of a synthetically projected rectangle', () => {
        // Project a 2:1 world rectangle with a known pinhole camera.
        const W = 1000, H = 750;
        const f = (35 / 36) * W;
        // Rectangle corners in camera space: tilted around X by 30°.
        const tilt = Math.PI / 6;
        const world: [number, number, number][] = [
            [-1, 0.5, 0], [1, 0.5, 0], [1, -0.5, 0], [-1, -0.5, 0], // 2 wide, 1 tall
        ];
        const quad: Vec2[] = world.map(([x, y]) => {
            const yc = y * Math.cos(tilt);
            const zc = 4 + y * Math.sin(tilt);
            return [f * (x / zc) + W / 2, f * (-yc / zc) + H / 2];
        });
        const ratio = metricAspect(quad, { width: W, height: H }, 35)!;
        expect(ratio).not.toBeNull();
        expect(ratio).toBeCloseTo(2, 1);
    });

    it('metricAspect returns null on degenerate input', () => {
        expect(metricAspect([[0, 0], [0, 0], [0, 0], [0, 0]], { width: 100, height: 100 })).toBeNull();
    });
});

describe('quad validity', () => {
    it('accepts a convex quad and rejects a self-intersecting one', () => {
        expect(isQuadValid([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
        expect(isQuadValid([[0, 0], [1, 1], [1, 0], [0, 1]])).toBe(false);
        expect(isQuadValid([[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001]], 0.01)).toBe(false);
    });
});

describe('flatSizeForQuad', () => {
    it('derives size from vertical edges and aspect, clamped to maxDim', () => {
        const s = flatSizeForQuad([[0, 0], [100, 0], [100, 200], [0, 200]], 0.5);
        expect(s.height).toBe(200);
        expect(s.width).toBe(100);
        const clamped = flatSizeForQuad([[0, 0], [100, 0], [100, 9000], [0, 9000]], 1, 1024);
        expect(Math.max(clamped.width, clamped.height)).toBeLessThanOrEqual(1024);
    });
});

describe('dragEdgePreservingPerspective', () => {
    it('keeps the dragged edge aimed at its vanishing point', () => {
        // A quad whose top and bottom edges meet at a VP to the right.
        const quad: Vec2[] = [[0, 0], [100, 20], [100, 80], [0, 100]];
        const vpBefore = lineIntersection(quad[0], quad[1], quad[3], quad[2])!;
        const res = dragEdgePreservingPerspective(quad, 0, [10, -10])!;
        expect(res).not.toBeNull();
        const [newTl, newTr] = res.corners;
        const vpAfter = lineIntersection(newTl, newTr, quad[3], quad[2])!;
        closeTo(vpAfter, vpBefore, 1e-3);
    });

    it('translates parallel edges without rotating them', () => {
        const quad: Vec2[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
        const res = dragEdgePreservingPerspective(quad, 0, [50, -20])!;
        const [a, b] = res.corners;
        expect(a[1]).toBeCloseTo(-20);
        expect(b[1]).toBeCloseTo(-20);
    });
});
