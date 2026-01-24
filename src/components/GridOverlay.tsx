import { useEffect } from 'react';
import * as fabric from 'fabric';

export type GridType = 'none' | 'rule-of-thirds' | 'golden-ratio' | 'cross' | 'grid-4x4';

type ArtboardInfo = {
  width: number;
  height: number;
  left: number;
  top: number;
};

type CanvasWithArtboard = fabric.Canvas & { artboard?: ArtboardInfo };

interface GridOverlayProps {
  canvas: fabric.Canvas | null;
  gridType: GridType;
  color?: string;
}

export const GridOverlay = ({ canvas, gridType, color = 'rgba(0, 163, 255, 0.4)' }: GridOverlayProps) => {
  useEffect(() => {
    if (!canvas) return;

    // Drawing function
    const drawGrid = (opt: { ctx: CanvasRenderingContext2D }) => {
       if (gridType === 'none') return;

       const ctx = opt.ctx;

       const artboard = (canvas as CanvasWithArtboard).artboard;
       
       if (!artboard) {
          // Fallback if artboard property is missing, though DesignCanvas sets it.
          // We can try to find the Object that is likely the artboard, or just use defaults.
          return;
       }

       const width = artboard.width;
       const height = artboard.height;
       const left = artboard.left || 0;
       const top = artboard.top || 0;
       
       const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];

       ctx.save();
       // Apply Viewport Transform to draw in World Coordinates
       ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);

       ctx.beginPath();
       ctx.strokeStyle = color;
       ctx.lineWidth = 2 / vpt[0]; // Constant screen width lines (optional: make them zoom dependent? Usually constant screen width is better, but here inversely proportional ensures they don't get super thick/thin? Actually constant screen width "2" is usually "2". If I transform, "1" is 1 unit in world. "1/scale" is 1 pixel in screen.)
       // Let's use a dynamic linewidth so it stays visible but fine.
       // Actually, standard is: lineWidth = 1 / zoom.
       ctx.lineWidth = 1 / Math.max(vpt[0], 0.01);
       // Make them a bit dashed for style? no, solid is fine for guidelines. 
       // Maybe light dash?
       // ctx.setLineDash([5 / vpt[0], 5 / vpt[0]]); 

       if (gridType === 'rule-of-thirds') {
            const w3 = width / 3;
            const h3 = height / 3;

            // Verticals
            ctx.moveTo(left + w3, top);
            ctx.lineTo(left + w3, top + height);
            ctx.moveTo(left + w3 * 2, top);
            ctx.lineTo(left + w3 * 2, top + height);

            // Horizontals
            ctx.moveTo(left, top + h3);
            ctx.lineTo(left + width, top + h3);
            ctx.moveTo(left, top + h3 * 2);
            ctx.lineTo(left + width, top + h3 * 2);

       } else if (gridType === 'golden-ratio') {
            const phi = 0.618;
            const wPhi = width * phi;
            const hPhi = height * phi;
            const wInv = width * (1 - phi); // 0.382
            const hInv = height * (1 - phi);

            // Verticals
            ctx.moveTo(left + wInv, top);
            ctx.lineTo(left + wInv, top + height);
            ctx.moveTo(left + wPhi, top);
            ctx.lineTo(left + wPhi, top + height);

            // Horizontals
            ctx.moveTo(left, top + hInv);
            ctx.lineTo(left + width, top + hInv);
            ctx.moveTo(left, top + hPhi);
            ctx.lineTo(left + width, top + hPhi);
            
       } else if (gridType === 'cross') {
            const cx = left + width / 2;
            const cy = top + height / 2;

            ctx.moveTo(cx, top);
            ctx.lineTo(cx, top + height);
            
            ctx.moveTo(left, cy);
            ctx.lineTo(left + width, cy);

       } else if (gridType === 'grid-4x4') {
           const w4 = width / 4;
           const h4 = height / 4;

           for (let i = 1; i < 4; i++) {
               ctx.moveTo(left + w4 * i, top);
               ctx.lineTo(left + w4 * i, top + height);
               
               ctx.moveTo(left, top + h4 * i);
               ctx.lineTo(left + width, top + h4 * i);
           }
       }

       ctx.stroke();
       ctx.restore();
    };

    canvas.on('after:render', drawGrid);
    canvas.requestRenderAll();

    return () => {
        canvas.off('after:render', drawGrid);
        canvas.requestRenderAll();
    };
  }, [canvas, gridType, color]);

  return null;
}
