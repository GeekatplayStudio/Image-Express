/**
 * Machine layer: toolpaths, G-code, simulation, camera registration, and the
 * full pipeline from model bytes to validated machine output.
 */

import { ingestMesh } from '../src/ingest';
import { segmentIntoPanels } from '../src/segment';
import { planGrooves } from '../src/grooves';
import { packSheets } from '../src/packSheets';

import { buildSheetToolpath, chainSegments } from '../src/machine/toolpath';
import { toGcode } from '../src/machine/gcode';
import { simulateToolpath } from '../src/machine/simulator';
import { applyHomography, homographyFromPairs, registrationErrorMm } from '../src/machine/registration';
import { validateFoldPlan } from '../src/validate';
import { buildFoldPlan } from '../src/buildFoldPlan';
import {
    DEFAULT_MATERIAL,
    ULTRASONIC_TILT_MACHINE,
    sheetForMachine,
    type FlatPanel,
    type GrooveSpec,
    type SheetLayout,
} from '../src/foldcraftTypes';
import { cubeMesh, hemisphereMesh } from './testMeshes';

/** Cube scaled to 100 mm, segmented and grooved on the default machine. */
function cubePlan100mm(): { panels: FlatPanel[]; grooves: GrooveSpec[][]; layout: SheetLayout } {
    const { mesh } = ingestMesh(cubeMesh());
    const scaled = {
        ...mesh,
        vertices: mesh.vertices.map((point) => ({ x: point.x * 100, y: point.y * 100, z: point.z * 100 })),
    };
    const { panels } = segmentIntoPanels(scaled, { maxPanelWidthMm: 580, maxPanelHeightMm: 580 });
    const grooves = panels.map((panel) => planGrooves(panel, DEFAULT_MATERIAL, ULTRASONIC_TILT_MACHINE).grooves);
    const layout = packSheets(panels, sheetForMachine(ULTRASONIC_TILT_MACHINE))[0];
    return { panels, grooves, layout };
}

