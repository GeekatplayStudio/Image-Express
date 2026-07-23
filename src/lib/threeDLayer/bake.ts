// Bake orchestration for 3D layers: turns a layer's threeDLayerSettings into
// fresh pixels. Lives in lib (not the panel components) so global-sun changes
// can re-bake every 3D layer on the canvas no matter which panel is open.

import type * as fabric from 'fabric';
import type { ExtendedFabricObject, ThreeDLayerLight, ThreeDLayerSettings } from '@/types';
import { renderRelight } from './relightShader';
import { applyLensBlur } from './lensBlur';
import { bakeObjectLayer } from './objectBake';
import { globalLightAsLayerLight, type GlobalLightState } from './globalLight';

export const DEFAULT_AMBIENT = { color: '#ffffff', intensity: 0.35 };
export const OBJECT_BAKE_SIZE = { width: 1024, height: 1024 };

type RelightCache = { source?: HTMLCanvasElement; depth?: HTMLCanvasElement; normals?: HTMLCanvasElement };
export type LayerWithCache = ExtendedFabricObject & { __relightCache?: RelightCache };

function loadCanvas(src: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d')!.drawImage(img, 0, 0);
            resolve(c);
        };
        img.onerror = reject;
        img.src = src;
    });
}

/** All lights a relight bake actually uses for a settings snapshot. */
export function effectiveLights(settings: ThreeDLayerSettings, global: GlobalLightState): ThreeDLayerLight[] {
    const locals = settings.lights ?? [];
    if (settings.useGlobalLight) {
        return [globalLightAsLayerLight(global), ...locals.filter((l) => l.kind === 'point')];
    }
    return locals;
}

export async function bakeRelight(layer: LayerWithCache, settings: ThreeDLayerSettings, global: GlobalLightState) {
    if (!settings.sourceRef || !settings.depthRef || !settings.normalRef) return;
    const cache = layer.__relightCache ?? (layer.__relightCache = {});
    cache.source = cache.source ?? await loadCanvas(settings.sourceRef);
    cache.depth = cache.depth ?? await loadCanvas(settings.depthRef);
    cache.normals = cache.normals ?? await loadCanvas(settings.normalRef);
    let result = renderRelight(
        cache.source,
        cache.normals,
        cache.depth,
        effectiveLights(settings, global),
        { ...DEFAULT_AMBIENT, ...settings.ambient },
    );
    if (settings.lensBlur?.enabled) {
        result = applyLensBlur(result, cache.depth, settings.lensBlur);
    }
    (layer as unknown as fabric.Image).setElement(result as unknown as HTMLImageElement);
    layer.set('dirty', true);
}

export async function bakeObject(layer: ExtendedFabricObject, settings: ThreeDLayerSettings, sun: GlobalLightState) {
    if (!settings.modelUrl) return;
    const result = await bakeObjectLayer(
        { modelUrl: settings.modelUrl, ...settings.object },
        sun,
        OBJECT_BAKE_SIZE,
    );
    (layer as unknown as fabric.Image).setElement(result as unknown as HTMLImageElement);
    layer.set('dirty', true);
}

/**
 * Re-bake every 3D layer on the canvas that follows the global sun —
 * relight layers with useGlobalLight and all object layers.
 */
export function rebakeGlobalLightLayers(canvas: fabric.Canvas, state: GlobalLightState) {
    (canvas.getObjects() as LayerWithCache[])
        .filter((o) => o.is3DLayer && o.threeDLayerSettings)
        .forEach((o) => {
            const s = o.threeDLayerSettings!;
            const job = s.mode === 'relight' && s.useGlobalLight
                ? bakeRelight(o, s, state)
                : s.mode === 'object'
                    ? bakeObject(o, s, state)
                    : null;
            if (job) void job.then(() => canvas.requestRenderAll());
        });
}
