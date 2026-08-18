/**
 * Foldcraft — the composed pipeline.
 *
 * One call from model bytes to machine-ready output:
 *
 *   load → ingest → panelize → segment → scale → grooves → pack → toolpaths
 *   → validate
 *
 * Every stage stays independently callable; this module only sequences them
 * and owns the one concern no single stage can: units. Segmentation runs in
 * model units with sheet limits converted down, panels are scaled to finished
 * millimetres immediately after, and everything downstream — grooves, packing,
 * SVG, G-code — speaks millimetres only.
 */

import type {
    FlatPanel,
    FoldBackReport,
    GrooveSpec,
    MachineProfile,
    MaterialSpec,
    SheetLayout,
    SheetSpec,
} from './foldcraftTypes';
import { DEFAULT_MACHINE, DEFAULT_MATERIAL, sheetForMachine } from './foldcraftTypes';
import { ingestMesh } from './ingest';
import { loadModel, type LoadModelOptions } from './loadModel';
import { modelExtent } from './planarize';
import { panelizeMesh } from './simplify';
import { segmentIntoPanels } from './segment';
import { planGrooves } from './grooves';
import { packSheets } from './packSheets';
import { exportSheetSvg } from './exportSvg';
import { buildSheetToolpath, type Toolpath } from './machine/toolpath';
import { toGcode } from './machine/gcode';
import { simulateToolpath, type SimulationReport } from './machine/simulator';
import { validateFoldPlan } from './validate';

export type FoldPipelineOptions = {
    machine?: MachineProfile;
    material?: MaterialSpec;
    /** Longest dimension of the finished object. */
    finishedSizeMm?: number;
    /** Faceting tolerance for panelize; higher = fewer, larger panels. */
    planarToleranceDeg?: number;
    /** Skip low-poly conversion for a model that is already faceted. */
    skipPanelize?: boolean;
    sheet?: SheetSpec;
    load?: LoadModelOptions;
};

export type FoldPipelineResult = {
    panels: FlatPanel[];
    grooves: GrooveSpec[][];
    layouts: SheetLayout[];
    svgs: string[];
    toolpaths: Toolpath[];
    gcode: string[];
    validation: FoldBackReport;
    simulations: SimulationReport[];
    warnings: string[];
    stats: {
        sourceFaces: number;
        panelFaces: number;
        panelCount: number;
        foldCount: number;
        seamCount: number;
        sheetCount: number;
        trueVeeCount: number;
        finishedSizeMm: number;
        scaleMmPerUnit: number;
    };
};

const DEFAULT_FINISHED_SIZE_MM = 180;
const DEFAULT_PLANAR_TOLERANCE_DEG = 14;

export function buildFoldPlan(
    source: ArrayBuffer | Uint8Array | string | ReturnType<typeof loadModel>['mesh'],
    options: FoldPipelineOptions = {},
): FoldPipelineResult {
    const machine = options.machine ?? DEFAULT_MACHINE;
    const material = options.material ?? DEFAULT_MATERIAL;
    const sheet = options.sheet ?? sheetForMachine(machine);
    const finishedSizeMm = options.finishedSizeMm ?? DEFAULT_FINISHED_SIZE_MM;
    const warnings: string[] = [];

    const raw = typeof source === 'object' && 'vertices' in source
        ? source
        : loadModel(source as ArrayBuffer | Uint8Array | string, options.load).mesh;

    const ingested = ingestMesh(raw);
    warnings.push(...ingested.warnings);
    const sourceFaces = ingested.mesh.faces.length;

    const lowPoly = options.skipPanelize
        ? ingested.mesh
        : panelizeMesh(ingested.mesh, options.planarToleranceDeg ?? DEFAULT_PLANAR_TOLERANCE_DEG).mesh;

    // Segmentation runs in model units; give it the sheet in those units.
    const extent = modelExtent(lowPoly);
    const scaleMmPerUnit = finishedSizeMm / extent;
    const printableWidth = (sheet.widthMm - sheet.marginMm * 2) / scaleMmPerUnit;
    const printableHeight = (sheet.heightMm - sheet.marginMm * 2) / scaleMmPerUnit;
    const segmented = segmentIntoPanels(lowPoly, {
        maxPanelWidthMm: printableWidth,
        maxPanelHeightMm: printableHeight,
    });

    const panels = segmented.panels.map((panel): FlatPanel => ({
        ...panel,
        faces: panel.faces.map((face) => ({
            ...face,
            points: face.points.map((point) => ({ x: point.x * scaleMmPerUnit, y: point.y * scaleMmPerUnit })),
        })),
        interiorEdges: panel.interiorEdges.map((edge) => ({
            ...edge,
            a: { x: edge.a.x * scaleMmPerUnit, y: edge.a.y * scaleMmPerUnit },
            b: { x: edge.b.x * scaleMmPerUnit, y: edge.b.y * scaleMmPerUnit },
        })),
        boundaryEdges: panel.boundaryEdges.map((edge) => ({
            ...edge,
            a: { x: edge.a.x * scaleMmPerUnit, y: edge.a.y * scaleMmPerUnit },
            b: { x: edge.b.x * scaleMmPerUnit, y: edge.b.y * scaleMmPerUnit },
        })),
        boundsMm: {
            minX: panel.boundsMm.minX * scaleMmPerUnit,
            minY: panel.boundsMm.minY * scaleMmPerUnit,
            maxX: panel.boundsMm.maxX * scaleMmPerUnit,
            maxY: panel.boundsMm.maxY * scaleMmPerUnit,
        },
    }));

    let trueVeeCount = 0;
    const grooves = panels.map((panel) => {
        const plan = planGrooves(panel, material, machine);
        warnings.push(...plan.warnings);
        trueVeeCount += plan.trueVeeCount;
        return plan.grooves;
    });

    const layouts = packSheets(panels, sheet);
    const svgs = layouts.map((layout) => exportSheetSvg(panels, grooves, layout, {}));
    const toolpaths = layouts.map((layout) => buildSheetToolpath(panels, grooves, layout, machine, {
        thicknessMm: material.thicknessMm,
    }));
    const gcode = machine.output === 'gcode'
        ? toolpaths.map((toolpath) => toGcode(toolpath, machine))
        : [];
    const simulations = toolpaths.map((toolpath) => simulateToolpath(toolpath, machine, {
        stockThicknessMm: material.thicknessMm,
    }));
    simulations.forEach((simulation, index) => {
        simulation.violations.forEach((violation) => {
            warnings.push(`Sheet ${index + 1} toolpath: ${violation.rule} — ${violation.detail}`);
        });
    });

    const validation = validateFoldPlan(lowPoly, panels, scaleMmPerUnit);

    return {
        panels,
        grooves,
        layouts,
        svgs,
        toolpaths,
        gcode,
        validation,
        simulations,
        warnings: [...new Set(warnings)],
        stats: {
            sourceFaces,
            panelFaces: panels.reduce((sum, panel) => sum + panel.faces.length, 0),
            panelCount: panels.length,
            foldCount: segmented.foldCount,
            seamCount: segmented.seamCount,
            sheetCount: layouts.length,
            trueVeeCount,
            finishedSizeMm,
            scaleMmPerUnit: Number(scaleMmPerUnit.toFixed(6)),
        },
    };
}
