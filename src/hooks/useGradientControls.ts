import { useEffect } from 'react';
import * as fabric from 'fabric';
import { ExtendedFabricObject } from '@/types';
import { getCanvasPointFromGradient, getGradientPointFromCanvas } from '@/lib/fabric-utils';

export function useGradientControls(
    canvas: fabric.Canvas | null,
    selectedObject: ExtendedFabricObject | null,
    isGradient: boolean,
    setGradientCoords: (coords: { x1: number; y1: number; x2: number; y2: number }) => void,
    setGradientAngle: (angle: number) => void
) {
    useEffect(() => {
        if (!canvas || !selectedObject) return;

        const isLinearGradient =
            selectedObject.fill &&
            typeof selectedObject.fill !== 'string' &&
            (selectedObject.fill as fabric.Gradient<'linear'>).type === 'linear' &&
            (selectedObject.fill as fabric.Gradient<'linear'>).coords;

        if (isLinearGradient && isGradient) {
            // Retrieve object from canvas to avoid modifying state directly
            const object = canvas.getActiveObject() as ExtendedFabricObject;
            
            // Safety check
            if (!object || object.id !== selectedObject.id) return;

            // 1. Define Position Handler (Local Gradient Coords -> Canvas Point)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const getControlPosition = (xProp: 'x1'|'x2', yProp: 'y1'|'y2', fabricObject: any) => {
                 const fill = fabricObject.fill as fabric.Gradient<'linear'>;
                 if (!fill || !fill.coords) return new fabric.Point(0, 0);
                 const cX = fill.coords[xProp] ?? (xProp === 'x1' ? 0 : 1);
                 const cY = fill.coords[yProp] ?? 0.5;
                 
                 const p = getCanvasPointFromGradient(fabricObject as ExtendedFabricObject, cX, cY);
                 return new fabric.Point(p.x, p.y);
            };

            // 2. Define Action Handler (Canvas Drag -> Update Gradient Coords)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const onControlDrag = (eventData: any, transform: fabric.Transform, x: number, y: number, isStart: boolean) => {
                 const fabricObject = transform.target as ExtendedFabricObject;
                 const p = getGradientPointFromCanvas(fabricObject, x, y);
                 
                 const fill = fabricObject.fill as fabric.Gradient<'linear'>;
                 if (!fill.coords) return false;
                 
                 if (isStart) {
                     fill.coords.x1 = p.x;
                     fill.coords.y1 = p.y;
                 } else {
                     fill.coords.x2 = p.x;
                     fill.coords.y2 = p.y;
                 }
                 
                 setGradientCoords({ x1: fill.coords.x1??0, y1: fill.coords.y1??0, x2: fill.coords.x2??1, y2: fill.coords.y2??0 });
                 
                 const dx = (fill.coords.x2 ?? 1) - (fill.coords.x1 ?? 0);
                 const dy = (fill.coords.y2 ?? 0) - (fill.coords.y1 ?? 0);
                 const angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
                 setGradientAngle(Math.round(angleDeg));

                 return true; // modified
            };

            // 3. Add Controls
            object.controls.gradientStart = new fabric.Control({
                x: 0, y: 0, 
                cursorStyle: 'crosshair',
                positionHandler: (dim, finalMatrix, fabricObject) => getControlPosition('x1', 'y1', fabricObject),
                actionHandler: (eventData, transform, x, y) => onControlDrag(eventData, transform, x, y, true),
                render: (ctx, left, top) => {
                    ctx.save();
                    ctx.translate(left, top);
                    ctx.beginPath();
                    ctx.arc(0, 0, 6, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#333333';
                    ctx.lineWidth = 1;
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            });

            object.controls.gradientEnd = new fabric.Control({
                x: 0, y: 0, 
                cursorStyle: 'crosshair',
                positionHandler: (dim, finalMatrix, fabricObject) => getControlPosition('x2', 'y2', fabricObject),
                actionHandler: (eventData, transform, x, y) => onControlDrag(eventData, transform, x, y, false),
                render: (ctx, left, top, _styleOverride, fabricObject) => {
                    // Draw Line from Start to End
                    const fill = fabricObject.fill as fabric.Gradient<'linear'>;
                    if (fill && fill.coords) {
                         const startP = getCanvasPointFromGradient(fabricObject as ExtendedFabricObject, fill.coords.x1??0, fill.coords.y1??0.5);
                         ctx.save();
                         ctx.beginPath();
                         ctx.moveTo(startP.x, startP.y);
                         ctx.lineTo(left, top);
                         ctx.strokeStyle = '#888';
                         ctx.setLineDash([4, 4]);
                         ctx.stroke();
                         ctx.restore();
                    }

                    ctx.save();
                    ctx.translate(left, top);
                    ctx.beginPath();
                    ctx.arc(0, 0, 6, 0, Math.PI * 2);
                    ctx.fillStyle = '#000000';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            });

            // Regenerate oCoords so fabric's control hit-testing stays in sync
            // with the mutated controls map (stale keys crash findControl).
            object.setCoords();
            canvas.requestRenderAll();

        } else {
            // Cleanup controls if they exist (and we are selected, but gradient mode off)
            if (selectedObject && selectedObject.controls) {
                 const controls = selectedObject.controls as Record<string, fabric.Control>;
                 // eslint-disable-next-line react-hooks/immutability
                 if (controls.gradientStart) delete controls.gradientStart;
                 if (controls.gradientEnd) delete controls.gradientEnd;
                 selectedObject.setCoords();
                 canvas.requestRenderAll();
            }
        }

        // Cleanup on unmount or when object changes
        return () => {
             if (selectedObject && selectedObject.controls) {
                  const controls = selectedObject.controls as Record<string, fabric.Control>;
                  delete controls.gradientStart;
                  delete controls.gradientEnd;
                  selectedObject.setCoords();
                  // We don't request render here as component might be unmounting or object switching
                  // But usually good practice if canvas is still alive.
                  canvas?.requestRenderAll();
             }
        }
    }, [selectedObject, isGradient, canvas, setGradientCoords, setGradientAngle]);
}
