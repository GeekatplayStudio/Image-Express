import { useCallback } from 'react';
import * as fabric from 'fabric';

import { normalizeColorValue, parseColorWithAlpha } from '@/lib/fabric-utils';
import type {
    ArtboardRectWithBackground,
    CanvasWithArtboard,
    CanvasWithExportInternals,
    ExportDataUrlOptions,
} from '@/components/Editor/editorView.types';

type CanvasBackgroundSettings = {
    color: string;
    enabled: boolean;
};

type UseEditorCanvasExportSupportArgs = {
    canvas: fabric.Canvas | null;
};

const IDENTITY_TRANSFORM = [1, 0, 0, 1, 0, 0] as fabric.TMat2D;

function canProbeCanvas2dContext(canvas: HTMLCanvasElement): boolean {
    const getContext = canvas.getContext as unknown as { _isMockFunction?: boolean } | undefined;
    if (getContext?._isMockFunction) {
        return true;
    }
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
        return false;
    }
    return true;
}

function exportSnapshotCanvasToDataUrl(
    snapshotCanvas: HTMLCanvasElement,
    format: string,
    quality: number,
    backgroundColor?: string,
) {
    if (!backgroundColor) {
        return snapshotCanvas.toDataURL(`image/${format}`, quality);
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = snapshotCanvas.width;
    exportCanvas.height = snapshotCanvas.height;

    if (!canProbeCanvas2dContext(exportCanvas)) {
        return snapshotCanvas.toDataURL(`image/${format}`, quality);
    }

    const exportContext = exportCanvas.getContext('2d');
    if (!exportContext) {
        return snapshotCanvas.toDataURL(`image/${format}`, quality);
    }

    exportContext.fillStyle = backgroundColor;
    exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportContext.drawImage(snapshotCanvas, 0, 0);

    return exportCanvas.toDataURL(`image/${format}`, quality);
}

export function useEditorCanvasExportSupport({
    canvas,
}: UseEditorCanvasExportSupportArgs) {
    const getCanvasBackgroundSettings = useCallback((): CanvasBackgroundSettings => {
        const activeCanvas = canvas as CanvasWithArtboard | null;
        const artboardRect = activeCanvas?.artboardRect as ArtboardRectWithBackground | undefined;

        const toVisibleColor = (value: unknown): string | null => {
            if (typeof value !== 'string') return null;

            const parsed = parseColorWithAlpha(value);
            if (parsed.alpha <= 0) return null;

            return normalizeColorValue(parsed.color) || parsed.color;
        };

        const storedColor = toVisibleColor(artboardRect?.canvasBackgroundColor);
        const fillColor = toVisibleColor(artboardRect?.fill);
        const canvasColor = toVisibleColor(activeCanvas?.backgroundColor);
        const color = storedColor || fillColor || canvasColor || '#ffffff';
        const enabled = artboardRect
            ? (typeof artboardRect.canvasBackgroundEnabled === 'boolean'
                ? artboardRect.canvasBackgroundEnabled
                : Boolean(fillColor))
            : true;

        return { color, enabled };
    }, [canvas]);

    const withViewportReset = useCallback(async <T,>(action: () => T | Promise<T>) => {
        if (!canvas) {
            return action();
        }

        const runtimeCanvas = canvas as CanvasWithExportInternals;
        const originalTransform = canvas.viewportTransform
            ? ([...canvas.viewportTransform] as fabric.TMat2D)
            : undefined;
        let shouldRestoreTransform = false;

        if (originalTransform && !runtimeCanvas.disposed && !runtimeCanvas.destroyed) {
            try {
                canvas.setViewportTransform(IDENTITY_TRANSFORM);
                canvas.requestRenderAll();
                shouldRestoreTransform = true;
            } catch (error) {
                console.warn('Viewport reset skipped during export/save:', error);
            }
        }

        try {
            return await action();
        } finally {
            if (originalTransform && shouldRestoreTransform && !runtimeCanvas.disposed && !runtimeCanvas.destroyed) {
                try {
                    canvas.setViewportTransform(originalTransform);
                    canvas.requestRenderAll();
                } catch (error) {
                    console.warn('Viewport restore skipped after export/save:', error);
                }
            }
        }
    }, [canvas]);

    const safeCanvasToDataURL = useCallback((options: ExportDataUrlOptions) => {
        if (!canvas) throw new Error('Canvas unavailable');

        try {
            return canvas.toDataURL(options);
        } catch (primaryError) {
            const runtimeCanvas = canvas as CanvasWithExportInternals;
            const format = options.format || 'png';
            const quality = options.quality ?? 1;
            const retinaScaling = options.enableRetinaScaling && typeof canvas.getRetinaScaling === 'function'
                ? canvas.getRetinaScaling()
                : 1;
            const finalMultiplier = (options.multiplier || 1) * retinaScaling;

            // Fabric v7 Canvas#toDataURL can fail when upper canvas internals are unavailable.
            // In that case, bypass Canvas#toCanvasElement and call StaticCanvas directly.
            const canUseStaticFallback =
                typeof fabric.StaticCanvas?.prototype?.toCanvasElement === 'function'
                && typeof (canvas as unknown as { calcViewportBoundaries?: unknown }).calcViewportBoundaries === 'function'
                && typeof (canvas as unknown as { renderCanvas?: unknown }).renderCanvas === 'function';

            if (canUseStaticFallback) {
                try {
                    const toCanvasElement = fabric.StaticCanvas.prototype.toCanvasElement as (
                        this: fabric.StaticCanvas,
                        multiplier?: number,
                        options?: fabric.TToCanvasElementOptions
                    ) => HTMLCanvasElement;
                    const snapshotCanvas = toCanvasElement.call(
                        canvas as unknown as fabric.StaticCanvas,
                        finalMultiplier,
                        options
                    );
                    return exportSnapshotCanvasToDataUrl(
                        snapshotCanvas,
                        format,
                        quality,
                        options.backgroundColor,
                    );
                } catch (fallbackError) {
                    console.warn('StaticCanvas fallback export failed:', fallbackError);
                }
            }

            const lowerCanvasEl = runtimeCanvas.lowerCanvasEl
                || runtimeCanvas.elements?.lower?.el
                || runtimeCanvas.getElement?.();
            if (lowerCanvasEl) {
                const viewportTransform = canvas.viewportTransform || IDENTITY_TRANSFORM;
                const logicalWidth = Number(canvas.getWidth?.() || canvas.width || lowerCanvasEl.width || 1);
                const logicalHeight = Number(canvas.getHeight?.() || canvas.height || lowerCanvasEl.height || 1);
                const cropLeft = Number(options.left ?? 0);
                const cropTop = Number(options.top ?? 0);
                const cropWidth = Math.max(1, Number(options.width ?? logicalWidth));
                const cropHeight = Math.max(1, Number(options.height ?? logicalHeight));
                const mapSceneToViewport = (point: fabric.Point) => (
                    new fabric.Point(
                        (point.x * viewportTransform[0]) + (point.y * viewportTransform[2]) + viewportTransform[4],
                        (point.x * viewportTransform[1]) + (point.y * viewportTransform[3]) + viewportTransform[5],
                    )
                );

                const topLeft = mapSceneToViewport(new fabric.Point(cropLeft, cropTop));
                const bottomRight = mapSceneToViewport(new fabric.Point(
                    cropLeft + cropWidth,
                    cropTop + cropHeight,
                ));
                const pixelScaleX = lowerCanvasEl.width / Math.max(1, logicalWidth);
                const pixelScaleY = lowerCanvasEl.height / Math.max(1, logicalHeight);

                let sx = Math.floor(Math.min(topLeft.x, bottomRight.x) * pixelScaleX);
                let sy = Math.floor(Math.min(topLeft.y, bottomRight.y) * pixelScaleY);
                let sw = Math.ceil(Math.abs(bottomRight.x - topLeft.x) * pixelScaleX);
                let sh = Math.ceil(Math.abs(bottomRight.y - topLeft.y) * pixelScaleY);

                sx = Math.max(0, Math.min(lowerCanvasEl.width - 1, sx));
                sy = Math.max(0, Math.min(lowerCanvasEl.height - 1, sy));
                sw = Math.max(1, Math.min(lowerCanvasEl.width - sx, sw));
                sh = Math.max(1, Math.min(lowerCanvasEl.height - sy, sh));

                const snapshotCanvas = document.createElement('canvas');
                snapshotCanvas.width = Math.max(1, Math.round(cropWidth * finalMultiplier));
                snapshotCanvas.height = Math.max(1, Math.round(cropHeight * finalMultiplier));

                if (!canProbeCanvas2dContext(snapshotCanvas)) {
                    return lowerCanvasEl.toDataURL(`image/${format}`, quality);
                }

                try {
                    const snapshotContext = snapshotCanvas.getContext('2d');
                    if (snapshotContext) {
                        if (options.backgroundColor) {
                            snapshotContext.fillStyle = options.backgroundColor;
                            snapshotContext.fillRect(0, 0, snapshotCanvas.width, snapshotCanvas.height);
                        }
                        // Preserve the requested crop instead of exporting only the visible viewport canvas.
                        snapshotContext.drawImage(
                            lowerCanvasEl,
                            sx,
                            sy,
                            sw,
                            sh,
                            0,
                            0,
                            snapshotCanvas.width,
                            snapshotCanvas.height,
                        );
                        return snapshotCanvas.toDataURL(`image/${format}`, quality);
                    }
                } catch {
                    // Fall through to the lower-canvas export when 2D contexts are unavailable.
                }

                return lowerCanvasEl.toDataURL(`image/${format}`, quality);
            }

            throw primaryError;
        }
    }, [canvas]);

    return {
        getCanvasBackgroundSettings,
        withViewportReset,
        safeCanvasToDataURL,
    };
}
