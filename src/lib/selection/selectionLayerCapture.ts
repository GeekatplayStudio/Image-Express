import type * as fabric from 'fabric';
import type { ExtendedFabricObject } from '@/types';
import type { RectBounds } from '@/components/Editor/selectionGeometry';
import { isSelectionChromeObject, findTopObjectAtPointer } from '@/components/Editor/selectionWand';
import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';
import { getRetouchBoundsFromCanvas } from '@/components/Editor/editorRetouchUtils';

export function getArtboardSelectionBounds(
    canvas: fabric.Canvas,
): RectBounds {
    return getRetouchBoundsFromCanvas(canvas, {
        width: canvas.getWidth?.() || 1,
        height: canvas.getHeight?.() || 1,
    });
}

export function ensureObjectId(obj: fabric.Object): string {
    const ext = obj as ExtendedFabricObject;
    if (!ext.id) {
        ext.id = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    return ext.id;
}

export function isContentSelectableLayer(obj: fabric.Object): boolean {
    if (isSelectionChromeObject(obj)) return false;
    const ext = obj as ExtendedFabricObject & { isSelectionOverlayHelper?: boolean };
    if (ext.isRetouchLayer || ext.isAdjustmentLayer) return false;
    if (ext.isSelectionOverlayHelper) return false;
    return true;
}

/**
 * Prefer active object when it is content-selectable; else top object under pointer.
 */
export function resolveContentSelectionTarget(
    canvas: fabric.Canvas,
    pointer: fabric.Point | null,
): fabric.Object | null {
    const active = canvas.getActiveObject();
    if (active && active.type !== 'activeSelection' && isContentSelectableLayer(active)) {
        if (!pointer) return active;
        const bounds = active.getBoundingRect();
        const inside = pointer.x >= bounds.left
            && pointer.x <= bounds.left + bounds.width
            && pointer.y >= bounds.top
            && pointer.y <= bounds.top + bounds.height;
        if (inside) return active;
    }

    if (!pointer) return null;
    const candidates = canvas.getObjects().filter(isContentSelectableLayer);
    return findTopObjectAtPointer(candidates, pointer);
}

/**
 * Rasterize a Fabric object into an artboard-aligned RGBA ImageData for wand sampling.
 */
export function captureLayerPixelsInArtboard(
    canvas: fabric.Canvas,
    target: fabric.Object,
    artboard: RectBounds,
): ImageData | null {
    if (typeof document === 'undefined') return null;

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(artboard.width));
    out.height = Math.max(1, Math.round(artboard.height));
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    const anyObj = target as fabric.Object & {
        toCanvasElement?: (options?: Record<string, unknown>) => HTMLCanvasElement;
        getElement?: () => CanvasImageSource | null;
    };

    try {
        const br = target.getBoundingRect();
        const dx = br.left - artboard.left;
        const dy = br.top - artboard.top;

        if (typeof anyObj.toCanvasElement === 'function') {
            const piece = anyObj.toCanvasElement({ enableRetinaScaling: false });
            ctx.drawImage(piece, dx, dy, br.width, br.height);
        } else if (typeof anyObj.getElement === 'function') {
            const el = anyObj.getElement();
            if (!el) return null;
            ctx.drawImage(el, dx, dy, br.width, br.height);
        } else {
            // Last resort: hide siblings and snapshot artboard (sync toDataURL path).
            return captureViaCanvasSnapshot(canvas, target, artboard);
        }

        return ctx.getImageData(0, 0, out.width, out.height);
    } catch {
        return captureViaCanvasSnapshot(canvas, target, artboard);
    }
}

function captureViaCanvasSnapshot(
    canvas: fabric.Canvas,
    target: fabric.Object,
    artboard: RectBounds,
): ImageData | null {
    if (typeof document === 'undefined') return null;

    const objects = canvas.getObjects();
    const visibility = objects.map((obj) => obj.visible !== false);
    const withArtboard = canvas as CanvasWithArtboard;
    const previousVpt = canvas.viewportTransform
        ? ([...canvas.viewportTransform] as [number, number, number, number, number, number])
        : null;

    try {
        objects.forEach((obj) => {
            obj.visible = obj === target || obj === withArtboard.artboardRect;
        });
        if (withArtboard.artboardRect) {
            // Keep artboard invisible in the sample so page white doesn't flood the wand.
            withArtboard.artboardRect.visible = false;
        }
        canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
        canvas.renderAll();

        const dataUrl = canvas.toDataURL({
            format: 'png',
            multiplier: 1,
            left: artboard.left,
            top: artboard.top,
            width: artboard.width,
            height: artboard.height,
        });

        return dataUrlToImageDataSync(dataUrl, artboard.width, artboard.height);
    } catch {
        return null;
    } finally {
        objects.forEach((obj, index) => {
            obj.visible = visibility[index];
        });
        if (previousVpt) canvas.viewportTransform = previousVpt;
        canvas.requestRenderAll();
    }
}

/**
 * Decode a PNG data URL synchronously via an Image already in memory when possible.
 * Falls back to null if the browser cannot decode synchronously (tests / CORS).
 */
function dataUrlToImageDataSync(
    dataUrl: string,
    width: number,
    height: number,
): ImageData | null {
    // Prefer Offscreen decode is async — use Image with complete check only when cached.
    // For the snapshot path we draw via a temporary Image; in Jest this often fails.
    // Callers should prefer toCanvasElement / getElement.
    try {
        const img = new Image();
        img.src = dataUrl;
        // If decode is not complete, we cannot block; return null and let wand no-op.
        if (!img.complete || img.naturalWidth <= 0) return null;

        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(width));
        c.height = Math.max(1, Math.round(height));
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        return ctx.getImageData(0, 0, c.width, c.height);
    } catch {
        return null;
    }
}
