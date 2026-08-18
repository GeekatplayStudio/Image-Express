/**
 * Foldcraft — model loading.
 *
 * Parses GLB, STL (binary and ASCII), and OBJ into a `FoldcraftMesh`, with no
 * dependency on three.js or any other runtime: the package must load a model
 * anywhere it runs — browser, Node, worker — because it is reused outside the
 * app it was born in.
 *
 * Only geometry is read. Materials, textures, skins, and animations are
 * ignored: the pipeline needs positions and faces, transformed into world
 * space, and nothing else. glTF's JSON-with-external-buffers form is out of
 * scope — exporters bundle to GLB when asked for a single file, and a single
 * file is what a cutting workflow passes around.
 */

import type { FoldcraftMesh, Vec3 } from './foldcraftTypes';

export type ModelFormat = 'glb' | 'stl' | 'obj';

export type LoadModelOptions = {
    /** Override format detection (magic bytes, then content sniffing). */
    format?: ModelFormat;
    /**
     * Source units per millimetre. glTF is metres by spec, so GLB defaults to
     * 0.001; STL and OBJ carry no unit and default to 1 (treated as mm).
     */
    unitsPerMm?: number;
};

export type LoadedModel = {
    mesh: FoldcraftMesh;
    format: ModelFormat;
    /** Meshes/solids found in the file; all are merged into one triangle set. */
    objectCount: number;
};

// 4x4 column-major matrices, the glTF convention.
type Mat4 = number[];

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const multiply = (a: Mat4, b: Mat4): Mat4 => {
    const out = new Array<number>(16).fill(0);
    for (let column = 0; column < 4; column += 1) {
        for (let row = 0; row < 4; row += 1) {
            let sum = 0;
            for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
            out[column * 4 + row] = sum;
        }
    }
    return out;
};

const applyMat4 = (m: Mat4, v: Vec3): Vec3 => ({
    x: m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12],
    y: m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13],
    z: m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14],
});

