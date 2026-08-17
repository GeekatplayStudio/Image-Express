import type { FlatFace, MeshTriangle, PapercraftIsland, Point2, Point3 } from './papercraftTypes';
import { papercraftVertexKey, unfoldTriangles } from './unfoldMesh';

export type FoldBackPrediction = {
    confidence: number;
    surfaceCoverage: number;
    edgeFidelity: number;
    areaFidelity: number;
    topologyCoverage: number;
    foldInstructionCoverage: number;
    watertight: boolean;
};

export type IntelligentUnfold = {
    islands: PapercraftIsland[];
    strategy: string;
    candidatesEvaluated: number;
    prediction: FoldBackPrediction;
};

type Candidate = { strategy: string; triangles: MeshTriangle[] };

const distance3 = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const distance2 = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);
const area2 = (face: FlatFace) => Math.abs(
    (face.points[1].x - face.points[0].x) * (face.points[2].y - face.points[0].y)
    - (face.points[1].y - face.points[0].y) * (face.points[2].x - face.points[0].x),
) / 2;

function area3(triangle: MeshTriangle): number {
    const [a, b, c] = triangle.points;
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    return Math.hypot(
        ab.y * ac.z - ab.z * ac.y,
        ab.z * ac.x - ab.x * ac.z,
        ab.x * ac.y - ab.y * ac.x,
    ) / 2;
}

const edgeKey = (a: Point3, b: Point3) => {
    const ka = papercraftVertexKey(a);
    const kb = papercraftVertexKey(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

function sharedEdgeDegrees(triangles: MeshTriangle[]): Map<number, number> {
    const uses = new Map<string, number[]>();
    triangles.forEach((triangle) => [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
        const key = edgeKey(triangle.points[a], triangle.points[b]);
        uses.set(key, [...(uses.get(key) ?? []), triangle.id]);
    }));
    const degree = new Map<number, number>();
    uses.forEach((ids) => {
        if (ids.length !== 2) return;
        ids.forEach((id) => degree.set(id, (degree.get(id) ?? 0) + 1));
    });
    return degree;
}

function candidateOrders(triangles: MeshTriangle[]): Candidate[] {
    const degree = sharedEdgeDegrees(triangles);
    const centroid = (triangle: MeshTriangle, axis: keyof Point3) => (
        triangle.points.reduce((sum, point) => sum + point[axis], 0) / 3
    );
    const orders: Candidate[] = [
        { strategy: 'source-order', triangles },
        { strategy: 'reverse-order', triangles: [...triangles].reverse() },
        { strategy: 'largest-face-seed', triangles: [...triangles].sort((a, b) => area3(b) - area3(a)) },
        { strategy: 'connected-seed', triangles: [...triangles].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)) },
        ...(['x', 'y', 'z'] as const).map((axis): Candidate => ({
            strategy: `${axis}-sweep`,
            triangles: [...triangles].sort((a, b) => centroid(a, axis) - centroid(b, axis)),
        })),
    ];
    const pivot = Math.floor(triangles.length / 2);
    orders.push({ strategy: 'center-out', triangles: [...triangles.slice(pivot), ...triangles.slice(0, pivot)] });
    return orders;
}

function layoutCost(islands: PapercraftIsland[]): number {
    const seamKeys = new Set(islands.flatMap((island) => island.cuts.filter((edge) => edge.seam).map((edge) => edge.edgeKey)));
    const boundsArea = islands.reduce((sum, island) => (
        sum + (island.bounds.maxX - island.bounds.minX) * (island.bounds.maxY - island.bounds.minY)
    ), 0);
    const faceArea = islands.reduce((sum, island) => sum + island.faces.reduce((area, face) => area + area2(face), 0), 0);
    const waste = Math.max(0, boundsArea - faceArea);
    return islands.length * 1_000_000 + seamKeys.size * 10_000 + waste;
}

export function predictFoldBack(triangles: MeshTriangle[], islands: PapercraftIsland[]): FoldBackPrediction {
    const flatFaces = new Map(islands.flatMap((island) => island.faces.map((face) => [face.faceId, face])));
    const edgeUses = new Map<string, number>();
    let edgeError = 0;
    let edgeSamples = 0;
    let areaError = 0;
    triangles.forEach((triangle) => {
        const flat = flatFaces.get(triangle.id);
        if (!flat) return;
        areaError += Math.abs(area3(triangle) - area2(flat)) / Math.max(area3(triangle), 1e-9);
        [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
            const key = edgeKey(triangle.points[a], triangle.points[b]);
            edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
            edgeError += Math.abs(distance3(triangle.points[a], triangle.points[b]) - distance2(flat.points[a], flat.points[b]))
                / Math.max(distance3(triangle.points[a], triangle.points[b]), 1e-9);
            edgeSamples += 1;
        });
    });
    const representedEdges = new Set(islands.flatMap((island) => [
        ...island.folds.map((edge) => edge.edgeKey),
        ...island.cuts.map((edge) => edge.edgeKey),
    ]));
    const surfaceCoverage = flatFaces.size / Math.max(1, triangles.length);
    const edgeFidelity = 1 - Math.min(1, edgeError / Math.max(1, edgeSamples));
    const areaFidelity = 1 - Math.min(1, areaError / Math.max(1, flatFaces.size));
    const topologyCoverage = representedEdges.size / Math.max(1, edgeUses.size);
    const folds = islands.flatMap((island) => island.folds);
    const foldInstructionCoverage = folds.filter((fold) => Number.isFinite(fold.foldAngleDegrees)).length / Math.max(1, folds.length);
    const watertight = [...edgeUses.values()].every((uses) => uses === 2);
    const confidence = 100 * (
        surfaceCoverage * 0.35 + edgeFidelity * 0.2 + areaFidelity * 0.15 + topologyCoverage * 0.1
        + foldInstructionCoverage * 0.15 + (watertight ? 0.05 : 0)
    );
    return {
        confidence: Number(confidence.toFixed(1)),
        surfaceCoverage: Number((surfaceCoverage * 100).toFixed(1)),
        edgeFidelity: Number((edgeFidelity * 100).toFixed(1)),
        areaFidelity: Number((areaFidelity * 100).toFixed(1)),
        topologyCoverage: Number((topologyCoverage * 100).toFixed(1)),
        foldInstructionCoverage: Number((foldInstructionCoverage * 100).toFixed(1)),
        watertight,
    };
}

export function optimizePapercraftUnfold(
    triangles: MeshTriangle[],
    limits: { maxWidth: number; maxHeight: number },
): IntelligentUnfold {
    const evaluated = candidateOrders(triangles).map((candidate) => ({
        ...candidate,
        islands: unfoldTriangles(candidate.triangles, limits),
    }));
    evaluated.sort((a, b) => layoutCost(a.islands) - layoutCost(b.islands));
    const best = evaluated[0];
    return {
        islands: best.islands,
        strategy: best.strategy,
        candidatesEvaluated: evaluated.length,
        prediction: predictFoldBack(triangles, best.islands),
    };
}
