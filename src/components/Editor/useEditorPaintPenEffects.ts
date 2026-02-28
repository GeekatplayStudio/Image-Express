import { useEffect } from 'react';
import * as fabric from 'fabric';

import { applyRasterBrushToCanvas, disableRasterDrawingMode, type RasterBlendMode, type RasterBrushPreset } from '@/lib/raster-engine';

type UseEditorPaintPenEffectsArgs = {
    canvas: fabric.Canvas | null;
    activeTool: string;
    paintBrushPreset: RasterBrushPreset;
    paintBrushSize: number;
    paintBrushHardness: number;
    paintBrushOpacity: number;
    paintBrushFlow: number;
    paintBrushSmoothing: number;
    paintBlendMode: RasterBlendMode;
    setPenTopMode: (mode: 'path' | 'shape') => void;
    setPenTopPathOperation: (mode: 'add' | 'subtract' | 'intersect') => void;
    setPenTopAutoAddDelete: (enabled: boolean) => void;
    setPenTopRubberBand: (enabled: boolean) => void;
};

type PenDraftPayload = {
    closure?: 'open' | 'closed';
    pathOperation?: 'add' | 'subtract' | 'intersect';
    autoAddDelete?: boolean;
    rubberBand?: boolean;
};

export function useEditorPaintPenEffects({
    canvas,
    activeTool,
    paintBrushPreset,
    paintBrushSize,
    paintBrushHardness,
    paintBrushOpacity,
    paintBrushFlow,
    paintBrushSmoothing,
    paintBlendMode,
    setPenTopMode,
    setPenTopPathOperation,
    setPenTopAutoAddDelete,
    setPenTopRubberBand,
}: UseEditorPaintPenEffectsArgs) {
    useEffect(() => {
        if (!canvas) return;
        if (activeTool !== 'paint') {
            disableRasterDrawingMode(canvas);
            return;
        }

        try {
            applyRasterBrushToCanvas(canvas, {
                preset: paintBrushPreset,
                size: paintBrushSize,
                hardness: paintBrushHardness,
                opacity: paintBrushOpacity,
                flow: paintBrushFlow,
                smoothing: paintBrushSmoothing,
                color: '#000000',
            });
            canvas.requestRenderAll();
        } catch {
            return;
        }
    }, [
        canvas,
        activeTool,
        paintBrushPreset,
        paintBrushSize,
        paintBrushHardness,
        paintBrushOpacity,
        paintBrushFlow,
        paintBrushSmoothing,
    ]);

    useEffect(() => {
        if (!canvas || activeTool !== 'paint') return;

        const handlePathBlendMode = (event: { path?: fabric.Object }) => {
            if (!event.path) return;
            window.setTimeout(() => {
                if (!event.path) return;
                event.path.set({ globalCompositeOperation: paintBlendMode });
                event.path.setCoords();
                canvas.requestRenderAll();
            }, 0);
        };

        canvas.on('path:created', handlePathBlendMode);
        return () => {
            canvas.off('path:created', handlePathBlendMode);
        };
    }, [canvas, activeTool, paintBlendMode]);

    useEffect(() => {
        if (!canvas) return;

        const canvasWithEvents = canvas as unknown as {
            on: (eventName: string, cb: (payload?: PenDraftPayload) => void) => void;
            off: (eventName: string, cb: (payload?: PenDraftPayload) => void) => void;
        };

        const syncPenMode = (payload?: PenDraftPayload) => {
            if (payload?.closure) {
                setPenTopMode(payload.closure === 'closed' ? 'shape' : 'path');
            }
            if (payload?.pathOperation) {
                setPenTopPathOperation(payload.pathOperation);
            }
            if (typeof payload?.autoAddDelete === 'boolean') {
                setPenTopAutoAddDelete(payload.autoAddDelete);
            }
            if (typeof payload?.rubberBand === 'boolean') {
                setPenTopRubberBand(payload.rubberBand);
            }
        };

        canvasWithEvents.on('pen:draft:update', syncPenMode);
        return () => {
            canvasWithEvents.off('pen:draft:update', syncPenMode);
        };
    }, [
        canvas,
        setPenTopAutoAddDelete,
        setPenTopMode,
        setPenTopPathOperation,
        setPenTopRubberBand,
    ]);
}