/** Compose glTF TRS into a column-major matrix. */
function trsMatrix(t: number[], r: number[], s: number[]): Mat4 {
    const [x, y, z, w] = r;
    const [sx, sy, sz] = s;
    // Standard quaternion-to-matrix expansion, scaled per column.
    return [
        (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
        (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
        (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
        t[0], t[1], t[2], 1,
    ];
}

// ---------------------------------------------------------------------------
// GLB
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- glTF JSON is untyped by nature. */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function parseGlb(buffer: ArrayBuffer): { triangles: Array<[Vec3, Vec3, Vec3]>; objectCount: number } {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('GLB_BAD_MAGIC');
    if (view.getUint32(4, true) !== 2) throw new Error('GLB_UNSUPPORTED_VERSION');

    let offset = 12;
    let json: any = null;
    let bin: DataView | null = null;
    while (offset + 8 <= view.byteLength) {
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        const start = offset + 8;
        if (type === CHUNK_JSON) {
            json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)));
        } else if (type === CHUNK_BIN) {
            bin = new DataView(buffer, start, length);
        }
        offset = start + length + (length % 4 === 0 ? 0 : 4 - (length % 4));
    }
    if (!json) throw new Error('GLB_MISSING_JSON');

    /**
     * Accessor values as one flat typed-friendly array. Generated sculpts
     * carry hundreds of thousands of positions; reading them as per-element
     * arrays allocated millions of short-lived objects and dominated load
     * time. A flat Float64Array read in one loop is allocation-free.
     */
    const readAccessorFlat = (accessorIndex: number): { values: Float64Array; components: number; count: number } => {
        const accessor = json.accessors[accessorIndex];
        const bufferView = json.bufferViews[accessor.bufferView];
        if (!bin) throw new Error('GLB_MISSING_BIN');
        const components = accessor.type === 'VEC3' ? 3 : accessor.type === 'SCALAR' ? 1 : 0;
        if (components === 0) throw new Error(`GLB_UNSUPPORTED_ACCESSOR_${accessor.type}`);
        const componentBytes = COMPONENT_BYTES[accessor.componentType];
        const stride = bufferView.byteStride ?? components * componentBytes;
        const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        const values = new Float64Array(accessor.count * components);
        let write = 0;
        for (let index = 0; index < accessor.count; index += 1) {
            const row = base + index * stride;
            for (let component = 0; component < components; component += 1) {
                const at = row + component * componentBytes;
                switch (accessor.componentType) {
                    case 5126: values[write++] = bin.getFloat32(at, true); break;
                    case 5125: values[write++] = bin.getUint32(at, true); break;
                    case 5123: values[write++] = bin.getUint16(at, true); break;
                    case 5121: values[write++] = bin.getUint8(at); break;
                    default: throw new Error(`GLB_UNSUPPORTED_COMPONENT_${accessor.componentType}`);
                }
            }
        }
        return { values, components, count: accessor.count };
    };

    const triangles: Array<[Vec3, Vec3, Vec3]> = [];
    let objectCount = 0;

    const visitNode = (nodeIndex: number, parent: Mat4) => {
        const node = json.nodes[nodeIndex];
        const local: Mat4 = node.matrix
            ? node.matrix
            : trsMatrix(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
        const world = multiply(parent, local);
        if (node.mesh !== undefined) {
            const mesh = json.meshes[node.mesh];
            for (const primitive of mesh.primitives ?? []) {
                // Mode 4 (TRIANGLES) is the default when omitted.
                if (primitive.mode !== undefined && primitive.mode !== 4) continue;
                if (primitive.attributes?.POSITION === undefined) continue;
                objectCount += 1;
                const position = readAccessorFlat(primitive.attributes.POSITION);
                const positions: Vec3[] = new Array(position.count);
                for (let index = 0; index < position.count; index += 1) {
                    positions[index] = applyMat4(world, {
                        x: position.values[index * 3],
                        y: position.values[index * 3 + 1],
                        z: position.values[index * 3 + 2],
                    });
                }
                if (primitive.indices !== undefined) {
                    const indices = readAccessorFlat(primitive.indices).values;
                    for (let i = 0; i + 2 < indices.length; i += 3) {
                        triangles.push([positions[indices[i]], positions[indices[i + 1]], positions[indices[i + 2]]]);
                    }
                } else {
                    for (let i = 0; i + 2 < positions.length; i += 3) {
                        triangles.push([positions[i], positions[i + 1], positions[i + 2]]);
                    }
                }
            }
        }
        for (const child of node.children ?? []) visitNode(child, world);
    };

    const scene = json.scenes?.[json.scene ?? 0];
    const roots: number[] = scene?.nodes ?? (json.nodes ?? []).map((_: unknown, index: number) => index);
    roots.forEach((root) => visitNode(root, IDENTITY));
    if (triangles.length === 0) throw new Error('MODEL_HAS_NO_TRIANGLES');
    return { triangles, objectCount };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// STL
// ---------------------------------------------------------------------------

function parseStl(buffer: ArrayBuffer): { triangles: Array<[Vec3, Vec3, Vec3]>; objectCount: number } {
    // Binary STL is 80-byte header + count + 50 bytes per triangle. When the
    // size matches exactly, it is binary regardless of what the header says —
    // some exporters put "solid" in binary headers, so sniffing text is wrong.
    const view = new DataView(buffer);
    if (buffer.byteLength >= 84) {
        const count = view.getUint32(80, true);
        if (84 + count * 50 === buffer.byteLength) {
            const triangles: Array<[Vec3, Vec3, Vec3]> = [];
            for (let index = 0; index < count; index += 1) {
                const base = 84 + index * 50 + 12; // skip the normal; it is recomputed
                const point = (at: number): Vec3 => ({
                    x: view.getFloat32(base + at, true),
                    y: view.getFloat32(base + at + 4, true),
                    z: view.getFloat32(base + at + 8, true),
                });
                triangles.push([point(0), point(12), point(24)]);
            }
            if (triangles.length === 0) throw new Error('MODEL_HAS_NO_TRIANGLES');
            return { triangles, objectCount: 1 };
        }
    }

    const text = new TextDecoder().decode(buffer);
    const triangles: Array<[Vec3, Vec3, Vec3]> = [];
    let objectCount = 0;
    let current: Vec3[] = [];
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('solid')) objectCount += 1;
        if (!trimmed.startsWith('vertex')) continue;
        const parts = trimmed.split(/\s+/).slice(1).map(Number);
        current.push({ x: parts[0], y: parts[1], z: parts[2] });
        if (current.length === 3) {
            triangles.push([current[0], current[1], current[2]]);
            current = [];
        }
    }
    if (triangles.length === 0) throw new Error('MODEL_HAS_NO_TRIANGLES');
    return { triangles, objectCount: Math.max(1, objectCount) };
}

