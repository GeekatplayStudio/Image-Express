// src/lib/imageCrop.ts
// Geometry helpers for non-destructive per-layer (image) cropping.
//
// Fabric images crop by windowing into their source pixels: `cropX`/`cropY`
// are the top-left offset into the source (in source pixels) and `width`/
// `height` are the size of the visible window (also source pixels). Changing
// these hides pixels without discarding them, so cropping is fully reversible.
//
// The tricky part is keeping the *kept* region visually anchored while the
// window and object dimensions change. We do all of it through the image's
// own transform matrix, so it stays correct for any origin, scale, or angle.
import * as fabric from 'fabric';

const clamp = (value: number, lo: number, hi: number) => {
    if (hi < lo) return lo;
    return Math.max(lo, Math.min(hi, value));
};

/** Natural (source) pixel size of an image's underlying element. */
export const getImageSourceSize = (image: fabric.Image): { width: number; height: number } => {
    const withOriginal = image as unknown as { getOriginalSize?: () => { width: number; height: number } };
    if (typeof withOriginal.getOriginalSize === 'function') {
        const size = withOriginal.getOriginalSize();
        if (size && size.width && size.height) return { width: size.width, height: size.height };
    }
    const element = image.getElement() as (HTMLImageElement & HTMLCanvasElement) | undefined;
    const width = element?.naturalWidth || element?.width || image.width || 0;
    const height = element?.naturalHeight || element?.height || image.height || 0;
    return { width, height };
};

/** The image's current visible window in source-pixel terms. */
export const getImageCropWindow = (image: fabric.Image) => ({
    cropX: image.cropX || 0,
    cropY: image.cropY || 0,
    width: image.width || 0,
    height: image.height || 0,
});

/**
 * Scene-space corners [tl, tr, br, bl] of the image's currently-visible box.
 * Used to initialise the interactive crop frame so it starts flush with what
 * the user already sees.
 */
export const getImageVisibleCorners = (image: fabric.Image): fabric.Point[] => {
    const w = image.width || 0;
    const h = image.height || 0;
    const matrix = image.calcTransformMatrix();
    const local = [
        new fabric.Point(-w / 2, -h / 2),
        new fabric.Point(w / 2, -h / 2),
        new fabric.Point(w / 2, h / 2),
        new fabric.Point(-w / 2, h / 2),
    ];
    return local.map((point) => fabric.util.transformPoint(point, matrix));
};

export type CropWindow = { cropX: number; cropY: number; width: number; height: number };

/**
 * Given an axis-aligned (in the image's local frame) crop rectangle, compute
 * the new source-pixel crop window, clamped so it never exceeds the current
 * window or the source bounds. Pure — does not mutate the image.
 *
 * `frameCorners` are scene-space points (any 4 corners of the crop frame). We
 * project them into the image's local, unscaled, centered coordinate space,
 * take the axis-aligned bounds there, and translate that into a source-pixel
 * window relative to the existing crop.
 */
export const computeCropWindow = (image: fabric.Image, frameCorners: fabric.Point[]): CropWindow => {
    const inverse = fabric.util.invertTransform(image.calcTransformMatrix());
    const locals = frameCorners.map((point) => fabric.util.transformPoint(point, inverse));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of locals) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }

    const { cropX, cropY, width, height } = getImageCropWindow(image);
    const source = getImageSourceSize(image);

    // local-centered -> source pixels (visible window spans [-w/2, w/2] over [cropX, cropX+width])
    let newCropX = cropX + (minX + width / 2);
    let newCropY = cropY + (minY + height / 2);
    let newWidth = maxX - minX;
    let newHeight = maxY - minY;

    // Trim only inward: stay within the current window and the source bounds.
    newCropX = clamp(newCropX, cropX, cropX + width);
    newCropY = clamp(newCropY, cropY, cropY + height);
    newCropX = clamp(newCropX, 0, Math.max(0, source.width - 1));
    newCropY = clamp(newCropY, 0, Math.max(0, source.height - 1));
    newWidth = clamp(newWidth, 1, Math.min(cropX + width, source.width) - newCropX);
    newHeight = clamp(newHeight, 1, Math.min(cropY + height, source.height) - newCropY);

    return { cropX: newCropX, cropY: newCropY, width: newWidth, height: newHeight };
};

/**
 * Apply a computed crop window to the image while keeping `anchorScene` (a
 * scene point that should map to the new visible top-left) fixed on screen —
 * so the kept region doesn't jump.
 */
