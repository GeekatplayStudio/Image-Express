import { useEffect } from 'react';
import * as fabric from 'fabric';

interface GradientControlObject extends fabric.Object {
    isGradientControl?: boolean;
    id?: string;
}

interface GradientControlsProps {
    canvas: fabric.Canvas | null;
    activeTool: string;
}

export function GradientControls({ canvas, activeTool }: GradientControlsProps) {
    useEffect(() => {
        if (!canvas) return;

        let p1Control: GradientControlObject | null = null;
        let p2Control: GradientControlObject | null = null;
        let lineControl: fabric.Line | null = null;
        let activeObj: fabric.Object | null = null;

        const cleanupControls = () => {
            if (p1Control) { canvas.remove(p1Control); p1Control = null; }
            if (p2Control) { canvas.remove(p2Control); p2Control = null; }
            if (lineControl) { canvas.remove(lineControl); lineControl = null; }
            canvas.requestRenderAll();
        };

        const updateControls = () => {
            if (!activeObj || !p1Control || !p2Control || !lineControl) return;
            
            // Get gradient relative coords
            const fill = activeObj.fill as fabric.Gradient<'linear'>;
            if (!fill || fill.type !== 'linear' || !fill.coords) return;

            const { x1, y1, x2, y2 } = fill.coords;
            const w = activeObj.getScaledWidth();
            const h = activeObj.getScaledHeight();
            const center = activeObj.getCenterPoint();
            const angle = fabric.util.degreesToRadians(activeObj.angle || 0);
            
            // Convert gradient percentage/factor coords to canvas absolute
            // Gradient coords are 0..1 usually or -1..1 depending on setup.
            // Fabric defaults: x1,y1 are relative to object center?
            // "percentage" units: 0,0 is Top-Left of object?
            // Actually, Fabric gradient coords depend on `gradientUnits`.
            // Default `pixels`. If `percentage`:
            // 0 -> 0, 1 -> width.
            
            // Let's assume percentage for interaction consistency (our tool creates percentage)
            
            // Helper to transform local offset to canvas point
            const toCanvas = (fx: number, fy: number) => {
                 // fx, fy are 0..1
                 // Object origin is center. TopLeft is (-0.5, -0.5)
                 const lx = (fx - 0.5) * w;
                 const ly = (fy - 0.5) * h;
                 
                 // Rotate
                 const rx = lx * Math.cos(angle) - ly * Math.sin(angle);
                 const ry = lx * Math.sin(angle) + ly * Math.cos(angle);
                 
                 return { x: center.x + rx, y: center.y + ry };
            };

            const start = toCanvas(x1, y1);
            const end = toCanvas(x2, y2);

            p1Control.set({ left: start.x, top: start.y });
            p2Control.set({ left: end.x, top: end.y });
            lineControl.set({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
            
            p1Control.setCoords();
            p2Control.setCoords();
            lineControl.setCoords();
        };

        const setupControls = (obj: fabric.Object) => {
            cleanupControls();
            const fill = obj.fill as fabric.Gradient<'linear'>;
            if (!fill || fill.type !== 'linear') return;

            activeObj = obj;

            // Create controls
            p1Control = new fabric.Circle({
                radius: 6, fill: '#fff', stroke: '#333', strokeWidth: 1,
                hasControls: false, hasBorders: false,
                originX: 'center', originY: 'center',
                hoverCursor: 'grab'
            }) as GradientControlObject;
            p2Control = new fabric.Circle({
                radius: 6, fill: '#fff', stroke: '#333', strokeWidth: 1,
                hasControls: false, hasBorders: false,
                originX: 'center', originY: 'center',
                hoverCursor: 'grab'
            }) as GradientControlObject;
            lineControl = new fabric.Line([0,0,0,0], {
                stroke: '#333', strokeWidth: 1, strokeDashArray: [4, 4],
                selectable: false, evented: false, opacity: 0.6
            });

            // Add custom props to identify
            p1Control.isGradientControl = true;
            p2Control.isGradientControl = true;
            p1Control.id = 'p1';
            p2Control.id = 'p2';

            canvas.add(lineControl);
            canvas.add(p1Control);
            canvas.add(p2Control);
            
            updateControls();
            canvas.requestRenderAll();
        };

        const onSelection = () => {
             // Only show if active tool is gradient OR select (optional, usually gradient tool only)
             if (activeTool !== 'gradient') {
                 cleanupControls();
                 return;
             }
             const active = canvas.getActiveObject();
             const fill = active?.fill as fabric.Gradient<'linear'>;
             if (active && fill && fill.type === 'linear') {
                 setupControls(active);
             } else {
                 cleanupControls();
             }
        };

        const onMoving = (e: any) => {
             const target = e.target;
             if (!activeObj || !p1Control || !p2Control) return;

             if (target === activeObj) {
                 updateControls();
             } else if (target === p1Control || target === p2Control) {
                 // Reverse: Update gradient from control pos
                 const p = { x: target.left, y: target.top };
                 
                 // Canvas to Local
                 const center = activeObj.getCenterPoint();
                 const angle = fabric.util.degreesToRadians(activeObj.angle || 0);
                 const w = activeObj.getScaledWidth();
                 const h = activeObj.getScaledHeight();

                 const dx = p.x - center.x;
                 const dy = p.y - center.y;
                 
                 const lx = dx * Math.cos(-angle) - dy * Math.sin(-angle);
                 const ly = dx * Math.sin(-angle) + dy * Math.cos(-angle);
                 
                 // Normalize to 0..1
                 const fx = (lx / w) + 0.5;
                 const fy = (ly / h) + 0.5;

                 const fill = activeObj.fill as fabric.Gradient<'linear'>;
                 if (target === p1Control) {
                     fill.coords.x1 = fx;
                     fill.coords.y1 = fy;
                 } else {
                     fill.coords.x2 = fx;
                     fill.coords.y2 = fy;
                 }
                 
                 // Update visual line
                 updateControls();
                 activeObj.set('dirty', true);
                 canvas.requestRenderAll();
             }
        };

        canvas.on('selection:created', onSelection);
        canvas.on('selection:updated', onSelection);
        canvas.on('selection:cleared', cleanupControls);
        canvas.on('object:moving', onMoving);
        
        // Initial check
        onSelection();

        return () => {
            cleanupControls();
            canvas.off('selection:created', onSelection);
            canvas.off('selection:updated', onSelection);
            canvas.off('selection:cleared', cleanupControls);
            canvas.off('object:moving', onMoving);
        };
    }, [canvas, activeTool]);

    return null;
}
