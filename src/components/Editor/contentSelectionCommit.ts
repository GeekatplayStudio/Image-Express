import {
    featherDocumentSelectionMask,
    type DocumentSelectionMask,
} from '@/lib/selection/documentSelectionMask';
import {
    commitDocumentSelection,
    ensureDocumentSelectionMask,
} from '@/lib/selection/documentSelectionStore';
import {
    captureLayerPixelsInArtboard,
    ensureObjectId,
    getArtboardSelectionBounds,
    resolveContentSelectionTarget,
} from '@/lib/selection/selectionLayerCapture';
import {
    intersectRect,
    unionPolygonIntoMask,
    unionRectIntoMask,
} from '@/lib/selection/selectionMaskRasterize';
import {
    parseHexRgb,
    rgbToHex,
    sampleRgbAtScenePoint,
    unionColorMatchIntoMask,
    unionFloodFillIntoMask,
    type Rgb,
} from '@/lib/selection/selectionWandFloodFill';
import type { RectBounds } from '@/components/Editor/selectionGeometry';
import type * as fabric from 'fabric';

export type ContentSelectionToast = (payload: {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive' | 'warning' | 'success';
}) => void;

export type WandSampleMode = 'contiguous' | 'color';

type PointLike = { x: number; y: number };

function prepareMask(canvas: fabric.Canvas, addToSelection: boolean): DocumentSelectionMask {
    const mask = ensureDocumentSelectionMask(canvas);
    if (!addToSelection) mask.data.fill(0);
    return mask;
}

function applyFeather(mask: DocumentSelectionMask, featherPx: number, addToSelection: boolean) {
    if (!addToSelection && featherPx > 0) featherDocumentSelectionMask(mask, featherPx);
}

function clipMaskOutsideLayer(mask: DocumentSelectionMask, layerBounds: RectBounds) {
    for (let y = 0; y < mask.height; y += 1) {
        const sceneY = mask.top + y;
        const row = y * mask.width;
        for (let x = 0; x < mask.width; x += 1) {
            const sceneX = mask.left + x;
            if (
                sceneX < layerBounds.left
                || sceneY < layerBounds.top
                || sceneX >= layerBounds.left + layerBounds.width
                || sceneY >= layerBounds.top + layerBounds.height
            ) {
                mask.data[row + x] = 0;
            }
        }
    }
}

export function commitMarqueeContentSelection(args: {
    canvas: fabric.Canvas;
    pointerStart: PointLike;
    pointerEnd: PointLike;
    featherPx: number;
    addToSelection?: boolean;
    toast?: ContentSelectionToast;
    emptyTargetTitle: string;
    emptyTargetDescription: string;
}): boolean {
    const {
        canvas, pointerStart, pointerEnd, featherPx, toast, emptyTargetTitle, emptyTargetDescription,
    } = args;
    const addToSelection = Boolean(args.addToSelection);
    const mid: PointLike = {
        x: (pointerStart.x + pointerEnd.x) / 2,
        y: (pointerStart.y + pointerEnd.y) / 2,
    };
    const target = resolveContentSelectionTarget(canvas, mid as fabric.Point);
    if (!target) {
        toast?.({ title: emptyTargetTitle, description: emptyTargetDescription, variant: 'warning' });
        return false;
    }

    const selectionBounds: RectBounds = {
        left: Math.min(pointerStart.x, pointerEnd.x),
        top: Math.min(pointerStart.y, pointerEnd.y),
        width: Math.abs(pointerEnd.x - pointerStart.x),
        height: Math.abs(pointerEnd.y - pointerStart.y),
    };
    if (selectionBounds.width < 2 || selectionBounds.height < 2) return false;

    const clipped = intersectRect(selectionBounds, target.getBoundingRect());
    if (!clipped) {
        toast?.({ title: emptyTargetTitle, description: emptyTargetDescription, variant: 'warning' });
        return false;
    }

    const mask = prepareMask(canvas, addToSelection);
    unionRectIntoMask(mask, clipped);
    applyFeather(mask, featherPx, addToSelection);
    commitDocumentSelection(canvas, mask, ensureObjectId(target));
    canvas.setActiveObject(target);
    canvas.requestRenderAll();
    return true;
}

