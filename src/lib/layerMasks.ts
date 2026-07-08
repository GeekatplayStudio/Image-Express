import * as fabric from 'fabric';

export type RasterMaskBounds = {
    left: number;
    top: number;
    width: number;
    height: number;
};

const loadImageElement = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load mask image.'));
    image.src = src;
});

/**
 * Converts a painted white-on-black mask (white = visible) into an
 * alpha-channel mask image. Fabric clipPaths clip by alpha, not luminance,
 * so the painted mask must become transparent where it is black.
 */
export const luminanceMaskToAlphaDataUrl = async (maskDataUrl: string): Promise<string | null> => {
    try {
        const image = await loadImageElement(maskDataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, image.naturalWidth);
        canvas.height = Math.max(1, image.naturalHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let index = 0; index < data.length; index += 4) {
            const luminance = (data[index] + data[index + 1] + data[index + 2]) / 3;
            data[index] = 255;
            data[index + 1] = 255;
            data[index + 2] = 255;
            data[index + 3] = Math.round(luminance);
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
};

/**
 * Applies a painted luminance mask to a fabric object as a raster layer mask
 * (an alpha image clipPath in scene coordinates covering the given bounds).
 */
export const applyRasterMaskToObject = async (
    target: fabric.Object,
    maskDataUrl: string,
    bounds: RasterMaskBounds,
): Promise<boolean> => {
    const alphaUrl = await luminanceMaskToAlphaDataUrl(maskDataUrl);
    if (!alphaUrl) return false;

    const maskImage = await fabric.Image.fromURL(alphaUrl, { crossOrigin: 'anonymous' });
    const naturalWidth = Math.max(1, maskImage.width || 1);
    const naturalHeight = Math.max(1, maskImage.height || 1);
    maskImage.set({
        absolutePositioned: true,
        left: bounds.left,
        top: bounds.top,
        scaleX: bounds.width / naturalWidth,
        scaleY: bounds.height / naturalHeight,
        originX: 'left',
        originY: 'top',
    });

    target.set({ clipPath: maskImage, dirty: true });
    return true;
};

/**
 * Creates a Photoshop-style "reveal all" vector mask: a rectangle covering the
 * object's own geometry, editable later via the Edit Mask flow.
 */
export const createRevealAllMask = (target: fabric.Object): fabric.Rect => {
    const width = Math.max(1, target.width || 1);
    const height = Math.max(1, target.height || 1);
    return new fabric.Rect({
        left: -width / 2,
        top: -height / 2,
        width,
        height,
        originX: 'left',
        originY: 'top',
        absolutePositioned: false,
    });
};
