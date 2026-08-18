/**
 * Shared test solids for the Foldcraft suites.
 *
 * Every generator returns faces wound counter-clockwise seen from outside, so
 * a test that wants badly-oriented input has to break it deliberately.
 *
 * Not a test file: jest's testMatch requires `.test.` or `.spec.` in the name.
 */

import type { FoldcraftMesh, Vec3 } from '../src/foldcraftTypes';

const mesh = (vertices: Vec3[], faces: number[][]): FoldcraftMesh => ({ vertices, faces, unitsPerMm: 1 });

/** Unit cube. Twelve interior edges, every one a 90 degree convex fold. */
export function cubeMesh(): FoldcraftMesh {
    const vertices: Vec3[] = [
        { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 1, z: 1 },
    ];
    const faces = [
        [0, 3, 2, 1], // z = 0, outward -z
        [4, 5, 6, 7], // z = 1, outward +z
        [0, 1, 5, 4], // y = 0, outward -y
        [3, 7, 6, 2], // y = 1, outward +y
        [0, 4, 7, 3], // x = 0, outward -x
        [1, 2, 6, 5], // x = 1, outward +x
    ];
    return mesh(vertices, faces);
}

/** Cube as triangles, for paths that assume triangular faces. */
export function cubeTrianglesMesh(): FoldcraftMesh {
    const quads = cubeMesh();
    const faces: number[][] = [];
    quads.faces.forEach((face) => {
        faces.push([face[0], face[1], face[2]]);
        faces.push([face[0], face[2], face[3]]);
    });
    return mesh(quads.vertices, faces);
}

/** Regular tetrahedron. */
export function tetrahedronMesh(): FoldcraftMesh {
    const vertices: Vec3[] = [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0.5, y: Math.sqrt(3) / 2, z: 0 },
        { x: 0.5, y: Math.sqrt(3) / 6, z: Math.sqrt(2 / 3) },
    ];
    return mesh(vertices, [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]]);
}

/** Regular icosahedron: thirty identical convex folds. */
export function icosahedronMesh(): FoldcraftMesh {
    const t = (1 + Math.sqrt(5)) / 2;
    const vertices: Vec3[] = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(([x, y, z]) => ({ x, y, z }));
    const faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    return mesh(vertices, faces);
}

/** Open hemisphere shell — the stand-in for a helmet or a hat crown. */
export function hemisphereMesh(rings: number, segments: number): FoldcraftMesh {
    const vertices: Vec3[] = [];
    const index = new Map<string, number>();
    const at = (ring: number, segment: number): number => {
        const wrapped = ((segment % segments) + segments) % segments;
        const key = ring === 0 ? 'apex' : `${ring},${wrapped}`;
        const existing = index.get(key);
        if (existing !== undefined) return existing;
        const phi = (ring / rings) * (Math.PI / 2);
        const theta = (wrapped / segments) * Math.PI * 2;
        vertices.push({
            x: Math.sin(phi) * Math.cos(theta),
            y: Math.cos(phi),
            z: Math.sin(phi) * Math.sin(theta),
        });
        index.set(key, vertices.length - 1);
        return vertices.length - 1;
    };
    const faces: number[][] = [];
    for (let ring = 0; ring < rings; ring += 1) {
        for (let segment = 0; segment < segments; segment += 1) {
            const a = at(ring, segment);
            const b = at(ring + 1, segment);
            const c = at(ring + 1, segment + 1);
            const d = at(ring, segment + 1);
            if (ring === 0) { faces.push([a, c, b]); continue; }
            faces.push([a, d, c]);
            faces.push([a, c, b]);
        }
    }
    return mesh(vertices, faces);
}

/**
 * Closed cylinder — a can. The side is developable and must unroll to a single
 * rectangle of width 2*pi*r once analytic unrolling lands.
 */
export function cylinderMesh(segments: number, radius = 1, height = 2): FoldcraftMesh {
    const vertices: Vec3[] = [];
    for (let i = 0; i < segments; i += 1) {
        const theta = (i / segments) * Math.PI * 2;
        vertices.push({ x: Math.cos(theta) * radius, y: 0, z: Math.sin(theta) * radius });
    }
    for (let i = 0; i < segments; i += 1) {
        const theta = (i / segments) * Math.PI * 2;
        vertices.push({ x: Math.cos(theta) * radius, y: height, z: Math.sin(theta) * radius });
    }
    const bottomCentre = vertices.push({ x: 0, y: 0, z: 0 }) - 1;
    const topCentre = vertices.push({ x: 0, y: height, z: 0 }) - 1;

    const faces: number[][] = [];
    for (let i = 0; i < segments; i += 1) {
        const next = (i + 1) % segments;
        faces.push([i, next, segments + next, segments + i]);
        faces.push([bottomCentre, next, i]);
        faces.push([topCentre, segments + i, segments + next]);
    }
    return mesh(vertices, faces);
}

/**
 * A cube whose corners are duplicated per face, the way a glTF exporter emits
 * them. Adjacency only exists after welding.
 */
export function splitVertexCubeMesh(): FoldcraftMesh {
    const source = cubeMesh();
    const vertices: Vec3[] = [];
    const faces = source.faces.map((face) => face.map((vertexIndex) => {
        const point = source.vertices[vertexIndex];
        // Nudge below any sane weld tolerance so welding, not luck, merges them.
        vertices.push({ x: point.x + 1e-9, y: point.y - 1e-9, z: point.z });
        return vertices.length - 1;
    }));
    return mesh(vertices, faces);
}

/** Cube with every face wound the wrong way round. */
export function invertedCubeMesh(): FoldcraftMesh {
    const source = cubeMesh();
    return mesh(source.vertices, source.faces.map((face) => [...face].reverse()));
}

/** Cube with a random subset of faces reversed — inconsistent, not merely inverted. */
export function scrambledCubeMesh(): FoldcraftMesh {
    const source = cubeMesh();
    return mesh(source.vertices, source.faces.map((face, index) => (
        index % 2 === 0 ? [...face].reverse() : face
    )));
}
