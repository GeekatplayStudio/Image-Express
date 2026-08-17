import { buildPapercraftPlanFromTriangles } from '../papercraftPlan';
import { countUniqueNetPoints, unfoldTriangles } from '../unfoldMesh';
import { simplifyMeshTriangles } from '../meshExtraction';
import type { MeshTriangle, Point3 } from '../papercraftTypes';

const p0: Point3 = { x: 0, y: 0, z: 0 };
const p1: Point3 = { x: 1, y: 0, z: 0 };
const p2: Point3 = { x: 0.5, y: Math.sqrt(3) / 2, z: 0 };
const p3: Point3 = { x: 0.5, y: Math.sqrt(3) / 6, z: Math.sqrt(2 / 3) };

const tetrahedron: MeshTriangle[] = [
    { id: 0, points: [p0, p1, p2] },
    { id: 1, points: [p0, p3, p1] },
    { id: 2, points: [p1, p3, p2] },
    { id: 3, points: [p0, p2, p3] },
];

const cubePoints = {
    p000: { x: 0, y: 0, z: 0 },
    p100: { x: 1, y: 0, z: 0 },
    p110: { x: 1, y: 1, z: 0 },
    p010: { x: 0, y: 1, z: 0 },
    p001: { x: 0, y: 0, z: 1 },
    p101: { x: 1, y: 0, z: 1 },
    p111: { x: 1, y: 1, z: 1 },
    p011: { x: 0, y: 1, z: 1 },
} satisfies Record<string, Point3>;

const cube: MeshTriangle[] = [
    [cubePoints.p000, cubePoints.p110, cubePoints.p100],
    [cubePoints.p000, cubePoints.p010, cubePoints.p110],
    [cubePoints.p001, cubePoints.p101, cubePoints.p111],
    [cubePoints.p001, cubePoints.p111, cubePoints.p011],
    [cubePoints.p000, cubePoints.p100, cubePoints.p101],
    [cubePoints.p000, cubePoints.p101, cubePoints.p001],
    [cubePoints.p010, cubePoints.p111, cubePoints.p110],
    [cubePoints.p010, cubePoints.p011, cubePoints.p111],
    [cubePoints.p000, cubePoints.p001, cubePoints.p011],
    [cubePoints.p000, cubePoints.p011, cubePoints.p010],
    [cubePoints.p100, cubePoints.p110, cubePoints.p111],
    [cubePoints.p100, cubePoints.p111, cubePoints.p101],
].map((points, id) => ({ id, points })) as MeshTriangle[];

describe('papercraft unfolding', () => {
    it('places every face into printable islands and preserves shared fold edges', () => {
        const islands = unfoldTriangles(tetrahedron, { maxWidth: 10, maxHeight: 10 });

        expect(islands.flatMap((island) => island.faces)).toHaveLength(4);
        expect(islands.reduce((sum, island) => sum + island.folds.length, 0)).toBe(3);
        expect(islands.some((island) => island.cuts.some((cut) => cut.tab))).toBe(true);
        expect(islands.every((island) => countUniqueNetPoints(island) >= 3)).toBe(true);
    });

    it('produces dimensioned SVG sheets with cut, score, and glue-tab operations', () => {
        const plan = buildPapercraftPlanFromTriangles(tetrahedron, {
            modelSizeMm: 80,
            sheetWidthMm: 210,
            sheetHeightMm: 297,
        });

        expect(plan.sourceFaceCount).toBe(4);
        expect(plan.unfoldedFaceCount).toBe(4);
        expect(plan.sheets).toHaveLength(1);
        expect(plan.sheets[0].svg).toContain('width="210mm"');
        expect(plan.sheets[0].svg).toContain('height="297mm"');
        expect(plan.sheets[0].svg).toContain('class="cut"');
        expect(plan.sheets[0].svg).toContain('data-operation="score"');
        expect(plan.sheets[0].svg).toContain('data-glue-tab="true"');
        expect(plan.sheets[0].svg).toContain('data-fold-back-confidence="100"');
        expect(plan.sheets[0].svg).toMatch(/data-fold-direction="(mountain|valley)"/);
        expect(plan.sheets[0].svg).toMatch(/data-fold-angle="[\d.]+"/);
        expect(plan.intelligence.candidatesEvaluated).toBe(8);
        expect(plan.intelligence.foldBackConfidence).toBe(100);
        expect(plan.intelligence.foldInstructionCoverage).toBe(100);
        expect(plan.intelligence.watertight).toBe(true);
    });

    it('unfolds a triangulated cube as six intact square panels', () => {
        const plan = buildPapercraftPlanFromTriangles(cube, {
            modelSizeMm: 80,
            sheetWidthMm: 420,
            sheetHeightMm: 297,
        });
        const islands = unfoldTriangles(cube, { maxWidth: 20, maxHeight: 20 });
        const folds = islands.flatMap((island) => island.folds);
        const flatFolds = folds.filter((fold) => fold.foldDirection === 'flat');
        const scoredFolds = folds.filter((fold) => fold.foldDirection !== 'flat');
        const cutKeys = new Set(islands.flatMap((island) => island.cuts.map((cut) => cut.edgeKey)));

        expect(plan.unfoldedFaceCount).toBe(12);
        expect(plan.islandCount).toBe(1);
        expect(flatFolds).toHaveLength(6);
        expect(flatFolds.every((fold) => !cutKeys.has(fold.edgeKey))).toBe(true);
        expect(scoredFolds).toHaveLength(5);
        expect(scoredFolds.every((fold) => fold.foldAngleDegrees === 90)).toBe(true);
        expect(plan.sheets).toHaveLength(1);
        expect(plan.sheets[0].svg).not.toContain('data-fold-direction="flat"');
        expect(plan.sheets[0].svg.match(/data-operation="score"/g)).toHaveLength(5);
        expect(plan.sheets[0].svg.match(/data-glue-tab="true"/g)).toHaveLength(7);
    });

    it('reduces dense geometry locally without adding a setup dependency', () => {
        const center: Point3 = { x: 0, y: 0, z: 0.25 };
        const dense = Array.from({ length: 180 }, (_, index): MeshTriangle => {
            const angleA = (index / 180) * Math.PI * 2;
            const angleB = ((index + 1) / 180) * Math.PI * 2;
            return {
                id: index,
                points: [
                    center,
                    { x: Math.cos(angleA), y: Math.sin(angleA), z: 0 },
                    { x: Math.cos(angleB), y: Math.sin(angleB), z: 0 },
                ],
            };
        });

        const simplified = simplifyMeshTriangles(dense, 40);

        expect(simplified.length).toBeGreaterThan(0);
        expect(simplified.length).toBeLessThanOrEqual(40);
    });

    it('streams very large coordinate bounds without exhausting the call stack', () => {
        const dense = Array.from({ length: 50_000 }, (_, index): MeshTriangle => {
            const angleA = (index / 50_000) * Math.PI * 2;
            const angleB = ((index + 1) / 50_000) * Math.PI * 2;
            return {
                id: index,
                points: [
                    { x: 0, y: 0, z: 0.3 },
                    { x: Math.cos(angleA), y: Math.sin(angleA), z: 0 },
                    { x: Math.cos(angleB), y: Math.sin(angleB), z: 0 },
                ],
            };
        });

        expect(() => simplifyMeshTriangles(dense, 40)).not.toThrow();
    });
});
