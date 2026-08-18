/**
 * Groove geometry.
 *
 * The governing property is physical: a groove of included angle α closes
 * exactly when the panel has turned through α, so α must equal the turn the
 * fold needs. Get it wrong and the assembled object is the wrong shape even
 * though every panel was cut correctly.
 */

import { ingestMesh } from '../src/ingest';
import { flattenPatchRigid } from '../src/flattenRigid';
import { planGrooves, requiredBladeTiltDeg } from '../src/grooves';
import {
    CRICUT_MAKER_MACHINE,
    DEFAULT_MATERIAL,
    ULTRASONIC_TILT_MACHINE,
    type FlatPanel,
    type FoldcraftMesh,
    type MachineProfile,
    type Patch,
} from '../src/foldcraftTypes';
import { cubeMesh, icosahedronMesh, tetrahedronMesh } from './testMeshes';

const wholeMeshPatch = (mesh: FoldcraftMesh): Patch => ({
    id: 0,
    faces: mesh.faces.map((_, index) => index),
    seedFace: 0,
    regionId: 0,
    kind: 'freeform',
});

const panelFor = (source: FoldcraftMesh): FlatPanel => {
    const { mesh } = ingestMesh(source);
    return flattenPatchRigid(mesh, wholeMeshPatch(mesh)).panel;
};

/** A panel with one synthetic fold at a chosen dihedral. */
const panelWithDihedral = (dihedralDeg: number): FlatPanel => ({
    patchId: 0,
    kind: 'freeform',
    faces: [],
    interiorEdges: [{
        edgeKey: '0:1',
        a: { x: 0, y: 0 },
        b: { x: 100, y: 0 },
        dihedralDeg,
        direction: dihedralDeg < 180 ? 'mountain' : 'valley',
        parentFace: 0,
        childFace: 1,
    }],
    boundaryEdges: [],
    boundsMm: { minX: 0, minY: 0, maxX: 100, maxY: 0 },
    mirrored: false,
    maxEdgeErrorPct: 0,
    method: 'rigid',
});

const wideTilt: MachineProfile = { ...ULTRASONIC_TILT_MACHINE, maxBladeTiltDeg: 89 };

describe('groove angle', () => {
    it('is the turn the fold needs, so groove and dihedral sum to 180', () => {
        [60, 90, 100, 120, 150, 179].forEach((dihedral) => {
            const { grooves } = planGrooves(panelWithDihedral(dihedral), DEFAULT_MATERIAL, wideTilt);
            const groove = grooves[0];
            if (groove.method === 'score' || groove.method === 'through-cut') return;
            expect(groove.grooveAngleDeg + groove.dihedralDeg).toBeCloseTo(180, 6);
        });
    });

    it('matches the worked widths for 6 mm foam with a 0.5 mm hinge', () => {
        // depth 5.5 mm, width = 2 * 5.5 * tan(alpha / 2)
        const expected: Array<[number, number]> = [
            [90, 11.0],   // right angle
            [120, 6.35],
            [140, 4.0],
        ];
        expected.forEach(([dihedral, width]) => {
            const { grooves } = planGrooves(panelWithDihedral(dihedral), DEFAULT_MATERIAL, wideTilt);
            expect(grooves[0].widthMm).toBeCloseTo(width, 1);
        });
    });

    it('cuts a valley fold from the opposite face', () => {
        const mountain = planGrooves(panelWithDihedral(90), DEFAULT_MATERIAL, wideTilt).grooves[0];
        const valley = planGrooves(panelWithDihedral(270), DEFAULT_MATERIAL, wideTilt).grooves[0];
        expect(mountain.side).toBe('inside');
        expect(valley.side).toBe('outside');
        // Mirror-image folds want an identical groove, just on the other face.
        expect(valley.grooveAngleDeg).toBeCloseTo(mountain.grooveAngleDeg, 6);
        expect(valley.widthMm).toBeCloseTo(mountain.widthMm, 6);
    });

    it('scores rather than grooves a fold the foam can simply bend through', () => {
        const { grooves } = planGrooves(panelWithDihedral(165), DEFAULT_MATERIAL, wideTilt);
        expect(grooves[0].method).toBe('score');
        expect(grooves[0].widthMm).toBe(0);
    });

    it('cuts apart a fold too sharp to hinge', () => {
        const plan = planGrooves(panelWithDihedral(30), DEFAULT_MATERIAL, wideTilt);
        expect(plan.grooves[0].method).toBe('through-cut');
        expect(plan.grooves[0].depthMm).toBe(DEFAULT_MATERIAL.thicknessMm);
        expect(plan.warnings.join(' ')).toMatch(/sharper than/);
    });
});

