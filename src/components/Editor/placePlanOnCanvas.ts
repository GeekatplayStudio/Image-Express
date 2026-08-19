import * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';
import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';

export async function createSheetGroup(svg: string, left: number, top: number): Promise<fabric.Group> {
    const parsed = await fabric.loadSVGFromString(svg);
    const objects = parsed.objects.filter((object): object is fabric.FabricObject => object !== null);
    if (objects.length === 0) throw new Error('EMPTY_UNFOLD_SHEET');
    return new fabric.Group(objects, { left, top, originX: 'left', originY: 'top' });
}

/** Land the unfolded sheets on the canvas as one selectable group, fitted to the artboard. */
export async function placePlanOnCanvas(
    canvas: fabric.Canvas,
    modelName: string,
    sheets: Array<{ svg: string; widthMm: number; heightMm: number }>,
): Promise<fabric.Group> {
    if (sheets.length === 0) throw new Error('EMPTY_UNFOLD_PLAN');
    const gap = 18;
    const columns = Math.max(1, Math.ceil(Math.sqrt(sheets.length)));
    const sheetGroups = await Promise.all(sheets.map((sheet, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return createSheetGroup(
            sheet.svg,
            column * (sheet.widthMm + gap),
            row * (sheet.heightMm + gap),
        );
    }));
    const net = new fabric.Group(sheetGroups, { originX: 'left', originY: 'top' });
    const artboard = (canvas as CanvasWithArtboard).artboard ?? {
        width: canvas.width || 800,
        height: canvas.height || 600,
        left: 0,
        top: 0,
    };
    const fitScale = Math.min(
        1,
        (artboard.width * 0.86) / Math.max(1, net.width),
        (artboard.height * 0.86) / Math.max(1, net.height),
    );
    net.set({
        left: artboard.left + (artboard.width - net.width * fitScale) / 2,
        top: artboard.top + (artboard.height - net.height * fitScale) / 2,
        scaleX: fitScale,
        scaleY: fitScale,
    });
    (net as ExtendedFabricObject).name = `${modelName} — Unfold`;
    canvas.add(net);
    canvas.setActiveObject(net);
    canvas.requestRenderAll();
    return net;
}
