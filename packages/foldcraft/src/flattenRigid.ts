/**
 * Foldcraft S5 — rigid flattening.
 *
 * Unfolds a patch of faces into the plane, preserving every edge length
 * exactly. Two corrections over the papercraft implementation this replaces:
 *
 * 1. The seed face is laid out in a frame built from its *outward normal*, so
 *    the panel is never a mirror image of the surface. The old code always used
 *    a fixed winding, giving each island a coin-flip chance of assembling
 *    inside-out — invisible on symmetric parts, wrong on a helmet cheek plate.
 *
 * 2. Fold angles are measured against the parent face's winding order rather
 *    than alphabetically sorted vertex keys, so mountain and valley mean
 *    something. The old code labelled six of a cube's twelve identical folds
 *    backwards.
 *
 * Both are asserted by the convex-solid property test: on a closed convex mesh
 * every interior fold must have the same direction, and no panel may be
 * mirrored.
 */

import type {
    FlatBoundaryEdge,
    FlatFacePolygon,
    FlatInteriorEdge,
    FlatPanel,
    FoldDirection,
    FoldcraftMesh,
    Patch,
    SurfaceKind,
    Vec2,
} from './foldcraftTypes';
import {
    EPSILON,
    buildEdgeMap,
    cross,
    dihedralDegrees,
    distance3,
    dot,
    faceNormal,
    normalize,
    sub,
    undirectedEdgeKey,
} from './meshTopology';

/** Degrees away from flat below which an edge is not a fold at all. */
const FLAT_TOLERANCE_DEG = 0.5;

const signedArea2 = (points: Vec2[]): number => {
    let total = 0;
    for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
};

/**
 * Project a face into 2D through a frame whose handedness matches the outward
 * normal, so a face wound counter-clockwise from outside comes out
 * counter-clockwise on the sheet. This is the anti-mirroring guarantee.
 */
export function localFrameCoordinates(mesh: FoldcraftMesh, faceIndex: number): Map<number, Vec2> {
    const face = mesh.faces[faceIndex];
    const origin = mesh.vertices[face[0]];
    const normal = faceNormal(mesh, faceIndex);
    const u = normalize(sub(mesh.vertices[face[1]], origin));
    // cross(u, v) === normal, so the mapping preserves orientation.
    const v = cross(normal, u);
    const coordinates = new Map<number, Vec2>();
    face.forEach((vertexIndex) => {
        const offset = sub(mesh.vertices[vertexIndex], origin);
        coordinates.set(vertexIndex, { x: dot(offset, u), y: dot(offset, v) });
    });
    return coordinates;
}

/**
 * The unique rotation+translation taking `localA`→`targetA` and
 * `localB`→`targetB`. Never a reflection, which is what keeps an unfolded child
 * on the correct side of the shared edge and stops mirroring propagating.
 */
export function rigidTransform(localA: Vec2, localB: Vec2, targetA: Vec2, targetB: Vec2) {
    const localAngle = Math.atan2(localB.y - localA.y, localB.x - localA.x);
    const targetAngle = Math.atan2(targetB.y - targetA.y, targetB.x - targetA.x);
    const angle = targetAngle - localAngle;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return (point: Vec2): Vec2 => {
        const dx = point.x - localA.x;
        const dy = point.y - localA.y;
        return { x: targetA.x + dx * cosine - dy * sine, y: targetA.y + dx * sine + dy * cosine };
    };
}

/** Longest diagonal of a polygon's bounding box — its characteristic size. */
const characteristicSize = (points: Vec2[]): number => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const point of points) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
    }
    if (!Number.isFinite(minX)) return 0;
    return Math.hypot(maxX - minX, maxY - minY);
};

/**
 * How deeply two faces must interpenetrate before it counts, as a fraction of
 * the smaller face. Faces that share a corner or a seam land within rounding
 * of each other and must read as separate; a real fold-over penetrates by a
 * visible fraction of a face, orders of magnitude more than this.
 */
const TOUCH_TOLERANCE_FRACTION = 1e-4;

