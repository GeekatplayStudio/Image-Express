/**
 * Planarisation: the stage that turns a round model into flat panels.
 *
 * The governing property is that the output is *exactly* planar, not nearly so.
 * A panel a degree out of true implies a fold angle the maker cannot hit.
 */

import { ingestMesh } from '../src/ingest';
import { panelizeMesh } from '../src/simplify';
import { flattenPatchRigid } from '../src/flattenRigid';
import { measurePlanarity } from '../src/planarize';
import { buildEdgeMap, faceNormal, dot } from '../src/meshTopology';
import type { FoldcraftMesh, Patch } from '../src/foldcraftTypes';
import { cubeTrianglesMesh, cylinderMesh, hemisphereMesh } from './testMeshes';

const wholeMeshPatch = (mesh: FoldcraftMesh): Patch => ({
    id: 0,
    faces: mesh.faces.map((_, index) => index),
    seedFace: 0,
    regionId: 0,
    kind: 'freeform',
});

describe('panelize', () => {
    it('merges a triangulated cube back into six square panels', () => {
        const { mesh } = ingestMesh(cubeTrianglesMesh());
        expect(mesh.faces).toHaveLength(12);

        const report = panelizeMesh(mesh, 8);
        expect(report.resultFaces).toBe(6);
        expect(report.mesh.faces.every((face) => face.length === 4)).toBe(true);
        expect(report.mesh.vertices).toHaveLength(8);
        // Coplanar merging must not move the surface at all.
        expect(report.maxDeviationMm).toBeLessThan(1e-9);
    });

    it('produces exactly planar faces from a curved surface', () => {
        const { mesh } = ingestMesh(hemisphereMesh(8, 20));
        const report = panelizeMesh(mesh, 12);
        expect(report.resultFaces).toBeLessThan(mesh.faces.length);
        expect(report.planarityErrorDeg).toBeLessThan(0.05);
    });

    /**
     * The guarantee that matters for fabrication: a panel that is not flat
     * cannot be cut from flat stock. It has to hold at every setting, including
     * the coarse ones where greedy region growth produces regions that cannot
     * be flattened and get split into triangles instead.
     */
    it.each([3, 5, 8, 12, 16, 20, 25, 30, 45])('keeps every face flat at %s degrees tolerance', (tolerance) => {
        const { mesh } = ingestMesh(hemisphereMesh(10, 24));
        const report = panelizeMesh(mesh, tolerance);
        expect(report.planarityErrorDeg).toBeLessThan(0.05);
        expect(measurePlanarity(report.mesh)).toBeLessThan(0.05);
    });

    it('trades panel count against fidelity as the tolerance opens up', () => {
        const { mesh } = ingestMesh(hemisphereMesh(10, 24));
        const tight = panelizeMesh(mesh, 5);
        const loose = panelizeMesh(mesh, 20);
        expect(loose.resultFaces).toBeLessThan(tight.resultFaces);
        expect(loose.maxDeviationPercent).toBeGreaterThan(tight.maxDeviationPercent);
        // A coarse facet job still tracks the original silhouette.
        expect(loose.maxDeviationPercent).toBeLessThan(15);
    });

    it('bounds how far planarising may move the surface', () => {
        // An unclamped least-squares snap threw vertices 37% of the model's
        // size at one tolerance, with far smaller values either side.
        const { mesh } = ingestMesh(hemisphereMesh(10, 24));
        [3, 5, 8, 12, 16, 20, 25, 30].forEach((tolerance) => {
            expect(panelizeMesh(mesh, tolerance).maxDeviationPercent).toBeLessThan(15);
        });
    });

    it('keeps faces wound outward so fold signs survive', () => {
        const { mesh } = ingestMesh(hemisphereMesh(6, 16));
        const report = panelizeMesh(mesh, 12);
        const centre = { x: 0, y: 0, z: 0 };
        report.mesh.faces.forEach((face, faceIndex) => {
            const normal = faceNormal(report.mesh, faceIndex);
            const point = report.mesh.vertices[face[0]];
            const outward = { x: point.x - centre.x, y: point.y - centre.y, z: point.z - centre.z };
            expect(dot(normal, outward)).toBeGreaterThan(0);
        });
    });

    it('leaves the mesh manifold and still foldable', () => {
        const { mesh } = ingestMesh(hemisphereMesh(6, 16));
        const report = panelizeMesh(mesh, 12);
        const reingested = ingestMesh(report.mesh);
        expect(reingested.nonManifoldEdges).toBe(0);
        expect(reingested.isConsistentlyOriented).toBe(true);

        const { panel } = flattenPatchRigid(reingested.mesh, wholeMeshPatch(reingested.mesh));
        expect(panel.mirrored).toBe(false);
        expect(panel.maxEdgeErrorPct).toBeLessThan(1e-6);
        const folds = panel.interiorEdges.filter((edge) => edge.direction !== 'flat');
        expect(folds.length).toBeGreaterThan(0);
        // Still a convex shell, so every fold must agree.
        expect(new Set(folds.map((edge) => edge.direction))).toEqual(new Set(['mountain']));
    });

    it('facets a cylinder into flat side panels rather than a smooth tube', () => {
        const { mesh } = ingestMesh(cylinderMesh(24));
        const report = panelizeMesh(mesh, 10);
        expect(report.planarityErrorDeg).toBeLessThan(0.01);
        // The two caps are already flat and must survive as single panels.
        const bigFaces = report.mesh.faces.filter((face) => face.length >= 12);
        expect(bigFaces).toHaveLength(2);
    });

    it('reports a region it could not merge instead of cutting it silently', () => {
        // An annulus has two boundary loops and cannot be one vertex list.
        const outer = 2;
        const inner = 1;
        const segments = 16;
        const vertices = [];
        for (let i = 0; i < segments; i += 1) {
            const theta = (i / segments) * Math.PI * 2;
            vertices.push({ x: Math.cos(theta) * outer, y: 0, z: Math.sin(theta) * outer });
        }
        for (let i = 0; i < segments; i += 1) {
            const theta = (i / segments) * Math.PI * 2;
            vertices.push({ x: Math.cos(theta) * inner, y: 0, z: Math.sin(theta) * inner });
        }
        const faces: number[][] = [];
        for (let i = 0; i < segments; i += 1) {
            const next = (i + 1) % segments;
            faces.push([i, next, segments + next, segments + i]);
        }
        const brim: FoldcraftMesh = { vertices, faces, unitsPerMm: 1 };
        const report = panelizeMesh(brim, 8);
        expect(report.holedRegions).toBe(1);
        expect(report.resultFaces).toBe(segments);
    });

    it('measures planarity as zero for a mesh that is already flat', () => {
        const { mesh } = ingestMesh(cubeTrianglesMesh());
        expect(measurePlanarity(mesh)).toBeLessThan(1e-9);
    });

    it('does not strand vertices or edges', () => {
        const { mesh } = ingestMesh(hemisphereMesh(6, 16));
        const report = panelizeMesh(mesh, 12);
        const referenced = new Set(report.mesh.faces.flat());
        expect(referenced.size).toBe(report.mesh.vertices.length);
        buildEdgeMap(report.mesh).forEach((uses) => expect(uses.length).toBeLessThanOrEqual(2));
    });
});
