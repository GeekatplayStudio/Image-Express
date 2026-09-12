/**
 * 3D Stamp Tool - Active Canvas Layer Capture Utility
 *
 * Automatically inspects, bounds, and exports all visible content layers
 * (drawings, text, shapes, logos, SVGs, images) from the active Fabric canvas
 * directly into the 3D Stamp Studio without requiring manual selection.
 */

import * as fabric from 'fabric';

export interface LayerBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface CapturedCanvasArtwork {
    dataUrl: string;
    layerCount: number;
    bounds: LayerBounds;
}

/**
 * Checks if a Fabric object is a non-content system object
 * (e.g. artboard background page, grid guides, selection overlays, crop helpers).
 */
export function isCanvasSystemObject(obj: fabric.Object, canvas?: fabric.Canvas | null): boolean {
    if (!obj) return true;

    const ext = obj as unknown as {
        name?: string;
        isArtboard?: boolean;
        excludeFromExport?: boolean;
        isSelectionOverlayHelper?: boolean;
        isHelper?: boolean;
        isGuide?: boolean;
        isGrid?: boolean;
        isRetouchLayer?: boolean;
    };

    const canvasExt = canvas as unknown as { artboardRect?: fabric.Object } | undefined;

    // Canvas background artboard rectangle
    if (canvasExt?.artboardRect && obj === canvasExt.artboardRect) return true;
    if (ext.name === 'Artboard' || ext.isArtboard === true) return true;

    // Helper overlays and transformation handles
    if (ext.excludeFromExport === true) return true;
    if (
        ext.isSelectionOverlayHelper === true ||
        ext.isHelper === true ||
        ext.isGuide === true ||
        ext.isGrid === true
    ) {
        return true;
    }

    return false;
}

/**
 * Retrieves all visible user content layers from the active canvas.
 */
export function getVisibleCanvasLayers(canvas: fabric.Canvas | null | undefined): fabric.Object[] {
    if (!canvas || typeof canvas.getObjects !== 'function') return [];

    const objects = canvas.getObjects();
    return objects.filter((obj) => {
        if (!obj || obj.visible === false) return false;
        return !isCanvasSystemObject(obj, canvas);
    });
}

/**
 * Computes the axis-aligned bounding box enclosing all visible content layers.
 */
