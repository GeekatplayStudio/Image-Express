'use client';

import JSZip from 'jszip';

import { createCricutParts, nestCricutParts } from './cricutNesting';
import { buildCricutSheetSvg } from './cricutSvg';
import { signedArea, traceCricutImage } from './cricutTrace';
import type { CricutExportOptions, CricutPlan } from './cricutTypes';

const safeName = (value: string) => value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'design';

export async function buildCricutPlan(
    sourceDataUrl: string,
    options: CricutExportOptions,
    designName = 'design',
): Promise<CricutPlan> {
    const trace = await traceCricutImage(sourceDataUrl, options);
    const parts = createCricutParts(trace, options);
    const layerCount = options.enabled
        ? Math.max(1, Math.ceil(Math.max(0.001, options.targetDepthMm) / Math.max(0.001, options.materialThicknessMm)))
        : 1;
    const packedSheets = nestCricutParts(parts, options);
    const sheets = packedSheets.map((sheet) => ({
        ...sheet,
        svg: buildCricutSheetSvg(sheet, options, designName),
    }));
    const materialAreaMm2 = parts.reduce((sum, part) => {
        const signed = part.contours.reduce((area, contour) => area + signedArea(contour.points), 0);
        return sum + Math.abs(signed);
    }, 0);
    const occupiedAreaMm2 = sheets.length * options.widthMm * options.heightMm;
    return {
        sourceWidthPx: trace.sourceWidthPx,
        sourceHeightPx: trace.sourceHeightPx,
        traceWidthPx: trace.traceWidthPx,
        traceHeightPx: trace.traceHeightPx,
        outputWidthMm: trace.outputWidthMm,
        outputHeightMm: trace.outputHeightMm,
        layerCount,
        parts,
        sheets,
        nodeCount: parts.reduce((sum, part) => sum + part.contours.reduce((nodes, contour) => nodes + contour.points.length, 0), 0),
        originalNodeCount: trace.components.reduce((sum, component) => sum + component.originalNodeCount, 0)
            * layerCount,
        materialAreaMm2,
        occupiedAreaMm2,
        utilizationPercent: occupiedAreaMm2 > 0 ? materialAreaMm2 / occupiedAreaMm2 * 100 : 0,
        monochromeDataUrl: trace.monochromeDataUrl,
    };
}

function manifest(plan: CricutPlan, options: CricutExportOptions, designName: string) {
    return JSON.stringify({
        format: 'Image Express Cricut fabrication manifest',
        version: 1,
        designName,
        units: 'mm',
        sheet: { width: options.widthMm, height: options.heightMm, margin: options.marginMm, gap: options.gapMm },
        tracedSize: { width: plan.outputWidthMm, height: plan.outputHeightMm },
        material: {
            thickness: options.materialThicknessMm,
            targetDepth: options.enabled ? options.targetDepthMm : options.materialThicknessMm,
            layers: plan.layerCount,
        },
        sheets: plan.sheets.map((sheet) => ({
            file: `sheet-${String(sheet.index + 1).padStart(2, '0')}.svg`,
            parts: sheet.placements.map((placement) => ({
                id: placement.part.id,
                layer: placement.part.layerIndex + 1,
                component: placement.part.componentIndex + 1,
                layerDepth: placement.part.layerDepthMm,
                x: placement.xMm,
                y: placement.yMm,
                rotated: placement.rotated,
            })),
        })),
        registrationMarks: options.enabled && options.registrationMarks
            ? { operation: 'score', diameter: options.registrationDiameterMm }
            : null,
    }, null, 2);
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCricutPlan(plan: CricutPlan, options: CricutExportOptions, designName: string) {
    const filename = safeName(designName);
    if (plan.sheets.length === 1) {
        downloadBlob(new Blob([plan.sheets[0].svg], { type: 'image/svg+xml;charset=utf-8' }), `${filename}-cricut.svg`);
        return;
    }
    const zip = new JSZip();
    plan.sheets.forEach((sheet) => {
        zip.file(`sheet-${String(sheet.index + 1).padStart(2, '0')}.svg`, sheet.svg);
    });
    zip.file('manifest.json', manifest(plan, options, designName));
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `${filename}-cricut-sheets.zip`);
}
