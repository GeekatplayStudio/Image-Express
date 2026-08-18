/**
 * Foldcraft S8 — SVG export.
 *
 * One SVG per sheet, dimensioned in real millimetres, with one layer per
 * operation so cutting software can address them separately:
 *
 *   #registration  corner fiducials for overhead-camera alignment
 *   #cut           through-cuts (panel outlines, through-cut folds)
 *   #groove        material-removal outlines for fold grooves
 *   #score         partial-depth fold lines
 *   #labels        panel ids and matching seam numbers for assembly
 *
 * Machine-readable data attributes carry the numbers a post-processor needs:
 * every groove line has its dihedral, groove angle, depth, and side; every
 * seam label pairs with the identical number on the mating panel.
 */

import type { FlatPanel, GrooveSpec, SheetLayout, Vec2 } from './foldcraftTypes';
import { placePoint } from './packSheets';

const mm = (value: number) => Number(value.toFixed(3));
const pointText = (point: Vec2) => `${mm(point.x)},${mm(point.y)}`;

export type SvgExportOptions = {
    /** Diameter of the corner registration fiducials; 0 disables them. */
    fiducialMm?: number;
    labelEdges?: boolean;
};

/** Seam ids: the same mesh edge cut on two panels gets one shared number. */
export function seamLabels(panels: FlatPanel[]): Map<string, number> {
    const counts = new Map<string, number>();
    panels.forEach((panel) => panel.boundaryEdges.forEach((edge) => {
        if (edge.seam) counts.set(edge.edgeKey, (counts.get(edge.edgeKey) ?? 0) + 1);
    }));
    const labels = new Map<string, number>();
    let next = 1;
    counts.forEach((count, edgeKey) => {
        if (count === 2) labels.set(edgeKey, next++);
    });
    return labels;
}

export function exportSheetSvg(
    panels: FlatPanel[],
    grooves: GrooveSpec[][],
    layout: SheetLayout,
    options: SvgExportOptions = {},
): string {
    const byId = new Map(panels.map((panel, index) => [panel.patchId, { panel, grooves: grooves[index] ?? [] }]));
    const labels = options.labelEdges === false ? new Map<string, number>() : seamLabels(panels);
    const layers = { cut: [] as string[], groove: [] as string[], score: [] as string[], labels: [] as string[] };

    layout.placements.forEach((placement) => {
        const entry = byId.get(placement.panelId);
        if (!entry) return;
        const at = (point: Vec2) => placePoint(entry.panel, placement, point);

        entry.panel.boundaryEdges.forEach((edge) => {
            const a = at(edge.a);
            const b = at(edge.b);
            layers.cut.push(`<line x1="${mm(a.x)}" y1="${mm(a.y)}" x2="${mm(b.x)}" y2="${mm(b.y)}"/>`);
            const label = labels.get(edge.edgeKey);
            if (label !== undefined) {
                const midX = (a.x + b.x) / 2;
                const midY = (a.y + b.y) / 2;
                layers.labels.push(
                    `<text x="${mm(midX)}" y="${mm(midY)}" data-seam="${label}">${label}</text>`,
                );
            }
        });

        entry.grooves.forEach((groove) => {
            const a = at(groove.a);
            const b = at(groove.b);
            const data = `data-dihedral="${groove.dihedralDeg}" data-groove-angle="${groove.grooveAngleDeg}" `
                + `data-depth-mm="${groove.depthMm}" data-width-mm="${groove.widthMm}" data-side="${groove.side}" `
                + `data-method="${groove.method}"`;
            if (groove.method === 'score') {
                layers.score.push(`<line x1="${mm(a.x)}" y1="${mm(a.y)}" x2="${mm(b.x)}" y2="${mm(b.y)}" ${data}/>`);
                return;
            }
            if (groove.method === 'through-cut') {
                layers.cut.push(`<line x1="${mm(a.x)}" y1="${mm(a.y)}" x2="${mm(b.x)}" y2="${mm(b.y)}" ${data}/>`);
                return;
            }
            const outline = groove.outline.map(at);
            layers.groove.push(`<polygon points="${outline.map(pointText).join(' ')}" ${data}/>`);
            // The fold line itself, for machines that score the hinge centre.
            layers.groove.push(`<line x1="${mm(a.x)}" y1="${mm(a.y)}" x2="${mm(b.x)}" y2="${mm(b.y)}" class="fold-centre" ${data}/>`);
        });

        const centreX = placement.x + (entry.panel.boundsMm.maxX - entry.panel.boundsMm.minX) / 2;
        const centreY = placement.y + (entry.panel.boundsMm.maxY - entry.panel.boundsMm.minY) / 2;
        layers.labels.push(`<text x="${mm(centreX)}" y="${mm(centreY)}" class="panel-id">P${entry.panel.patchId + 1}</text>`);
    });

    const fiducial = options.fiducialMm ?? 5;
    const registration: string[] = [];
    if (fiducial > 0) {
        const inset = Math.max(2, fiducial);
        const spots: Vec2[] = [
            { x: inset, y: inset },
            { x: layout.spec.widthMm - inset, y: inset },
            { x: layout.spec.widthMm - inset, y: layout.spec.heightMm - inset },
            { x: inset, y: layout.spec.heightMm - inset },
        ];
        spots.forEach((spot, index) => registration.push(
            `<circle cx="${mm(spot.x)}" cy="${mm(spot.y)}" r="${mm(fiducial / 2)}" data-fiducial="${index}"/>`,
        ));
    }

    const { widthMm, heightMm } = layout.spec;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" data-foldcraft-sheet="${layout.index}">
  <style>
    #cut line{stroke:#111;stroke-width:.35;fill:none}
    #groove polygon{fill:none;stroke:#d97706;stroke-width:.25}
    #groove .fold-centre{stroke:#2563eb;stroke-width:.2;stroke-dasharray:2 1.5}
    #score line{stroke:#2563eb;stroke-width:.25;stroke-dasharray:2 1.5}
    #labels text{font-family:sans-serif;font-size:4px;fill:#64748b;text-anchor:middle}
    #labels .panel-id{font-size:6px;fill:#334155}
    #registration circle{fill:#111}
  </style>
  <rect width="${widthMm}" height="${heightMm}" fill="#fff"/>
  <g id="registration">${registration.join('')}</g>
  <g id="groove">${layers.groove.join('')}</g>
  <g id="score">${layers.score.join('')}</g>
  <g id="cut">${layers.cut.join('')}</g>
  <g id="labels">${layers.labels.join('')}</g>
</svg>`;
}
