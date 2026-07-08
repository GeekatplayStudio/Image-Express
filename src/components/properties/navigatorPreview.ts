import * as fabric from 'fabric';

import type { CanvasWithArtboard } from './propertiesPanelTypes';
import type { NavigatorSceneRect } from './PanelUtilityViews';

type CanvasWithNavigatorExport = CanvasWithArtboard & {
    lowerCanvasEl?: HTMLCanvasElement;
    elements?: {
        lower?: {
            el?: HTMLCanvasElement;
        };
    };
    getElement?: () => HTMLCanvasElement;
    disposed?: boolean;
    destroyed?: boolean;
};

const IDENTITY_TRANSFORM = [1, 0, 0, 1, 0, 0] as fabric.TMat2D;

type BuildNavigatorPreviewArgs = {
    canvas: fabric.Canvas | null;
    world: NavigatorSceneRect;
    backgroundColor?: string;
    maxDimension?: number;
};

function exportSnapshotCanvas(
    snapshotCanvas: HTMLCanvasElement,
    backgroundColor?: string,
) {
    if (!backgroundColor) {
        return snapshotCanvas.toDataURL('image/png');
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = snapshotCanvas.width;
    exportCanvas.height = snapshotCanvas.height;

    const context = exportCanvas.getContext('2d');
    if (!context) {
        return snapshotCanvas.toDataURL('image/png');
    }

    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    context.drawImage(snapshotCanvas, 0, 0);

    return exportCanvas.toDataURL('image/png');
}

function buildLowerCanvasSnapshot(
    canvas: CanvasWithNavigatorExport,
    world: NavigatorSceneRect,
    multiplier: number,
    backgroundColor?: string,
) {
    const lowerCanvasEl = canvas.lowerCanvasEl || canvas.elements?.lower?.el || canvas.getElement?.();
    if (!lowerCanvasEl) return null;

    const logicalWidth = Number(canvas.getWidth?.() || canvas.width || lowerCanvasEl.width || 1);
    const logicalHeight = Number(canvas.getHeight?.() || canvas.height || lowerCanvasEl.height || 1);
    const pixelScaleX = lowerCanvasEl.width / Math.max(1, logicalWidth);
    const pixelScaleY = lowerCanvasEl.height / Math.max(1, logicalHeight);

    const sx = Math.max(0, Math.floor(world.left * pixelScaleX));
    const sy = Math.max(0, Math.floor(world.top * pixelScaleY));
    const sw = Math.max(1, Math.min(lowerCanvasEl.width - sx, Math.ceil(world.width * pixelScaleX)));
    const sh = Math.max(1, Math.min(lowerCanvasEl.height - sy, Math.ceil(world.height * pixelScaleY)));

    const snapshotCanvas = document.createElement('canvas');
    snapshotCanvas.width = Math.max(1, Math.round(world.width * multiplier));
    snapshotCanvas.height = Math.max(1, Math.round(world.height * multiplier));

    const context = snapshotCanvas.getContext('2d');
    if (!context) return lowerCanvasEl.toDataURL('image/png');

    if (backgroundColor) {
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, snapshotCanvas.width, snapshotCanvas.height);
    }

    context.drawImage(
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

    return snapshotCanvas.toDataURL('image/png');
}

export function buildNavigatorPreviewDataUrl({
    canvas,
    world,
    backgroundColor,
    maxDimension = 240,
}: BuildNavigatorPreviewArgs) {
    if (!canvas || world.width <= 0 || world.height <= 0) return null;

    const runtimeCanvas = canvas as CanvasWithNavigatorExport;
    const maxWorldDimension = Math.max(world.width, world.height, 1);
    const multiplier = Math.max(0.1, Math.min(1, maxDimension / maxWorldDimension));
    const originalTransform = canvas.viewportTransform
        ? ([...canvas.viewportTransform] as fabric.TMat2D)
        : undefined;
    let shouldRestoreTransform = false;

    if (originalTransform && !runtimeCanvas.disposed && !runtimeCanvas.destroyed) {
        try {
            canvas.setViewportTransform(IDENTITY_TRANSFORM);
            canvas.requestRenderAll();
            shouldRestoreTransform = true;
        } catch {
            shouldRestoreTransform = false;
        }
    }

    try {
        return canvas.toDataURL({
            format: 'png',
            left: world.left,
            top: world.top,
            width: world.width,
            height: world.height,
            multiplier,
            enableRetinaScaling: false,
        });
    } catch {
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
                    multiplier,
                    {
                        left: world.left,
                        top: world.top,
                        width: world.width,
                        height: world.height,
                    },
                );
                return exportSnapshotCanvas(snapshotCanvas, backgroundColor);
            } catch {
                return buildLowerCanvasSnapshot(runtimeCanvas, world, multiplier, backgroundColor);
            }
        }

        return buildLowerCanvasSnapshot(runtimeCanvas, world, multiplier, backgroundColor);
    } finally {
        if (originalTransform && shouldRestoreTransform && !runtimeCanvas.disposed && !runtimeCanvas.destroyed) {
            try {
                canvas.setViewportTransform(originalTransform);
                canvas.requestRenderAll();
            } catch {
                // Best-effort restore only.
            }
        }
    }
}