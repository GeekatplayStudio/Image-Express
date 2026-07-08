import { useCallback } from 'react';
import * as fabric from 'fabric';
import { ExtendedFabricObject } from '@/types';
import { ensureObjectId, moveObjectToGroup, moveObjectToCanvas } from '@/lib/fabric-utils';
import { createRevealAllMask } from '@/lib/layerMasks';
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
        const group = (active as any).toGroup() as fabric.Group;
        // Report sub-targets so double-click can enter the group on canvas.
        group.set({ subTargetCheck: true });
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
            const group = (active as any).toGroup() as fabric.Group;
            (group as ExtendedFabricObject).name = "Folder";
            group.set({ subTargetCheck: true });
            canvas.requestRenderAll();
        } else {
            // Empty folder: exists only as a drop target in the layers panel until
            // it has children, so it must not catch canvas events.
            const group = new fabric.Group([], { subTargetCheck: true, evented: false });
            (group as ExtendedFabricObject).name = 'Folder';
            canvas.add(group);
            canvas.centerObject(group);
        }
        updateObjects();
    }, [canvas, updateObjects]);

    /**
     * Finds the next visual layer below the target in the same parent scope,
     * skipping adjustment layers, retouch layers, and the artboard.
     */
    const getVisualLayerBelow = useCallback((target: fabric.Object): fabric.Object | null => {
        if (!canvas) return null;
        const scope = target.group && typeof target.group.getObjects === 'function'
            ? target.group.getObjects()
            : canvas.getObjects();
        const index = scope.indexOf(target);
        if (index <= 0) return null;

        const artboardRect = (canvas as CanvasWithArtboard).artboardRect;
        for (let i = index - 1; i >= 0; i--) {
            const candidate = scope[i] as ExtendedFabricObject;
            if (candidate.isAdjustmentLayer || candidate.isRetouchLayer) continue;
            if (candidate.name === 'Artboard' || candidate === artboardRect) continue;
            if (candidate.isMaskEditing) continue;
            return candidate;
        }
        return null;
    }, [canvas]);

    /**
     * Rebuilds a clipped layer's mask from its base layer's current geometry.
     * The mask lives in scene coordinates (absolutePositioned) so the clipped
     * layer can slide underneath it, exactly like a Photoshop clipping mask.
     */
    const buildClipFromBase = useCallback(async (target: fabric.Object, base: fabric.Object) => {
        const cloned = await base.clone();
        cloned.set({ isAdjustmentLayer: false, absolutePositioned: true });
        fabric.util.applyTransformToObject(cloned, base.calcTransformMatrix());
        target.set({ clipPath: cloned, dirty: true });
    }, []);

    /** Photoshop "Create Clipping Mask": clip the selected layer to the layer below it. */
    const handleClipToBelow = useCallback(async (targetOverride?: fabric.Object | null): Promise<boolean> => {
        if (!canvas) return false;
        const target = targetOverride || selectedObject;
        if (!target) return false;
        const ext = target as ExtendedFabricObject;
        if (ext.isAdjustmentLayer) return false;

        const base = getVisualLayerBelow(target);
        if (!base) return false;

        await buildClipFromBase(target, base);
        target.set({ isClippedToBelow: true, clipSourceId: ensureObjectId(base) });
        canvas.fire('object:modified', { target });
        canvas.requestRenderAll();
        updateObjects();
        return true;
    }, [buildClipFromBase, canvas, getVisualLayerBelow, selectedObject, updateObjects]);

    /**
     * Clips the visual layer sitting directly above the target to the target
     * (the "clip layer above to this" direction of a clipping mask).
     */
    const handleClipLayerAboveToThis = useCallback(async (targetOverride?: fabric.Object | null): Promise<boolean> => {
        if (!canvas) return false;
        const target = targetOverride || selectedObject;
        if (!target) return false;

        const scope = target.group && typeof target.group.getObjects === 'function'
            ? target.group.getObjects()
            : canvas.getObjects();
        const index = scope.indexOf(target);
        if (index < 0 || index >= scope.length - 1) return false;

        for (let i = index + 1; i < scope.length; i++) {
            const candidate = scope[i] as ExtendedFabricObject;
            if (candidate.isAdjustmentLayer || candidate.isRetouchLayer || candidate.isMaskEditing) continue;
            if (candidate.name === 'Artboard') continue;
            if (candidate.isClippedToBelow) return false; // already clipped
            return handleClipToBelow(candidate);
        }
        return false;
    }, [canvas, handleClipToBelow, selectedObject]);

    /** Photoshop "Release Clipping Mask". */
    const handleReleaseClipBelow = useCallback((targetOverride?: fabric.Object | null) => {
        if (!canvas) return;
        const target = targetOverride || selectedObject;
        if (!target) return;
        const ext = target as ExtendedFabricObject;
        if (!ext.isClippedToBelow) return;

        target.set({ clipPath: undefined, isClippedToBelow: false, clipSourceId: undefined, dirty: true });
        canvas.fire('object:modified', { target });
        canvas.requestRenderAll();
        updateObjects();
    }, [canvas, selectedObject, updateObjects]);

    /**
     * Keeps clip masks in sync when their base layer changes (move/scale/edit).
     * Call on object:modified with the changed object.
     */
    const syncClippedLayersToBase = useCallback(async (changed: fabric.Object) => {
        if (!canvas) return;
        const changedId = (changed as ExtendedFabricObject).id;
        if (!changedId) return;

        const collect = (list: fabric.Object[]): ExtendedFabricObject[] => list.flatMap((obj) => {
            const ext = obj as ExtendedFabricObject;
            const nested = obj.type === 'group' ? collect((obj as fabric.Group).getObjects()) : [];
            return ext.isClippedToBelow && ext.clipSourceId === changedId ? [ext, ...nested] : nested;
        });

        const dependents = collect(canvas.getObjects());
        if (dependents.length === 0) return;

        for (const dependent of dependents) {
            await buildClipFromBase(dependent, changed);
        }
        canvas.requestRenderAll();
    }, [buildClipFromBase, canvas]);

    /**
     * Photoshop "Add layer mask" (reveal all): gives the layer a rectangular
     * vector mask covering its own bounds, ready for Edit Mask reshaping.
     */
    const handleAddRevealAllMask = useCallback((targetOverride?: fabric.Object | null) => {
        if (!canvas) return;
        const target = targetOverride || selectedObject;
        if (!target) return;
        const ext = target as ExtendedFabricObject;
        if (ext.isAdjustmentLayer || ext.isClippedToBelow || target.clipPath) return;

        target.set({ clipPath: createRevealAllMask(target), dirty: true });
        canvas.fire('object:modified', { target });
        canvas.requestRenderAll();
        updateObjects();
    }, [canvas, selectedObject, updateObjects]);

    /**
     * Detaches a layer's mask back onto the canvas so it can be transformed,
     * then re-applied with handleApplyEditedMask.
     */
    const handleEditMask = useCallback(async (targetOverride?: fabric.Object | null) => {
        const target = targetOverride || selectedObject;
        if (!canvas || !target || !target.clipPath) return;
        const ext = target as ExtendedFabricObject;
        if (ext.isClippedToBelow) return;

        const mask = target.clipPath;
        const restored = (await mask.clone()) as unknown as fabric.Object;
        const restoredExt = restored as ExtendedFabricObject;

        const clipWithPosition = mask as unknown as { absolutePositioned?: boolean };
        if (!clipWithPosition.absolutePositioned) {
            const targetMatrix = target.calcTransformMatrix();
            const localMatrix = mask.calcTransformMatrix();
            const worldMatrix = fabric.util.multiplyTransformMatrices(targetMatrix, localMatrix);
            fabric.util.applyTransformToObject(restored, worldMatrix);
        }

        restoredExt.isMaskEditing = true;
        restoredExt.maskTargetId = ensureObjectId(target);
        restoredExt.name = 'Mask (editing)';
        restored.set({ opacity: 0.55 });

        target.set({ clipPath: undefined, dirty: true });
        canvas.add(restored);
        canvas.setActiveObject(restored);
        canvas.requestRenderAll();
        updateObjects();
    }, [canvas, selectedObject, updateObjects]);

    /** Re-applies a detached mask (from handleEditMask) to its owner layer. */
    const handleApplyEditedMask = useCallback(async (maskOverride?: fabric.Object | null) => {
        if (!canvas) return;
        const maskObject = (maskOverride || selectedObject) as ExtendedFabricObject | null;
        if (!maskObject || !maskObject.isMaskEditing || !maskObject.maskTargetId) return;

        const targetRes = findObjectById(maskObject.maskTargetId, canvas.getObjects());
        if (!targetRes) return;
        const target = targetRes.obj;

        const cloned = await maskObject.clone();
        cloned.set({ opacity: 1 });
        const targetMatrix = target.calcTransformMatrix();
        const maskMatrix = maskObject.calcTransformMatrix();
        const targetInverse = fabric.util.invertTransform(targetMatrix);
        const localMatrix = fabric.util.multiplyTransformMatrices(targetInverse, maskMatrix);
        fabric.util.applyTransformToObject(cloned, localMatrix);
        cloned.set({ absolutePositioned: false });

        target.set({ clipPath: cloned, dirty: true });

        canvas.remove(maskObject);
        canvas.discardActiveObject();
        canvas.setActiveObject(target);
        canvas.fire('object:modified', { target });
        canvas.requestRenderAll();
        updateObjects();
    }, [canvas, selectedObject, updateObjects]);

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
            // eslint-disable-next-line react-hooks/immutability, @typescript-eslint/no-explicit-any
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
        handleClipToBelow,
        handleClipLayerAboveToThis,
        handleReleaseClipBelow,
        syncClippedLayersToBase,
        handleEditMask,
        handleApplyEditedMask,
        handleAddRevealAllMask,
    };
}
