/**
 * The overlap predicate, which decides both where segmentation stops growing a
 * panel and whether the finished plan is safe to cut.
 *
 * It is used at two different scales — segmentation works in model units,
 * validation re-checks the same panels after scaling to finished millimetres —
 * so **scale invariance is a correctness requirement**. A version that
 * answered differently at the two scales made the stages contradict each
 * other: on a real 280 mm can model, two triangles that merely shared a corner
 * "overlapped" by 1.7e-7 mm once scaled by 161, and a plan with perfect fold
 * signs, no mirroring and every face placed was refused outright.
 */

import { polygonsOverlap } from '../src/flattenRigid';
import type { Vec2 } from '../src/foldcraftTypes';

const scaleBy = (points: Vec2[], factor: number): Vec2[] => (
    points.map((point) => ({ x: point.x * factor, y: point.y * factor }))
);

const triangle = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Vec2[] => (
    [{ x: ax, y: ay }, { x: bx, y: by }, { x: cx, y: cy }]
);

/** The scales a plan actually passes through: model units, then millimetres. */
const SCALES = [1, 0.001, 161.299921, 1000];

describe('polygonsOverlap', () => {
    it('reports a genuine overlap', () => {
        const a = triangle(0, 0, 4, 0, 0, 4);
        const b = triangle(1, 1, 5, 1, 1, 5);
        expect(polygonsOverlap(a, b)).toBe(true);
    });

    it('reports separated polygons as separate', () => {
        const a = triangle(0, 0, 1, 0, 0, 1);
        const b = triangle(5, 5, 6, 5, 5, 6);
        expect(polygonsOverlap(a, b)).toBe(false);
    });

    it('treats polygons that share an edge as separate', () => {
        // Two triangles forming a square across their shared diagonal: this is
        // every interior fold in every panel, and must never read as overlap.
        const a = triangle(0, 0, 1, 0, 0, 1);
        const b = triangle(1, 0, 1, 1, 0, 1);
        expect(polygonsOverlap(a, b)).toBe(false);
    });

    it('treats polygons meeting at a single corner as separate', () => {
        const a = triangle(0, 0, 1, 0, 0, 1);
        const b = triangle(1, 1, 2, 1, 2, 2);
        expect(polygonsOverlap(a, b)).toBe(false);
    });

    /**
     * The pair that actually broke, captured from the model that broke it:
     * faces 1214 and 1252 of panel 1 of a 280 mm soda can, in finished
     * millimetres.
     *
     * They share a corner — A[0] and B[2] are the same mesh vertex — but the
     * two copies arrived through different chains of rigid transforms and
     * differ in the last bits: 6e-8 mm apart in x, 7e-7 mm in y. That leaves
     * them interpenetrating by 1.7e-7 mm, which is 1/2000th of the cutter's
     * kerf and about a thousandth of a wavelength of light.
     *
     * Segmentation, working in model units, called them separate. Validation,
     * re-checking after the 161x scale to millimetres, called them
     * overlapping — and refused a plan whose folds were all correctly signed,
     * with nothing mirrored and every face placed. Both stages must agree.
     */
    const CAN_SCALE_MM_PER_UNIT = 161.299921;
    const CAN_FACE_A: Vec2[] = [
        { x: -30.026599670675136, y: -279.1221026668476 },
        { x: -34.56244847475817, y: -273.7903462704028 },
        { x: -40.15471312554039, y: -275.58614766188543 },
    ];
    const CAN_FACE_B: Vec2[] = [
        { x: -32.45700857775151, y: -294.4465944816281 },
        { x: -24.296577650533155, y: -277.67023154836744 },
        // The shared corner, as the neighbouring face computed it.
        { x: -30.026599734990764, y: -279.1221019591852 },
    ];

    it('does not call the can pair an overlap in finished millimetres', () => {
        expect(polygonsOverlap(CAN_FACE_A, CAN_FACE_B)).toBe(false);
    });

    it('gives the can pair the same verdict in model units as in millimetres', () => {
        const inModelUnits = 1 / CAN_SCALE_MM_PER_UNIT;
        expect(polygonsOverlap(scaleBy(CAN_FACE_A, inModelUnits), scaleBy(CAN_FACE_B, inModelUnits)))
            .toBe(polygonsOverlap(CAN_FACE_A, CAN_FACE_B));
    });

    it.each(SCALES)('holds that verdict at scale %p', (factor) => {
        expect(polygonsOverlap(scaleBy(CAN_FACE_A, factor), scaleBy(CAN_FACE_B, factor))).toBe(false);
    });

    /**
     * The property that makes segmentation and validation agree. Without it,
     * one stage accepts what the other rejects and no amount of correct
     * geometry can produce files.
     */
    it.each(SCALES)('gives the same verdict at scale %p', (factor) => {
        const overlapping: Array<[Vec2[], Vec2[]]> = [
            [triangle(0, 0, 4, 0, 0, 4), triangle(1, 1, 5, 1, 1, 5)],
            [triangle(0, 0, 10, 0, 0, 10), triangle(2, 2, 3, 2, 2, 3)], // contained
        ];
        const separate: Array<[Vec2[], Vec2[]]> = [
            [triangle(0, 0, 1, 0, 0, 1), triangle(5, 5, 6, 5, 5, 6)],
            [triangle(0, 0, 1, 0, 0, 1), triangle(1, 0, 1, 1, 0, 1)], // shared edge
            [triangle(0, 0, 1, 0, 0, 1), triangle(1, 1, 2, 1, 2, 2)], // shared corner
        ];
        overlapping.forEach(([a, b]) => {
            expect(polygonsOverlap(scaleBy(a, factor), scaleBy(b, factor))).toBe(true);
        });
        separate.forEach(([a, b]) => {
            expect(polygonsOverlap(scaleBy(a, factor), scaleBy(b, factor))).toBe(false);
        });
    });

    it('still catches an overlap far smaller than a face but bigger than noise', () => {
        // 1% of the face — a real sliver fold-over, not rounding.
        const a = triangle(0, 0, 1, 0, 0, 1);
        const b = triangle(0.99, 0, 1.99, 0, 0.99, 1);
        expect(polygonsOverlap(a, b)).toBe(true);
        expect(polygonsOverlap(scaleBy(a, 1000), scaleBy(b, 1000))).toBe(true);
    });

    it('survives a degenerate zero-area polygon without throwing', () => {
        const degenerate = triangle(1, 1, 1, 1, 1, 1);
        expect(polygonsOverlap(triangle(0, 0, 1, 0, 0, 1), degenerate)).toBe(false);
    });
});