describe('machine capability', () => {
    it('cuts a true V when the blade reaches half the groove angle', () => {
        const { grooves, trueVeeCount } = planGrooves(
            panelWithDihedral(90),
            DEFAULT_MATERIAL,
            ULTRASONIC_TILT_MACHINE,
        );
        expect(trueVeeCount).toBe(1);
        expect(grooves[0].method).toBe('v-groove');
        // Two passes, one per wall, tilted to half the groove angle each way.
        expect(grooves[0].passes).toHaveLength(2);
        expect(grooves[0].passes[0].bladeTiltDeg).toBeCloseTo(45, 6);
        expect(grooves[0].passes[1].bladeTiltDeg).toBeCloseTo(-45, 6);
        expect(grooves[0].passes.every((pass) => pass.depthMm === 5.5)).toBe(true);
    });

    it('falls back to a channel when the blade cannot tilt, keeping the width', () => {
        const tilting = planGrooves(panelWithDihedral(90), DEFAULT_MATERIAL, ULTRASONIC_TILT_MACHINE);
        const dragging = planGrooves(panelWithDihedral(90), DEFAULT_MATERIAL, CRICUT_MAKER_MACHINE);
        expect(dragging.grooves[0].method).toBe('channel');
        expect(dragging.trueVeeCount).toBe(0);
        // The opening is what sets the fold angle, so it must not change.
        expect(dragging.grooves[0].widthMm).toBeCloseTo(tilting.grooves[0].widthMm, 6);
        expect(dragging.warnings.join(' ')).toMatch(/blade tilt/);
    });

    it('puts the channel walls exactly a groove-width apart', () => {
        const { grooves } = planGrooves(panelWithDihedral(90), DEFAULT_MATERIAL, CRICUT_MAKER_MACHINE);
        const offsets = grooves[0].passes.map((pass) => pass.offsetMm).sort((a, b) => a - b);
        expect(offsets[offsets.length - 1] - offsets[0]).toBeCloseTo(grooves[0].widthMm, 6);
    });

    it('warns rather than silently under-cutting when tilt falls short', () => {
        const limited: MachineProfile = { ...ULTRASONIC_TILT_MACHINE, maxBladeTiltDeg: 20 };
        const plan = planGrooves(panelWithDihedral(90), DEFAULT_MATERIAL, limited);
        // 90 degrees of fold wants 45 degrees of tilt; 20 is not enough.
        expect(plan.trueVeeCount).toBe(0);
        expect(plan.warnings).toHaveLength(1);
        expect(plan.warnings[0]).toMatch(/45\.0° of blade tilt/);
    });

    it('reports the tilt range a machine would need for a given model', () => {
        // A cube folds at 90 degrees throughout, so it needs 45 degrees of tilt.
        expect(requiredBladeTiltDeg([panelFor(cubeMesh())], DEFAULT_MATERIAL)).toBeCloseTo(45, 4);
        // A tetrahedron's 70.53 degree folds need more.
        const tetra = requiredBladeTiltDeg([panelFor(tetrahedronMesh())], DEFAULT_MATERIAL);
        expect(tetra).toBeCloseTo((180 - Math.acos(1 / 3) * 180 / Math.PI) / 2, 3);
        expect(tetra).toBeGreaterThan(45);
    });
});

describe('grooves on real geometry', () => {
    it('gives a cube twelve identical right-angle grooves', () => {
        const plan = planGrooves(panelFor(cubeMesh()), DEFAULT_MATERIAL, ULTRASONIC_TILT_MACHINE);
        expect(plan.grooves.length).toBeGreaterThan(0);
        plan.grooves.forEach((groove) => {
            expect(groove.dihedralDeg).toBeCloseTo(90, 4);
            expect(groove.grooveAngleDeg).toBeCloseTo(90, 4);
            expect(groove.widthMm).toBeCloseTo(11, 1);
            expect(groove.side).toBe('inside');
            expect(groove.method).toBe('v-groove');
        });
    });

    it('draws groove outlines the width of the groove', () => {
        const plan = planGrooves(panelFor(icosahedronMesh()), DEFAULT_MATERIAL, ULTRASONIC_TILT_MACHINE);
        plan.grooves.filter((groove) => groove.widthMm > 0).forEach((groove) => {
            expect(groove.outline).toHaveLength(4);
            const across = Math.hypot(
                groove.outline[0].x - groove.outline[3].x,
                groove.outline[0].y - groove.outline[3].y,
            );
            expect(across).toBeCloseTo(groove.widthMm, 6);
        });
    });

    it('keeps every groove on the inside face of a convex solid', () => {
        const plan = planGrooves(panelFor(icosahedronMesh()), DEFAULT_MATERIAL, ULTRASONIC_TILT_MACHINE);
        expect(plan.grooves.every((groove) => groove.side === 'inside')).toBe(true);
    });
});