export const applyCropWindow = (image: fabric.Image, window: CropWindow, anchorScene: fabric.Point): void => {
    image.set({ cropX: window.cropX, cropY: window.cropY, width: window.width, height: window.height });
    image.setCoords();
    const currentTopLeft = fabric.util.transformPoint(
        new fabric.Point(-window.width / 2, -window.height / 2),
        image.calcTransformMatrix(),
    );
    image.set({
        left: (image.left || 0) + (anchorScene.x - currentTopLeft.x),
        top: (image.top || 0) + (anchorScene.y - currentTopLeft.y),
    });
    image.setCoords();
};

/**
 * Reset an image to show its full source, keeping its current on-screen
 * top-left corner fixed. Returns the pre-reset window so callers can restore.
 */
export const resetImageCrop = (image: fabric.Image): CropWindow => {
    const previous = getImageCropWindow(image);
    const source = getImageSourceSize(image);
    if (!source.width || !source.height) return previous;
    const topLeft = getImageVisibleCorners(image)[0];
    applyCropWindow(
        image,
        { cropX: 0, cropY: 0, width: source.width, height: source.height },
        // Keep the current visible top-left anchored to the same screen point.
        topLeft,
    );
    return previous;
};

/** True when the image is showing less than its full source (i.e. is cropped). */
export const isImageCropped = (image: fabric.Image): boolean => {
    const { cropX, cropY, width, height } = getImageCropWindow(image);
    const source = getImageSourceSize(image);
    return cropX > 0.5 || cropY > 0.5
        || width < source.width - 0.5 || height < source.height - 0.5;
};

// ---------------------------------------------------------------------------
// Edge-based crop (the Properties-panel sliders).
//
// Each side is expressed as a fraction (0–1) of the FULL source, measured from
// that edge — so the four values are absolute, not incremental. left=0 means
// "left edge at the full extent"; raising it hides that strip, lowering it
// reveals it again. This makes the sliders reversible (you can un-crop) and
// order-independent, unlike an inward-only drag frame.
// ---------------------------------------------------------------------------

export type CropEdges = { left: number; right: number; top: number; bottom: number };

/** Read the current crop as edge fractions for the sliders. */
export const readEdgeCrop = (image: fabric.Image): CropEdges => {
    const { cropX, cropY, width, height } = getImageCropWindow(image);
    const source = getImageSourceSize(image);
    const w = source.width || 1;
    const h = source.height || 1;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    return {
        left: clamp01(cropX / w),
        top: clamp01(cropY / h),
        right: clamp01(1 - (cropX + width) / w),
        bottom: clamp01(1 - (cropY + height) / h),
    };
};

/** Rotate a vector by an angle in degrees (image angle), matching fabric. */
const rotateVec = (x: number, y: number, angleDeg: number): fabric.Point => {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return new fabric.Point(x * cos - y * sin, x * sin + y * cos);
};

/**
 * Apply edge-fraction crop to an image, keeping the *kept* content fixed in the
 * full-image layout (trimming a side hides that strip without moving the rest).
 * Absolute in source space, so it also expands a previously-cropped side.
 */
export const applyEdgeCrop = (image: fabric.Image, edges: CropEdges): void => {
    const source = getImageSourceSize(image);
    const srcW = source.width;
    const srcH = source.height;
    if (!srcW || !srcH) return;

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    // Leave at least ~1% on each axis so width/height never collapse to zero.
    let left = clamp(edges.left, 0, 0.99);
    let right = clamp(edges.right, 0, 0.99);
    let top = clamp(edges.top, 0, 0.99);
    let bottom = clamp(edges.bottom, 0, 0.99);
    if (left + right > 0.99) { const k = 0.99 / (left + right); left *= k; right *= k; }
    if (top + bottom > 0.99) { const k = 0.99 / (top + bottom); top *= k; bottom *= k; }

    const cropX = left * srcW;
    const cropY = top * srcH;
    const width = srcW * (1 - left - right);
    const height = srcH * (1 - top - bottom);

    const scaleX = image.scaleX || 1;
    const scaleY = image.scaleY || 1;
    const angle = image.angle || 0;

    // origin0 = scene position of the FULL source's (0,0) corner, in the layout
    // the image currently occupies. Derive it from the current visible corner.
    const current = getImageCropWindow(image);
    const visibleTopLeft = getImageVisibleCorners(image)[0];
    const offsetToFull = rotateVec(current.cropX * scaleX, current.cropY * scaleY, angle);
    const origin0 = new fabric.Point(visibleTopLeft.x - offsetToFull.x, visibleTopLeft.y - offsetToFull.y);

    // Anchor for the new window: where the new visible top-left should land so
    // the retained pixels stay put.
    const newOffset = rotateVec(cropX * scaleX, cropY * scaleY, angle);
    const anchor = new fabric.Point(origin0.x + newOffset.x, origin0.y + newOffset.y);

    applyCropWindow(image, { cropX, cropY, width, height }, anchor);
};