// ---------------------------------------------------------------------------
// OBJ
// ---------------------------------------------------------------------------

function parseObj(text: string): { vertices: Vec3[]; faces: number[][]; objectCount: number } {
    const vertices: Vec3[] = [];
    const faces: number[][] = [];
    let objectCount = 0;
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('o ') || trimmed.startsWith('g ')) objectCount += 1;
        if (trimmed.startsWith('v ')) {
            const parts = trimmed.split(/\s+/).slice(1).map(Number);
            vertices.push({ x: parts[0], y: parts[1], z: parts[2] });
            continue;
        }
        if (!trimmed.startsWith('f ')) continue;
        const face = trimmed.split(/\s+/).slice(1).map((token) => {
            // "v", "v/vt", "v//vn", "v/vt/vn" — only the vertex index matters.
            const raw = Number(token.split('/')[0]);
            // OBJ indices are 1-based; negative counts back from the end.
            return raw > 0 ? raw - 1 : vertices.length + raw;
        });
        if (face.length >= 3) faces.push(face);
    }
    if (faces.length === 0) throw new Error('MODEL_HAS_NO_TRIANGLES');
    return { vertices, faces, objectCount: Math.max(1, objectCount) };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function detectFormat(buffer: ArrayBuffer): ModelFormat {
    if (buffer.byteLength >= 4 && new DataView(buffer).getUint32(0, true) === GLB_MAGIC) return 'glb';
    const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(512, buffer.byteLength)));
    // OBJ before STL: an ASCII "solid" header is ambiguous, "v " lines are not.
    if (/^\s*(?:#|v |vn |o |mtllib )/m.test(head)) return 'obj';
    return 'stl';
}

const toArrayBuffer = (source: ArrayBuffer | Uint8Array | string): ArrayBuffer => {
    if (typeof source === 'string') {
        const encoded = new TextEncoder().encode(source);
        return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
    }
    if (source instanceof Uint8Array) {
        return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
    }
    return source;
};

/**
 * Parse a model file into a raw `FoldcraftMesh`.
 *
 * The result is unwelded and unoriented on purpose — `ingestMesh` owns those
 * repairs and their reporting, and callers should always run it next.
 */
export function loadModel(source: ArrayBuffer | Uint8Array | string, options: LoadModelOptions = {}): LoadedModel {
    const buffer = toArrayBuffer(source);
    const format = options.format ?? detectFormat(buffer);

    if (format === 'obj') {
        const parsed = parseObj(new TextDecoder().decode(buffer));
        return {
            mesh: { vertices: parsed.vertices, faces: parsed.faces, unitsPerMm: options.unitsPerMm ?? 1 },
            format,
            objectCount: parsed.objectCount,
        };
    }

    const parsed = format === 'glb' ? parseGlb(buffer) : parseStl(buffer);
    const vertices: Vec3[] = [];
    const faces: number[][] = [];
    parsed.triangles.forEach((triangle) => {
        const base = vertices.length;
        vertices.push(triangle[0], triangle[1], triangle[2]);
        faces.push([base, base + 1, base + 2]);
    });
    return {
        mesh: {
            vertices,
            faces,
            unitsPerMm: options.unitsPerMm ?? (format === 'glb' ? 0.001 : 1),
        },
        format,
        objectCount: parsed.objectCount,
    };
}
