import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import {
    documentSelectionToTintImageData,
    getDocumentSelectionTightBounds,
    isDocumentSelectionEmpty,
} from '@/lib/selection/documentSelectionMask';
import {
    getDocumentSelectionMask,
    subscribeDocumentSelection,
} from '@/lib/selection/documentSelectionStore';

type TintOverlay = fabric.Image & { isSelectionOverlayHelper?: boolean };
type AntsRect = fabric.Rect & { isSelectionOverlayHelper?: boolean };

/**
 * Keeps a tint + dashed "ants" rect in sync with the document selection mask.
 */
export function useSelectionMaskOverlay(canvas: fabric.Canvas | null) {
    const tintRef = useRef<TintOverlay | null>(null);
    const antsRef = useRef<AntsRect | null>(null);
    const dashOffsetRef = useRef(0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!canvas) return;

        const removeOverlay = () => {
            if (tintRef.current) {
                canvas.remove(tintRef.current);
                tintRef.current = null;
            }
            if (antsRef.current) {
                canvas.remove(antsRef.current);
                antsRef.current = null;
            }
        };

        const syncOverlay = () => {
            const mask = getDocumentSelectionMask(canvas);
            if (!mask || isDocumentSelectionEmpty(mask)) {
                removeOverlay();
                canvas.requestRenderAll();
                return;
            }

            const tintData = documentSelectionToTintImageData(mask);
            if (!tintData) return;

            const tintCanvas = document.createElement('canvas');
            tintCanvas.width = mask.width;
            tintCanvas.height = mask.height;
            const tintCtx = tintCanvas.getContext('2d');
            if (!tintCtx) return;
            tintCtx.putImageData(tintData, 0, 0);

            if (!tintRef.current) {
                const image = new fabric.Image(tintCanvas, {
                    left: mask.left,
                    top: mask.top,
                    originX: 'left',
                    originY: 'top',
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    excludeFromExport: true,
                }) as TintOverlay;
                image.isSelectionOverlayHelper = true;
                tintRef.current = image;
                canvas.add(image);
            } else {
                const imageAny = tintRef.current as unknown as {
                    setElement?: (el: HTMLCanvasElement) => void;
                };
                imageAny.setElement?.(tintCanvas);
                tintRef.current.set({
                    left: mask.left,
                    top: mask.top,
                    width: mask.width,
                    height: mask.height,
                    dirty: true,
                });
                tintRef.current.setCoords();
            }

            const tight = getDocumentSelectionTightBounds(mask);
            if (tight) {
                if (!antsRef.current) {
                    const rect = new fabric.Rect({
                        left: tight.left,
                        top: tight.top,
                        width: Math.max(1, tight.width),
                        height: Math.max(1, tight.height),
                        fill: 'transparent',
                        stroke: '#2563eb',
                        strokeWidth: 1.25,
                        strokeDashArray: [5, 4],
                        selectable: false,
                        evented: false,
                        objectCaching: false,
                        excludeFromExport: true,
                    }) as AntsRect;
                    rect.isSelectionOverlayHelper = true;
                    antsRef.current = rect;
                    canvas.add(rect);
                } else {
                    antsRef.current.set({
                        left: tight.left,
                        top: tight.top,
                        width: Math.max(1, tight.width),
                        height: Math.max(1, tight.height),
                        dirty: true,
                    });
                    antsRef.current.setCoords();
                }
            }

            const bringFront = canvas as fabric.Canvas & {
                bringObjectToFront?: (o: fabric.Object) => void;
                bringToFront?: (o: fabric.Object) => void;
            };
            if (tintRef.current) {
                bringFront.bringObjectToFront?.(tintRef.current);
                bringFront.bringToFront?.(tintRef.current);
            }
            if (antsRef.current) {
                bringFront.bringObjectToFront?.(antsRef.current);
                bringFront.bringToFront?.(antsRef.current);
            }
            canvas.requestRenderAll();
        };

        const tickAnts = () => {
            if (antsRef.current) {
                dashOffsetRef.current = (dashOffsetRef.current + 0.35) % 18;
                antsRef.current.set({ strokeDashOffset: -dashOffsetRef.current });
                canvas.requestRenderAll();
            }
            rafRef.current = window.setTimeout(tickAnts, 48) as unknown as number;
        };

        syncOverlay();
        const unsubscribe = subscribeDocumentSelection(canvas, syncOverlay);
        tickAnts();

        return () => {
            unsubscribe();
            if (rafRef.current != null) {
                window.clearTimeout(rafRef.current as unknown as number);
                rafRef.current = null;
            }
            removeOverlay();
        };
    }, [canvas]);
}