export function computeCombinedLayerBounds(layers: fabric.Object[]): LayerBounds | null {
    if (!layers || layers.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const obj of layers) {
        // Method A: obj.getCoords() handles rotation, scaling, and skewing
        if (typeof obj.getCoords === 'function') {
            try {
                const coords = obj.getCoords();
                if (Array.isArray(coords) && coords.length > 0) {
                    let hasFinite = false;
                    for (const pt of coords) {
                        if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
                            minX = Math.min(minX, pt.x);
                            maxX = Math.max(maxX, pt.x);
                            minY = Math.min(minY, pt.y);
                            maxY = Math.max(maxY, pt.y);
                            hasFinite = true;
                        }
                    }
                    if (hasFinite) continue;
                }
            } catch {
                // Fallback to getBoundingRect
            }
        }

        // Method B: obj.getBoundingRect()
        if (typeof obj.getBoundingRect === 'function') {
            try {
                const b = obj.getBoundingRect();
                if (
                    Number.isFinite(b.left) &&
                    Number.isFinite(b.top) &&
                    Number.isFinite(b.width) &&
                    Number.isFinite(b.height) &&
                    b.width > 0 &&
                    b.height > 0
                ) {
                    minX = Math.min(minX, b.left);
                    maxX = Math.max(maxX, b.left + b.width);
                    minY = Math.min(minY, b.top);
                    maxY = Math.max(maxY, b.top + b.height);
                }
            } catch {
                // Ignore object bounding error
            }
        }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
        return null;
    }

    return {
        left: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

/**
 * Captures all visible content layers from the canvas as a high-resolution PNG data URL
 * with a transparent background for 3D stamp generation.
 *
 * Automatically:
 * 1. Collects all visible user layers (ignoring background artboard, guides, and tools).
 * 2. Tight-crops to the combined bounding box with subtle padding.
 * 3. Restores canvas state (visibilities, background, viewport transform) cleanly.
 */
export function captureVisibleCanvasLayers(canvas: fabric.Canvas | null | undefined): CapturedCanvasArtwork | null {
    if (!canvas || typeof canvas.getObjects !== 'function') {
        return null;
    }

    const visibleLayers = getVisibleCanvasLayers(canvas);
    if (visibleLayers.length === 0) {
        return null;
    }

    // Single object optimization: direct fast capture
    if (visibleLayers.length === 1 && typeof visibleLayers[0].toDataURL === 'function') {
        try {
            const single = visibleLayers[0];
            const bounds = computeCombinedLayerBounds(visibleLayers) || {
                left: single.left || 0,
                top: single.top || 0,
                width: single.getScaledWidth?.() || 100,
                height: single.getScaledHeight?.() || 100,
            };

            const dataUrl = single.toDataURL({
                format: 'png',
                multiplier: 3,
                enableRetinaScaling: true,
            });

            if (dataUrl && dataUrl.startsWith('data:image/')) {
                return {
                    dataUrl,
                    layerCount: 1,
                    bounds,
                };
            }
        } catch (singleErr) {
            console.warn('Single layer direct toDataURL failed, falling back to composite capture:', singleErr);
        }
    }

    const rawBounds = computeCombinedLayerBounds(visibleLayers);
    if (!rawBounds) {
        return null;
    }

    // Add 4% padding around the bounding box (minimum 8px)
    const pad = Math.max(8, Math.round(Math.max(rawBounds.width, rawBounds.height) * 0.04));
    const cropLeft = Math.floor(rawBounds.left - pad);
    const cropTop = Math.floor(rawBounds.top - pad);
    const cropWidth = Math.ceil(rawBounds.width + pad * 2);
    const cropHeight = Math.ceil(rawBounds.height + pad * 2);

    const paddedBounds: LayerBounds = {
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight,
    };

    // Save previous canvas state
    const allObjects = canvas.getObjects();
    const originalVisibilities = allObjects.map((o) => o.visible);
    const originalVpt = canvas.viewportTransform ? ([...canvas.viewportTransform] as fabric.TMat2D) : null;
    const originalBg = canvas.backgroundColor;

    try {
        // 1. Hide system objects, artboards, and any non-content items
        allObjects.forEach((obj) => {
            obj.visible = visibleLayers.includes(obj);
        });

        // 2. Set transparent background so stencil edges are clean
        canvas.backgroundColor = '';

        // 3. Temporarily set viewport to 1:1 identity matrix
        if (typeof canvas.setViewportTransform === 'function') {
            canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as fabric.TMat2D);
        }
        canvas.renderAll();

        // 4. Calculate optimal multiplier for high-definition 1024px+ vector contour smoothing
        const maxDim = Math.max(cropWidth, cropHeight);
        const multiplier = Math.max(1, Math.min(4, Math.round(1024 / Math.max(1, maxDim))));

        // 5. Export cropped composite
        const dataUrl = canvas.toDataURL({
            format: 'png',
            left: cropLeft,
            top: cropTop,
            width: cropWidth,
            height: cropHeight,
            multiplier,
            enableRetinaScaling: false,
        });

        if (dataUrl && dataUrl.startsWith('data:image/')) {
            return {
                dataUrl,
                layerCount: visibleLayers.length,
                bounds: paddedBounds,
            };
        }

        return null;
    } catch (err) {
        console.error('Failed to capture visible canvas layers:', err);
        return null;
    } finally {
        // Restore canvas state
        allObjects.forEach((obj, idx) => {
            obj.visible = originalVisibilities[idx];
        });
        canvas.backgroundColor = originalBg;
        if (originalVpt && typeof canvas.setViewportTransform === 'function') {
            canvas.setViewportTransform(originalVpt);
        }
        canvas.renderAll();
    }
}
