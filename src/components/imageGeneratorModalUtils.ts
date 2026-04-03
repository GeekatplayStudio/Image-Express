import * as fabric from 'fabric';

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number };
    contains?: (object: fabric.Object) => boolean;
};

type ViewportTransform = [number, number, number, number, number, number];

export interface CapturedSourceInspection {
    sampleCount: number;
    nearWhiteRatio: number;
    looksBlank: boolean;
}

export const inspectCapturedSourcePixels = (pixels: ArrayLike<number>): CapturedSourceInspection => {
    let sampleCount = 0;
    let nearWhiteCount = 0;

    for (let index = 0; index <= pixels.length - 4; index += 4) {
        const red = Number(pixels[index]);
        const green = Number(pixels[index + 1]);
        const blue = Number(pixels[index + 2]);
        const alpha = Number(pixels[index + 3]);

        if (alpha < 16) {
            continue;
        }

        sampleCount += 1;

        const maxChannel = Math.max(red, green, blue);
        const minChannel = Math.min(red, green, blue);
        const average = (red + green + blue) / 3;
        if (average >= 247 && (maxChannel - minChannel) <= 10) {
            nearWhiteCount += 1;
        }
    }

    const nearWhiteRatio = sampleCount > 0 ? nearWhiteCount / sampleCount : 0;
    return {
        sampleCount,
        nearWhiteRatio,
        looksBlank: sampleCount > 0 && nearWhiteRatio >= 0.99,
    };
};

export const inspectCapturedSourceDataUrl = async (dataUrl: string): Promise<CapturedSourceInspection> => {
    if (typeof document === 'undefined' || !dataUrl.startsWith('data:')) {
        return {
            sampleCount: 0,
            nearWhiteRatio: 0,
            looksBlank: false,
        };
    }

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error('Failed to inspect captured source image.'));
        nextImage.src = dataUrl;
    });

    const sampleWidth = Math.max(1, Math.min(128, image.naturalWidth || image.width || 1));
    const sampleHeight = Math.max(1, Math.min(128, image.naturalHeight || image.height || 1));
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = sampleWidth;
    probeCanvas.height = sampleHeight;
    const context = probeCanvas.getContext('2d');
    if (!context) {
        return {
            sampleCount: 0,
            nearWhiteRatio: 0,
            looksBlank: false,
        };
    }

    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);
    return inspectCapturedSourcePixels(imageData.data);
};

export const captureComfySourceImageFromCanvas = (
    canvas: CanvasWithArtboard | null | undefined,
    zoneObject: fabric.Rect | null,
    zoneWidth: number,
    zoneHeight: number
): string | null => {
    if (!canvas) {
        return null;
    }

    const activeObject = canvas.getActiveObject();
    const activeBounds = (
        activeObject
        && activeObject !== zoneObject
        && typeof activeObject.getBoundingRect === 'function'
    )
        ? activeObject.getBoundingRect()
        : null;
    const shouldHideZone = Boolean(
        zoneObject
        && (typeof canvas.contains !== 'function' || canvas.contains(zoneObject))
        && zoneObject.visible !== false
    );
    const originalVpt = canvas.viewportTransform as ViewportTransform | undefined;

    if (shouldHideZone && zoneObject) {
        zoneObject.set('visible', false);
    }

    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.requestRenderAll();

    try {
        if (activeBounds) {
            return canvas.toDataURL({
                format: 'png',
                multiplier: 1,
                left: Math.max(0, activeBounds.left),
                top: Math.max(0, activeBounds.top),
                width: Math.max(1, activeBounds.width),
                height: Math.max(1, activeBounds.height),
            });
        }

        if (zoneObject) {
            return canvas.toDataURL({
                format: 'png',
                multiplier: 1,
                left: Math.max(0, zoneObject.left || 0),
                top: Math.max(0, zoneObject.top || 0),
                width: Math.max(1, (zoneObject.width || zoneWidth) * (zoneObject.scaleX || 1)),
                height: Math.max(1, (zoneObject.height || zoneHeight) * (zoneObject.scaleY || 1)),
            });
        }

        const extCanvas = canvas as CanvasWithArtboard;
        if (extCanvas.artboard) {
            return canvas.toDataURL({
                format: 'png',
                multiplier: 1,
                left: 0,
                top: 0,
                width: Math.max(1, extCanvas.artboard.width),
                height: Math.max(1, extCanvas.artboard.height),
            });
        }

        return canvas.toDataURL({ format: 'png', multiplier: 1 });
    } finally {
        if (shouldHideZone && zoneObject) {
            zoneObject.set('visible', true);
        }

        if (originalVpt) {
            if (typeof canvas.setViewportTransform === 'function') {
                canvas.setViewportTransform(originalVpt);
            } else {
                canvas.viewportTransform = originalVpt;
            }
        }

        canvas.requestRenderAll();
    }
};