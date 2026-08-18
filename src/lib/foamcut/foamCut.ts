/**
 * One-click foam cut — the bridge between the editor and the Foldcraft
 * library.
 *
 * The promise this module keeps: a maker with no computer experience
 * right-clicks the hat they want, presses one button, and receives files
 * ready to cut. Everything a power user could tune stays tunable in the
 * library; everything here is chosen for them:
 *
 *  - finished size defaults to costume scale (280 mm) rather than desk scale,
 *  - 6 mm EVA foam, the stock cosplay armour material,
 *  - the reference ultrasonic cutter, falling back gracefully for others,
 *  - low-poly tolerance picked for "looks like the model, buildable panels".
 *
 * The plan only becomes files when its own validation and the machine
 * simulation both pass — a person who cannot debug a bad net must never
 * receive one.
 */

import {
    buildFoldPlan,
    estimateMinutes,
    ULTRASONIC_TILT_MACHINE,
    type FoldPipelineResult,
} from '../../../packages/foldcraft/src/index';

export type FoamCutFile = {
    filename: string;
    mimeType: string;
    content: string;
};

export type FoamCutResult = {
    files: FoamCutFile[];
    svgs: string[];
    sheetCount: number;
    panelCount: number;
    grooveCount: number;
    estimatedMinutes: number;
    /** 0–100, from fold-sign consistency and refold error. */
    confidencePct: number;
    warnings: string[];
};

export type FoamCutOptions = {
    /** Longest dimension of the finished piece. Default suits wearables. */
    finishedSizeMm?: number;
    planarToleranceDeg?: number;
};

const DEFAULT_FINISHED_SIZE_MM = 280;
const DEFAULT_PLANAR_TOLERANCE_DEG = 14;

const safeName = (name: string) => (
    name.replace(/\.(glb|gltf|stl|obj)$/i, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'model'
);

class FoamCutError extends Error {
    constructor(code: string, public readonly details: string[]) {
        super(code);
        this.name = 'FoamCutError';
    }
}

/**
 * Run the whole pipeline and package the output as downloadable files.
 * Throws `FOAMCUT_PLAN_INVALID` when validation or simulation fails —
 * with the reasons, so the toast can say something useful.
 */
export function planFoamCut(
    model: ArrayBuffer | Uint8Array,
    modelName: string,
    options: FoamCutOptions = {},
): FoamCutResult {
    const result: FoldPipelineResult = buildFoldPlan(model, {
        machine: ULTRASONIC_TILT_MACHINE,
        finishedSizeMm: options.finishedSizeMm ?? DEFAULT_FINISHED_SIZE_MM,
        planarToleranceDeg: options.planarToleranceDeg ?? DEFAULT_PLANAR_TOLERANCE_DEG,
    });

    const failures: string[] = [];
    if (result.validation.verdict === 'fail') failures.push(...result.validation.issues);
    result.simulations.forEach((simulation, index) => {
        simulation.violations.forEach((violation) => {
            failures.push(`Sheet ${index + 1}: ${violation.rule} — ${violation.detail}`);
        });
    });
    if (failures.length > 0) throw new FoamCutError('FOAMCUT_PLAN_INVALID', failures);

    const base = safeName(modelName);
    const files: FoamCutFile[] = [];
    result.svgs.forEach((svg, index) => {
        files.push({ filename: `${base}-sheet${index + 1}.svg`, mimeType: 'image/svg+xml', content: svg });
    });
    result.gcode.forEach((gcode, index) => {
        files.push({ filename: `${base}-sheet${index + 1}.nc`, mimeType: 'text/plain', content: gcode });
    });

    const grooveCount = result.grooves.reduce((sum, panel) => sum + panel.length, 0);
    const confidencePct = Math.round(
        result.validation.foldSignConsistency * 100
        - Math.min(10, result.validation.refoldMaxErrorMm * 10),
    );

    return {
        files,
        svgs: result.svgs,
        sheetCount: result.stats.sheetCount,
        panelCount: result.stats.panelCount,
        grooveCount,
        estimatedMinutes: result.toolpaths.reduce((sum, toolpath) => sum + estimateMinutes(toolpath), 0),
        confidencePct: Math.max(0, Math.min(100, confidencePct)),
        warnings: result.warnings,
    };
}

/**
 * Run the pipeline off the main thread when the environment allows.
 *
 * The plan for a dense generated model takes seconds even with the face
 * budgets; on the main thread that is a frozen window. Where module workers
 * are unavailable (older WebViews, jsdom) the synchronous path still runs,
 * so the feature degrades to slow rather than broken.
 */
export function runFoamCut(
    bytes: ArrayBuffer,
    modelName: string,
    options: FoamCutOptions = {},
): Promise<FoamCutResult> {
    if (typeof Worker === 'undefined') {
        return Promise.resolve(planFoamCut(bytes, modelName, options));
    }
    return new Promise<FoamCutResult>((resolve, reject) => {
        let worker: Worker;
        try {
            worker = new Worker(new URL('./foamCut.worker.ts', import.meta.url));
        } catch {
            // Bundler or CSP said no — degrade to the blocking path.
            try {
                resolve(planFoamCut(bytes, modelName, options));
            } catch (error) {
                reject(error as Error);
            }
            return;
        }
        worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: FoamCutResult; message?: string; details?: string[] }>) => {
            worker.terminate();
            if (event.data.ok && event.data.result) {
                resolve(event.data.result);
                return;
            }
            const error = new Error(event.data.message ?? 'FOAMCUT_FAILED');
            (error as Error & { details?: string[] }).details = event.data.details ?? [];
            reject(error);
        };
        worker.onerror = (event) => {
            worker.terminate();
            // A worker that cannot even start falls back to the sync path.
            try {
                resolve(planFoamCut(bytes, modelName, options));
            } catch (error) {
                reject(error as Error);
            }
            event.preventDefault?.();
        };
        // The buffer transfers rather than copies: 50+ MB models are routine.
        worker.postMessage({ bytes, modelName, options }, [bytes]);
    });
}

/** Hand the files to the user through the browser (works in Electron too). */
export function downloadFoamCutFiles(files: FoamCutFile[]): void {
    files.forEach((file) => {
        const blob = new Blob([file.content], { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    });
}
