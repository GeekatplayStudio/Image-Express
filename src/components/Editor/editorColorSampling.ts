import * as fabric from 'fabric';
import type { CanvasWithExportInternals } from '@/components/Editor/editorView.types';

function averageOpaqueRgb(data: Uint8ClampedArray): string | null {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha === 0) continue;
        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
        count += 1;
    }
    if (count === 0) return null;

    const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
    return `#${toHex(red / count)}${toHex(green / count)}${toHex(blue / count)}`;
}

function sampleCanvasWindow(
    sourceCanvas: HTMLCanvasElement,
    centerX: number,
    centerY: number,
    sampleSize: number,
): string | null {
    const context = sourceCanvas.getContext('2d');
    if (!context) return null;

    const pixelWindow = Math.max(1, sampleSize);
    const halfWindow = Math.floor(pixelWindow / 2);
    const startX = Math.max(0, centerX - halfWindow);
    const startY = Math.max(0, centerY - halfWindow);
    const width = Math.min(pixelWindow, sourceCanvas.width - startX);
    const height = Math.min(pixelWindow, sourceCanvas.height - startY);
    if (width <= 0 || height <= 0) return null;

    try {
        const imageData = context.getImageData(startX, startY, width, height).data;
        return averageOpaqueRgb(imageData);
    } catch {
        return null;
    }
}

export function sampleColorAtScenePoint(
    canvas: fabric.Canvas,
    point: fabric.Point,
    sampleSize: number,
): string | null {
    const exportCanvas = canvas as CanvasWithExportInternals;
    const sourceCanvas = exportCanvas.lowerCanvasEl || exportCanvas.getElement?.();
    if (!sourceCanvas) return null;

    const canvasWidth = Math.max(1, canvas.getWidth?.() || sourceCanvas.width);
    const canvasHeight = Math.max(1, canvas.getHeight?.() || sourceCanvas.height);
    const vt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const viewportX = (point.x * vt[0]) + (point.y * vt[2]) + vt[4];
    const viewportY = (point.x * vt[1]) + (point.y * vt[3]) + vt[5];
    const pixelCenterX = Math.round((viewportX / canvasWidth) * sourceCanvas.width);
    const pixelCenterY = Math.round((viewportY / canvasHeight) * sourceCanvas.height);

    return sampleCanvasWindow(sourceCanvas, pixelCenterX, pixelCenterY, sampleSize);
}

export function sampleColorAtCanvasCenter(canvas: fabric.Canvas, sampleSize: number): string | null {
    const exportCanvas = canvas as CanvasWithExportInternals;
    const sourceCanvas = exportCanvas.lowerCanvasEl || exportCanvas.getElement?.();
    if (!sourceCanvas) return null;

    const centerX = Math.floor(sourceCanvas.width / 2);
    const centerY = Math.floor(sourceCanvas.height / 2);
    return sampleCanvasWindow(sourceCanvas, centerX, centerY, sampleSize);
}