import { useCallback } from 'react';
import * as fabric from 'fabric';
import { ExtendedFabricObject } from '@/types';
import { ensureObjectId, moveObjectToGroup, moveObjectToCanvas } from '@/lib/fabric-utils';
import type { CanvasWithArtboard } from './propertiesPanelTypes';

/**
 * Recursive helper to find an object by ID anywhere in the canvas tree.
 */
function findObjectById(
    id: string,
    searchSpace: fabric.Object[],
    parent: fabric.Group | null = null
): { obj: fabric.Object; parent: fabric.Group | null; index: number } | null {
    for (let i = 0; i < searchSpace.length; i++) {
        const o = searchSpace[i];
        if ((o as ExtendedFabricObject).id === id) {
            return { obj: o, parent, index: i };
        }
        if (o.type === 'group' && !(o as ExtendedFabricObject).isAdjustmentLayer) {
            const res = findObjectById(id, (o as fabric.Group).getObjects(), o as fabric.Group);
            if (res) return res;
        }
    }
    return null;
}

/**
 * Hook that provides layer ordering, reorder, folder, group, mask,
 * and clip operations for the properties panel.
 */
export function useLayerOperations(
    canvas: fabric.Canvas | null,
    selectedObject: ExtendedFabricObject | null,
    updateObjects: () => void,
    applyAdjustmentLayers: () => void,
) {
    const getLayerOrderState = useCallback((target: fabric.Object | null) => {
        if (!canvas || !target) {
            return { canMoveUp: false, canMoveDown: false, canBringToFront: false, canSendToBack: false };
        }

        const ext = target as ExtendedFabricObject;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (
            target.type === 'activeSelection'
            || target.type === 'selection'
            || ext.isRetouchLayer
            || ext.name === 'Artboard'
            || (canvasWithArtboard.artboardRect && target === canvasWithArtboard.artboardRect)
        ) {
            return { canMoveUp: false, canMoveDown: false, canBringToFront: false, canSendToBack: false };
        }

        if (target.group && typeof target.group.getObjects === 'function') {
            const siblings = target.group.getObjects();
            const currentIndex = siblings.indexOf(target);
            const maxIndex = siblings.length - 1;
            const canMoveUp = currentIndex >= 0 && currentIndex < maxIndex;
            const canMoveDown = currentIndex > 0;
            return { canMoveUp, canMoveDown, canBringToFront: canMoveUp, canSendToBack: canMoveDown };
        }

        const objects = canvas.getObjects();
        const currentIndex = objects.indexOf(target);
        if (currentIndex < 0) {
            return { canMoveUp: false, canMoveDown: false, canBringToFront: false, canSendToBack: false };
        }
        const artboardIndex = canvasWithArtboard.artboardRect ? objects.indexOf(canvasWithArtboard.artboardRect) : -1;
        const minIndex = artboardIndex >= 0 ? artboardIndex + 1 : 0;
        const maxIndex = objects.length - 1;
        const canMoveUp = currentIndex < maxIndex;
        const canMoveDown = currentIndex > minIndex;
        return { canMoveUp, canMoveDown, canBringToFront: canMoveUp, canSendToBack: canMoveDown };
    }, [canvas]);

    const handleLayerOrderAction = useCallback((action: 'move-up' | 'move-down' | 'to-front' | 'to-back', targetOverride?: fabric.Object | null) => {
        if (!canvas) return;
        const target = targetOverride || selectedObject;
        if (!target) return;
        const ext = target as ExtendedFabricObject;
        const canvasWithArtboard = canvas as CanvasWithArtboard;
        if (
            target.type === 'activeSelection'
            || target.type === 'selection'
            || ext.isRetouchLayer
            || ext.name === 'Artboard'
            || (canvasWithArtboard.artboardRect && target === canvasWithArtboard.artboardRect)
        ) {
            return;
        }

        let moved = false;
        if (target.group && typeof target.group.getObjects === 'function') {
            const parent = target.group as fabric.Group;
            const siblings = parent.getObjects();
            const currentIndex = siblings.indexOf(target);
            if (currentIndex < 0) return;
            const maxIndex = siblings.length - 1;
            let nextIndex = currentIndex;
            if (action === 'move-up') nextIndex = Math.min(maxIndex, currentIndex + 1);
            if (action === 'move-down') nextIndex = Math.max(0, currentIndex - 1);
            if (action === 'to-front') nextIndex = maxIndex;
            if (action === 'to-back') nextIndex = 0;
            if (nextIndex !== currentIndex) {
                parent.remove(target);
                parent.insertAt(nextIndex, target);
                parent.setCoords();
                parent.set('dirty', true);
                moved = true;
            }
        } else {
            const objects = canvas.getObjects();
            const currentIndex = objects.indexOf(target);
            if (currentIndex < 0) return;
            const artboardIndex = canvasWithArtboard.artboardRect ? objects.indexOf(canvasWithArtboard.artboardRect) : -1;
            const minIndex = artboardIndex >= 0 ? artboardIndex + 1 : 0;
            const maxIndex = objects.length - 1;
            let nextIndex = currentIndex;
            if (action === 'move-up') nextIndex = Math.min(maxIndex, currentIndex + 1);
            if (action === 'move-down') nextIndex = Math.max(minIndex, currentIndex - 1);
            if (action === 'to-front') nextIndex = maxIndex;
            if (action === 'to-back') nextIndex = minIndex;
            if (nextIndex !== currentIndex) {
                canvas.moveObjectTo(target, nextIndex);
                moved = true;
            }
        }

        if (!moved) return;
        target.setCoords();
        if (target.group) target.group.set('dirty', true);
        canvas.setActiveObject(target);
        canvas.fire('object:modified', { target });
        canvas.requestRenderAll();
        updateObjects();
        applyAdjustmentLayers();
    }, [canvas, selectedObject, updateObjects, applyAdjustmentLayers]);

    const handleReorder = useCallback((activeId: string, overId: string) => {
        if (!canvas) return;
        const canvasObjs = canvas.getObjects();
        const activeRes = findObjectById(activeId, canvasObjs);
        const overRes = findObjectById(overId, canvasObjs);
        if (!activeRes || !overRes) return;

        const { obj: active, parent: activeParent } = activeRes;
        const { obj: over, parent: overParent, index: overIndex } = overRes;

        if (activeParent === overParent) {
            if (activeParent) {
                activeParent.remove(active);
                const updatedOverIndex = activeParent.getObjects().indexOf(over);
                activeParent.insertAt(updatedOverIndex >= 0 ? updatedOverIndex : overIndex, active);
                activeParent.setCoords();
                activeParent.set('dirty', true);
            } else {
                const idx = canvasObjs.indexOf(over);
                canvas.moveObjectTo(active, idx);
            }
        } else {
            if (activeParent && !overParent) {
                moveObjectToCanvas(active, activeParent, canvas);
                const idx = canvas.getObjects().indexOf(over);
                canvas.moveObjectTo(active, idx);
            } else if (!activeParent && overParent) {
                moveObjectToGroup(active, overParent, canvas);
                const idx = overParent.getObjects().indexOf(over);
                overParent.remove(active);
                overParent.insertAt(idx, active);
                overParent.setCoords();
                overParent.set('dirty', true);
            } else if (activeParent && overParent) {
                moveObjectToCanvas(active, activeParent, canvas);
                moveObjectToGroup(active, overParent, canvas);
                const idx = overParent.getObjects().indexOf(over);
                overParent.remove(active);
                overParent.insertAt(idx, active);
                overParent.setCoords();
                overParent.set('dirty', true);
            }
        }

        canvas.requestRenderAll();
        updateObjects();
        applyAdjustmentLayers();
    }, [canvas, updateObjects, applyAdjustmentLayers]);

    const handleAddToFolder = useCallback((activeId: string, folderId: string) => {
        if (!canvas) return;
        const canvasObjs = canvas.getObjects();
        const activeRes = findObjectById(activeId, canvasObjs);
        const folderRes = findObjectById(folderId, canvasObjs);
        if (!activeRes || !folderRes) return;
        if (folderRes.obj.type !== 'group') return;

        const active = activeRes.obj;
        const oldParent = activeRes.parent;
        const folder = folderRes.obj as fabric.Group;
        if (active === folder) return;

        if (oldParent) {
            moveObjectToCanvas(active, oldParent, canvas);
        }
        moveObjectToGroup(active, folder, canvas);
        canvas.requestRenderAll();
        updateObjects();
        applyAdjustmentLayers();
    }, [canvas, updateObjects, applyAdjustmentLayers]);

    const handleRemoveFromFolder = useCallback((itemId: string) => {
        if (!canvas) return;
        const canvasObjs = canvas.getObjects();
        const res = findObjectById(itemId, canvasObjs);
        if (res && res.parent) {
            moveObjectToCanvas(res.obj, res.parent, canvas);
            canvas.requestRenderAll();
            updateObjects();
        }
    }, [canvas, updateObjects]);

    const deleteLayer = useCallback((obj: fabric.Object) => {
        if (!canvas) return;
        const artboardRect = (canvas as CanvasWithArtboard).artboardRect;
        if (obj === artboardRect) return;
        if (obj.group) obj.group.remove(obj);
        else canvas.remove(obj);
        canvas.requestRenderAll();
    }, [canvas]);

    const handleGroup = useCallback(() => {
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'activeSelection') return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (active as any).toGroup();
        canvas.requestRenderAll();
        updateObjects();
    }, [canvas, updateObjects]);

    const handleUngroup = useCallback(() => {
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'group') return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (active as any).toActiveSelection();
        canvas.requestRenderAll();
        updateObjects();
    }, [canvas, updateObjects]);

    const handleCreateFolder = useCallback(() => {
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (active && active.type === 'activeSelection') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const group = (active as any).toGroup();
            (group as ExtendedFabricObject).name = "Folder";
            canvas.requestRenderAll();
        } else {
            const group = new fabric.Group([]);
            (group as ExtendedFabricObject).name = 'Folder';
            canvas.add(group);
            canvas.centerObject(group);
        }
        updateObjects();
    }, [canvas, updateObjects]);

    const handleCreateMask = useCallback(async () => {
        if (!canvas) return;
        const active = canvas.getActiveObjects();
        if (active.length !== 2) return;

        const isShape = (o: fabric.Object) =>
            ['rect', 'circle', 'triangle', 'polygon', 'path', 'ellipse'].includes(o.type);
        const isImage = (o: fabric.Object) =>
            ['image', 'group'].includes(o.type);

        const objA = active[0];
        const objB = active[1];

        let mask: fabric.Object | null = null;
        let target: fabric.Object | null = null;

        if (isShape(objA) && isImage(objB)) {
            mask = objA; target = objB;
        } else if (isShape(objB) && isImage(objA)) {
            mask = objB; target = objA;
        } else {
            const idxA = canvas.getObjects().indexOf(objA);
            const idxB = canvas.getObjects().indexOf(objB);
            if (idxA > idxB) { mask = objA; target = objB; }
            else { mask = objB; target = objA; }
        }

        if (!mask || !target) return;

        const cloned = await mask.clone();
        const targetMatrix = target.calcTransformMatrix();
        const maskMatrix = mask.calcTransformMatrix();
        const targetInverse = fabric.util.invertTransform(targetMatrix);
        const localMatrix = fabric.util.multiplyTransformMatrices(targetInverse, maskMatrix);
        fabric.util.applyTransformToObject(cloned, localMatrix);
        cloned.set({ absolutePositioned: false });

        target.clipPath = cloned;

        if ((target as ExtendedFabricObject).isAdjustmentLayer) {
            (target as ExtendedFabricObject).clipped = true;
            applyAdjustmentLayers();
        }

        canvas.remove(mask);
        canvas.discardActiveObject();
        canvas.setActiveObject(target);
        canvas.requestRenderAll();
        updateObjects();
    }, [canvas, updateObjects, applyAdjustmentLayers]);

    const handleReleaseMask = useCallback(() => {
        if (!selectedObject || !canvas || !selectedObject.clipPath) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectedObject.clipPath.clone().then((restored: any) => {
            const restoredObj = restored as unknown as fabric.Object;
            const clipWithPosition = selectedObject.clipPath as unknown as { absolutePositioned?: boolean };
            if (clipWithPosition.absolutePositioned) {
                restoredObj.left = selectedObject.clipPath!.left;
                restoredObj.top = selectedObject.clipPath!.top;
            } else {
                const targetMatrix = selectedObject.calcTransformMatrix();
                const localMatrix = selectedObject.clipPath!.calcTransformMatrix();
                const worldMatrix = fabric.util.multiplyTransformMatrices(targetMatrix, localMatrix);
                fabric.util.applyTransformToObject(restoredObj, worldMatrix);
            }

            canvas.add(restoredObj);
            selectedObject.clipPath = undefined;

            if ((selectedObject as ExtendedFabricObject).isAdjustmentLayer) {
                (selectedObject as ExtendedFabricObject).clipped = false;
                applyAdjustmentLayers();
            }

            selectedObject.set('dirty', true);
            canvas.requestRenderAll();
            updateObjects();
        });
    }, [canvas, selectedObject, updateObjects, applyAdjustmentLayers]);

    const toggleMaskLock = useCallback(async () => {
        if (!selectedObject || !canvas || !selectedObject.clipPath) return;
        const mask = selectedObject.clipPath;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isAbsolute = !!(mask as any).absolutePositioned;

        const targetMatrix = selectedObject.calcTransformMatrix();

        if (isAbsolute) {
            const maskMatrix = mask.calcTransformMatrix();
            const targetInverse = fabric.util.invertTransform(targetMatrix);
            const localMatrix = fabric.util.multiplyTransformMatrices(targetInverse, maskMatrix);
            fabric.util.applyTransformToObject(mask, localMatrix);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (mask as any).absolutePositioned = false;
        } else {
            const localMatrix = mask.calcTransformMatrix();
            const worldMatrix = fabric.util.multiplyTransformMatrices(targetMatrix, localMatrix);
            fabric.util.applyTransformToObject(mask, worldMatrix);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (mask as any).absolutePositioned = true;
        }

        selectedObject.set('dirty', true);
        canvas.requestRenderAll();
        updateObjects();
    }, [canvas, selectedObject, updateObjects]);

    return {
        getLayerOrderState,
        handleLayerOrderAction,
        handleReorder,
        handleAddToFolder,
        handleRemoveFromFolder,
        deleteLayer,
        handleGroup,
        handleUngroup,
        handleCreateFolder,
        handleCreateMask,
        handleReleaseMask,
        toggleMaskLock,
    };
}
