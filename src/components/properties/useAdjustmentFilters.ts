import { useCallback } from 'react';
import * as fabric from 'fabric';
import {
    ExtendedFabricObject,
    AdjustmentLayerType,
    AdjustmentLayerSettings,
    CurvesAdjustmentSettings,
    CurvesChannel,
    LevelsAdjustmentSettings,
    ExposureSettings,
    BrightnessContrastSettings,
    HueSaturationSettings,
    SaturationVibranceSettings,
    ColorBalanceSettings,
    LightAndColorSettings,
    SolidColorSettings,
    FabricBaseFilter,
} from '@/types';
import { CurvesFilter, isAdjustmentGeneratedFilter, reviveImageFilters, tagAdjustmentFilters } from '@/lib/fabric-filters';
import { applyAlphaToColor, applyImageFiltersPreservingGeometry } from '@/lib/fabric-utils';

/**
 * Build an array of Fabric.js image filters that implement a given
 * adjustment-layer type at a specific intensity (0-1, mapped from opacity).
 */
export function buildFiltersForAdjustment(
    type: AdjustmentLayerType,
    settings: AdjustmentLayerSettings,
    intensity: number
): FabricBaseFilter[] {
    const clampedIntensity = Math.min(1, Math.max(0, intensity));
    const filtersRegistry = fabric.filters as unknown as Record<string, new (options?: Record<string, unknown>) => FabricBaseFilter>;

    if (type === 'curves') {
        const curves = settings as CurvesAdjustmentSettings;
        const filters: FabricBaseFilter[] = [];

        if (curves.pointsByChannel) {
            Object.entries(curves.pointsByChannel).forEach(([ch, pts]) => {
                if (pts && pts.length >= 2) {
                    filters.push(
                        new CurvesFilter({
                            points: pts,
                            channel: ch as CurvesChannel,
                            intensity: clampedIntensity
                        }) as unknown as FabricBaseFilter
                    );
                }
            });
        } else if (curves.points && curves.points.length >= 2) {
            filters.push(
                new CurvesFilter({
                    points: curves.points,
                    channel: curves.channel || 'rgb',
                    intensity: clampedIntensity
                }) as unknown as FabricBaseFilter
            );
        }
        return filters;
    }

    if (type === 'levels') {
        const levels = settings as LevelsAdjustmentSettings;
        const brightness = ((levels.black || 0) * 0.5 - ((1 - (levels.white || 1)) * 0.5)) * clampedIntensity;
        const contrast = (((levels.mid || 1) - 1) * 0.5) * clampedIntensity;
        const filters: FabricBaseFilter[] = [];
        if (Math.abs(brightness) > 0.01) {
            filters.push(new fabric.filters.Brightness({ brightness }) as unknown as FabricBaseFilter);
        }
        if (Math.abs(contrast) > 0.01) {
            filters.push(new fabric.filters.Contrast({ contrast }) as unknown as FabricBaseFilter);
        }
        return filters;
    }

    if (type === 'exposure') {
        const exposure = settings as ExposureSettings;
        return [
            new fabric.filters.Brightness({ brightness: (exposure.exposure || 0) * clampedIntensity }) as unknown as FabricBaseFilter,
            new fabric.filters.Contrast({ contrast: (exposure.contrast || 0) * clampedIntensity }) as unknown as FabricBaseFilter
        ];
    }

    if (type === 'brightness-contrast') {
        const bc = settings as BrightnessContrastSettings;
        return [
            new fabric.filters.Brightness({ brightness: (bc.brightness || 0) * clampedIntensity }) as unknown as FabricBaseFilter,
            new fabric.filters.Contrast({ contrast: (bc.contrast || 0) * clampedIntensity }) as unknown as FabricBaseFilter
        ];
    }

    if (type === 'hue-saturation') {
        const hueSat = settings as HueSaturationSettings;
        const filters: FabricBaseFilter[] = [
            new fabric.filters.HueRotation({ rotation: (hueSat.hue || 0) * 2 * clampedIntensity }) as unknown as FabricBaseFilter,
            new fabric.filters.Saturation({ saturation: (hueSat.saturation || 0) * clampedIntensity }) as unknown as FabricBaseFilter
        ];
        if (typeof hueSat.lightness === 'number' && Math.abs(hueSat.lightness) > 0.001) {
            filters.push(new fabric.filters.Brightness({ brightness: hueSat.lightness * clampedIntensity }) as unknown as FabricBaseFilter);
        }
        return filters;
    }

    if (type === 'saturation-vibrance') {
        const satVib = settings as SaturationVibranceSettings;
        const filters: FabricBaseFilter[] = [
            new fabric.filters.Saturation({ saturation: (satVib.saturation || 0) * clampedIntensity }) as unknown as FabricBaseFilter
        ];
        const VibranceFilter = filtersRegistry.Vibrance;
        if (VibranceFilter) {
            filters.push(new VibranceFilter({ vibrance: (satVib.vibrance || 0) * clampedIntensity }) as unknown as FabricBaseFilter);
        }
        return filters;
    }

    if (type === 'black-white') {
        const bw = new fabric.filters.BlackWhite() as unknown as FabricBaseFilter;
        if (clampedIntensity >= 0.99) return [bw];
        return [
            new fabric.filters.Saturation({ saturation: -clampedIntensity }) as unknown as FabricBaseFilter
        ];
    }

    if (type === 'color-balance') {
        const balance = settings as ColorBalanceSettings;
        const red = Math.max(-1, Math.min(1, balance.red || 0)) * 0.35 * clampedIntensity;
        const green = Math.max(-1, Math.min(1, balance.green || 0)) * 0.35 * clampedIntensity;
        const blue = Math.max(-1, Math.min(1, balance.blue || 0)) * 0.35 * clampedIntensity;
        const filters: FabricBaseFilter[] = [];
        if (Math.abs(red) > 0.001) {
            filters.push(new fabric.filters.Brightness({ brightness: red }) as unknown as FabricBaseFilter);
        }
        if (Math.abs(green) > 0.001) {
            filters.push(new fabric.filters.Brightness({ brightness: green }) as unknown as FabricBaseFilter);
        }
        if (Math.abs(blue) > 0.001) {
            filters.push(new fabric.filters.Brightness({ brightness: blue }) as unknown as FabricBaseFilter);
        }
        return filters;
    }

    if (type === 'light-and-color') {
        const lac = settings as LightAndColorSettings;
        const filters: FabricBaseFilter[] = [];
        const exposure = (lac.exposure || 0) * clampedIntensity;
        const saturation = (lac.saturation || 0) * clampedIntensity;
        const vibrance = (lac.vibrance || 0) * clampedIntensity;
        const temperature = (lac.temperature || 0) * 0.2 * clampedIntensity;
        if (Math.abs(exposure) > 0.001) {
            filters.push(new fabric.filters.Brightness({ brightness: exposure }) as unknown as FabricBaseFilter);
        }
        if (Math.abs(saturation) > 0.001) {
            filters.push(new fabric.filters.Saturation({ saturation }) as unknown as FabricBaseFilter);
        }
        const VibranceFilter = filtersRegistry.Vibrance;
        if (VibranceFilter && Math.abs(vibrance) > 0.001) {
            filters.push(new VibranceFilter({ vibrance }) as unknown as FabricBaseFilter);
        }
        if (Math.abs(temperature) > 0.001) {
            filters.push(new fabric.filters.Brightness({ brightness: temperature }) as unknown as FabricBaseFilter);
        }
        return filters;
    }

    if (type === 'solid-color') {
        const sc = settings as SolidColorSettings;
        const color = sc.color || '#ff0000';
        return [
            new fabric.filters.BlendColor({
                color,
                mode: 'tint',
                alpha: clampedIntensity,
            }) as unknown as FabricBaseFilter
        ];
    }

    return [];
}

