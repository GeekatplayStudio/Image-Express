import type {
    CricutExportOptions,
    CricutPart,
    CricutPlacement,
    CricutSheet,
    CricutTraceResult,
} from './cricutTypes';

type Rect = { x: number; y: number; width: number; height: number };
type WorkingSheet = { free: Rect[]; placements: CricutPlacement[] };
type Candidate = {
    sheetIndex: number;
    freeIndex: number;
    rotated: boolean;
    width: number;
    height: number;
    shortSide: number;
    longSide: number;
};

const round = (value: number) => Number(value.toFixed(4));

function contains(outer: Rect, inner: Rect): boolean {
    return inner.x >= outer.x && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height;
}

function splitFreeRect(free: Rect, used: Rect): Rect[] {
    const right = free.x + free.width;
    const bottom = free.y + free.height;
    const usedRight = used.x + used.width;
    const usedBottom = used.y + used.height;
    const parts: Rect[] = [];
    if (used.x > free.x) parts.push({ x: free.x, y: free.y, width: used.x - free.x, height: free.height });
    if (usedRight < right) parts.push({ x: usedRight, y: free.y, width: right - usedRight, height: free.height });
    if (used.y > free.y) parts.push({ x: free.x, y: free.y, width: free.width, height: used.y - free.y });
    if (usedBottom < bottom) parts.push({ x: free.x, y: usedBottom, width: free.width, height: bottom - usedBottom });
    return parts.filter((rect) => rect.width > 0.001 && rect.height > 0.001);
}

function intersects(first: Rect, second: Rect): boolean {
    return first.x < second.x + second.width && first.x + first.width > second.x
        && first.y < second.y + second.height && first.y + first.height > second.y;
}

function pruneFreeRects(rectangles: Rect[]): Rect[] {
    return rectangles.filter((rect, index) => !rectangles.some((other, otherIndex) => (
        index !== otherIndex && contains(other, rect)
    )));
}

function findCandidate(sheets: WorkingSheet[], part: CricutPart, gap: number, allowRotation: boolean): Candidate | null {
    let best: Candidate | null = null;
    for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
        const sheet = sheets[sheetIndex];
        for (let freeIndex = 0; freeIndex < sheet.free.length; freeIndex += 1) {
            const free = sheet.free[freeIndex];
            const orientations = allowRotation
                ? [{ rotated: false, width: part.widthMm + gap, height: part.heightMm + gap }, { rotated: true, width: part.heightMm + gap, height: part.widthMm + gap }]
                : [{ rotated: false, width: part.widthMm + gap, height: part.heightMm + gap }];
            for (const orientation of orientations) {
                if (orientation.width > free.width + 0.001 || orientation.height > free.height + 0.001) continue;
                const candidate: Candidate = {
                    sheetIndex,
                    freeIndex,
                    ...orientation,
                    shortSide: Math.min(free.width - orientation.width, free.height - orientation.height),
                    longSide: Math.max(free.width - orientation.width, free.height - orientation.height),
                };
                if (!best
                    || candidate.shortSide < best.shortSide
                    || (candidate.shortSide === best.shortSide && candidate.longSide < best.longSide)) best = candidate;
            }
        }
    }
    return best;
}

function packInOrder(parts: CricutPart[], options: CricutExportOptions): WorkingSheet[] {
    const usable: Rect = {
        x: options.marginMm,
        y: options.marginMm,
        width: options.widthMm - options.marginMm * 2,
        height: options.heightMm - options.marginMm * 2,
    };
    const sheets: WorkingSheet[] = [{ free: [usable], placements: [] }];
    for (const part of parts) {
        let candidate = findCandidate(sheets, part, options.gapMm, options.allowRotation);
        if (!candidate) {
            sheets.push({ free: [usable], placements: [] });
            candidate = findCandidate(sheets, part, options.gapMm, options.allowRotation);
        }
        if (!candidate) {
            throw new Error(`Part ${part.id} (${round(part.widthMm)} × ${round(part.heightMm)} mm) does not fit the selected sheet.`);
        }
        const sheet = sheets[candidate.sheetIndex];
        const free = sheet.free[candidate.freeIndex];
        const used = { x: free.x, y: free.y, width: candidate.width, height: candidate.height };
        const padding = options.gapMm / 2;
        sheet.placements.push({
            part,
            xMm: used.x + padding,
            yMm: used.y + padding,
            rotated: candidate.rotated,
            packedWidthMm: candidate.width - options.gapMm,
            packedHeightMm: candidate.height - options.gapMm,
        });
        sheet.free = pruneFreeRects(sheet.free.flatMap((rect) => (
            intersects(rect, used) ? splitFreeRect(rect, used) : [rect]
        )));
    }
    return sheets;
}

function scorePacking(sheets: WorkingSheet[], options: CricutExportOptions): number {
    const sheetPenalty = sheets.length * options.widthMm * options.heightMm * 100;
    const extents = sheets.reduce((sum, sheet) => {
        const maxY = Math.max(options.marginMm, ...sheet.placements.map((placement) => placement.yMm + placement.packedHeightMm));
        return sum + maxY * options.widthMm;
    }, 0);
    return sheetPenalty + extents;
}

export function createCricutParts(trace: CricutTraceResult, options: CricutExportOptions): CricutPart[] {
    const materialThickness = Math.max(0.001, options.materialThicknessMm);
    const targetDepth = Math.max(0.001, options.targetDepthMm);
    const layerCount = options.enabled
        ? Math.max(1, Math.ceil(targetDepth / materialThickness))
        : 1;
    const parts: CricutPart[] = [];
    for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
        const layerDepth = options.enabled
            ? Math.min(materialThickness, targetDepth - layerIndex * materialThickness)
            : materialThickness;
        trace.components.forEach((component, componentIndex) => {
            parts.push({
                id: `layer-${layerIndex + 1}-part-${componentIndex + 1}`,
                componentIndex,
                layerIndex,
                layerDepthMm: round(layerDepth),
                widthMm: component.widthMm,
                heightMm: component.heightMm,
                contours: component.contours,
                registrationAnchors: options.enabled && options.registrationMarks ? component.registrationAnchors : [],
            });
        });
    }
    return parts;
}

/** Multi-strategy MaxRects packing; deterministic output keeps exports reproducible. */
export function nestCricutParts(parts: CricutPart[], options: CricutExportOptions): Omit<CricutSheet, 'svg'>[] {
    if (options.widthMm <= options.marginMm * 2 || options.heightMm <= options.marginMm * 2) {
        throw new Error('Sheet margins leave no usable cutting area.');
    }
    const strategies = [
        [...parts].sort((a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm),
        [...parts].sort((a, b) => Math.max(b.widthMm, b.heightMm) - Math.max(a.widthMm, a.heightMm)),
        [...parts].sort((a, b) => b.heightMm - a.heightMm),
        [...parts].sort((a, b) => b.widthMm - a.widthMm),
    ];
    let best: WorkingSheet[] | null = null;
    let bestScore = Infinity;
    for (const ordered of strategies) {
        const packed = packInOrder(ordered, options);
        const score = scorePacking(packed, options);
        if (score < bestScore) {
            best = packed;
            bestScore = score;
        }
    }
    return (best ?? []).map((sheet, index) => ({
        index,
        widthMm: options.widthMm,
        heightMm: options.heightMm,
        placements: sheet.placements,
        usedAreaMm2: sheet.placements.reduce((sum, placement) => (
            sum + placement.part.widthMm * placement.part.heightMm
        ), 0),
    }));
}
