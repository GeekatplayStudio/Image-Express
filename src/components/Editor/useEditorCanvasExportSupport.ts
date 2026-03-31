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
                canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as fabric.TMat2D);
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

            const exportToSnapshotCanvas = () => {
                const directToCanvasElement = runtimeCanvas.toCanvasElement;
                if (typeof directToCanvasElement === 'function') {
                    return directToCanvasElement.call(runtimeCanvas, finalMultiplier, options);
                }

                if (typeof fabric.StaticCanvas?.prototype?.toCanvasElement === 'function') {
                    const staticToCanvasElement = fabric.StaticCanvas.prototype.toCanvasElement as (
                        this: fabric.StaticCanvas,
                        multiplier?: number,
                        options?: fabric.TToCanvasElementOptions
                    ) => HTMLCanvasElement;
                    return staticToCanvasElement.call(
                        canvas as unknown as fabric.StaticCanvas,
                        finalMultiplier,
                        options,
                    );
                }

                return null;
            };

            try {
                const snapshotCanvas = exportToSnapshotCanvas();
                if (snapshotCanvas) {
                    return snapshotCanvas.toDataURL(`image/${format}`, quality);
                }
            } catch (fallbackError) {
                console.warn('Snapshot export fallback failed:', fallbackError);
            }

            const lowerCanvasEl = runtimeCanvas.lowerCanvasEl
                || runtimeCanvas.elements?.lower?.el
                || runtimeCanvas.getElement?.();
            if (lowerCanvasEl) {
                const requiresScratchCanvas = Boolean(
                    options.backgroundColor
                    || typeof options.left === 'number'
                    || typeof options.top === 'number'
                    || typeof options.width === 'number'
                    || typeof options.height === 'number',
                );

                if (!requiresScratchCanvas) {
                    return lowerCanvasEl.toDataURL(`image/${format}`, quality);
                }

                const exportCanvas = document.createElement('canvas');
                const exportWidth = Math.max(1, Math.round((options.width || lowerCanvasEl.width || canvas.getWidth() || 1) * finalMultiplier));
                const exportHeight = Math.max(1, Math.round((options.height || lowerCanvasEl.height || canvas.getHeight() || 1) * finalMultiplier));
                exportCanvas.width = exportWidth;
                exportCanvas.height = exportHeight;

                let exportContext: CanvasRenderingContext2D | null = null;
                try {
                    exportContext = exportCanvas.getContext('2d');
                } catch {
                    exportContext = null;
                }
                if (exportContext) {
                    if (options.backgroundColor) {
                        exportContext.fillStyle = options.backgroundColor;
                        exportContext.fillRect(0, 0, exportWidth, exportHeight);
                    }

                    const sourceLeft = Math.max(0, Math.round((options.left || 0) * finalMultiplier));
                    const sourceTop = Math.max(0, Math.round((options.top || 0) * finalMultiplier));
                    const sourceWidth = Math.max(1, Math.min(lowerCanvasEl.width - sourceLeft, exportWidth));
                    const sourceHeight = Math.max(1, Math.min(lowerCanvasEl.height - sourceTop, exportHeight));

                    if (sourceWidth > 0 && sourceHeight > 0) {
                        exportContext.drawImage(
                            lowerCanvasEl,
                            sourceLeft,
                            sourceTop,
                            sourceWidth,
                            sourceHeight,
                            0,
                            0,
                            sourceWidth,
                            sourceHeight,
                        );
                    }

                    return exportCanvas.toDataURL(`image/${format}`, quality);
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