/**
 * Separating-axis overlap test for two convex polygons.
 *
 * **Scale-invariant by construction**, which is a correctness requirement
 * rather than a nicety: segmentation tests overlap in model units and
 * validation re-tests the same panels after scaling to finished millimetres,
 * so a test that answers differently at the two scales makes the two stages
 * contradict each other. The previous version compared against
 * `max(1, |projection|) * 1e-9` — an absolute floor applied to projections
 * onto *un-normalised* axes, values that grow with the square of the
 * coordinates. On a 280 mm can (161 mm per model unit) two triangles meeting
 * at a shared corner passed segmentation and then "overlapped" by 1.7e-7 mm
 * in validation, failing an otherwise perfect 33-panel plan.
 *
 * The axis is now normalised, so the separation is a true distance, and the
 * tolerance is a fraction of the polygons' own size.
 */
export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
    const tolerance = Math.min(characteristicSize(a), characteristicSize(b)) * TOUCH_TOLERANCE_FRACTION;
    for (const polygon of [a, b]) {
        const degenerate = characteristicSize(polygon) * 1e-12;
        for (let i = 0; i < polygon.length; i += 1) {
            const current = polygon[i];
            const next = polygon[(i + 1) % polygon.length];
            const dx = next.x - current.x;
            const dy = next.y - current.y;
            const length = Math.hypot(dx, dy);
            // A zero-length edge has no normal; it contributes no axis.
            if (length <= degenerate) continue;
            const axis = { x: -dy / length, y: dx / length };
            let minA = Infinity; let maxA = -Infinity;
            let minB = Infinity; let maxB = -Infinity;
            a.forEach((point) => {
                const value = point.x * axis.x + point.y * axis.y;
                minA = Math.min(minA, value); maxA = Math.max(maxA, value);
            });
            b.forEach((point) => {
                const value = point.x * axis.x + point.y * axis.y;
                minB = Math.min(minB, value); maxB = Math.max(maxB, value);
            });
            const separation = Math.min(maxA, maxB) - Math.max(minA, minB);
            if (separation <= tolerance) return false;
        }
    }
    return true;
}

export const foldDirectionFor = (dihedralDeg: number): FoldDirection => {
    if (Math.abs(dihedralDeg - 180) < FLAT_TOLERANCE_DEG) return 'flat';
    return dihedralDeg < 180 ? 'mountain' : 'valley';
};

export type FlattenOptions = {
    /** Reject a face whose placement would overlap one already on the panel. */
    rejectOverlaps?: boolean;
};

/**
 * Flatten one patch. Faces that cannot be placed without overlapping are left
 * out and reported in `unplacedFaces` for the segmenter to re-seed elsewhere,
 * rather than silently becoming their own island as they did before.
 */