/**
 * React hook that returns a memoized callback to walk the canvas object
 * stack and apply adjustment-layer filters to images below them.
 */
export function useApplyAdjustmentLayers(canvas: fabric.Canvas | null) {
    return useCallback(() => {
        if (!canvas) return;
        const objs = canvas.getObjects();

        const defaultFilterBackend = fabric.getFilterBackend();
        const canvas2dFilterBackend = new fabric.Canvas2dFilterBackend();

        const globalFilters: FabricBaseFilter[] = [];
        let currentClipStack: FabricBaseFilter[] = [];

        for (let i = objs.length - 1; i >= 0; i--) {
            const obj = objs[i];
            const ext = obj as ExtendedFabricObject;

            if (obj.type === 'selection' || obj.type === 'activeSelection' || !obj.visible && !ext.isAdjustmentLayer) {
                if (ext.isAdjustmentLayer) {
                    // handled below
                } else if (obj.visible === false) {
                    continue;
                } else if (obj.type === 'selection' || obj.type === 'activeSelection') {
                    continue;
                }
            }

            if (ext.isAdjustmentLayer && ext.adjustmentType && ext.adjustmentSettings) {
                if (obj.visible === false) continue;

                const opacity = typeof obj.opacity === 'number' ? obj.opacity : 1;
                const newFilters = tagAdjustmentFilters(buildFiltersForAdjustment(ext.adjustmentType, ext.adjustmentSettings, opacity));

                if (ext.clipped) {
                    currentClipStack.unshift(...newFilters);
                } else {
                    globalFilters.unshift(...newFilters);
                }
                continue;
            }

            if (obj.type === 'image') {
                const image = obj as fabric.Image;
                const imageExt = image as ExtendedFabricObject;
                if (!imageExt.baseFilters) {
                    // First touch: everything currently on the image that was
                    // not generated by an adjustment layer is the user's base.
                    const existing = image.filters || [];
                    imageExt.baseFilters = existing.filter((f) => !isAdjustmentGeneratedFilter(f));
                } else {
                    // baseFilters may be plain JSON after a canvas/design load.
                    imageExt.baseFilters = reviveImageFilters(imageExt.baseFilters);
                }

                const combinedFilters = [...imageExt.baseFilters, ...currentClipStack, ...globalFilters];
                image.filters = combinedFilters;

                if (typeof image.applyFilters === 'function') {
                    const needsCanvas2d = combinedFilters.some((filter) => filter.type === 'Curves');
                    const shouldSwapBackend = needsCanvas2d && !(defaultFilterBackend instanceof fabric.Canvas2dFilterBackend);
                    if (shouldSwapBackend) {
                        fabric.setFilterBackend(canvas2dFilterBackend);
                    }
                    applyImageFiltersPreservingGeometry(image);
                    if (shouldSwapBackend) {
                        fabric.setFilterBackend(defaultFilterBackend);
                    }
                }
            }

            currentClipStack = [];
        }

        canvas.requestRenderAll();
    }, [canvas]);
}
