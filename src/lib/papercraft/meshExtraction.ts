import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { MeshTriangle, Point3 } from './papercraftTypes';

type PointBucket = Point3 & { count: number };

function worldPoint(
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    index: number,
    matrix: THREE.Matrix4,
): Point3 {
    const point = new THREE.Vector3(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
    point.applyMatrix4(matrix);
    return { x: point.x, y: point.y, z: point.z };
}

function meshTriangles(mesh: THREE.Mesh, startId: number): MeshTriangle[] {
    const position = mesh.geometry.getAttribute('position');
    if (!position) return [];
    const index = mesh.geometry.getIndex();
    const count = index?.count ?? position.count;
    const triangles: MeshTriangle[] = [];
    for (let offset = 0; offset + 2 < count; offset += 3) {
        const indices = [0, 1, 2].map((step) => index ? index.getX(offset + step) : offset + step);
        const points = indices.map((pointIndex) => worldPoint(position, pointIndex, mesh.matrixWorld)) as [Point3, Point3, Point3];
        const ab = new THREE.Vector3(points[1].x - points[0].x, points[1].y - points[0].y, points[1].z - points[0].z);
        const ac = new THREE.Vector3(points[2].x - points[0].x, points[2].y - points[0].y, points[2].z - points[0].z);
        if (ab.cross(ac).lengthSq() < 1e-14) continue;
        triangles.push({ id: startId + triangles.length, points });
    }
    return triangles;
}

function clusteredTriangles(input: MeshTriangle[], divisions: number): MeshTriangle[] {
    const minima = { x: Infinity, y: Infinity, z: Infinity };
    const maxima = { x: -Infinity, y: -Infinity, z: -Infinity };
    input.forEach((triangle) => triangle.points.forEach((point) => {
        minima.x = Math.min(minima.x, point.x);
        minima.y = Math.min(minima.y, point.y);
        minima.z = Math.min(minima.z, point.z);
        maxima.x = Math.max(maxima.x, point.x);
        maxima.y = Math.max(maxima.y, point.y);
        maxima.z = Math.max(maxima.z, point.z);
    }));
    const spans = {
        x: Math.max(1e-9, maxima.x - minima.x),
        y: Math.max(1e-9, maxima.y - minima.y),
        z: Math.max(1e-9, maxima.z - minima.z),
    };
    const keyFor = (point: Point3) => (['x', 'y', 'z'] as const).map((axis) => (
        Math.min(divisions - 1, Math.floor(((point[axis] - minima[axis]) / spans[axis]) * divisions))
    )).join(',');
    const buckets = new Map<string, PointBucket>();
    input.forEach((triangle) => triangle.points.forEach((point) => {
        const key = keyFor(point);
        const bucket = buckets.get(key) ?? { x: 0, y: 0, z: 0, count: 0 };
        bucket.x += point.x;
        bucket.y += point.y;
        bucket.z += point.z;
        bucket.count += 1;
        buckets.set(key, bucket);
    }));
    const centers = new Map([...buckets].map(([key, bucket]) => [key, {
        x: bucket.x / bucket.count,
        y: bucket.y / bucket.count,
        z: bucket.z / bucket.count,
    }]));
    const seen = new Set<string>();
    const output: MeshTriangle[] = [];
    input.forEach((triangle) => {
        const keys = triangle.points.map(keyFor);
        if (new Set(keys).size < 3) return;
        const faceKey = [...keys].sort().join('|');
        if (seen.has(faceKey)) return;
        seen.add(faceKey);
        output.push({
            id: output.length,
            points: keys.map((key) => centers.get(key)!) as [Point3, Point3, Point3],
        });
    });
    return output;
}

export function simplifyMeshTriangles(input: MeshTriangle[], faceQuota: number): MeshTriangle[] {
    if (input.length <= faceQuota) return input;
    const candidates = [2, 3, 4, 6, 8, 12, 16, 24, 32];
    let best = clusteredTriangles(input, candidates[0]);
    for (const divisions of candidates.slice(1)) {
        const candidate = clusteredTriangles(input, divisions);
        if (candidate.length > faceQuota) break;
        if (candidate.length > best.length) best = candidate;
    }
    return best.length > 0 ? best : input;
}

export async function extractModelTriangles(modelUrl: string, maxFaces: number): Promise<MeshTriangle[]> {
    const gltf = await new GLTFLoader().loadAsync(modelUrl);
    gltf.scene.updateMatrixWorld(true);
    const components: MeshTriangle[][] = [];
    gltf.scene.traverse((object) => {
        if (!(object as THREE.Mesh).isMesh) return;
        const triangles = meshTriangles(object as THREE.Mesh, 0);
        if (triangles.length > 0) components.push(triangles);
    });
    const sourceFaces = components.reduce((sum, triangles) => sum + triangles.length, 0);
    if (sourceFaces === 0) throw new Error('MODEL_HAS_NO_TRIANGLES');

    const output: MeshTriangle[] = [];
    components.forEach((triangles) => {
        const quota = Math.max(4, Math.round(maxFaces * triangles.length / sourceFaces));
        simplifyMeshTriangles(triangles, quota).forEach((triangle) => {
            output.push({ ...triangle, id: output.length });
        });
    });
    if (output.length === 0) throw new Error('MODEL_SIMPLIFICATION_FAILED');
    const capped = output.length > maxFaces ? simplifyMeshTriangles(output, maxFaces) : output;
    return capped.map((triangle, id) => ({ ...triangle, id }));
}
