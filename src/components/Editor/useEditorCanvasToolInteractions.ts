import { useEffect } from 'react';
import * as fabric from 'fabric';

import type { RectBounds } from '@/components/Editor/editorView.types';

type CropHelperRect = fabric.Rect & { isSelectionOverlayHelper?: boolean };

type UseEditorCanvasToolInteractionsParams = {
    canvas: fabric.Canvas | null;
    activeTool: string;
    cropDraftHelperRef: React.MutableRefObject<CropHelperRect | null>;
    setCropTopDraftRect: React.Dispatch<React.SetStateAction<RectBounds | null>>;
    applyTopCropSettings: () => void;
    getScenePointerFromEvent: (opt: fabric.TPointerEventInfo) => fabric.Point | null;
    eyedropperPointerRef: React.MutableRefObject<fabric.Point | null>;
    handleEyedropperSample: (preferredPoint?: fabric.Point | null) => void;
    enterEyedropperCanvasMode: () => (() => void) | null;
};

export const useEditorCanvasToolInteractions = ({
    canvas,
    activeTool,
    cropDraftHelperRef,
    setCropTopDraftRect,
    applyTopCropSettings,
    getScenePointerFromEvent,
    eyedropperPointerRef,
    handleEyedropperSample,
    enterEyedropperCanvasMode,
}: UseEditorCanvasToolInteractionsParams) => {
    useEffect(() => {
        if (!canvas) return;

        const clearDraftHelper = () => {
            const helper = cropDraftHelperRef.current;
            if (!helper) return;
            canvas.remove(helper);
            cropDraftHelperRef.current = null;
            canvas.requestRenderAll();
        };

        if (activeTool !== 'crop') {
            clearDraftHelper();
            setCropTopDraftRect(null);
            return;
        }

        let isDragging = false;
        let dragStart: fabric.Point | null = null;

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;

            const pointer = getScenePointerFromEvent(opt);
            if (!pointer) return;

            isDragging = true;
            dragStart = pointer;
            clearDraftHelper();
            setCropTopDraftRect(null);

            const helper = new fabric.Rect({
                left: pointer.x,
                top: pointer.y,
                width: 1,
                height: 1,
                fill: 'rgba(31,138,165,0.12)',
                stroke: '#1f8aa5',
                strokeWidth: 1.2,
                strokeDashArray: [6, 4],
                selectable: false,
                evented: false,
                objectCaching: false,
                excludeFromExport: true,
            }) as CropHelperRect;
            helper.isSelectionOverlayHelper = true;
            cropDraftHelperRef.current = helper;
            canvas.add(helper);
            canvas.requestRenderAll();
        };

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            if (!isDragging || !dragStart || !cropDraftHelperRef.current) return;
            const pointer = getScenePointerFromEvent(opt);
            if (!pointer) return;

            const left = Math.min(dragStart.x, pointer.x);
            const top = Math.min(dragStart.y, pointer.y);
            const width = Math.max(1, Math.abs(pointer.x - dragStart.x));
            const height = Math.max(1, Math.abs(pointer.y - dragStart.y));

            cropDraftHelperRef.current.set({ left, top, width, height });
            cropDraftHelperRef.current.setCoords();
            setCropTopDraftRect({ left, top, width, height });
            canvas.requestRenderAll();
        };

        const handleMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            dragStart = null;
        };

        const handleWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            applyTopCropSettings();
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        window.addEventListener('keydown', handleWindowKeyDown);
        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
            window.removeEventListener('keydown', handleWindowKeyDown);
            clearDraftHelper();
        };
    }, [canvas, activeTool, applyTopCropSettings, getScenePointerFromEvent, setCropTopDraftRect, cropDraftHelperRef]);

    useEffect(() => {
        if (!canvas || activeTool !== 'eyedropper') return;
        const restoreEyedropperCanvasMode = enterEyedropperCanvasMode();
        if (canvas.getActiveObject()) {
            canvas.discardActiveObject();
            canvas.requestRenderAll();
        }

        const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
            const pointer = getScenePointerFromEvent(opt);
            if (pointer) eyedropperPointerRef.current = pointer;
        };

        const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
            const rawEvent = opt.e as MouseEvent | PointerEvent | TouchEvent | undefined;
            if (rawEvent && 'button' in rawEvent && rawEvent.button !== 0) return;
            const pointer = getScenePointerFromEvent(opt);
            if (!pointer) return;
            eyedropperPointerRef.current = pointer;
            handleEyedropperSample(pointer);
        };

        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:down', handleMouseDown);
        return () => {
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:down', handleMouseDown);
            restoreEyedropperCanvasMode?.();
        };
    }, [canvas, activeTool, getScenePointerFromEvent, handleEyedropperSample, eyedropperPointerRef, enterEyedropperCanvasMode]);
};
