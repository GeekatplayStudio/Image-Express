/**
 * Property tests for the two defects that made papercraft nets unfoldable.
 *
 * The governing property: on a closed convex solid every interior edge is the
 * same kind of fold. Any implementation that labels some of a cube's twelve
 * identical 90 degree edges "mountain" and others "valley" is wrong, and that
 * is exactly what the papercraft module did.
 */

import { ingestMesh } from '../src/ingest';
import { flattenPatchRigid } from '../src/flattenRigid';
import { buildEdgeMap, dihedralDegrees, faceNormal, dot, faceCentroid, sub, normalize } from '../src/meshTopology';
import type { FoldcraftMesh, Patch } from '../src/foldcraftTypes';
import {
    cubeMesh,
    cubeTrianglesMesh,
    cylinderMesh,
    hemisphereMesh,
    icosahedronMesh,
    invertedCubeMesh,
    scrambledCubeMesh,
    splitVertexCubeMesh,
    tetrahedronMesh,
} from './testMeshes';

const wholeMeshPatch = (mesh: FoldcraftMesh): Patch => ({
    id: 0,
    faces: mesh.faces.map((_, index) => index),
    seedFace: 0,
    regionId: 0,
    kind: 'freeform',
});

/** Every interior dihedral, measured against the parent face's winding. */
function interiorDihedrals(mesh: FoldcraftMesh): number[] {
    const edges = buildEdgeMap(mesh);
    const angles: number[] = [];
    edges.forEach((uses) => {
        if (uses.length !== 2) return;
        angles.push(dihedralDegrees(mesh, uses[0], uses[1].faceIndex));
    });
    return angles;
}

describe('ingest', () => {
    it('welds duplicated corners into a closed manifold', () => {
        const report = ingestMesh(splitVertexCubeMesh());
        expect(report.weldedVertices).toBe(16); // 24 face corners collapse to 8
        expect(report.mesh.vertices).toHaveLength(8);
        expect(report.isClosed).toBe(true);
        expect(report.nonManifoldEdges).toBe(0);
        expect(report.boundaryEdges).toBe(0);
    });

    it('leaves an already-correct mesh alone', () => {
        const report = ingestMesh(cubeMesh());
        expect(report.reorientedFaces).toBe(0);
        expect(report.isConsistentlyOriented).toBe(true);
        expect(report.isClosed).toBe(true);
    });

    it('turns an inside-out solid outward', () => {
        const report = ingestMesh(invertedCubeMesh());
        expect(report.isConsistentlyOriented).toBe(true);
        // Outward normals point away from the centre of the cube.
        report.mesh.faces.forEach((_, faceIndex) => {
            const away = normalize(sub(faceCentroid(report.mesh, faceIndex), { x: 0.5, y: 0.5, z: 0.5 }));
            expect(dot(away, faceNormal(report.mesh, faceIndex))).toBeGreaterThan(0.9);
        });
    });

    it('repairs a mesh whose faces disagree with each other', () => {
        const before = scrambledCubeMesh();
        const edgesBefore = buildEdgeMap(before);
        let disagreeing = 0;
        edgesBefore.forEach((uses) => {
            if (uses.length === 2 && !(uses[0].from === uses[1].to && uses[0].to === uses[1].from)) disagreeing += 1;
        });
        expect(disagreeing).toBeGreaterThan(0);

        const report = ingestMesh(before);
        expect(report.isConsistentlyOriented).toBe(true);
        expect(report.reorientedFaces).toBeGreaterThan(0);
    });

    it('reports an open shell as open without failing', () => {
        const report = ingestMesh(hemisphereMesh(4, 10));
        expect(report.isClosed).toBe(false);
        expect(report.boundaryEdges).toBe(10);
        expect(report.isConsistentlyOriented).toBe(true);
    });
});

