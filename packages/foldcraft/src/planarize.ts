/**
 * Foldcraft S2 — planarisation.
 *
 * Turns a rounded model into genuinely flat panels: group faces into regions
 * that are nearly coplanar already, fit one plane to each, then move every
 * vertex onto the planes it belongs to.
 *
 * "Nearly flat" is not good enough for foam. A panel that is a degree off still
 * fights you when it is glued, and the fold angle it implies is wrong. After
 * this stage a vertex shared by three regions sits exactly on all three planes,
 * so the faces really are planar and the dihedral angles really are the angles
 * the maker will fold to.
 *
 * The maker's priority is that the outside looks right, so the fit is
 * least-squares rather than inscribed or circumscribed, and how far the surface
 * moved is measured and reported.
 */

import type { FoldcraftMesh, Vec3 } from './foldcraftTypes';
import {
    EPSILON,
    add,
    boundingBox,
    buildEdgeMap,
    distance3,
    dot,
    faceArea,
    faceCentroid,
    faceNormal,
    normalize,
    scale,
    sub,
} from './meshTopology';

export type PlanarRegion = {
    id: number;
    faces: number[];
    normal: Vec3;
    origin: Vec3;
    areaSum: number;
};

/** Solve a 3x3 system by Gaussian elimination with partial pivoting. */
function solve3(matrix: number[][], rhs: number[]): Vec3 | null {
    const m = matrix.map((row, index) => [...row, rhs[index]]);
    for (let column = 0; column < 3; column += 1) {
        let pivot = column;
        for (let row = column + 1; row < 3; row += 1) {
            if (Math.abs(m[row][column]) > Math.abs(m[pivot][column])) pivot = row;
        }
        if (Math.abs(m[pivot][column]) < 1e-12) return null;
        [m[column], m[pivot]] = [m[pivot], m[column]];
        for (let row = 0; row < 3; row += 1) {
            if (row === column) continue;
            const factor = m[row][column] / m[column][column];
            for (let k = column; k < 4; k += 1) m[row][k] -= factor * m[column][k];
        }
    }
    return { x: m[0][3] / m[0][0], y: m[1][3] / m[1][1], z: m[2][3] / m[2][2] };
}

/**
 * Grow regions of nearly-coplanar faces.
 *
 * A face joins the region when its normal is within `toleranceDeg` of the
 * region's running area-weighted normal. Comparing against the running average
 * rather than the seed lets a gently curved surface become one panel, which is
 * what produces a low-poly look instead of a triangle-for-triangle copy.
 *
 * Seeding from the largest faces first keeps big flat areas whole.
 */
export function growPlanarRegions(mesh: FoldcraftMesh, toleranceDeg: number): PlanarRegion[] {
    const edges = buildEdgeMap(mesh);
    const neighbours = new Map<number, number[]>();
    edges.forEach((uses) => {
        if (uses.length !== 2) return;
        const [a, b] = uses;
        const listA = neighbours.get(a.faceIndex);
        if (listA) listA.push(b.faceIndex); else neighbours.set(a.faceIndex, [b.faceIndex]);
        const listB = neighbours.get(b.faceIndex);
        if (listB) listB.push(a.faceIndex); else neighbours.set(b.faceIndex, [a.faceIndex]);
    });

    const normals = mesh.faces.map((_, index) => faceNormal(mesh, index));
    const areas = mesh.faces.map((_, index) => faceArea(mesh, index));
    const order = mesh.faces.map((_, index) => index).sort((a, b) => areas[b] - areas[a]);
    const assigned = new Array<number>(mesh.faces.length).fill(-1);
    const tolerance = Math.max(0, toleranceDeg) * Math.PI / 180;
    const cosineLimit = Math.cos(tolerance);
    /**
     * Second limit, against the seed rather than the running average.
     *
     * Testing only against the average lets a region drift: each face is within
     * tolerance of the mean, the mean shifts a little, and on a sphere the
     * region walks right around the surface. Capping the total span at twice
     * the tolerance keeps a region genuinely near-planar while still letting it
     * follow a gentle curve.
     */
    const seedCosineLimit = Math.cos(Math.min(Math.PI, tolerance * 2));
    const regions: PlanarRegion[] = [];

    for (const seed of order) {
        if (assigned[seed] >= 0) continue;
        const id = regions.length;
        assigned[seed] = id;
        const faces = [seed];
        const seedNormal = normals[seed];
        let accumulated = scale(normals[seed], areas[seed]);
        let areaSum = areas[seed];
        const queue = [seed];

        while (queue.length > 0) {
            const current = queue.shift()!;
            const average = normalize(accumulated);
            for (const candidate of neighbours.get(current) ?? []) {
                if (assigned[candidate] >= 0) continue;
                if (dot(normals[candidate], average) < cosineLimit) continue;
                if (dot(normals[candidate], seedNormal) < seedCosineLimit) continue;
                assigned[candidate] = id;
                faces.push(candidate);
                accumulated = add(accumulated, scale(normals[candidate], areas[candidate]));
                areaSum += areas[candidate];
                queue.push(candidate);
            }
        }

        let centroid: Vec3 = { x: 0, y: 0, z: 0 };
        faces.forEach((faceIndex) => {
            centroid = add(centroid, scale(faceCentroid(mesh, faceIndex), areas[faceIndex]));
        });
        regions.push({
            id,
            faces,
            normal: normalize(accumulated),
            origin: scale(centroid, 1 / Math.max(EPSILON, areaSum)),
            areaSum,
        });
    }
    return regions;
}

