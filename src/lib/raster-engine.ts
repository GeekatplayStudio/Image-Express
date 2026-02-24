import * as fabric from 'fabric';
import { applyAlphaToColor } from '@/lib/fabric-utils';

export type RasterBrushPreset = 'Pencil' | 'Spray' | 'Oil' | 'Watercolor';
export type RasterBlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export interface RasterBrushConfig {
    preset: RasterBrushPreset;
    size: number;
    hardness: number;
    opacity: number;
    flow: number;
    smoothing: number;
    color: string;
}

type DrawingCanvas = fabric.Canvas & {
    set?: (key: string, value: unknown) => void;
    freeDrawingBrush?: fabric.BaseBrush;
    isDrawingMode?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeConfig = (config: RasterBrushConfig) => ({
    ...config,
    size: clamp(Number(config.size) || 1, 1, 1000),
    hardness: clamp(Number(config.hardness) || 0, 0, 100),
    opacity: clamp(Number(config.opacity) || 100, 1, 100),
    flow: clamp(Number(config.flow) || 100, 1, 100),
    smoothing: clamp(Number(config.smoothing) || 50, 0, 100),
    color: typeof config.color === 'string' && config.color.trim().length > 0 ? config.color : '#000000',
});

export const createRasterBrush = (canvas: fabric.Canvas, rawConfig: RasterBrushConfig): fabric.BaseBrush => {
    const config = normalizeConfig(rawConfig);

    let brush: fabric.BaseBrush;

    if (config.preset === 'Spray' || config.preset === 'Oil') {
        const sprayBrush = new fabric.SprayBrush(canvas);
        sprayBrush.density = Math.max(5, Math.round((config.flow / 100) * 100));

        if (config.preset === 'Oil') {
            sprayBrush.dotWidth = Math.max(1, config.size / 8);
            sprayBrush.dotWidthVariance = Math.max(1, config.size / 10);
            sprayBrush.randomOpacity = false;
            sprayBrush.optimizeOverlapping = false;
        }

        brush = sprayBrush;
    } else {
        const pencilBrush = new fabric.PencilBrush(canvas);
        pencilBrush.decimate = Math.max(0, Number((((100 - config.smoothing) / 100) * 8).toFixed(2)));
        const blurAmount = config.preset === 'Watercolor'
            ? Math.max(6, Math.round(((100 - config.hardness) / 100) * 50))
            : Math.max(0, Math.round(((100 - config.hardness) / 100) * 50));

        pencilBrush.shadow = blurAmount > 0
            ? new fabric.Shadow({
                blur: blurAmount,
                offsetX: 0,
                offsetY: 0,
                color: config.preset === 'Watercolor'
                    ? applyAlphaToColor(config.color, 0.35)
                    : config.color,
            })
            : null;

        brush = pencilBrush;
    }

    brush.width = config.size;
    const combinedOpacity = clamp((config.opacity / 100) * (config.flow / 100), 0.01, 1);
    brush.color = applyAlphaToColor(config.color, combinedOpacity);
    return brush;
};

export const applyRasterBrushToCanvas = (
    canvas: fabric.Canvas,
    config: RasterBrushConfig
): fabric.BaseBrush => {
    const drawingCanvas = canvas as DrawingCanvas;
    const brush = createRasterBrush(canvas, config);

    if (typeof drawingCanvas.set === 'function') {
        drawingCanvas.set('isDrawingMode', true);
        drawingCanvas.set('freeDrawingBrush', brush);
    } else {
        drawingCanvas.isDrawingMode = true;
        drawingCanvas.freeDrawingBrush = brush;
    }

    return brush;
};

export const disableRasterDrawingMode = (canvas: fabric.Canvas) => {
    const drawingCanvas = canvas as DrawingCanvas;
    if (typeof drawingCanvas.set === 'function') {
        drawingCanvas.set('isDrawingMode', false);
        return;
    }
    drawingCanvas.isDrawingMode = false;
};
