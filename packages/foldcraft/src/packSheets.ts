/**
 * Foldcraft S8 — sheet packing.
 *
 * Shelf packing with per-panel rotation: panels sorted by area, placed left to
 * right in rows, rotated 90° when that fits better, new sheet when a row will
 * not open. Not optimal nesting — that is a later refinement — but predictable,
 * fast, and the layout a person can sanity-check by eye, which matters when
 * the next step is cutting real material.
 */

import type { FlatPanel, SheetLayout, SheetSpec } from './foldcraftTypes';

const panelWidth = (panel: FlatPanel) => panel.boundsMm.maxX - panel.boundsMm.minX;
const panelHeight = (panel: FlatPanel) => panel.boundsMm.maxY - panel.boundsMm.minY;

export function packSheets(panels: FlatPanel[], sheet: SheetSpec): SheetLayout[] {
    const printableWidth = sheet.widthMm - sheet.marginMm * 2;
    const printableHeight = sheet.heightMm - sheet.marginMm * 2;

    const order = [...panels].sort((a, b) => (
        panelWidth(b) * panelHeight(b) - panelWidth(a) * panelHeight(a)
    ));

    const layouts: SheetLayout[] = [];
    let current: SheetLayout | null = null;
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;

    const openSheet = () => {
        current = { index: layouts.length, spec: sheet, placements: [] };
        layouts.push(current);
        cursorX = sheet.marginMm;
        cursorY = sheet.marginMm;
        rowHeight = 0;
    };

    for (const panel of order) {
        const width = panelWidth(panel);
        const height = panelHeight(panel);
        const orientations = [
            { width, height, rotationDeg: 0 },
            { width: height, height: width, rotationDeg: 90 },
        ].filter((option) => option.width <= printableWidth && option.height <= printableHeight);
        if (orientations.length === 0) {
            throw new Error(`PANEL_EXCEEDS_SHEET:${panel.patchId}:${width.toFixed(1)}x${height.toFixed(1)}mm`);
        }

        if (!current) openSheet();
        let chosen = null as null | { width: number; height: number; rotationDeg: number };
        for (let attempt = 0; attempt < 3 && !chosen; attempt += 1) {
            chosen = orientations
                .filter((option) => (
                    cursorX + option.width <= sheet.widthMm - sheet.marginMm
                    && cursorY + option.height <= sheet.heightMm - sheet.marginMm
                ))
                // Prefer the orientation that grows the current row least.
                .sort((a, b) => Math.max(rowHeight, a.height) - Math.max(rowHeight, b.height) || a.width - b.width)[0] ?? null;
            if (chosen) break;
            if (attempt === 0) {
                cursorX = sheet.marginMm;
                cursorY += rowHeight + sheet.gapMm;
                rowHeight = 0;
            } else if (attempt === 1) {
                openSheet();
            }
        }
        if (!chosen) throw new Error(`PANEL_EXCEEDS_SHEET:${panel.patchId}`);

        current!.placements.push({ panelId: panel.patchId, x: cursorX, y: cursorY, rotationDeg: chosen.rotationDeg });
        cursorX += chosen.width + sheet.gapMm;
        rowHeight = Math.max(rowHeight, chosen.height);
    }
    return layouts;
}

/** Map a panel-local point onto its sheet position for a given placement. */
export function placePoint(
    panel: FlatPanel,
    placement: SheetLayout['placements'][number],
    point: { x: number; y: number },
): { x: number; y: number } {
    const localX = point.x - panel.boundsMm.minX;
    const localY = point.y - panel.boundsMm.minY;
    if (placement.rotationDeg === 90) {
        const height = panel.boundsMm.maxY - panel.boundsMm.minY;
        return { x: placement.x + height - localY, y: placement.y + localX };
    }
    return { x: placement.x + localX, y: placement.y + localY };
}