/**
 * Move each vertex onto every plane it touches.
 *
 * Minimises the squared distance to the incident regions' planes, regularised
 * towards the original position so the system stays solvable when a vertex sits
 * on fewer than three distinct planes. With one plane the result is the
 * projection onto it; with three it is their intersection point.
 */
export function snapVerticesToRegions(
    mesh: FoldcraftMesh,
    regions: PlanarRegion[],
    moveLimits?: number[],
): { vertices: Vec3[]; maxDeviation: number } {
    const incident = new Map<number, Set<number>>();
    regions.forEach((region) => region.faces.forEach((faceIndex) => {
        mesh.faces[faceIndex].forEach((vertexIndex) => {
            const set = incident.get(vertexIndex);
            if (set) set.add(region.id); else incident.set(vertexIndex, new Set([region.id]));
        });
    }));

    const limits = moveLimits ?? incidentEdgeLengths(mesh);
    const lambda = 1e-6;
    let maxDeviation = 0;
    const vertices = mesh.vertices.map((original, vertexIndex) => {
        const planes = [...(incident.get(vertexIndex) ?? new Set<number>())].map((id) => regions[id]);
        if (planes.length === 0) return original;
        const matrix = [
            [lambda, 0, 0],
            [0, lambda, 0],
            [0, 0, lambda],
        ];
        const rhs = [lambda * original.x, lambda * original.y, lambda * original.z];
        planes.forEach((plane) => {
            const n = plane.normal;
            const d = dot(n, plane.origin);
            const components = [n.x, n.y, n.z];
            for (let row = 0; row < 3; row += 1) {
                for (let column = 0; column < 3; column += 1) {
                    matrix[row][column] += components[row] * components[column];
                }
                rhs[row] += d * components[row];
            }
        });
        const solved = solve3(matrix, rhs);
        if (!solved) return original;

        /**
         * Two regions whose normals are nearly parallel meet along a line that
         * is barely determined, and the solve can fling a vertex an arbitrary
         * distance to satisfy both. Unclamped, that showed up as a 37% shape
         * deviation at one tolerance setting with far smaller values either
         * side. A vertex has no business travelling further than the edges
         * meeting at it, so the displacement is capped at that length; the
         * direction is still the one that best satisfies the planes.
         */
        const limit = limits[vertexIndex];
        const travelled = distance3(original, solved);
        const capped = limit > EPSILON && travelled > limit
            ? add(original, scale(sub(solved, original), limit / travelled))
            : solved;
        maxDeviation = Math.max(maxDeviation, distance3(original, capped));
        return capped;
    });
    return { vertices, maxDeviation };
}

/**
 * How far a vertex may travel, as a multiple of the edges meeting at it.
 *
 * Swept against a faceted hemisphere across tolerances from 3 to 30 degrees.
 * Loosening it trades shape fidelity for merged panels: at 5 the clamp barely
 * binds and deviation reaches 37% of the model's size, at 2 it reaches 19%, at
 * 1 it stays within 11%.
 *
 * 1 is the right end of that trade because flatness no longer depends on it —
 * `enforcePlanarity` splits any panel that stayed out of true, so a tight clamp
 * costs a few extra triangles at coarse tolerances rather than a panel that
 * cannot be cut. The maker's priority is that the outside looks right, and this
 * is the setting that keeps the surface closest to the model they made.
 */
const MOVE_LIMIT_FACTOR = 1;

