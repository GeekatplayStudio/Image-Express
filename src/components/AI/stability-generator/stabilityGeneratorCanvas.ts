import * as fabric from 'fabric';
import type { ExtendedFabricObject } from '@/types';
import type { CanvasWithArtboard } from './types';

export const captureSelectionImage = (canvas: fabric.Canvas | null, flattenSelection: boolean) => {
    if (!canvas) return null;

    const active = canvas.getActiveObject();
    if (!active) return null;

    if (flattenSelection) {
        const originalVpt = canvas.viewportTransform;
        const rect = active.getBoundingRect();

        canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
        canvas.requestRenderAll();

        try {
            return canvas.toDataURL({
                format: 'png',
                multiplier: 1,
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
            });
        } finally {
            if (originalVpt) {
                canvas.setViewportTransform(originalVpt);
                canvas.requestRenderAll();
            }
        }
    }

    return active.toDataURL({
        format: 'png',
        multiplier: 1,
    });
};

export const captureSourceImage = (
    canvas: fabric.Canvas | null,
    sourceType: 'selection' | 'canvas',
    captureSelection: () => string | null
) => {
    if (!canvas) return null;

    const active = canvas.getActiveObject();
    if (sourceType === 'canvas') {
        const extCanvas = canvas as CanvasWithArtboard;
        let cropOptions: fabric.TDataUrlOptions = { format: 'png', multiplier: 1 };

        if (extCanvas.artboard) {
            cropOptions = { ...cropOptions, ...extCanvas.artboard };
        } else if (extCanvas.artboardRect) {
            const rect = extCanvas.artboardRect;
            cropOptions = {
                ...cropOptions,
                left: rect.left ?? 0,
                top: rect.top ?? 0,
                width: (rect.width ?? 0) * (rect.scaleX ?? 1),
                height: (rect.height ?? 0) * (rect.scaleY ?? 1),
            };
        }

        const originalVpt = canvas.viewportTransform;
        canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
        canvas.requestRenderAll();

        try {
            return canvas.toDataURL(cropOptions);
        } finally {
            if (originalVpt) {
                canvas.setViewportTransform(originalVpt);
                canvas.requestRenderAll();
            }
        }
    }

    if (active) {
        return captureSelection();
    }

    return null;
};

export const clearCanvasMask = (canvas: fabric.Canvas | null) => {
    if (!canvas) return;
    const masks = canvas.getObjects().filter((object) => (object as ExtendedFabricObject).isMask);
    masks.forEach((mask) => canvas.remove(mask));
    canvas.requestRenderAll();
};

export const captureCanvasAndMask = async (canvas: fabric.Canvas | null, maskBrushColor: string) => {
    if (!canvas) return null;

    const extCanvas = canvas as CanvasWithArtboard;
    const artboardRect = extCanvas.artboardRect;
    const artboardMeta = extCanvas.artboard;
    const width = artboardMeta?.width
        || (artboardRect ? (artboardRect.width ?? 0) * (artboardRect.scaleX ?? 1) : 0)
        || canvas.width
        || 1024;
    const height = artboardMeta?.height
        || (artboardRect ? (artboardRect.height ?? 0) * (artboardRect.scaleY ?? 1) : 0)
        || canvas.height
        || 1024;
    const left = artboardMeta?.left || artboardRect?.left || 0;
    const top = artboardMeta?.top || artboardRect?.top || 0;

    const originalVpt = canvas.viewportTransform;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.requestRenderAll();

    const objects = canvas.getObjects();
    const masks = objects.filter((object) => (object as ExtendedFabricObject).isMask);
    const nonMasks = objects.filter((object) => !(object as ExtendedFabricObject).isMask);
    const originalMaskVisibility = masks.map((mask) => mask.visible);
    const originalNonMaskVisibility = nonMasks.map((item) => item.visible);
    const originalMaskStroke = masks.map((mask) => mask.stroke);
    const originalBg = canvas.backgroundColor;
    const originalArtboardVisible = artboardRect ? artboardRect.visible : true;

    try {
        masks.forEach((mask) => {
            mask.visible = false;
        });

        const imageParams: fabric.TDataUrlOptions = { format: 'png', multiplier: 1, left, top, width, height };
        const imageDataUrl = canvas.toDataURL(imageParams);
        const imageBlob = await fetch(imageDataUrl).then((response) => response.blob());

        nonMasks.forEach((item) => {
            item.visible = false;
        });
        masks.forEach((mask) => {
            mask.visible = true;
            mask.set({ stroke: '#ffffff', fill: null });
        });

        canvas.backgroundColor = '#000000';
        if (artboardRect) artboardRect.visible = false;
        canvas.renderAll();

        const maskOutputUrl = canvas.toDataURL(imageParams);
        const maskBlob = await fetch(maskOutputUrl).then((response) => response.blob());
        return { imageBlob, maskBlob };
    } finally {
        masks.forEach((mask, index) => {
            mask.set({ stroke: originalMaskStroke[index] || maskBrushColor });
            mask.visible = originalMaskVisibility[index];
        });
        nonMasks.forEach((item, index) => {
            item.visible = originalNonMaskVisibility[index];
        });
        canvas.backgroundColor = originalBg;
        if (artboardRect) {
            artboardRect.visible = originalArtboardVisible;
        }
        if (originalVpt) {
            canvas.setViewportTransform(originalVpt);
        }
        canvas.renderAll();
    }
};

export const addResultImageToCanvas = async (canvas: fabric.Canvas | null, resultImage: string | null) => {
    if (!canvas || !resultImage) return;

    const img = await fabric.Image.fromURL(resultImage, {});
    const artboard = (canvas as CanvasWithArtboard).artboard || { width: canvas.width || 800, height: canvas.height || 600 };
    const targetWidth = artboard.width;
    const targetHeight = artboard.height;

    if (img.width && img.height && (img.width > targetWidth * 0.8 || img.height > targetHeight * 0.8)) {
        const scale = Math.min((targetWidth * 0.8) / img.width, (targetHeight * 0.8) / img.height);
        img.scale(scale);
    }

    canvas.centerObject(img);
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
};
