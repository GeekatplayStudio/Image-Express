import * as fabric from 'fabric';
import type { ExtendedFabricObject } from '@/types';

/**
 * Stacking order for a single layer: what moves are available, and making one.
 * A layer inside a group moves among its siblings; a top-level layer moves on
 * the canvas but never beneath the page rect.
 */

export type LayerOrderAction = 'move-up' | 'move-down' | 'to-front' | 'to-back';

export interface LayerOrderState {
    canMoveUp: boolean;
    canMoveDown: boolean;
    canBringToFront: boolean;
    canSendToBack: boolean;
}

type CanvasWithPage = fabric.Canvas & { artboardRect?: fabric.Rect };

const FIXED: LayerOrderState = { canMoveUp: false, canMoveDown: false, canBringToFront: false, canSendToBack: false };

/** Layers whose position in the stack is not the user's to change. */
const isOrderLocked = (canvas: fabric.Canvas, target: fabric.Object): boolean => {
    const ext = target as ExtendedFabricObject;
    const page = (canvas as CanvasWithPage).artboardRect;
    return target.type === 'activeSelection'
        || target.type === 'selection'
        || !!ext.isRetouchLayer
        || ext.name === 'Artboard'
        || (!!page && target === page);
};

/** The index range a layer may occupy among `siblings`, and where it is now. */
const orderRange = (canvas: fabric.Canvas, target: fabric.Object) => {
    if (target.group && typeof target.group.getObjects === 'function') {
        const siblings = target.group.getObjects();
        return { index: siblings.indexOf(target), min: 0, max: siblings.length - 1, parent: target.group as fabric.Group };
    }
    const objects = canvas.getObjects();
    const page = (canvas as CanvasWithPage).artboardRect;
    const pageIndex = page ? objects.indexOf(page) : -1;
    return { index: objects.indexOf(target), min: pageIndex >= 0 ? pageIndex + 1 : 0, max: objects.length - 1, parent: null };
};

export function getLayerOrderState(canvas: fabric.Canvas | null, target: fabric.Object | null): LayerOrderState {
    if (!canvas || !target || isOrderLocked(canvas, target)) return FIXED;
    const { index, min, max } = orderRange(canvas, target);
    if (index < 0) return FIXED;
    const canMoveUp = index < max;
    const canMoveDown = index > min;
    return { canMoveUp, canMoveDown, canBringToFront: canMoveUp, canSendToBack: canMoveDown };
}

/** Move the layer. Returns false when it was already there or may not move. */
export function moveLayerInOrder(canvas: fabric.Canvas, target: fabric.Object, action: LayerOrderAction): boolean {
    if (isOrderLocked(canvas, target)) return false;
    const { index, min, max, parent } = orderRange(canvas, target);
    if (index < 0) return false;

    let next = index;
    if (action === 'move-up') next = Math.min(max, index + 1);
    if (action === 'move-down') next = Math.max(min, index - 1);
    if (action === 'to-front') next = max;
    if (action === 'to-back') next = min;
    if (next === index) return false;

    if (parent) {
        parent.remove(target);
        parent.insertAt(next, target);
        parent.setCoords();
        parent.set('dirty', true);
    } else {
        canvas.moveObjectTo(target, next);
    }
    return true;
}
