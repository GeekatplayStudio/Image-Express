/**
 * 3D Stamp Tool - Mesh Integrity Helpers
 *
 * Shared checks for the printable-solid invariants the stamp generators must hold:
 * closed (every edge shared by exactly two triangles), consistently wound, and oriented
 * outwards. Orientation matters as much as closure - an inside-out shell passes every
 * edge-count test, renders as a hollow shape in the viewport, and is rejected by slicers.
 */

import * as THREE from 'three';

export interface MeshTopologyReport {
    triangleCount: number;
    vertexCount: number;
    degenerateTriangles: number;
    nanOrInfCount: number;
    /** Edges used by a single triangle (holes). */
    boundaryEdges: number;
    /** Edges whose two triangles traverse them in the same direction. */
    inconsistentWindingEdges: number;
    /** Edges shared by more than two triangles. */
    nonManifoldEdges: number;
    /** Positive when the surface is wound outwards. */
    signedVolumeMm3: number;
    isWatertightManifold: boolean;
    isOutwardOriented: boolean;
}

/**
 * Signed volume of a closed triangle mesh via the divergence theorem.
 * Positive means the faces are wound counter-clockwise as seen from outside.
 * O(triangles) - cheap enough to run on every interactive rebuild.
 */
export function computeSignedVolume(geometry: THREE.BufferGeometry): number {
    const pos = geometry.getAttribute('position');
    if (!pos) return 0;
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const cross = new THREE.Vector3();
    let volume = 0;

    for (let i = 0; i + 2 < count; i += 3) {
        const i0 = index ? index.getX(i) : i;
        const i1 = index ? index.getX(i + 1) : i + 1;
        const i2 = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0);
        b.fromBufferAttribute(pos, i1);
        c.fromBufferAttribute(pos, i2);
        cross.crossVectors(b, c);
        volume += a.dot(cross);
    }

    return volume / 6;
}

/**
 * Full topological analysis. Vertices are matched by quantised position (1 micron) so
 * meshes that duplicate coincident vertices - `ExtrudeGeometry` output, for instance -
 * are still recognised as closed.
 *
 * This walks a hash map per edge, so it is meant for tests and export-time validation
 * rather than per-frame use; prefer `computeSignedVolume` on the interactive path.
 */
export function analyzeMeshTopology(geometry: THREE.BufferGeometry): MeshTopologyReport {
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangleCount = index ? index.count / 3 : pos.count / 3;

    let degenerateTriangles = 0;
    let nanOrInfCount = 0;

    const keyCache = new Map<number, string>();
    const getVertexKey = (idx: number): string => {
        const cached = keyCache.get(idx);
        if (cached !== undefined) return cached;

        const x = pos.getX(idx);
        const y = pos.getY(idx);
        const z = pos.getZ(idx);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            nanOrInfCount++;
        }
        const key = `${Math.round(x * 1000)}_${Math.round(y * 1000)}_${Math.round(z * 1000)}`;
        keyCache.set(idx, key);
        return key;
    };

    const directedEdges = new Map<string, number>();
    const undirectedEdges = new Map<string, number>();

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const cross = new THREE.Vector3();

    for (let t = 0; t < triangleCount; t++) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

        vA.fromBufferAttribute(pos, i0);
        vB.fromBufferAttribute(pos, i1);
        vC.fromBufferAttribute(pos, i2);

        edge1.subVectors(vB, vA);
        edge2.subVectors(vC, vA);
        cross.crossVectors(edge1, edge2);
        if (cross.length() < 1e-9) {
            degenerateTriangles++;
        }

        const k0 = getVertexKey(i0);
        const k1 = getVertexKey(i1);
        const k2 = getVertexKey(i2);

        const edges: [string, string][] = [
            [k0, k1],
            [k1, k2],
            [k2, k0],
        ];

        for (const [from, to] of edges) {
            if (from === to) continue; // collapsed edge
            const dirKey = `${from}->${to}`;
            const undirKey = from < to ? `${from}|${to}` : `${to}|${from}`;
            directedEdges.set(dirKey, (directedEdges.get(dirKey) || 0) + 1);
            undirectedEdges.set(undirKey, (undirectedEdges.get(undirKey) || 0) + 1);
        }
    }

    let boundaryEdges = 0;
    let nonManifoldEdges = 0;
    let inconsistentWindingEdges = 0;

    for (const [undirKey, count] of undirectedEdges.entries()) {
        if (count === 1) {
            boundaryEdges++;
        } else if (count > 2) {
            nonManifoldEdges++;
        } else {
            const [v1, v2] = undirKey.split('|');
            const forward = directedEdges.get(`${v1}->${v2}`) || 0;
            const reverse = directedEdges.get(`${v2}->${v1}`) || 0;
            if (forward !== 1 || reverse !== 1) {
                inconsistentWindingEdges++;
            }
        }
    }

    const signedVolumeMm3 = computeSignedVolume(geometry);

    const isWatertightManifold =
        boundaryEdges === 0 &&
        nonManifoldEdges === 0 &&
        inconsistentWindingEdges === 0 &&
        degenerateTriangles === 0 &&
        nanOrInfCount === 0;

    return {
        triangleCount,
        vertexCount: pos.count,
        degenerateTriangles,
        nanOrInfCount,
        boundaryEdges,
        inconsistentWindingEdges,
        nonManifoldEdges,
        signedVolumeMm3,
        isWatertightManifold,
        isOutwardOriented: signedVolumeMm3 > 0,
    };
}
