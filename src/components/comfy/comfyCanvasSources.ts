import * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { left?: number; top?: number; width: number; height: number };
};

export type ComfySourceKind = 'selection' | 'layers' | 'canvas';

export interface ComfyCanvasLayerOption {
    id: string;
    label: string;
    isSelected: boolean;
}

export interface ComfyCapturedSource {
    dataUrl: string;
    width: number;
    height: number;
    bounds: { left: number; top: number; width: number; height: number };
    layerIds: string[];
}

const ensureComfyLayerId = (object: fabric.Object): string => {
    const extended = object as ExtendedFabricObject;
    if (!extended.id) {
        extended.id = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    return extended.id;
};

const describeLayer = (object: fabric.Object, indexFromTop: number): string => {
    const extended = object as ExtendedFabricObject;
    if (extended.name && extended.name.trim().length > 0) {
        return extended.name;
    }

    const type = object.type || 'object';
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    return `${typeLabel} ${indexFromTop + 1}`;
};

export const listComfyCanvasLayers = (canvas: fabric.Canvas | null): ComfyCanvasLayerOption[] => {
    if (!canvas) return [];

    const activeIds = new Set(canvas.getActiveObjects().map((object) => ensureComfyLayerId(object)));
    return [...canvas.getObjects()]
        .reverse()
        .map((object, indexFromTop) => ({
            id: ensureComfyLayerId(object),
            label: describeLayer(object, indexFromTop),
            isSelected: activeIds.has(ensureComfyLayerId(object)),
        }));
};

export const getSelectedComfyLayerIds = (canvas: fabric.Canvas | null): string[] => {
    if (!canvas) return [];
    return canvas.getActiveObjects().map((object) => ensureComfyLayerId(object));
};

const unionBounds = (objects: fabric.Object[]) => {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const object of objects) {
        const rect = object.getBoundingRect();
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.left + rect.width);
        bottom = Math.max(bottom, rect.top + rect.height);
    }

    return {
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
    };
};

/**
 * Captures the given layers in isolation (all other objects hidden) so overlapping
 * content does not bleed into the workflow input image.
 */
export const captureComfyLayersSource = (
    canvas: fabric.Canvas | null,
    layerIds: string[],
): ComfyCapturedSource | null => {
    if (!canvas || layerIds.length === 0) return null;

    const idSet = new Set(layerIds);
    const objects = canvas.getObjects();
    const targets = objects.filter((object) => idSet.has(ensureComfyLayerId(object)));
    if (targets.length === 0) return null;

    const originalVpt = canvas.viewportTransform;
    const originalVisibility = objects.map((object) => object.visible);
    const originalActive = canvas.getActiveObject();
    canvas.discardActiveObject();
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];

    try {
        objects.forEach((object) => {
            object.visible = targets.includes(object);
        });
        canvas.renderAll();

        const bounds = unionBounds(targets);
        const dataUrl = canvas.toDataURL({
            format: 'png',
            multiplier: 1,
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
        });

        return {
            dataUrl,
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            bounds,
            layerIds: targets.map((object) => ensureComfyLayerId(object)),
        };
    } catch {
        return null;
    } finally {
        objects.forEach((object, index) => {
            object.visible = originalVisibility[index];
        });
        if (originalActive) {
            canvas.setActiveObject(originalActive);
        }
        if (originalVpt) {
            canvas.setViewportTransform(originalVpt);
        }
        canvas.renderAll();
    }
};

export const captureComfyCanvasSource = (canvas: fabric.Canvas | null): ComfyCapturedSource | null => {
    if (!canvas) return null;

    const withArtboard = canvas as CanvasWithArtboard;
    const originalVpt = canvas.viewportTransform;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.renderAll();

    try {
        const bounds = withArtboard.artboard && withArtboard.artboard.width > 0 && withArtboard.artboard.height > 0
            ? {
                left: withArtboard.artboard.left || 0,
                top: withArtboard.artboard.top || 0,
                width: withArtboard.artboard.width,
                height: withArtboard.artboard.height,
            }
            : {
                left: 0,
                top: 0,
                width: Math.max(1, canvas.getWidth()),
                height: Math.max(1, canvas.getHeight()),
            };

        const dataUrl = canvas.toDataURL({
            format: 'png',
            multiplier: 1,
            ...bounds,
        });

        return {
            dataUrl,
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            bounds,
            layerIds: [],
        };
    } catch {
        return null;
    } finally {
        if (originalVpt) {
            canvas.setViewportTransform(originalVpt);
        }
        canvas.renderAll();
    }
};

