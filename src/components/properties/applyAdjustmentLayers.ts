import * as fabric from 'fabric';
import {
    ExtendedFabricObject,
    AdjustmentLayerType,
    AdjustmentLayerSettings,
    CurvesAdjustmentSettings,
    CurvesChannel,
    LevelsAdjustmentSettings,
    SaturationVibranceSettings,
    HueSaturationSettings,
    ExposureSettings,
    BrightnessContrastSettings,
    ColorBalanceSettings,
    LightAndColorSettings,
    SolidColorSettings,
    FabricBaseFilter,
} from '@/types';
import { applyImageFiltersPreservingGeometry } from '@/lib/fabric-utils';
import { CurvesFilter, isAdjustmentGeneratedFilter, reviveImageFilters, tagAdjustmentFilters } from '@/lib/fabric-filters';

/**
 * Re-derive every image layer's filters from the adjustment layers above it.
 *
 * Walks the layer stack top-down: an adjustment layer either clips to the one
 * visual layer beneath it or applies to everything below, and each image ends
 * up with its own filters plus the stack that reaches it. Lifted out of
 * PropertiesPanel, where it sat as a 300-line callback whose only dependency on
 * the component was the canvas.
 */
export function applyAdjustmentLayersToCanvas(canvas: fabric.Canvas): void {
    const objs = canvas.getObjects();

    const filtersRegistry = fabric.filters as unknown as Record<string, new (options?: Record<string, unknown>) => FabricBaseFilter>;

    const buildFiltersForAdjustment = (
        type: AdjustmentLayerType,
        settings: AdjustmentLayerSettings,
        intensity: number
    ): FabricBaseFilter[] => {
        const clampedIntensity = Math.min(1, Math.max(0, intensity));
        if (type === 'curves') {
            const curves = settings as CurvesAdjustmentSettings;
            const filters: FabricBaseFilter[] = [];

            // 1. Process explicit channels from pointsByChannel
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
            } 
            // 2. Fallback to legacy single-channel if no map exists
            else if (curves.points && curves.points.length >= 2) {
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
            // fabric's BlackWhite doesn't support intensity; opacity blending is handled by clampedIntensity
            // by stacking a desaturation via saturation if not full intensity
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
            const matrix = [
                1, 0, 0, 0, red,
                0, 1, 0, 0, green,
                0, 0, 1, 0, blue,
                0, 0, 0, 1, 0,
            ];
            return [
                new fabric.filters.ColorMatrix({ matrix }) as unknown as FabricBaseFilter
            ];
        }

        if (type === 'light-and-color') {
            const lac = settings as LightAndColorSettings;
            const filters: FabricBaseFilter[] = [];
            const temperature = Math.max(-1, Math.min(1, lac.temperature || 0)) * 0.2 * clampedIntensity;
            const tint = Math.max(-1, Math.min(1, lac.tint || 0)) * 0.2 * clampedIntensity;
            const matrix = [
                1, 0, 0, 0, temperature,
                0, 1, 0, 0, tint,
                0, 0, 1, 0, -temperature,
                0, 0, 0, 1, 0,
            ];
            if (Math.abs(temperature) > 0.001 || Math.abs(tint) > 0.001) {
                filters.push(new fabric.filters.ColorMatrix({ matrix }) as unknown as FabricBaseFilter);
            }

            if (Math.abs(lac.exposure || 0) > 0.001) {
                filters.push(new fabric.filters.Brightness({ brightness: (lac.exposure || 0) * clampedIntensity }) as unknown as FabricBaseFilter);
            }
            if (Math.abs(lac.saturation || 0) > 0.001) {
                filters.push(new fabric.filters.Saturation({ saturation: (lac.saturation || 0) * clampedIntensity }) as unknown as FabricBaseFilter);
            }
            const VibranceFilter = filtersRegistry.Vibrance;
            if (VibranceFilter && Math.abs(lac.vibrance || 0) > 0.001) {
                filters.push(new VibranceFilter({ vibrance: (lac.vibrance || 0) * clampedIntensity }) as unknown as FabricBaseFilter);
            }
            return filters;
        }

        if (type === 'solid-color') {
            const solid = settings as SolidColorSettings;
            const BlendColorFilter = filtersRegistry.BlendColor;
            if (!BlendColorFilter) return [];
            const alpha = Math.max(0, Math.min(1, solid.opacity ?? 0.5));
            return [
                new BlendColorFilter({
                    color: solid.color || '#ff8800',
                    mode: solid.mode || 'tint',
                    alpha: alpha * clampedIntensity,
                }) as unknown as FabricBaseFilter
            ];
        }

        return [];
    };

    const defaultFilterBackend = fabric.getFilterBackend();
    const canvas2dFilterBackend = new fabric.Canvas2dFilterBackend();

    // New Logic: Top-Down "Stack Consumption" to correctly handle clipping blockers
    // We accumulate filters as we traverse from Top to Bottom
    const globalFilters: FabricBaseFilter[] = [];
    let currentClipStack: FabricBaseFilter[] = [];

    // Iterate from Top (last object) to Bottom (first object)
    for (let i = objs.length - 1; i >= 0; i--) {
        const obj = objs[i];
        const ext = obj as ExtendedFabricObject;

        // 1. Skip helpers/selection overlays
        if (obj.type === 'selection' || obj.type === 'activeSelection' || !obj.visible && !ext.isAdjustmentLayer) {
             // Note: We skip invisible visual layers, but invisible adjustment layers just don't contribute
             // If an invisible visual layer is here, it should probably block clipping? 
             // If we skip it here, we "see through" it to the layer below.
             // The user requested rigorous blocking. 
             // If I hide a layer, does the clip pass through? Usually yes if the layer is gone.
             // But let's stick to the visible stack logic.
             if (ext.isAdjustmentLayer) {
                 // handled below
             } else if (obj.visible === false) {
                // Invisible visual layer -> Treat as non-existent for clipping flow
                 continue; 
             } else if (obj.type === 'selection' || obj.type === 'activeSelection') {
                 continue;
             }
        }

        // 2. Is it an Adjustment Layer?
        if (ext.isAdjustmentLayer && ext.adjustmentType && ext.adjustmentSettings) {
            // Normalize legacy designs: adjustment layers must never intercept
            // canvas clicks (they are selected from the layers panel instead).
            if (obj.evented || obj.selectable) {
                obj.set({ evented: false, selectable: false });
            }

            if (obj.visible === false) {
                 // Hidden adjustment layer -> contributes nothing
                 continue;
            }

            const opacity = typeof obj.opacity === 'number' ? obj.opacity : 1;
            const newFilters = tagAdjustmentFilters(buildFiltersForAdjustment(ext.adjustmentType, ext.adjustmentSettings, opacity));

            if (ext.clipped) {
                 // Add to Current Clip Stack
                 // Since we are going Top -> Bottom, the new filter (Top) should be applied AFTER inner filters (Bottom)
                 // BUT, fabric applies array [0, 1, 2] in order.
                 // Filter 0 acts on Image. Filter 1 acts on result of 0.
                 // So Bottom Most Filter should be 0.
                 // Since we visit Top first, we are seeing the LAST applied filter first.
                 // So we should APPEND (Push) to a stack that we will eventually REVERSE?
                 // Or, just construct the final array correctly.
                 
                 // If we have [A, B] (B over A).
                 // We visit B. ClipStack = [B].
                 // Visit A. ClipStack = [A, B]? No. Adjustments stack on each other.
                 // If B is Top. B is applied LAST.
                 // So final array should be [...Old, ...New].
                 // Wait. B is "On Top" visually.
                 // Image -> Filter A -> Filter B.
                 // So B is last in list.
                 // We visit B first.
                 // currentClipStack = [B].
                 // Next is A. currentClipStack = [A, B] ?? 
                 // No. currentClipStack is ACCUMULATING filters to apply to the NEXT VISUAL LAYER.
                 // If we have Adj B (Top), Adj A (Below B).
                 // They both apply to Image (Bottom).
                 // Image should get [A, B].
                 // We visit B. stack = [B].
                 // We visit A. stack = [A, B]. (Unshift).
                 currentClipStack.unshift(...newFilters);
            } else {
                 // Global
                 // Same logic. Global B, Global A. Image gets [A, B].
                 globalFilters.unshift(...newFilters);
            }
            continue;
        }

        // 3. Visual Layer (Image/Group/etc)
        // It CONSUMES the Clip Stack.
        
        // Check if supported target (Image)
        if (obj.type === 'image') {
             const image = obj as fabric.Image;
             const imageExt = image as ExtendedFabricObject; // Re-cast to be sure
             // Init Base Filters if needed
             if (!imageExt.baseFilters) {
                 const existing = image.filters || [];
                 imageExt.baseFilters = existing.filter((f) => !isAdjustmentGeneratedFilter(f));
             } else {
                 imageExt.baseFilters = reviveImageFilters(imageExt.baseFilters);
             }
             
             // Apply: Base + Global + LocalClipped
             // Note: Global filters usually apply AFTER local clipped filters? 
             // Or do they apply generally?
             // In PS: Global Adj Layer acts on everything below.
             // Local Clipped Adj Layer acts on Specific Layer.
             // So Local Clipped is tightly bound. Global is "Above".
             // So Global should be LAST in the pipeline (Index High).
             // Pipeline: Image -> Base -> Clipped -> Global.
             const combinedFilters = [...imageExt.baseFilters, ...currentClipStack, ...globalFilters];
             
             image.filters = combinedFilters;

             // Backend Swap Logic (Curves)
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
        } else if (obj.type === 'group') {
            // Group logic - consumes stack but doesn't render filters by default
            // TODO: Support filters on groups if possible
        } else {
            // Texts, etc
        }
        
        // Visual layer acts as a stopper for the clip stack
        // All "pending" clipped layers have found their target.
        currentClipStack = [];
    }

    canvas.requestRenderAll();
}