/** Mean length of the edges meeting at each vertex — the local feature size. */
export function incidentEdgeLengths(mesh: FoldcraftMesh): number[] {
    const totals = new Array<number>(mesh.vertices.length).fill(0);
    const counts = new Array<number>(mesh.vertices.length).fill(0);
    mesh.faces.forEach((face) => {
        for (let corner = 0; corner < face.length; corner += 1) {
            const from = face[corner];
            const to = face[(corner + 1) % face.length];
            const length = distance3(mesh.vertices[from], mesh.vertices[to]);
            totals[from] += length; counts[from] += 1;
            totals[to] += length; counts[to] += 1;
        }
    });
    return totals.map((total, index) => (counts[index] > 0 ? total / counts[index] * MOVE_LIMIT_FACTOR : 0));
}

/** Recompute each region's plane from the current vertex positions. */
export function refitRegions(mesh: FoldcraftMesh, regions: PlanarRegion[]): PlanarRegion[] {
    return regions.map((region) => {
        let accumulated: Vec3 = { x: 0, y: 0, z: 0 };
        let centroid: Vec3 = { x: 0, y: 0, z: 0 };
        let areaSum = 0;
        region.faces.forEach((faceIndex) => {
            const area = faceArea(mesh, faceIndex);
            accumulated = add(accumulated, scale(faceNormal(mesh, faceIndex), area));
            centroid = add(centroid, scale(faceCentroid(mesh, faceIndex), area));
            areaSum += area;
        });
        if (areaSum < EPSILON) return region;
        return {
            ...region,
            normal: normalize(accumulated),
            origin: scale(centroid, 1 / areaSum),
            areaSum,
        };
    });
}

/**
 * Alternate refitting planes and snapping vertices onto them.
 *
 * A vertex where four or more regions meet cannot sit exactly on all of them,
 * so a single snap leaves faces visibly out of true — on a faceted hemisphere,
 * about a degree and a half. Re-fitting each plane to where the vertices
 * actually ended up and snapping again converges to a configuration where both
 * hold to well under a hundredth of a degree. This is the same
 * alternating-projection idea used to planarise quad meshes in architectural
 * geometry, kept deliberately simple because the region assignment is fixed.
 */
export function planarizeIteratively(
    mesh: FoldcraftMesh,
    regions: PlanarRegion[],
    iterations: number,
): { mesh: FoldcraftMesh; regions: PlanarRegion[]; maxDeviation: number } {
    const original = mesh.vertices;
    // Measured once on the input: the limit is on total travel from the
    // original surface, not on each step, so iterating cannot creep past it.
    const limits = incidentEdgeLengths(mesh);
    let current = mesh;
    let fitted = regions;
    for (let step = 0; step < Math.max(1, iterations); step += 1) {
        const snapped = snapVerticesToRegions(current, fitted, limits);
        current = {
            ...current,
            vertices: snapped.vertices.map((point, index) => {
                const limit = limits[index];
                const travelled = distance3(original[index], point);
                if (limit <= EPSILON || travelled <= limit) return point;
                return add(original[index], scale(sub(point, original[index]), limit / travelled));
            }),
        };
        fitted = refitRegions(current, fitted);
    }
    let maxDeviation = 0;
    current.vertices.forEach((point, index) => {
        maxDeviation = Math.max(maxDeviation, distance3(original[index], point));
    });
    return { mesh: current, regions: fitted, maxDeviation };
}

/**
 * How far a single face departs from its own best-fit plane, in degrees.
 * A triangle is planar by definition and always scores zero.
 */
export function facePlanarityDeg(mesh: FoldcraftMesh, faceIndex: number): number {
    const face = mesh.faces[faceIndex];
    if (face.length < 4) return 0;
    const normal = faceNormal(mesh, faceIndex);
    const origin = faceCentroid(mesh, faceIndex);
    let span = 0;
    face.forEach((vertexIndex) => {
        span = Math.max(span, distance3(mesh.vertices[vertexIndex], origin));
    });
    if (span < EPSILON) return 0;
    let worst = 0;
    face.forEach((vertexIndex) => {
        const offset = dot(normal, sub(mesh.vertices[vertexIndex], origin));
        worst = Math.max(worst, Math.asin(Math.min(1, Math.abs(offset) / span)) * 180 / Math.PI);
    });
    return worst;
}

/** Worst planarity error across every face in the mesh. */
export function measurePlanarity(mesh: FoldcraftMesh): number {
    let worst = 0;
    mesh.faces.forEach((_, faceIndex) => {
        worst = Math.max(worst, facePlanarityDeg(mesh, faceIndex));
    });
    return worst;
}

/** Longest bounding-box axis, used to express deviation as a fraction of size. */
export const modelExtent = (mesh: FoldcraftMesh): number => {
    const box = boundingBox(mesh);
    return Math.max(EPSILON, box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
};
