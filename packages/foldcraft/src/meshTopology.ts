/**
 * Foldcraft — vector maths and mesh adjacency.
 *
 * Adjacency is built from vertex *indices*, never from coordinates. Two faces
 * share an edge when they name the same two indices, so there is no tolerance
 * to tune and no way for a loader's duplicated corners to hide an adjacency.
 */

import type { FoldcraftMesh, Vec3 } from './foldcraftTypes';

export const EPSILON = 1e-9;

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const length3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const distance3 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});

export function normalize(a: Vec3): Vec3 {
    const l = length3(a);
    return l < EPSILON ? { x: 0, y: 0, z: 0 } : { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** Newell's method: correct for planar n-gons, not just triangles. */
export function faceNormal(mesh: FoldcraftMesh, faceIndex: number): Vec3 {
    const face = mesh.faces[faceIndex];
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < face.length; i += 1) {
        const current = mesh.vertices[face[i]];
        const next = mesh.vertices[face[(i + 1) % face.length]];
        nx += (current.y - next.y) * (current.z + next.z);
        ny += (current.z - next.z) * (current.x + next.x);
        nz += (current.x - next.x) * (current.y + next.y);
    }
    return normalize({ x: nx, y: ny, z: nz });
}

export function faceCentroid(mesh: FoldcraftMesh, faceIndex: number): Vec3 {
    const face = mesh.faces[faceIndex];
    let sum: Vec3 = { x: 0, y: 0, z: 0 };
    face.forEach((vertexIndex) => { sum = add(sum, mesh.vertices[vertexIndex]); });
    return scale(sum, 1 / Math.max(1, face.length));
}

export function faceArea(mesh: FoldcraftMesh, faceIndex: number): number {
    const face = mesh.faces[faceIndex];
    let total: Vec3 = { x: 0, y: 0, z: 0 };
    const origin = mesh.vertices[face[0]];
    for (let i = 1; i + 1 < face.length; i += 1) {
        total = add(total, cross(
            sub(mesh.vertices[face[i]], origin),
            sub(mesh.vertices[face[i + 1]], origin),
        ));
    }
    return length3(total) / 2;
}

/** One face's traversal of one edge. `from`/`to` preserve the winding order. */
export type DirectedEdgeUse = {
    faceIndex: number;
    from: number;
    to: number;
    /** Position of `from` within the face's vertex list. */
    corner: number;
};

export type EdgeMap = Map<string, DirectedEdgeUse[]>;

export const undirectedEdgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export function buildEdgeMap(mesh: FoldcraftMesh): EdgeMap {
    const edges: EdgeMap = new Map();
    mesh.faces.forEach((face, faceIndex) => {
        for (let corner = 0; corner < face.length; corner += 1) {
            const from = face[corner];
            const to = face[(corner + 1) % face.length];
            if (from === to) continue;
            const key = undirectedEdgeKey(from, to);
            const uses = edges.get(key);
            const use: DirectedEdgeUse = { faceIndex, from, to, corner };
            if (uses) uses.push(use); else edges.set(key, [use]);
        }
    });
    return edges;
}

/**
 * Two faces sharing an edge agree on orientation when they traverse it in
 * opposite directions — the defining property of a consistently wound surface.
 */
export const usesAgree = (a: DirectedEdgeUse, b: DirectedEdgeUse): boolean => a.from === b.to && a.to === b.from;

export type FaceAdjacency = Map<number, Array<{ faceIndex: number; edgeKey: string }>>;

export function buildFaceAdjacency(edges: EdgeMap): FaceAdjacency {
    const adjacency: FaceAdjacency = new Map();
    const link = (from: number, to: number, edgeKey: string) => {
        const list = adjacency.get(from);
        if (list) list.push({ faceIndex: to, edgeKey }); else adjacency.set(from, [{ faceIndex: to, edgeKey }]);
    };
    edges.forEach((uses, key) => {
        if (uses.length !== 2) return;
        link(uses[0].faceIndex, uses[1].faceIndex, key);
        link(uses[1].faceIndex, uses[0].faceIndex, key);
    });
    return adjacency;
}

/**
 * Signed dihedral angle across a shared edge, in degrees, as the angle between
 * the two panels in the finished object: 180 is flat, 90 a right angle, and
 * values above 180 are reflex (a valley seen from outside).
 *
 * The edge direction is taken from `parentUse`, the parent face's own traversal
 * order. That is the whole fix: with a consistently wound mesh this makes the
 * sign a property of the surface rather than of how the vertices happened to be
 * numbered. Deriving the direction from sorted vertex keys — as the papercraft
 * module does — labels half a cube's twelve identical folds backwards.
 */
export function dihedralDegrees(
    mesh: FoldcraftMesh,
    parentUse: DirectedEdgeUse,
    childFaceIndex: number,
): number {
    const edge = normalize(sub(mesh.vertices[parentUse.to], mesh.vertices[parentUse.from]));
    const parentNormal = faceNormal(mesh, parentUse.faceIndex);
    const childNormal = faceNormal(mesh, childFaceIndex);
    const sine = dot(edge, cross(parentNormal, childNormal));
    const cosine = Math.max(-1, Math.min(1, dot(parentNormal, childNormal)));
    // atan2 gives the turn angle away from flat; 180 minus it is the angle
    // between the panels themselves.
    const turn = Math.atan2(sine, cosine) * 180 / Math.PI;
    return 180 - turn;
}

/**
 * Six times the signed volume of a closed shell. Positive means the faces wind
 * counter-clockwise seen from outside.
 */
export function signedVolume6(mesh: FoldcraftMesh): number {
    let total = 0;
    mesh.faces.forEach((face) => {
        const origin = mesh.vertices[face[0]];
        for (let i = 1; i + 1 < face.length; i += 1) {
            total += dot(origin, cross(mesh.vertices[face[i]], mesh.vertices[face[i + 1]]));
        }
    });
    return total;
}

export function boundingBox(mesh: FoldcraftMesh): { min: Vec3; max: Vec3; diagonal: number } {
    const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
    const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
    mesh.vertices.forEach((point) => {
        min.x = Math.min(min.x, point.x); max.x = Math.max(max.x, point.x);
        min.y = Math.min(min.y, point.y); max.y = Math.max(max.y, point.y);
        min.z = Math.min(min.z, point.z); max.z = Math.max(max.z, point.z);
    });
    if (!Number.isFinite(min.x)) {
        return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, diagonal: 0 };
    }
    return { min, max, diagonal: distance3(min, max) };
}
