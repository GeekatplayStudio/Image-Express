import type {
    FlatFace,
    MeshTriangle,
    PapercraftIsland,
    Point2,
    Point3,
} from './papercraftTypes';

const EPSILON = 1e-7;

type EdgeUse = { faceId: number; a: number; b: number };
type FaceInfo = { triangle: MeshTriangle; keys: [string, string, string] };
type PlacedFace = FlatFace & { islandId: number };
type FaceNeighbor = { faceId: number; edgeKey: string; coplanar: boolean };
type PanelConnection = { parentId: number; childId: number; edgeKey: string };

const distance3 = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const cross2 = (a: Point2, b: Point2, c: Point2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function faceNormal(triangle: MeshTriangle): Point3 {
    const [a, b, c] = triangle.points;
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const normal = {
        x: ab.y * ac.z - ab.z * ac.y,
        y: ab.z * ac.x - ab.x * ac.z,
        z: ab.x * ac.y - ab.y * ac.x,
    };
    const length = Math.max(EPSILON, Math.hypot(normal.x, normal.y, normal.z));
    return { x: normal.x / length, y: normal.y / length, z: normal.z / length };
}

function foldInstruction(parent: FaceInfo, child: FaceInfo, sharedEdgeKey: string) {
    const [firstKey, secondKey] = sharedEdgeKey.split('|');
    const first = parent.triangle.points[parent.keys.indexOf(firstKey)];
    const second = parent.triangle.points[parent.keys.indexOf(secondKey)];
    const edgeLength = Math.max(EPSILON, distance3(first, second));
    const edge = {
        x: (second.x - first.x) / edgeLength,
        y: (second.y - first.y) / edgeLength,
        z: (second.z - first.z) / edgeLength,
    };
    const a = faceNormal(parent.triangle);
    const b = faceNormal(child.triangle);
    const cross = {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
    const sine = edge.x * cross.x + edge.y * cross.y + edge.z * cross.z;
    const cosine = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    const signedAngle = Math.atan2(sine, cosine) * 180 / Math.PI;
    const magnitude = Math.abs(signedAngle);
    return {
        foldAngleDegrees: Number(magnitude.toFixed(1)),
        foldDirection: magnitude < 0.5 ? 'flat' as const : signedAngle >= 0 ? 'mountain' as const : 'valley' as const,
    };
}

export function papercraftVertexKey(point: Point3): string {
    const precision = 100000;
    return `${Math.round(point.x * precision)},${Math.round(point.y * precision)},${Math.round(point.z * precision)}`;
}

const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
const pointKey = (point: Point2) => `${Math.round(point.x * 100000)},${Math.round(point.y * 100000)}`;

function seedPlacement(face: FaceInfo): [Point2, Point2, Point2] {
    const [a, b, c] = face.triangle.points;
    const ab = Math.max(EPSILON, distance3(a, b));
    const ac = distance3(a, c);
    const bc = distance3(b, c);
    const x = (ac * ac - bc * bc + ab * ab) / (2 * ab);
    const y = Math.sqrt(Math.max(0, ac * ac - x * x));
    return [{ x: 0, y: 0 }, { x: ab, y: 0 }, { x, y }];
}

function placeAcrossEdge(child: FaceInfo, parent: PlacedFace, sharedEdgeKey: string): [Point2, Point2, Point2] | null {
    const childIndices = child.keys
        .map((key, index) => ({ key, index }))
        .filter(({ key }) => sharedEdgeKey.split('|').includes(key));
    if (childIndices.length !== 2) return null;
    const first = childIndices[0];
    const second = childIndices[1];
    const thirdIndex = [0, 1, 2].find((index) => index !== first.index && index !== second.index);
    if (thirdIndex === undefined) return null;

    const parentFirstIndex = parent.vertexKeys.indexOf(first.key);
    const parentSecondIndex = parent.vertexKeys.indexOf(second.key);
    if (parentFirstIndex < 0 || parentSecondIndex < 0) return null;
    const a2 = parent.points[parentFirstIndex];
    const b2 = parent.points[parentSecondIndex];
    const edgeLength = Math.hypot(b2.x - a2.x, b2.y - a2.y);
    if (edgeLength < EPSILON) return null;

    const a3 = child.triangle.points[first.index];
    const b3 = child.triangle.points[second.index];
    const c3 = child.triangle.points[thirdIndex];
    const ac = distance3(a3, c3);
    const bc = distance3(b3, c3);
    const along = (ac * ac - bc * bc + edgeLength * edgeLength) / (2 * edgeLength);
    const height = Math.sqrt(Math.max(0, ac * ac - along * along));
    const ux = (b2.x - a2.x) / edgeLength;
    const uy = (b2.y - a2.y) / edgeLength;
    const base = { x: a2.x + ux * along, y: a2.y + uy * along };
    const candidates = [
        { x: base.x - uy * height, y: base.y + ux * height },
        { x: base.x + uy * height, y: base.y - ux * height },
    ];
    const parentThird = parent.points.find((_, index) => index !== parentFirstIndex && index !== parentSecondIndex);
    const parentSide = parentThird ? Math.sign(cross2(a2, b2, parentThird)) : 1;
    const third = candidates.find((candidate) => Math.sign(cross2(a2, b2, candidate)) !== parentSide) ?? candidates[0];
    const points: Point2[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    points[first.index] = a2;
    points[second.index] = b2;
    points[thirdIndex] = third;
    return points as [Point2, Point2, Point2];
}

function projection(points: [Point2, Point2, Point2], axis: Point2) {
    const values = points.map((point) => point.x * axis.x + point.y * axis.y);
    return { min: Math.min(...values), max: Math.max(...values) };
}

function trianglesOverlap(a: [Point2, Point2, Point2], b: [Point2, Point2, Point2]): boolean {
    const axes: Point2[] = [];
    [a, b].forEach((triangle) => triangle.forEach((point, index) => {
        const next = triangle[(index + 1) % 3];
        axes.push({ x: -(next.y - point.y), y: next.x - point.x });
    }));
    return axes.every((axis) => {
        const pa = projection(a, axis);
        const pb = projection(b, axis);
        return Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min) > EPSILON;
    });
}

function faceBounds(faces: FlatFace[]) {
    const points = faces.flatMap((face) => face.points);
    return {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
    };
}

export function modelMaximumExtent(triangles: MeshTriangle[]): number {
    const minima = { x: Infinity, y: Infinity, z: Infinity };
    const maxima = { x: -Infinity, y: -Infinity, z: -Infinity };
    triangles.forEach((triangle) => triangle.points.forEach((point) => {
        minima.x = Math.min(minima.x, point.x);
        minima.y = Math.min(minima.y, point.y);
        minima.z = Math.min(minima.z, point.z);
        maxima.x = Math.max(maxima.x, point.x);
        maxima.y = Math.max(maxima.y, point.y);
        maxima.z = Math.max(maxima.z, point.z);
    }));
    return Math.max(EPSILON, maxima.x - minima.x, maxima.y - minima.y, maxima.z - minima.z);
}

export function unfoldTriangles(
    triangles: MeshTriangle[],
    limits: { maxWidth: number; maxHeight: number },
): PapercraftIsland[] {
    const faces = new Map<number, FaceInfo>();
    const edges = new Map<string, EdgeUse[]>();
    triangles.forEach((triangle) => {
        const keys = triangle.points.map(papercraftVertexKey) as [string, string, string];
        faces.set(triangle.id, { triangle, keys });
        [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
            const key = edgeKey(keys[a], keys[b]);
            edges.set(key, [...(edges.get(key) ?? []), { faceId: triangle.id, a, b }]);
        });
    });

    const neighbors = new Map<number, FaceNeighbor[]>();
    const coplanarEdges = new Set<string>();
    edges.forEach((uses, key) => {
        if (uses.length !== 2) return;
        const first = faces.get(uses[0].faceId)!;
        const second = faces.get(uses[1].faceId)!;
        const coplanar = foldInstruction(first, second, key).foldDirection === 'flat';
        if (coplanar) coplanarEdges.add(key);
        neighbors.set(uses[0].faceId, [
            ...(neighbors.get(uses[0].faceId) ?? []),
            { faceId: uses[1].faceId, edgeKey: key, coplanar },
        ]);
        neighbors.set(uses[1].faceId, [
            ...(neighbors.get(uses[1].faceId) ?? []),
            { faceId: uses[0].faceId, edgeKey: key, coplanar },
        ]);
    });
    neighbors.forEach((entries) => entries.sort((a, b) => Number(b.coplanar) - Number(a.coplanar)));

    const placeCoplanarPanel = (
        seedInfo: FaceInfo,
        seedPoints: [Point2, Point2, Point2],
        islandId: number,
    ) => {
        const panelFaces = new Map<number, PlacedFace>();
        const connections: PanelConnection[] = [];
        panelFaces.set(seedInfo.triangle.id, {
            faceId: seedInfo.triangle.id,
            points: seedPoints,
            vertexKeys: seedInfo.keys,
            islandId,
        });
        const panelQueue = [seedInfo.triangle.id];
        while (panelQueue.length > 0) {
            const parentId = panelQueue.shift()!;
            const parent = panelFaces.get(parentId)!;
            for (const neighbor of neighbors.get(parentId) ?? []) {
                if (!neighbor.coplanar || panelFaces.has(neighbor.faceId)) continue;
                const childInfo = faces.get(neighbor.faceId)!;
                const points = placeAcrossEdge(childInfo, parent, neighbor.edgeKey);
                if (!points) continue;
                panelFaces.set(neighbor.faceId, {
                    faceId: neighbor.faceId,
                    points,
                    vertexKeys: childInfo.keys,
                    islandId,
                });
                connections.push({ parentId, childId: neighbor.faceId, edgeKey: neighbor.edgeKey });
                panelQueue.push(neighbor.faceId);
            }
        }
        return { faces: [...panelFaces.values()], connections };
    };

    const placed = new Map<number, PlacedFace>();
    const foldFaces = new Set<string>();
    const foldEdges = new Map<number, Array<{
        edgeKey: string;
        a: Point2;
        b: Point2;
        foldAngleDegrees: number;
        foldDirection: 'mountain' | 'valley' | 'flat';
    }>>();
    const islands: PapercraftIsland[] = [];

    const recordFold = (islandId: number, parentId: number, childId: number, sharedEdgeKey: string) => {
        const parent = placed.get(parentId)!;
        const edgeKeys = sharedEdgeKey.split('|');
        const ai = parent.vertexKeys.indexOf(edgeKeys[0]);
        const bi = parent.vertexKeys.indexOf(edgeKeys[1]);
        foldFaces.add(`${parentId}:${sharedEdgeKey}`);
        foldFaces.add(`${childId}:${sharedEdgeKey}`);
        foldEdges.set(islandId, [...(foldEdges.get(islandId) ?? []), {
            edgeKey: sharedEdgeKey,
            a: parent.points[ai],
            b: parent.points[bi],
            ...foldInstruction(faces.get(parentId)!, faces.get(childId)!, sharedEdgeKey),
        }]);
    };

    for (const [faceId, info] of faces) {
        if (placed.has(faceId)) continue;
        const islandId = islands.length;
        const seedPanel = placeCoplanarPanel(info, seedPlacement(info), islandId);
        seedPanel.faces.forEach((face) => placed.set(face.faceId, face));
        seedPanel.connections.forEach((connection) => recordFold(
            islandId,
            connection.parentId,
            connection.childId,
            connection.edgeKey,
        ));
        const islandFaces: PlacedFace[] = [...seedPanel.faces];
        const queue = seedPanel.faces.map((face) => face.faceId);

        while (queue.length > 0) {
            const parentId = queue.shift()!;
            const parent = placed.get(parentId)!;
            for (const neighbor of neighbors.get(parentId) ?? []) {
                if (neighbor.coplanar || placed.has(neighbor.faceId)) continue;
                const childInfo = faces.get(neighbor.faceId)!;
                const points = placeAcrossEdge(childInfo, parent, neighbor.edgeKey);
                if (!points) continue;
                const panel = placeCoplanarPanel(childInfo, points, islandId);
                if (panel.faces.some((face) => placed.has(face.faceId))) continue;
                if (panel.faces.some((candidate) => (
                    islandFaces.some((face) => trianglesOverlap(face.points, candidate.points))
                ))) continue;
                const bounds = faceBounds([...islandFaces, ...panel.faces]);
                if (bounds.maxX - bounds.minX > limits.maxWidth || bounds.maxY - bounds.minY > limits.maxHeight) continue;
                panel.faces.forEach((face) => placed.set(face.faceId, face));
                islandFaces.push(...panel.faces);
                queue.push(...panel.faces.map((face) => face.faceId));
                recordFold(islandId, parentId, neighbor.faceId, neighbor.edgeKey);
                panel.connections.forEach((connection) => recordFold(
                    islandId,
                    connection.parentId,
                    connection.childId,
                    connection.edgeKey,
                ));
            }
        }

        const cuts = islandFaces.flatMap((face) => [[0, 1], [1, 2], [2, 0]].flatMap(([a, b]) => {
            const key = edgeKey(face.vertexKeys[a], face.vertexKeys[b]);
            if (coplanarEdges.has(key)) return [];
            if (foldFaces.has(`${face.faceId}:${key}`)) return [];
            const uses = edges.get(key) ?? [];
            return [{
                a: face.points[a],
                b: face.points[b],
                edgeKey: key,
                faceId: face.faceId,
                seam: uses.length === 2,
                tab: uses.length === 2 && face.faceId === Math.min(...uses.map((use) => use.faceId)),
            }];
        }));
        islands.push({
            id: islandId,
            faces: islandFaces,
            cuts,
            folds: foldEdges.get(islandId) ?? [],
            bounds: faceBounds(islandFaces),
        });
    }
    return islands;
}

export function countUniqueNetPoints(island: PapercraftIsland): number {
    return new Set(island.faces.flatMap((face) => face.points.map(pointKey))).size;
}
