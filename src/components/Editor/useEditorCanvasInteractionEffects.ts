import { useEffect } from 'react';
import * as fabric from 'fabric';

import type { ExtendedFabricObject, ThreeDImage } from '@/types';

type MediaPreview = { type: 'video' | 'audio'; url: string } | null;

type UseEditorCanvasInteractionEffectsArgs = {
    canvas: fabric.Canvas | null;
    activeTool: string;
    gradientTopType: 'linear' | 'radial' | 'angle';
    gradientTopBlendMode: 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
    gradientTopOpacity: number;
    gradientTopReverse: boolean;
    gradientTopDither: boolean;
    resolveGradientStops: (fill: unknown, reverse: boolean) => Array<{ offset: number; color: string }>;
    setMediaPreview: React.Dispatch<React.SetStateAction<MediaPreview>>;
    setEditingModelUrl: React.Dispatch<React.SetStateAction<string | null>>;
    setEditingModelObject: React.Dispatch<React.SetStateAction<fabric.Object | null>>;
    onOpenThreeDModel?: (target: ThreeDImage & ExtendedFabricObject) => void;
    setActiveTool: (tool: string) => void;
};

export function useEditorCanvasInteractionEffects({
    canvas,
    activeTool,
    gradientTopType,
    gradientTopBlendMode,
    gradientTopOpacity,
    gradientTopReverse,
    gradientTopDither,
    resolveGradientStops,
    setMediaPreview,
    setEditingModelUrl,
    setEditingModelObject,
    onOpenThreeDModel,
    setActiveTool,
}: UseEditorCanvasInteractionEffectsArgs) {
    useEffect(() => {
        if (!canvas) return;

        const handleDblClick = (e: fabric.TPointerEventInfo) => {
            const target = e.target as (ThreeDImage & ExtendedFabricObject) | undefined;
            if (!target) return;

            if (target.mediaType && target.mediaSource) {
                setMediaPreview({ type: target.mediaType as 'video' | 'audio', url: target.mediaSource });
                return;
            }

            if (target.is3DModel || target.modelUrl) {
                if (onOpenThreeDModel) {
                    onOpenThreeDModel(target);
                    return;
                }
                setEditingModelUrl(target.modelUrl || null);
                setEditingModelObject(target);
            } else {
                setActiveTool('select');
            }
        };

        const handleGradientTool = () => {
            let isDown = false;
            let startPoint = { x: 0, y: 0 };
            let activeObj: fabric.Object | null | undefined = null;

            return {
                'mouse:down': (opt: fabric.TPointerEventInfo) => {
                    if (activeTool !== 'gradient') return;
                    if (opt.target) {
                        canvas.setActiveObject(opt.target);
                        activeObj = opt.target;
                    } else {
                        activeObj = canvas.getActiveObject();
                    }
                    if (!activeObj) return;
                    isDown = true;
                    const pointer = canvas.getScenePoint(opt.e);
                    startPoint = { x: pointer.x, y: pointer.y };
                },
                'mouse:move': (opt: fabric.TPointerEventInfo) => {
                    if (!isDown || activeTool !== 'gradient' || !activeObj) return;
                    const pointer = canvas.getScenePoint(opt.e);
                    const m = activeObj.calcTransformMatrix();
                    const mInv = fabric.util.invertTransform(m);
                    const p1Local = fabric.util.transformPoint(new fabric.Point(startPoint.x, startPoint.y), mInv);
                    const p2Local = fabric.util.transformPoint(new fabric.Point(pointer.x, pointer.y), mInv);
                    const w = activeObj.width || 1;
                    const h = activeObj.height || 1;
                    const ox = activeObj.originX === 'center' ? 0.5 : (activeObj.originX === 'right' ? 1 : 0);
                    const oy = activeObj.originY === 'center' ? 0.5 : (activeObj.originY === 'bottom' ? 1 : 0);
                    const n1 = { x: (p1Local.x / w) + ox, y: (p1Local.y / h) + oy };
                    const n2 = { x: (p2Local.x / w) + ox, y: (p2Local.y / h) + oy };

                    const editableGradientObject = activeObj as fabric.Object & ExtendedFabricObject & {
                        get: (key: string) => unknown;
                        set: (props: unknown) => void;
                        setCoords?: () => void;
                    };
                    const currentFill = editableGradientObject.get('fill');
                    const nextStops = resolveGradientStops(currentFill, gradientTopReverse);
                    const nextType = gradientTopType;
                    const nextBlendMode = gradientTopBlendMode;
                    const nextOpacity = Math.max(1, Math.min(100, Math.round(gradientTopOpacity)));
                    const nextDither = gradientTopDither;

                    let newGradient: fabric.Gradient<'linear' | 'radial'>;
                    if (nextType === 'radial') {
                        const radius = Math.max(0.001, Math.hypot(n2.x - n1.x, n2.y - n1.y));
                        newGradient = new fabric.Gradient({
                            type: 'radial',
                            gradientUnits: 'percentage',
                            coords: { x1: n1.x, y1: n1.y, r1: 0, x2: n1.x, y2: n1.y, r2: radius },
                            colorStops: nextStops,
                        });
                    } else {
                        newGradient = new fabric.Gradient({
                            type: 'linear',
                            gradientUnits: 'percentage',
                            coords: { x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y },
                            colorStops: nextStops,
                        });
                    }

                    editableGradientObject.set({
                        fill: newGradient,
                        globalCompositeOperation: nextBlendMode,
                        opacity: nextOpacity / 100,
                        dirty: true,
                    });
                    editableGradientObject.gradientTypeHint = nextType;
                    editableGradientObject.gradientReversed = gradientTopReverse;
                    editableGradientObject.gradientDitherEnabled = nextDither;
                    editableGradientObject.setCoords?.();
                    canvas.requestRenderAll();
                },
                'mouse:up': () => {
                    isDown = false;
                    activeObj = null;
                },
            };
        };

        const gradientHandlers = handleGradientTool();
        canvas.on('mouse:dblclick', handleDblClick);
        canvas.on('mouse:down', gradientHandlers['mouse:down']);
        canvas.on('mouse:move', gradientHandlers['mouse:move']);
        canvas.on('mouse:up', gradientHandlers['mouse:up']);

        return () => {
            canvas.off('mouse:dblclick', handleDblClick);
            canvas.off('mouse:down', gradientHandlers['mouse:down']);
            canvas.off('mouse:move', gradientHandlers['mouse:move']);
            canvas.off('mouse:up', gradientHandlers['mouse:up']);
        };
    }, [
        canvas,
        activeTool,
        gradientTopType,
        gradientTopBlendMode,
        gradientTopOpacity,
        gradientTopReverse,
        gradientTopDither,
        resolveGradientStops,
        setMediaPreview,
        setEditingModelUrl,
        setEditingModelObject,
        onOpenThreeDModel,
        setActiveTool,
    ]);
}
