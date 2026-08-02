import { useCallback } from 'react';
import * as fabric from 'fabric';

import { morphDocumentSelectionMask } from '@/lib/selection/documentSelectionMask';
import {
    commitDocumentSelection,
    getDocumentSelectionMask,
    getDocumentSelectionTargetId,
    hasDocumentSelection,
} from '@/lib/selection/documentSelectionStore';

type UseEditorSelectionModifyArgs = {
    canvas: fabric.Canvas | null;
    selectionModifyPixels: number;
};

/**
 * Expand/contract the content selection mask when one exists.
 * (Object-bounds expand was the old Layer-pick behavior — replaced for content select.)
 */
export function useEditorSelectionModify({
    canvas,
    selectionModifyPixels,
}: UseEditorSelectionModifyArgs) {
    const handleSelectionModify = useCallback((mode: 'expand' | 'contract') => {
        if (!canvas) return;
        if (!hasDocumentSelection(canvas)) {
            canvas.requestRenderAll();
            return;
        }

        const mask = getDocumentSelectionMask(canvas);
        if (!mask) return;

        const modifyPixels = Math.max(1, Math.min(120, Math.round(selectionModifyPixels)));
        morphDocumentSelectionMask(mask, mode, modifyPixels);
        commitDocumentSelection(canvas, mask, getDocumentSelectionTargetId(canvas));
        canvas.requestRenderAll();
    }, [canvas, selectionModifyPixels]);

    return { handleSelectionModify };
}
