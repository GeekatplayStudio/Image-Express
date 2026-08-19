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
    FoldProgressListener,
    GrooveSpec,
    MachineProfile,
    MaterialSpec,
    SheetLayout,
    SheetSpec,
} from './foldcraftTypes';
import { DEFAULT_MACHINE, DEFAULT_MATERIAL, sheetForMachine } from './foldcraftTypes';
import { meshPreviewSvg, panelsPreviewSvg } from './exportPreview';
import { ingestMesh } from './ingest';
import { loadModel, type LoadModelOptions } from './loadModel';
import { modelExtent } from './planarize';
import { decimateMesh, panelizeMesh } from './simplify';
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
    /**
     * Stage-by-stage progress, with headline stats and preview thumbnails.
     * Previews are only rendered when a listener is attached.
     */
    onProgress?: FoldProgressListener;
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
/**
 * Face budgets, both safety nets rather than quality dials.
 *
 * PRE: generated sculpts arrive at hundreds of thousands of triangles; the
 * linear stages handle that, but nothing downstream benefits from it — a
 * foam build is dozens of panels. Decimating early bounds every later stage.
 *
 * PANEL: what segmentation and packing are expected to chew through. When
 * panelize leaves more (a noisy organic surface at a fine tolerance), the
 * tolerance escalates, and as a last resort the mesh is decimated harder —
 * a coarser model that cuts beats a faithful one that never finishes.
 */
const PRE_DECIMATE_BUDGET = 60_000;
const PANEL_FACE_BUDGET = 2_500;

export function buildFoldPlan(
    source: ArrayBuffer | Uint8Array | string | ReturnType<typeof loadModel>['mesh'],
    options: FoldPipelineOptions = {},
): FoldPipelineResult {
    const machine = options.machine ?? DEFAULT_MACHINE;
    const material = options.material ?? DEFAULT_MATERIAL;
    const sheet = options.sheet ?? sheetForMachine(machine);
    const finishedSizeMm = options.finishedSizeMm ?? DEFAULT_FINISHED_SIZE_MM;
    const warnings: string[] = [];
    const emit = options.onProgress;

    emit?.({ stage: 'load', status: 'start' });
    const raw = typeof source === 'object' && 'vertices' in source
        ? source
        : loadModel(source as ArrayBuffer | Uint8Array | string, options.load).mesh;

    // Bound the work before ANY geometry stage sees it: decimation is the
    // only stage that tolerates raw triangle soup (clustering is itself a
    // weld), and everything else — including ingest's welding and
    // orientation walk — costs per-face. A 56 MB generated sculpt froze the
    // app inside ingest before segmentation ever ran.
    const sourceFaces = raw.faces.length;
    const bounded = sourceFaces > PRE_DECIMATE_BUDGET ? decimateMesh(raw, PRE_DECIMATE_BUDGET) : raw;
    if (bounded !== raw) {
        warnings.push(`Model decimated from ${sourceFaces} to ${bounded.faces.length} faces before panelling.`);
    }

    const ingested = ingestMesh(bounded, { dropShellsBelowAreaFraction: 0.01 });
    warnings.push(...ingested.warnings);
    const working = ingested.mesh;
    emit?.({
        stage: 'load',
        status: 'done',
        stats: { faces: sourceFaces, usedFaces: working.faces.length },
        // Only evaluated when a listener exists — ?. skips the argument too.
        // The thumbnail wants ~1k faces; the working mesh may hold 60k.
        previewSvg: meshPreviewSvg(decimateMesh(working, 1_500)),
    });

    emit?.({ stage: 'lowpoly', status: 'start' });
    let lowPoly = working;
    if (!options.skipPanelize) {
        let tolerance = options.planarToleranceDeg ?? DEFAULT_PLANAR_TOLERANCE_DEG;
        lowPoly = panelizeMesh(working, tolerance).mesh;
        while (lowPoly.faces.length > PANEL_FACE_BUDGET && tolerance < 40) {
            tolerance += 8;
            lowPoly = panelizeMesh(working, tolerance).mesh;
        }
        if (lowPoly.faces.length > PANEL_FACE_BUDGET) {
            // Surface too noisy for tolerance alone: coarsen the mesh itself
            // until the panel count lands. Faceting error grows with each
            // step, but a plan that cuts always beats one that cannot.
            let clusterTarget = PANEL_FACE_BUDGET * 2;
            while (lowPoly.faces.length > PANEL_FACE_BUDGET && clusterTarget >= 250) {
                const coarser = ingestMesh(decimateMesh(working, clusterTarget), {
                    dropShellsBelowAreaFraction: 0.01,
                }).mesh;
                lowPoly = panelizeMesh(coarser, tolerance).mesh;
                clusterTarget = Math.floor(clusterTarget / 2);
            }
            warnings.push(`Surface panelled at ${tolerance}° after extra decimation; result has ${lowPoly.faces.length} panels.`);
        }
    }
    emit?.({
        stage: 'lowpoly',
        status: 'done',
        stats: { faces: working.faces.length, flatFaces: lowPoly.faces.length },
        previewSvg: meshPreviewSvg(lowPoly),
    });

    emit?.({ stage: 'unfold', status: 'start' });
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
    emit?.({
        stage: 'unfold',
        status: 'done',
        stats: {
            panels: panels.length,
            folds: segmented.foldCount,
            seams: segmented.seamCount,
        },
        previewSvg: panelsPreviewSvg(panels),
    });

    emit?.({ stage: 'grooves', status: 'start' });
    let trueVeeCount = 0;
    const grooves = panels.map((panel) => {
        const plan = planGrooves(panel, material, machine);
        warnings.push(...plan.warnings);
        trueVeeCount += plan.trueVeeCount;
        return plan.grooves;
    });
    emit?.({
        stage: 'grooves',
        status: 'done',
        stats: {
            grooves: grooves.reduce((sum, list) => sum + list.length, 0),
            trueVee: trueVeeCount,
        },
    });

    emit?.({ stage: 'layout', status: 'start' });
    const layouts = packSheets(panels, sheet);
    const svgs = layouts.map((layout) => exportSheetSvg(panels, grooves, layout, {}));
    emit?.({
        stage: 'layout',
        status: 'done',
        stats: { sheets: layouts.length },
        previewSvg: svgs[0],
    });

    emit?.({ stage: 'verify', status: 'start' });
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
    emit?.({
        stage: 'verify',
        status: 'done',
        stats: {
            verdict: validation.verdict,
            refoldMaxErrorMm: Number(validation.refoldMaxErrorMm.toFixed(1)),
            signConsistency: Number(validation.foldSignConsistency.toFixed(2)),
        },
    });

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
