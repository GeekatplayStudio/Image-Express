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

const elementToDataUrl = (element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): string | null => {
    try {
        const width = 'naturalWidth' in element ? element.naturalWidth || element.width : element.width;
        const height = 'naturalHeight' in element ? element.naturalHeight || element.height : element.height;
        if (!width || !height) return null;
        const buffer = document.createElement('canvas');
        buffer.width = width;
        buffer.height = height;
        const ctx = buffer.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(element, 0, 0, width, height);
        return buffer.toDataURL('image/png');
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
        const dataUrl = elementToDataUrl(element);
        if (dataUrl) entry.src = dataUrl;
    }
};

/** Rewrite blob: image sources in `json` to data URLs. Mutates and returns `json`. */
export function inlineVolatileImageSources(canvas: fabric.Canvas, json: SerializedCanvasJson): SerializedCanvasJson {
    if (typeof document === 'undefined') return json;
    const liveById = new Map<string, fabric.Object>();
    collectLiveById(canvas.getObjects(), liveById);
    walkSerialized(json.objects, liveById);
    return json;
}
