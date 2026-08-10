// Blob/object URLs (blob:...) die with the document that created them, so a
// canvas snapshot that stores them cannot be reloaded later ("Error loading
// blob:..."). Before persisting a snapshot, rewrite every such image source
// to a self-contained data URL rasterized from the live fabric element.
import * as fabric from 'fabric';
import type { ExtendedFabricObject } from '@/types';
import type { SerializedCanvasJson, SerializedLayer } from '@/lib/multicanvas/projectStore';

const isVolatileSrc = (src: unknown): src is string => (
    typeof src === 'string' && src.startsWith('blob:')
);

// Full-resolution photos routed through blob URLs can be tens of megabytes as
// a PNG data URL — several of those blow localStorage's ~5-10MB quota outright.
// Downscale the *source pixels* to this ceiling; only safe to do for
// uncropped images (see below), which covers the common asset-library case.
const MAX_INLINED_DIM = 2048;

type RasterResult = { dataUrl: string; scale: number };

const rasterizeElement = (
    element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    maxDim: number,
): RasterResult | null => {
    try {
        const width = 'naturalWidth' in element ? element.naturalWidth || element.width : element.width;
        const height = 'naturalHeight' in element ? element.naturalHeight || element.height : element.height;
        if (!width || !height) return null;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        const outW = Math.max(1, Math.round(width * scale));
        const outH = Math.max(1, Math.round(height * scale));
        const buffer = document.createElement('canvas');
        buffer.width = outW;
        buffer.height = outH;
        const ctx = buffer.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(element, 0, 0, outW, outH);
        return { dataUrl: buffer.toDataURL('image/png'), scale };
    } catch {
        return null; // tainted canvas or detached element — keep the original src
    }
};

// Serialization order can differ from the live object list (the artboard rect
// is excluded from export), so match serialized entries to live objects by
// their persistent layer id instead of by index.
const collectLiveById = (objects: fabric.Object[], into: Map<string, fabric.Object>): void => {
    for (const obj of objects) {
        const id = (obj as ExtendedFabricObject).id;
        if (id) into.set(id, obj);
        const group = obj as fabric.Group;
        if (typeof group.getObjects === 'function' && obj.type === 'group') {
            collectLiveById(group.getObjects(), into);
        }
    }
};

const isUncropped = (entry: SerializedLayer, element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): boolean => {
    const cropX = typeof entry.cropX === 'number' ? entry.cropX : 0;
    const cropY = typeof entry.cropY === 'number' ? entry.cropY : 0;
    if (cropX !== 0 || cropY !== 0) return false;
    const naturalWidth = 'naturalWidth' in element ? element.naturalWidth || element.width : element.width;
    const naturalHeight = 'naturalHeight' in element ? element.naturalHeight || element.height : element.height;
    const width = typeof entry.width === 'number' ? entry.width : naturalWidth;
    const height = typeof entry.height === 'number' ? entry.height : naturalHeight;
    return width >= naturalWidth && height >= naturalHeight;
};

const walkSerialized = (entries: SerializedLayer[] | undefined, liveById: Map<string, fabric.Object>): void => {
    if (!entries) return;
    for (const entry of entries) {
        const children = (entry as { objects?: SerializedLayer[] }).objects;
        if (children) walkSerialized(children, liveById);
        if (!isVolatileSrc(entry.src)) continue;
        const live = entry.id ? liveById.get(entry.id) : undefined;
        const image = live as fabric.Image | undefined;
        if (!image || typeof image.getElement !== 'function') continue;
        const element = image.getElement() as HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | undefined;
        if (!element) continue;

        // Cropped images encode the crop rectangle in the source's native
        // pixel space; downscaling that source would silently corrupt the
        // crop. Keep those at full resolution (still fixes the blob: issue).
        const maxDim = isUncropped(entry, element) ? MAX_INLINED_DIM : Infinity;
        const result = rasterizeElement(element, maxDim);
        if (!result) continue;
        entry.src = result.dataUrl;
        if (result.scale < 1) {
            const prevWidth = typeof entry.width === 'number' ? entry.width : image.width;
            const prevHeight = typeof entry.height === 'number' ? entry.height : image.height;
            const prevScaleX = typeof entry.scaleX === 'number' ? entry.scaleX : 1;
            const prevScaleY = typeof entry.scaleY === 'number' ? entry.scaleY : 1;
            entry.width = prevWidth * result.scale;
            entry.height = prevHeight * result.scale;
            entry.scaleX = prevScaleX / result.scale;
            entry.scaleY = prevScaleY / result.scale;
        }
    }
};

/**
 * Rasterize a live element to a durable data URL plus its resulting pixel
 * size (downscaled to the inline ceiling). Used when a volatile blob: source
 * must be handed to snapshots of OTHER pages, which cannot re-rasterize from
 * a live object the way `inlineVolatileImageSources` does.
 */
export function rasterizeElementToDataUrl(
    element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): { dataUrl: string; width: number; height: number } | null {
    const result = rasterizeElement(element, MAX_INLINED_DIM);
    if (!result) return null;
    const width = 'naturalWidth' in element ? element.naturalWidth || element.width : element.width;
    const height = 'naturalHeight' in element ? element.naturalHeight || element.height : element.height;
    return {
        dataUrl: result.dataUrl,
        width: Math.max(1, Math.round(width * result.scale)),
        height: Math.max(1, Math.round(height * result.scale)),
    };
}

/** Rewrite blob: image sources in `json` to data URLs. Mutates and returns `json`. */
export function inlineVolatileImageSources(canvas: fabric.Canvas, json: SerializedCanvasJson): SerializedCanvasJson {
    if (typeof document === 'undefined') return json;
    const liveById = new Map<string, fabric.Object>();
    collectLiveById(canvas.getObjects(), liveById);
    walkSerialized(json.objects, liveById);
    return json;
}