export const captureComfySource = (
    canvas: fabric.Canvas | null,
    kind: ComfySourceKind,
    layerIds: string[],
): ComfyCapturedSource | null => {
    if (kind === 'canvas') {
        return captureComfyCanvasSource(canvas);
    }

    const ids = kind === 'selection' ? getSelectedComfyLayerIds(canvas) : layerIds;
    return captureComfyLayersSource(canvas, ids);
};

export interface ComfyOutpaintPadding {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface ComfyOutpaintPayload {
    imageDataUrl: string;
    maskDataUrl: string;
    width: number;
    height: number;
}

/**
 * Pads the source by the given per-side amounts and builds the matching mask
 * (white = area to generate, black = preserved source pixels).
 */
export const buildComfyOutpaintPayload = (
    source: ComfyCapturedSource,
    padding: ComfyOutpaintPadding,
): Promise<ComfyOutpaintPayload | null> => new Promise((resolve) => {
    const top = Math.max(0, Math.round(padding.top));
    const right = Math.max(0, Math.round(padding.right));
    const bottom = Math.max(0, Math.round(padding.bottom));
    const left = Math.max(0, Math.round(padding.left));

    if (top + right + bottom + left === 0) {
        resolve(null);
        return;
    }

    const image = new Image();

    image.onload = () => {
        const width = image.naturalWidth + left + right;
        const height = image.naturalHeight + top + bottom;

        const imageCanvas = document.createElement('canvas');
        imageCanvas.width = width;
        imageCanvas.height = height;
        const imageCtx = imageCanvas.getContext('2d');

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext('2d');

        if (!imageCtx || !maskCtx) {
            resolve(null);
            return;
        }

        imageCtx.drawImage(image, left, top);

        maskCtx.fillStyle = '#ffffff';
        maskCtx.fillRect(0, 0, width, height);
        maskCtx.fillStyle = '#000000';
        maskCtx.fillRect(left, top, image.naturalWidth, image.naturalHeight);

        resolve({
            imageDataUrl: imageCanvas.toDataURL('image/png'),
            maskDataUrl: maskCanvas.toDataURL('image/png'),
            width,
            height,
        });
    };
    image.onerror = () => resolve(null);
    image.src = source.dataUrl;
});

export const createComfySolidMaskDataUrl = (width: number, height: number): string | null => {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = Math.max(1, Math.round(width));
    maskCanvas.height = Math.max(1, Math.round(height));
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    return maskCanvas.toDataURL('image/png');
};

export interface InsertComfyResultOptions {
    replaceSourceLayers?: boolean;
}

/**
 * Inserts a generated image onto the canvas. When the run had a layer/selection
 * source, the result is placed over the source bounds (scaled to match); otherwise
 * it lands at the artboard origin.
 */
export const insertComfyResultOntoCanvas = async (
    canvas: fabric.Canvas,
    resultDataUrl: string,
    source: ComfyCapturedSource | null,
    options: InsertComfyResultOptions = {},
): Promise<fabric.Image> => {
    const image = await fabric.Image.fromURL(resultDataUrl, { crossOrigin: 'anonymous' });

    if (source) {
        const scaleX = source.bounds.width / Math.max(1, image.width || 1);
        const scaleY = source.bounds.height / Math.max(1, image.height || 1);
        const scale = Math.min(scaleX, scaleY);
        image.set({
            left: source.bounds.left,
            top: source.bounds.top,
            scaleX: scale,
            scaleY: scale,
        });
    } else {
        const withArtboard = canvas as CanvasWithArtboard;
        image.set({
            left: withArtboard.artboard?.left || 0,
            top: withArtboard.artboard?.top || 0,
        });
    }

    if (options.replaceSourceLayers && source && source.layerIds.length > 0) {
        const idSet = new Set(source.layerIds);
        const toRemove = canvas.getObjects().filter((object) => idSet.has(ensureComfyLayerId(object)));
        toRemove.forEach((object) => canvas.remove(object));
    }

    (image as ExtendedFabricObject).name = 'ComfyUI result';
    canvas.add(image);
    canvas.setActiveObject(image);
    canvas.requestRenderAll();
    return image;
};
