import type {
    MeshTriangle,
    PapercraftIsland,
    PapercraftOptions,
    PapercraftPlan,
    PapercraftSheet,
    Point2,
} from './papercraftTypes';
import { DEFAULT_PAPERCRAFT_OPTIONS } from './papercraftTypes';
import { extractModelTriangles } from './meshExtraction';
import { modelMaximumExtent } from './unfoldMesh';
import { optimizePapercraftUnfold, type IntelligentUnfold } from './papercraftIntelligence';

type IslandPlacement = {
    island: PapercraftIsland;
    x: number;
    y: number;
    rotate: boolean;
};

type IslandOrientation = { width: number; height: number; rotate: boolean };

const value = (number: number) => Number(number.toFixed(3));
const pointText = (point: Point2) => `${value(point.x)},${value(point.y)}`;

function transformedPoint(
    point: Point2,
    placement: IslandPlacement,
    scale: number,
    tabDepth: number,
): Point2 {
    const { bounds } = placement.island;
    const localX = (point.x - bounds.minX) * scale;
    const localY = (point.y - bounds.minY) * scale;
    const height = (bounds.maxY - bounds.minY) * scale;
    return placement.rotate
        ? { x: placement.x + tabDepth + height - localY, y: placement.y + tabDepth + localX }
        : { x: placement.x + tabDepth + localX, y: placement.y + tabDepth + localY };
}

function tabPoints(a: Point2, b: Point2, third: Point2, depth: number): [Point2, Point2, Point2, Point2] {
    const length = Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y));
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const side = Math.sign((b.x - a.x) * (third.y - a.y) - (b.y - a.y) * (third.x - a.x)) || 1;
    const nx = side > 0 ? uy : -uy;
    const ny = side > 0 ? -ux : ux;
    const inset = Math.min(length * 0.2, depth * 0.55);
    const p1 = { x: a.x + ux * inset, y: a.y + uy * inset };
    const p2 = { x: b.x - ux * inset, y: b.y - uy * inset };
    const flapDepth = Math.min(depth, length * 0.32);
    return [
        p1,
        { x: p1.x + nx * flapDepth + ux * flapDepth * 0.2, y: p1.y + ny * flapDepth + uy * flapDepth * 0.2 },
        { x: p2.x + nx * flapDepth - ux * flapDepth * 0.2, y: p2.y + ny * flapDepth - uy * flapDepth * 0.2 },
        p2,
    ];
}

function packIslands(
    islands: PapercraftIsland[],
    options: PapercraftOptions,
    scale: number,
): IslandPlacement[][] {
    const printableWidth = options.sheetWidthMm - options.marginMm * 2;
    const sorted = [...islands].sort((a, b) => {
        const areaA = (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxY - a.bounds.minY);
        const areaB = (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxY - b.bounds.minY);
        return areaB - areaA;
    });
    const sheets: IslandPlacement[][] = [[]];
    let x = options.marginMm;
    let y = options.marginMm;
    let rowHeight = 0;
    const right = options.sheetWidthMm - options.marginMm;
    const bottom = options.sheetHeightMm - options.marginMm;

    sorted.forEach((island) => {
        const rawWidth = (island.bounds.maxX - island.bounds.minX) * scale + options.tabDepthMm * 2;
        const rawHeight = (island.bounds.maxY - island.bounds.minY) * scale + options.tabDepthMm * 2;
        const orientations: IslandOrientation[] = [
            { width: rawWidth, height: rawHeight, rotate: false },
            { width: rawHeight, height: rawWidth, rotate: true },
        ].filter((item, index, all) => (
            item.width <= printableWidth
            && item.height <= options.sheetHeightMm - options.marginMm * 2
            && (index === 0 || item.width !== all[0].width || item.height !== all[0].height)
        ));
        const choose = () => orientations
            .filter((item) => x + item.width <= right && y + item.height <= bottom)
            .sort((a, b) => (
                Math.max(rowHeight, a.height) - Math.max(rowHeight, b.height)
                || a.width - b.width
            ))[0];
        let orientation = choose();
        if (!orientation) {
            x = options.marginMm;
            y += rowHeight + options.gapMm;
            rowHeight = 0;
            orientation = choose();
        }
        if (!orientation) {
            sheets.push([]);
            x = options.marginMm;
            y = options.marginMm;
            rowHeight = 0;
            orientation = choose();
        }
        if (!orientation) throw new Error('UNFOLD_ISLAND_EXCEEDS_SHEET');
        sheets[sheets.length - 1].push({ island, x, y, rotate: orientation.rotate });
        x += orientation.width + options.gapMm;
        rowHeight = Math.max(rowHeight, orientation.height);
    });
    return sheets.filter((sheet) => sheet.length > 0);
}

