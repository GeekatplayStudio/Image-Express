import type * as fabric from 'fabric';
import {
    clearDocumentSelectionMask,
    createDocumentSelectionMask,
    isDocumentSelectionEmpty,
    type DocumentSelectionMask,
} from '@/lib/selection/documentSelectionMask';
import { getArtboardSelectionBounds } from '@/lib/selection/selectionLayerCapture';

export type CanvasWithDocumentSelection = fabric.Canvas & {
    __ieSelectionMask?: DocumentSelectionMask | null;
    __ieSelectionTargetId?: string | null;
    __ieSelectionVersion?: number;
};

type Listener = () => void;
const listeners = new WeakMap<object, Set<Listener>>();

function emit(canvas: CanvasWithDocumentSelection) {
    canvas.__ieSelectionVersion = (canvas.__ieSelectionVersion || 0) + 1;
    listeners.get(canvas)?.forEach((listener) => listener());
}

export function subscribeDocumentSelection(canvas: fabric.Canvas, listener: Listener): () => void {
    const key = canvas as object;
    let set = listeners.get(key);
    if (!set) {
        set = new Set();
        listeners.set(key, set);
    }
    set.add(listener);
    return () => {
        set?.delete(listener);
    };
}

export function getDocumentSelectionMask(
    canvas: fabric.Canvas | null,
): DocumentSelectionMask | null {
    if (!canvas) return null;
    return (canvas as CanvasWithDocumentSelection).__ieSelectionMask || null;
}

export function getDocumentSelectionTargetId(canvas: fabric.Canvas | null): string | null {
    if (!canvas) return null;
    return (canvas as CanvasWithDocumentSelection).__ieSelectionTargetId || null;
}

export function ensureDocumentSelectionMask(canvas: fabric.Canvas): DocumentSelectionMask {
    const typed = canvas as CanvasWithDocumentSelection;
    const bounds = getArtboardSelectionBounds(canvas);
    const current = typed.__ieSelectionMask;
    if (
        current
        && current.width === Math.round(bounds.width)
        && current.height === Math.round(bounds.height)
        && current.left === bounds.left
        && current.top === bounds.top
    ) {
        return current;
    }

    const next = createDocumentSelectionMask(bounds);
    typed.__ieSelectionMask = next;
    return next;
}

export function commitDocumentSelection(
    canvas: fabric.Canvas,
    mask: DocumentSelectionMask,
    targetId: string | null,
) {
    const typed = canvas as CanvasWithDocumentSelection;
    typed.__ieSelectionMask = mask;
    typed.__ieSelectionTargetId = targetId;
    emit(typed);
}

export function clearDocumentSelection(canvas: fabric.Canvas | null) {
    if (!canvas) return;
    const typed = canvas as CanvasWithDocumentSelection;
    if (typed.__ieSelectionMask) {
        clearDocumentSelectionMask(typed.__ieSelectionMask);
    }
    typed.__ieSelectionTargetId = null;
    emit(typed);
}

export function hasDocumentSelection(canvas: fabric.Canvas | null): boolean {
    const mask = getDocumentSelectionMask(canvas);
    return Boolean(mask && !isDocumentSelectionEmpty(mask));
}
