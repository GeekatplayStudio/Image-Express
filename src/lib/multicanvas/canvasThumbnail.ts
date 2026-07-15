// Captures a small artboard-cropped thumbnail of a fabric canvas so the 3D
// stack view can render the whole workspace (with images) on each plane.
import * as fabric from 'fabric';

type ArtboardInfo = { width: number; height: number; left: number; top: number };
type CanvasWithArtboard = fabric.Canvas & {
    artboard?: ArtboardInfo;
    artboardRect?: fabric.Rect & { canvasBackgroundColor?: string };
};

export const THUMBNAIL_MAX_DIM = 512;

export function captureCanvasThumbnail(canvas: fabric.Canvas, maxDim: number = THUMBNAIL_MAX_DIM): string | null {
    const extended = canvas as CanvasWithArtboard;
    const artboard = extended.artboard;
    const width = artboard?.width ?? canvas.width ?? 0;
    const height = artboard?.height ?? canvas.height ?? 0;
    if (!width || !height) return null;

    const previousVpt = canvas.viewportTransform ? ([...canvas.viewportTransform] as fabric.TMat2D) : null;
    const previousBackground = canvas.backgroundColor;
    try {
        if (previousVpt) canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as fabric.TMat2D);
        // The artboard rect is excluded from export; paint its color as the
        // canvas background so thumbnails don't come out transparent/black.
        canvas.backgroundColor = extended.artboardRect?.canvasBackgroundColor || '#ffffff';
        const multiplier = Math.min(1, maxDim / Math.max(width, height));
        return canvas.toDataURL({
            format: 'jpeg',
            quality: 0.7,
            left: artboard?.left ?? 0,
            top: artboard?.top ?? 0,
            width,
            height,
            multiplier,
        });
    } catch {
        return null;
    } finally {
        canvas.backgroundColor = previousBackground;
        if (previousVpt) canvas.setViewportTransform(previousVpt);
        canvas.requestRenderAll();
    }
}