describe('dihedral sign', () => {
    it.each([
        ['cube', cubeMesh()],
        ['cube (triangulated)', cubeTrianglesMesh()],
        ['tetrahedron', tetrahedronMesh()],
        ['icosahedron', icosahedronMesh()],
        ['hemisphere 4x10', hemisphereMesh(4, 10)],
        ['hemisphere 6x16', hemisphereMesh(6, 16)],
        ['cylinder', cylinderMesh(16)],
    ])('is convex everywhere on %s', (_name, source) => {
        const { mesh } = ingestMesh(source);
        const angles = interiorDihedrals(mesh).filter((angle) => Math.abs(angle - 180) > 0.5);
        expect(angles.length).toBeGreaterThan(0);
        // Convex solid: every fold is under 180 degrees seen from outside.
        // The old implementation split these roughly evenly above and below.
        expect(angles.every((angle) => angle < 180)).toBe(true);
    });

    it('measures a cube fold as exactly 90 degrees', () => {
        const { mesh } = ingestMesh(cubeMesh());
        const angles = interiorDihedrals(mesh);
        expect(angles).toHaveLength(12);
        angles.forEach((angle) => expect(angle).toBeCloseTo(90, 6));
    });

    it('measures a tetrahedron fold as the expected 70.53 degrees', () => {
        const { mesh } = ingestMesh(tetrahedronMesh());
        const expected = Math.acos(1 / 3) * 180 / Math.PI;
        interiorDihedrals(mesh).forEach((angle) => expect(angle).toBeCloseTo(expected, 4));
    });

    it('does not depend on vertex numbering', () => {
        // Re-label the cube's vertices; the folds must not change.
        const source = cubeMesh();
        const permutation = [5, 2, 7, 0, 3, 6, 1, 4];
        const shuffled: FoldcraftMesh = {
            vertices: permutation.map((index) => source.vertices[index]),
            faces: source.faces.map((face) => face.map((index) => permutation.indexOf(index))),
            unitsPerMm: 1,
        };
        const angles = interiorDihedrals(ingestMesh(shuffled).mesh);
        expect(angles).toHaveLength(12);
        angles.forEach((angle) => expect(angle).toBeCloseTo(90, 6));
    });
});

describe('rigid flattening', () => {
    it.each([
        ['cube', cubeMesh()],
        ['tetrahedron', tetrahedronMesh()],
        ['icosahedron', icosahedronMesh()],
        ['hemisphere 4x10', hemisphereMesh(4, 10)],
    ])('never mirrors a panel from %s', (_name, source) => {
        const { mesh } = ingestMesh(source);
        const { panel } = flattenPatchRigid(mesh, wholeMeshPatch(mesh));
        expect(panel.mirrored).toBe(false);
        expect(panel.faces.length).toBeGreaterThan(0);
    });

    it.each([
        ['cube', cubeMesh()],
        ['icosahedron', icosahedronMesh()],
        ['hemisphere 4x10', hemisphereMesh(4, 10)],
    ])('labels every fold the same direction on convex %s', (_name, source) => {
        const { mesh } = ingestMesh(source);
        const { panel } = flattenPatchRigid(mesh, wholeMeshPatch(mesh));
        const folds = panel.interiorEdges.filter((edge) => edge.direction !== 'flat');
        expect(folds.length).toBeGreaterThan(0);
        expect(new Set(folds.map((edge) => edge.direction)).size).toBe(1);
        expect(folds[0].direction).toBe('mountain');
    });

    it('preserves every edge length', () => {
        const { mesh } = ingestMesh(icosahedronMesh());
        const { panel } = flattenPatchRigid(mesh, wholeMeshPatch(mesh));
        expect(panel.maxEdgeErrorPct).toBeLessThan(1e-6);
    });

    it('places a cube net without overlap and keeps its folds at 90 degrees', () => {
        const { mesh } = ingestMesh(cubeMesh());
        const { panel, unplacedFaces } = flattenPatchRigid(mesh, wholeMeshPatch(mesh));
        expect(panel.faces.length + unplacedFaces.length).toBe(6);
        panel.interiorEdges.forEach((edge) => expect(edge.dihedralDeg).toBeCloseTo(90, 6));
    });

    it('reports faces it could not place instead of silently dropping them', () => {
        const { mesh } = ingestMesh(icosahedronMesh());
        const { panel, unplacedFaces } = flattenPatchRigid(mesh, wholeMeshPatch(mesh));
        expect(panel.faces.length + unplacedFaces.length).toBe(mesh.faces.length);
        expect(new Set(unplacedFaces).size).toBe(unplacedFaces.length);
    });
});