describe('toolpath', () => {
    it('cuts grooves before outlines so parts stay anchored', () => {
        const { panels, grooves, layout } = cubePlan100mm();
        const toolpath = buildSheetToolpath(panels, grooves, layout, ULTRASONIC_TILT_MACHINE, { thicknessMm: 6 });
        const firstOutline = toolpath.ops.findIndex((op) => op.kind === 'comment' && op.text.includes('outline'));
        const grooveCuts = toolpath.ops.slice(0, firstOutline).filter((op) => op.kind === 'cut');
        expect(grooveCuts.length).toBeGreaterThan(0);
        // Groove passes cut to partial depth only.
        grooveCuts.forEach((op) => {
            if (op.kind === 'cut') expect(-op.z).toBeLessThan(6);
        });
        // Outline cuts pierce the stock.
        const outlineCuts = toolpath.ops.slice(firstOutline).filter((op) => op.kind === 'cut');
        outlineCuts.forEach((op) => {
            if (op.kind === 'cut') expect(-op.z).toBeGreaterThan(6);
        });
    });

    it('chains boundary segments into a closed loop', () => {
        const square = [
            { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
            { a: { x: 10, y: 10 }, b: { x: 0, y: 10 } },
            { a: { x: 10, y: 0 }, b: { x: 10, y: 10 } },
            { a: { x: 0, y: 10 }, b: { x: 0, y: 0 } },
        ];
        const chains = chainSegments(square);
        expect(chains).toHaveLength(1);
        expect(chains[0]).toHaveLength(5); // closed: last point returns to start
    });
});

describe('gcode', () => {
    it('emits grblHAL-safe words with tilt on A and swivel on C', () => {
        const { panels, grooves, layout } = cubePlan100mm();
        const toolpath = buildSheetToolpath(panels, grooves, layout, ULTRASONIC_TILT_MACHINE, { thicknessMm: 6 });
        const gcode = toGcode(toolpath, ULTRASONIC_TILT_MACHINE);
        expect(gcode).toContain('G21');
        expect(gcode).toContain('G90');
        expect(gcode).toContain('M3 S1000');
        expect(gcode).toContain('M5');
        expect(gcode).toMatch(/A45/);     // V-groove wall tilt for 90° folds
        expect(gcode).toMatch(/A-45/);
        expect(gcode.trim().endsWith('M2')).toBe(true);
        // Every cut line carries a feed.
        gcode.split('\n').filter((line) => line.startsWith('G1')).forEach((line) => {
            expect(line).toMatch(/F\d/);
        });
    });

    it('never rotates the blade while it is buried', () => {
        const { panels, grooves, layout } = cubePlan100mm();
        const toolpath = buildSheetToolpath(panels, grooves, layout, ULTRASONIC_TILT_MACHINE, { thicknessMm: 6 });
        const report = simulateToolpath(toolpath, ULTRASONIC_TILT_MACHINE, { stockThicknessMm: 6 });
        expect(report.violations.filter((violation) => violation.rule === 'buried-rotation')).toHaveLength(0);
    });
});

describe('simulator', () => {
    it('passes a well-formed cube toolpath', () => {
        const { panels, grooves, layout } = cubePlan100mm();
        const toolpath = buildSheetToolpath(panels, grooves, layout, ULTRASONIC_TILT_MACHINE, { thicknessMm: 6 });
        const report = simulateToolpath(toolpath, ULTRASONIC_TILT_MACHINE, { stockThicknessMm: 6 });
        expect(report.ok).toBe(true);
        expect(report.stats.maxTiltDeg).toBeCloseTo(45, 4);
        expect(report.stats.maxDepthMm).toBeCloseTo(6.3, 4); // thickness + overcut
        expect(report.stats.cutLengthMm).toBeGreaterThan(0);
    });

    it('flags tilt beyond the machine and travel beyond the bed', () => {
        const report = simulateToolpath({
            sheetIndex: 0,
            cutLengthMm: 0,
            ops: [
                { kind: 'rapid', x: 700, y: 10 },
                { kind: 'cut', x: 700, y: 20, z: -2, tiltDeg: 60, swivelDeg: 0 },
            ],
        }, ULTRASONIC_TILT_MACHINE, { stockThicknessMm: 6 });
        expect(report.ok).toBe(false);
        const rules = report.violations.map((violation) => violation.rule);
        expect(rules).toContain('bed-bounds');
        expect(rules).toContain('tilt-range');
    });

    it('flags a cut deeper than the stock', () => {
        const report = simulateToolpath({
            sheetIndex: 0,
            cutLengthMm: 0,
            ops: [{ kind: 'cut', x: 10, y: 10, z: -20, tiltDeg: 0, swivelDeg: 0 }],
        }, ULTRASONIC_TILT_MACHINE, { stockThicknessMm: 6 });
        expect(report.violations.some((violation) => violation.rule === 'depth-range')).toBe(true);
    });
});

describe('camera registration', () => {
    it('recovers a pure translation exactly', () => {
        const pairs = [
            { camera: { x: 100, y: 100 }, bed: { x: 5, y: 5 } },
            { camera: { x: 500, y: 100 }, bed: { x: 405, y: 5 } },
            { camera: { x: 500, y: 400 }, bed: { x: 405, y: 305 } },
            { camera: { x: 100, y: 400 }, bed: { x: 5, y: 305 } },
        ];
        const h = homographyFromPairs(pairs)!;
        expect(h).not.toBeNull();
        expect(registrationErrorMm(h, pairs)).toBeLessThan(1e-6);
        const mapped = applyHomography(h, { x: 300, y: 250 });
        expect(mapped.x).toBeCloseTo(205, 6);
        expect(mapped.y).toBeCloseTo(155, 6);
    });

    it('absorbs perspective a camera at an angle introduces', () => {
        // Synthetic perspective: bed corners seen as a trapezoid.
        const pairs = [
            { camera: { x: 120, y: 80 }, bed: { x: 0, y: 0 } },
            { camera: { x: 520, y: 95 }, bed: { x: 600, y: 0 } },
            { camera: { x: 560, y: 430 }, bed: { x: 600, y: 600 } },
            { camera: { x: 80, y: 445 }, bed: { x: 0, y: 600 } },
        ];
        const h = homographyFromPairs(pairs)!;
        expect(registrationErrorMm(h, pairs)).toBeLessThan(1e-6);
    });

    it('returns null for degenerate correspondences', () => {
        const collinear = [
            { camera: { x: 0, y: 0 }, bed: { x: 0, y: 0 } },
            { camera: { x: 1, y: 1 }, bed: { x: 10, y: 10 } },
            { camera: { x: 2, y: 2 }, bed: { x: 20, y: 20 } },
            { camera: { x: 3, y: 3 }, bed: { x: 30, y: 30 } },
        ];
        expect(homographyFromPairs(collinear)).toBeNull();
    });
});

describe('validation', () => {
    it('passes a correct segmentation', () => {
        const { mesh } = ingestMesh(cubeMesh());
        const { panels } = segmentIntoPanels(mesh, { maxPanelWidthMm: 100, maxPanelHeightMm: 100 });
        const report = validateFoldPlan(mesh, panels);
        expect(report.verdict).toBe('ok');
        expect(report.foldSignConsistency).toBe(1);
        expect(report.unplacedFaces).toBe(0);
    });

    it('catches a deliberately flipped fold sign', () => {
        const { mesh } = ingestMesh(cubeMesh());
        const { panels } = segmentIntoPanels(mesh, { maxPanelWidthMm: 100, maxPanelHeightMm: 100 });
        panels[0].interiorEdges[0].dihedralDeg = 360 - panels[0].interiorEdges[0].dihedralDeg;
        const report = validateFoldPlan(mesh, panels);
        expect(report.verdict).toBe('fail');
        expect(report.foldSignConsistency).toBeLessThan(1);
        expect(report.issues.join(' ')).toMatch(/wrong shape/);
    });

    it('catches a missing face', () => {
        const { mesh } = ingestMesh(cubeMesh());
        const { panels } = segmentIntoPanels(mesh, { maxPanelWidthMm: 100, maxPanelHeightMm: 100 });
        panels[0].faces.pop();
        const report = validateFoldPlan(mesh, panels);
        expect(report.verdict).toBe('fail');
        expect(report.unplacedFaces).toBe(1);
    });
});

describe('end-to-end pipeline', () => {
    it('turns a cube mesh into validated sheets, SVG, and G-code', () => {
        const result = buildFoldPlan(cubeMesh(), { finishedSizeMm: 100, skipPanelize: true });
        expect(result.validation.verdict).toBe('ok');
        expect(result.stats.panelCount).toBe(1);
        expect(result.stats.sheetCount).toBe(1);
        expect(result.stats.trueVeeCount).toBe(5);
        expect(result.svgs[0]).toContain('id="groove"');
        expect(result.svgs[0]).toContain('data-fiducial');
        expect(result.gcode[0]).toContain('G21');
        expect(result.simulations.every((simulation) => simulation.ok)).toBe(true);
        // 100 mm finished size: the largest panel dimension is 4 faces = 400 mm...
        // scaled to fit: extent 1 unit → 100 mm per unit, net spans 4 units = 400 mm < 580 bed.
        const panel = result.panels[0];
        const span = Math.max(
            panel.boundsMm.maxX - panel.boundsMm.minX,
            panel.boundsMm.maxY - panel.boundsMm.minY,
        );
        expect(span).toBeGreaterThan(200);
        expect(span).toBeLessThanOrEqual(580);
    });

    it('handles a curved helmet-like shell end to end', () => {
        const result = buildFoldPlan(hemisphereMesh(8, 20), { finishedSizeMm: 250 });
        expect(result.validation.verdict).toBe('ok');
        expect(result.validation.foldSignConsistency).toBe(1);
        expect(result.stats.panelCount).toBeLessThanOrEqual(10);
        expect(result.stats.sheetCount).toBeGreaterThan(0);
        expect(result.simulations.every((simulation) => simulation.ok)).toBe(true);
        result.panels.forEach((panel) => expect(panel.mirrored).toBe(false));
    });
});
