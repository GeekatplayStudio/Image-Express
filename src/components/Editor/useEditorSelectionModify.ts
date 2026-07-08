import { useCallback } from 'react';
import * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';

type UseEditorSelectionModifyArgs = {
    canvas: fabric.Canvas | null;
    selectionMode: 'layer' | 'group';
    selectionModifyPixels: number;
};

export function useEditorSelectionModify({
    canvas,
    selectionMode,
    selectionModifyPixels,
}: UseEditorSelectionModifyArgs) {
    const handleSelectionModify = useCallback((mode: 'expand' | 'contract') => {
        if (!canvas) return;

        const intersectsBounds = (
            a: { left: number; top: number; width: number; height: number },
            b: { left: number; top: number; width: number; height: number }
        ) => !(
            a.left + a.width < b.left
            || b.left + b.width < a.left
            || a.top + a.height < b.top
            || b.top + b.height < a.top
        );

        const collectSelectableObjects = () => canvas.getObjects().filter((obj) => {
            const ext = obj as ExtendedFabricObject & {
                isPenDraftAnchor?: boolean;
                isSelectionOverlayHelper?: boolean;
            };
            if (ext.isSelectionOverlayHelper) return false;
            if (obj.type === 'activeSelection' || obj.type === 'selection') return false;
            if (ext.isPenDraftAnchor) return false;
            if (ext.name === 'Artboard') return false;
            if (obj.selectable === false || obj.evented === false) return false;
            return true;
        });

        const commitSelectedObjects = (selected: fabric.Object[]) => {
            if (selected.length === 0) {
                canvas.discardActiveObject();
                canvas.requestRenderAll();
                return;
            }
            if (selectionMode === 'layer' || selected.length === 1) {
                const topMost = selected[selected.length - 1];
                if (topMost) {
                    canvas.setActiveObject(topMost);
                    canvas.requestRenderAll();
                }
                return;
            }
            const nextSelection = new fabric.ActiveSelection(selected, { canvas });
            canvas.setActiveObject(nextSelection);
            canvas.requestRenderAll();
        };

        const activeObjects = canvas.getActiveObjects();
        const activeObject = canvas.getActiveObject();
        const selectedObjects = activeObjects.length > 0
            ? activeObjects
            : activeObject
                ? [activeObject]
                : [];
        if (selectedObjects.length === 0) {
            canvas.requestRenderAll();
            return;
        }

        const bounds = selectedObjects.map((obj) => obj.getBoundingRect());
        const unionBounds = bounds.reduce((acc, rect) => ({
            left: Math.min(acc.left, rect.left),
            top: Math.min(acc.top, rect.top),
            width: Math.max(acc.left + acc.width, rect.left + rect.width) - Math.min(acc.left, rect.left),
            height: Math.max(acc.top + acc.height, rect.top + rect.height) - Math.min(acc.top, rect.top),
        }));

        const modifyPixels = Math.max(1, Math.min(120, Math.round(selectionModifyPixels)));
        if (mode === 'expand') {
            const expandedBounds = {
                left: unionBounds.left - modifyPixels,
                top: unionBounds.top - modifyPixels,
                width: unionBounds.width + (modifyPixels * 2),
                height: unionBounds.height + (modifyPixels * 2),
            };
            const expandedSelection = collectSelectableObjects().filter((obj) => intersectsBounds(expandedBounds, obj.getBoundingRect()));
            commitSelectedObjects(expandedSelection);
            return;
        }

        const contractedBounds = {
            left: unionBounds.left + modifyPixels,
            top: unionBounds.top + modifyPixels,
            width: Math.max(0, unionBounds.width - (modifyPixels * 2)),
            height: Math.max(0, unionBounds.height - (modifyPixels * 2)),
        };

        if (contractedBounds.width < 1 || contractedBounds.height < 1) {
            commitSelectedObjects([selectedObjects[selectedObjects.length - 1]]);
            return;
        }

        const contractedSelection = selectedObjects.filter((obj) => {
            const rect = obj.getBoundingRect();
            const centerX = rect.left + (rect.width / 2);
            const centerY = rect.top + (rect.height / 2);
            return (
                centerX >= contractedBounds.left
                && centerX <= contractedBounds.left + contractedBounds.width
                && centerY >= contractedBounds.top
                && centerY <= contractedBounds.top + contractedBounds.height
            );
        });

        commitSelectedObjects(contractedSelection);
    }, [canvas, selectionMode, selectionModifyPixels]);

    return { handleSelectionModify };
}