export function flattenPatchRigid(
    mesh: FoldcraftMesh,
    patch: Patch,
    options: FlattenOptions = {},
): { panel: FlatPanel; unplacedFaces: number[] } {
    const patchFaces = new Set(patch.faces);
    const edges = buildEdgeMap(mesh);
    const placed = new Map<number, Map<number, Vec2>>();
    const interiorEdges: FlatInteriorEdge[] = [];
    const polygons: FlatFacePolygon[] = [];

    const seed = patchFaces.has(patch.seedFace) ? patch.seedFace : patch.faces[0];
    if (seed === undefined) {
        return {
            panel: emptyPanel(patch.id, patch.kind),
            unplacedFaces: [],
        };
    }

    const pushPolygon = (faceIndex: number, coordinates: Map<number, Vec2>) => {
        placed.set(faceIndex, coordinates);
        polygons.push({
            faceId: faceIndex,
            points: mesh.faces[faceIndex].map((vertexIndex) => coordinates.get(vertexIndex)!),
        });
    };

    pushPolygon(seed, localFrameCoordinates(mesh, seed));

    const unplaced: number[] = [];
    const queue = [seed];
    while (queue.length > 0) {
        const parentIndex = queue.shift()!;
        const parentCoordinates = placed.get(parentIndex)!;
        const parentFace = mesh.faces[parentIndex];

        for (let corner = 0; corner < parentFace.length; corner += 1) {
            const from = parentFace[corner];
            const to = parentFace[(corner + 1) % parentFace.length];
            const key = undirectedEdgeKey(from, to);
            const uses = edges.get(key);
            if (!uses || uses.length !== 2) continue;
            const parentUse = uses.find((use) => use.faceIndex === parentIndex);
            const childUse = uses.find((use) => use.faceIndex !== parentIndex);
            if (!parentUse || !childUse) continue;
            const childIndex = childUse.faceIndex;
            if (!patchFaces.has(childIndex) || placed.has(childIndex)) continue;

            const childLocal = localFrameCoordinates(mesh, childIndex);
            const transform = rigidTransform(
                childLocal.get(from)!,
                childLocal.get(to)!,
                parentCoordinates.get(from)!,
                parentCoordinates.get(to)!,
            );
            const childCoordinates = new Map<number, Vec2>();
            mesh.faces[childIndex].forEach((vertexIndex) => {
                childCoordinates.set(vertexIndex, transform(childLocal.get(vertexIndex)!));
            });
            const childPolygon = mesh.faces[childIndex].map((vertexIndex) => childCoordinates.get(vertexIndex)!);

            if (options.rejectOverlaps !== false) {
                const collides = polygons.some((existing) => (
                    existing.faceId !== parentIndex && polygonsOverlap(existing.points, childPolygon)
                ));
                if (collides) { unplaced.push(childIndex); continue; }
            }

            pushPolygon(childIndex, childCoordinates);
            const dihedral = dihedralDegrees(mesh, parentUse, childIndex);
            interiorEdges.push({
                edgeKey: key,
                a: parentCoordinates.get(from)!,
                b: parentCoordinates.get(to)!,
                dihedralDeg: Number(dihedral.toFixed(4)),
                direction: foldDirectionFor(dihedral),
                parentFace: parentIndex,
                childFace: childIndex,
            });
            queue.push(childIndex);
        }
    }

    const boundaryEdges = collectBoundaryEdges(mesh, edges, placed, interiorEdges);
    const maxEdgeErrorPct = measureEdgeError(mesh, placed);
    const mirrored = polygons.some((polygon) => signedArea2(polygon.points) < -EPSILON);

    return {
        panel: {
            patchId: patch.id,
            kind: patch.kind,
            faces: polygons,
            interiorEdges,
            boundaryEdges,
            boundsMm: boundsOf(polygons),
            mirrored,
            maxEdgeErrorPct: Number(maxEdgeErrorPct.toFixed(6)),
            method: 'rigid',
        },
        unplacedFaces: unplaced,
    };
}

export function collectBoundaryEdges(
    mesh: FoldcraftMesh,
    edges: ReturnType<typeof buildEdgeMap>,
    placed: Map<number, Map<number, Vec2>>,
    interiorEdges: FlatInteriorEdge[],
): FlatBoundaryEdge[] {
    const folded = new Set(interiorEdges.map((edge) => edge.edgeKey));
    const boundary: FlatBoundaryEdge[] = [];
    placed.forEach((coordinates, faceIndex) => {
        const face = mesh.faces[faceIndex];
        for (let corner = 0; corner < face.length; corner += 1) {
            const from = face[corner];
            const to = face[(corner + 1) % face.length];
            const key = undirectedEdgeKey(from, to);
            if (folded.has(key)) continue;
            const uses = edges.get(key) ?? [];
            boundary.push({
                edgeKey: key,
                a: coordinates.get(from)!,
                b: coordinates.get(to)!,
                faceId: faceIndex,
                seam: uses.length === 2,
            });
        }
    });
    return boundary;
}

/** Largest relative difference between a 3D edge and its flattened length. */
export function measureEdgeError(mesh: FoldcraftMesh, placed: Map<number, Map<number, Vec2>>): number {
    let worst = 0;
    placed.forEach((coordinates, faceIndex) => {
        const face = mesh.faces[faceIndex];
        for (let corner = 0; corner < face.length; corner += 1) {
            const from = face[corner];
            const to = face[(corner + 1) % face.length];
            const spatial = distance3(mesh.vertices[from], mesh.vertices[to]);
            if (spatial < EPSILON) continue;
            const a = coordinates.get(from)!;
            const b = coordinates.get(to)!;
            const flat = Math.hypot(b.x - a.x, b.y - a.y);
            worst = Math.max(worst, Math.abs(spatial - flat) / spatial * 100);
        }
    });
    return worst;
}

export function boundsOf(polygons: FlatFacePolygon[]) {
    const points = polygons.flatMap((polygon) => polygon.points);
    if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
    };
}

function emptyPanel(patchId: number, kind: SurfaceKind): FlatPanel {
    return {
        patchId,
        kind,
        faces: [],
        interiorEdges: [],
        boundaryEdges: [],
        boundsMm: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        mirrored: false,
        maxEdgeErrorPct: 0,
        method: 'rigid',
    };
}
