// Always-visible on-canvas indicator for shared (linked) layers: a small
// link badge drawn at each shared object's top-left corner after every
// render, so users can tell at a glance which layers are linked across the
// project/federation.
import * as fabric from 'fabric';
import type { ExtendedFabricObject } from '@/types';

const BADGE_RADIUS = 9;
const BADGE_BG = 'rgba(30, 41, 59, 0.9)';
const BADGE_STROKE = '#7FAAB0';

function drawLinkGlyph(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, BADGE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = BADGE_BG;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = BADGE_STROKE;
    ctx.stroke();

    // Two interlocking chain links.
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = BADGE_STROKE;
    ctx.beginPath();
    ctx.ellipse(-2.4, 0, 3.4, 2.2, -Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(2.4, 0, 3.4, 2.2, -Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

/** Draw link badges over every shared layer after each render. Returns cleanup. */
export function installSharedLayerBadges(canvas: fabric.Canvas): () => void {
    const handleAfterRender = (event: { ctx?: CanvasRenderingContext2D }) => {
        const ctx = event.ctx ?? canvas.getContext();
        if (!ctx) return;
        const vpt = canvas.viewportTransform;
        if (!vpt) return;
        for (const obj of canvas.getObjects()) {
            const ext = obj as ExtendedFabricObject;
            if (!ext.sharedLayerId || obj.visible === false) continue;
            // Object's top-left corner in scene space -> screen space.
            const corner = obj.getCoords()[0];
            const screen = fabric.util.transformPoint(corner, vpt);
            drawLinkGlyph(ctx, screen.x + 2, screen.y + 2);
        }
    };
    canvas.on('after:render', handleAfterRender);
    return () => {
        canvas.off('after:render', handleAfterRender);
    };
}