export function commitLassoContentSelection(args: {
    canvas: fabric.Canvas;
    points: PointLike[];
    featherPx: number;
    addToSelection?: boolean;
    toast?: ContentSelectionToast;
    emptyTargetTitle: string;
    emptyTargetDescription: string;
}): boolean {
    const { canvas, points, featherPx, toast, emptyTargetTitle, emptyTargetDescription } = args;
    const addToSelection = Boolean(args.addToSelection);
    if (points.length < 3) return false;

    const seed = points[0];
    const target = resolveContentSelectionTarget(canvas, seed as fabric.Point);
    if (!target) {
        toast?.({ title: emptyTargetTitle, description: emptyTargetDescription, variant: 'warning' });
        return false;
    }

    const layerBounds = target.getBoundingRect();
    const mask = prepareMask(canvas, addToSelection);
    unionPolygonIntoMask(mask, points);
    if (!addToSelection) {
        clipMaskOutsideLayer(mask, layerBounds);
    }

    applyFeather(mask, featherPx, addToSelection);
    commitDocumentSelection(canvas, mask, ensureObjectId(target));
    canvas.setActiveObject(target);
    canvas.requestRenderAll();
    return true;
}

export function commitWandContentSelection(args: {
    canvas: fabric.Canvas;
    pointer: PointLike;
    threshold: number;
    featherPx: number;
    sampleMode: WandSampleMode;
  /** Color mode: optional hint; click always samples under the pointer. */
  seedColorHex?: string | null;
  addToSelection?: boolean;
    toast?: ContentSelectionToast;
    emptyTargetTitle: string;
    emptyTargetDescription: string;
    noPixelsTitle: string;
    noPixelsDescription: string;
    onSampledColor?: (hex: string) => void;
}): boolean {
    const {
        canvas,
        pointer,
        threshold,
        featherPx,
    sampleMode,
    seedColorHex,
    toast,
    emptyTargetTitle,
    emptyTargetDescription,
    noPixelsTitle,
    noPixelsDescription,
    onSampledColor,
  } = args;
  const addToSelection = Boolean(args.addToSelection);

  const target = resolveContentSelectionTarget(canvas, pointer as fabric.Point);
  if (!target) {
    toast?.({ title: emptyTargetTitle, description: emptyTargetDescription, variant: 'warning' });
    return false;
  }

  const artboard = getArtboardSelectionBounds(canvas);
  const pixels = captureLayerPixelsInArtboard(canvas, target, artboard);
  if (!pixels) {
    toast?.({ title: noPixelsTitle, description: noPixelsDescription, variant: 'warning' });
    return false;
  }

  const mask = prepareMask(canvas, addToSelection);

  let seed: Rgb | null = sampleRgbAtScenePoint(pixels, mask, pointer.x, pointer.y);
  if (!seed && seedColorHex) {
    seed = parseHexRgb(seedColorHex);
  }
    if (!seed) {
        toast?.({ title: noPixelsTitle, description: noPixelsDescription, variant: 'warning' });
        return false;
    }

    onSampledColor?.(rgbToHex(seed));

    if (sampleMode === 'color') {
        unionColorMatchIntoMask(mask, pixels, seed, threshold);
    } else {
        unionFloodFillIntoMask(mask, pixels, pointer.x, pointer.y, threshold);
    }

    applyFeather(mask, featherPx, addToSelection);
    commitDocumentSelection(canvas, mask, ensureObjectId(target));
    canvas.setActiveObject(target);
    canvas.requestRenderAll();
    return true;
}

/** Apply Color Range using the picker color on the active/target layer. */
export function commitWandColorPickerSelection(args: {
    canvas: fabric.Canvas;
    seedColorHex: string;
    threshold: number;
    featherPx: number;
    addToSelection?: boolean;
    toast?: ContentSelectionToast;
    emptyTargetTitle: string;
    emptyTargetDescription: string;
    noPixelsTitle: string;
    noPixelsDescription: string;
}): boolean {
    const seed = parseHexRgb(args.seedColorHex);
    if (!seed) return false;

    const target = resolveContentSelectionTarget(args.canvas, null);
    if (!target) {
        args.toast?.({
            title: args.emptyTargetTitle,
            description: args.emptyTargetDescription,
            variant: 'warning',
        });
        return false;
    }

    const artboard = getArtboardSelectionBounds(args.canvas);
    const pixels = captureLayerPixelsInArtboard(args.canvas, target, artboard);
    if (!pixels) {
        args.toast?.({
            title: args.noPixelsTitle,
            description: args.noPixelsDescription,
            variant: 'warning',
        });
        return false;
    }

    const addToSelection = Boolean(args.addToSelection);
    const mask = prepareMask(args.canvas, addToSelection);
    unionColorMatchIntoMask(mask, pixels, seed, args.threshold);
    applyFeather(mask, args.featherPx, addToSelection);
    commitDocumentSelection(args.canvas, mask, ensureObjectId(target));
    args.canvas.setActiveObject(target);
    args.canvas.requestRenderAll();
    return true;
}