function sheetSvg(
    placements: IslandPlacement[],
    options: PapercraftOptions,
    scale: number,
    index: number,
    intelligence: IntelligentUnfold,
): PapercraftSheet {
    const content: string[] = [];
    placements.forEach((placement) => {
        const point = (input: Point2) => transformedPoint(input, placement, scale, options.tabDepthMm);
        placement.island.faces.forEach((face) => {
            const points = face.points.map(point) as [Point2, Point2, Point2];
            const center = {
                x: (points[0].x + points[1].x + points[2].x) / 3,
                y: (points[0].y + points[1].y + points[2].y) / 3,
            };
            content.push(`<polygon points="${points.map(pointText).join(' ')}" fill="#f8fafc" stroke="none" data-face="${face.faceId + 1}" />`);
            if (Math.min(...points.map((p, i) => Math.hypot(p.x - points[(i + 1) % 3].x, p.y - points[(i + 1) % 3].y))) > 8) {
                content.push(`<text x="${value(center.x)}" y="${value(center.y)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="3" fill="#64748b">${face.faceId + 1}</text>`);
            }
        });
        placement.island.cuts.forEach((edge) => {
            const a = point(edge.a);
            const b = point(edge.b);
            if (!edge.tab) {
                content.push(`<line x1="${value(a.x)}" y1="${value(a.y)}" x2="${value(b.x)}" y2="${value(b.y)}" class="cut" />`);
                return;
            }
            const face = placement.island.faces.find((item) => item.faceId === edge.faceId)!;
            const third = point(face.points.find((candidate) => candidate !== edge.a && candidate !== edge.b) ?? face.points[2]);
            const tab = tabPoints(a, b, third, options.tabDepthMm);
            content.push(`<path d="M ${pointText(a)} L ${tab.map(pointText).join(' L ')} L ${pointText(b)}" class="cut" data-glue-tab="true" />`);
            content.push(`<line x1="${value(a.x)}" y1="${value(a.y)}" x2="${value(b.x)}" y2="${value(b.y)}" class="tab-fold" />`);
        });
        placement.island.folds.forEach((fold) => {
            if (fold.foldDirection === 'flat') return;
            const a = point(fold.a);
            const b = point(fold.b);
            content.push(`<line x1="${value(a.x)}" y1="${value(a.y)}" x2="${value(b.x)}" y2="${value(b.y)}" class="fold ${fold.foldDirection}" data-operation="score" data-fold-direction="${fold.foldDirection}" data-fold-angle="${fold.foldAngleDegrees}" />`);
        });
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.sheetWidthMm}mm" height="${options.sheetHeightMm}mm" viewBox="0 0 ${options.sheetWidthMm} ${options.sheetHeightMm}" data-fold-back-confidence="${intelligence.prediction.confidence}" data-unfold-strategy="${intelligence.strategy}">
  <title>Origami unfold sheet ${index + 1}</title>
  <desc>Solid black lines are cuts. Dashed blue lines are folds. Dotted violet lines are glue-tab folds.</desc>
  <style>.cut{fill:none;stroke:#111827;stroke-width:.35;stroke-linecap:round}.fold{stroke:#2563eb;stroke-width:.3;stroke-dasharray:2 1.5}.tab-fold{stroke:#7c3aed;stroke-width:.25;stroke-dasharray:.7 1}</style>
  <rect x="0" y="0" width="${options.sheetWidthMm}" height="${options.sheetHeightMm}" fill="#fff" />
  ${content.join('\n  ')}
</svg>`;
    return { index, widthMm: options.sheetWidthMm, heightMm: options.sheetHeightMm, svg, islandCount: placements.length };
}

export function buildPapercraftPlanFromTriangles(
    triangles: MeshTriangle[],
    overrides: Partial<PapercraftOptions> = {},
): PapercraftPlan {
    const options = { ...DEFAULT_PAPERCRAFT_OPTIONS, ...overrides };
    const extent = modelMaximumExtent(triangles);
    const scale = options.modelSizeMm / extent;
    const maxWidth = Math.max(1, (options.sheetWidthMm - options.marginMm * 2 - options.tabDepthMm * 2) / scale);
    const maxHeight = Math.max(1, (options.sheetHeightMm - options.marginMm * 2 - options.tabDepthMm * 2) / scale);
    const intelligent = optimizePapercraftUnfold(triangles, { maxWidth, maxHeight });
    const islands = intelligent.islands;
    const sheets = packIslands(islands, options, scale).map((placements, index) => sheetSvg(placements, options, scale, index, intelligent));
    return {
        sourceFaceCount: triangles.length,
        unfoldedFaceCount: islands.reduce((sum, island) => sum + island.faces.length, 0),
        islandCount: islands.length,
        sheets,
        modelScaleMm: options.modelSizeMm,
        intelligence: {
            strategy: intelligent.strategy,
            candidatesEvaluated: intelligent.candidatesEvaluated,
            foldBackConfidence: intelligent.prediction.confidence,
            surfaceCoverage: intelligent.prediction.surfaceCoverage,
            edgeFidelity: intelligent.prediction.edgeFidelity,
            areaFidelity: intelligent.prediction.areaFidelity,
            topologyCoverage: intelligent.prediction.topologyCoverage,
            foldInstructionCoverage: intelligent.prediction.foldInstructionCoverage,
            watertight: intelligent.prediction.watertight,
        },
    };
}

export async function buildPapercraftPlan(
    modelUrl: string,
    overrides: Partial<PapercraftOptions> = {},
): Promise<PapercraftPlan> {
    const options = { ...DEFAULT_PAPERCRAFT_OPTIONS, ...overrides };
    const triangles = await extractModelTriangles(modelUrl, options.maxFaces);
    return buildPapercraftPlanFromTriangles(triangles, options);
}
