import * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';

type DuplicateCanvasObjectsOptions = {
    offsetX?: number;
    offsetY?: number;
    renameCopies?: boolean;
};

const createObjectId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `object-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export async function duplicateCanvasObjects(
    canvas: fabric.Canvas,
    objects: fabric.Object[],
    options: DuplicateCanvasObjectsOptions = {}
) {
    if (objects.length === 0) return [] as fabric.Object[];

    const {
        offsetX = 20,
        offsetY = 20,
        renameCopies = true,
    } = options;

    canvas.discardActiveObject();

    const clones: fabric.Object[] = [];
    for (const object of objects) {
        const cloned = await object.clone();
        cloned.set({
            left: (cloned.left || 0) + offsetX,
            top: (cloned.top || 0) + offsetY,
            evented: true,
        });

        (cloned as ExtendedFabricObject).id = createObjectId();

        if (renameCopies && (object as ExtendedFabricObject).name) {
            (cloned as ExtendedFabricObject).name = `${(object as ExtendedFabricObject).name} (Copy)`;
        }

        canvas.add(cloned);
        clones.push(cloned);
    }

    if (clones.length === 1) {
        canvas.setActiveObject(clones[0]);
    } else if (clones.length > 1) {
        const selection = new fabric.ActiveSelection(clones, { canvas });
        canvas.setActiveObject(selection);
    }

    canvas.requestRenderAll();
    return clones;
}

export async function duplicateActiveCanvasSelection(
    canvas: fabric.Canvas,
    options: DuplicateCanvasObjectsOptions = {}
) {
    const activeObjects = canvas.getActiveObjects();
    if (!activeObjects || activeObjects.length === 0) return [] as fabric.Object[];
    return duplicateCanvasObjects(canvas, activeObjects, options);
}