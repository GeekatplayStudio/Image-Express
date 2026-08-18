/**
 * Model loading. Each fixture is built in memory so the tests document the
 * formats byte-for-byte and never depend on files on disk.
 */

import { loadModel } from '../src/loadModel';
import { ingestMesh } from '../src/ingest';

function binaryStlOfTetrahedron(): ArrayBuffer {
    const triangles = [
        [[0, 0, 0], [1, 0, 0], [0.5, Math.sqrt(3) / 2, 0]],
        [[0, 0, 0], [0.5, Math.sqrt(3) / 6, Math.sqrt(2 / 3)], [1, 0, 0]],
        [[1, 0, 0], [0.5, Math.sqrt(3) / 6, Math.sqrt(2 / 3)], [0.5, Math.sqrt(3) / 2, 0]],
        [[0, 0, 0], [0.5, Math.sqrt(3) / 2, 0], [0.5, Math.sqrt(3) / 6, Math.sqrt(2 / 3)]],
    ];
    const buffer = new ArrayBuffer(84 + triangles.length * 50);
    const view = new DataView(buffer);
    view.setUint32(80, triangles.length, true);
    triangles.forEach((triangle, index) => {
        let at = 84 + index * 50 + 12; // 12 bytes of normal left zero
        triangle.forEach((point) => point.forEach((value) => {
            view.setFloat32(at, value, true);
            at += 4;
        }));
    });
    return buffer;
}

const OBJ_QUAD_CUBE = `
# unit cube as quads
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 4 8 7 3
f 1 5 8 4
f 2 3 7 6
`;

function glbOfTriangle(): ArrayBuffer {
    // One indexed triangle, node scaled by 2 to prove transforms are applied.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const bin = new ArrayBuffer(positions.byteLength + 8); // 6 index bytes, padded to 4
    new Float32Array(bin, 0, 9).set(positions);
    new Uint16Array(bin, positions.byteLength, 3).set(indices);
    const json = JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, scale: [2, 2, 2] }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
            { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
            { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
        ],
        buffers: [{ byteLength: bin.byteLength }],
    });
    const jsonBytes = new TextEncoder().encode(json);
    const jsonPadded = Math.ceil(jsonBytes.length / 4) * 4;
    const total = 12 + 8 + jsonPadded + 8 + bin.byteLength;
    const buffer = new ArrayBuffer(total);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, jsonPadded, true);
    view.setUint32(16, 0x4e4f534a, true);
    bytes.set(jsonBytes, 20);
    for (let index = 20 + jsonBytes.length; index < 20 + jsonPadded; index += 1) bytes[index] = 0x20;
    view.setUint32(20 + jsonPadded, bin.byteLength, true);
    view.setUint32(24 + jsonPadded, 0x004e4942, true);
    bytes.set(new Uint8Array(bin), 28 + jsonPadded);
    return buffer;
}

describe('loadModel', () => {
    it('parses binary STL and welds into a closed tetrahedron', () => {
        const loaded = loadModel(binaryStlOfTetrahedron());
        expect(loaded.format).toBe('stl');
        expect(loaded.mesh.faces).toHaveLength(4);
        const report = ingestMesh(loaded.mesh);
        expect(report.mesh.vertices).toHaveLength(4);
        expect(report.isClosed).toBe(true);
    });

    it('parses ASCII STL', () => {
        const ascii = `solid tri
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 1 0 0
vertex 0 1 0
endloop
endfacet
endsolid tri`;
        const loaded = loadModel(ascii, { format: 'stl' });
        expect(loaded.mesh.faces).toHaveLength(1);
        expect(loaded.mesh.vertices[1]).toEqual({ x: 1, y: 0, z: 0 });
    });

    it('parses OBJ quads with 1-based indices', () => {
        const loaded = loadModel(OBJ_QUAD_CUBE);
        expect(loaded.format).toBe('obj');
        expect(loaded.mesh.faces).toHaveLength(6);
        expect(loaded.mesh.faces.every((face) => face.length === 4)).toBe(true);
        const report = ingestMesh(loaded.mesh);
        expect(report.isClosed).toBe(true);
        expect(report.isConsistentlyOriented).toBe(true);
    });

    it('parses GLB with indices and applies node transforms', () => {
        const loaded = loadModel(glbOfTriangle());
        expect(loaded.format).toBe('glb');
        expect(loaded.mesh.faces).toHaveLength(1);
        // The node scales by 2; glTF units are metres, so unitsPerMm is 0.001.
        expect(loaded.mesh.vertices[1].x).toBeCloseTo(2, 6);
        expect(loaded.mesh.unitsPerMm).toBe(0.001);
    });

    it('rejects an empty model with a clear error', () => {
        expect(() => loadModel('v 1 2 3\n', { format: 'obj' })).toThrow('MODEL_HAS_NO_TRIANGLES');
    });
});
