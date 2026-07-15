// Text background rendering patch + free-distort (warp) support for the
// design canvas. Extracted from DesignCanvas.tsx to keep files small.
import * as fabric from 'fabric';
import { ensureObjectId } from '@/lib/fabric-utils';
import { ExtendedFabricObject } from '@/types';

export type WarpCorner = 'TL' | 'TR' | 'BR' | 'BL';
export type WarpPoint = { x: number; y: number };

// Patch IText and Textbox to support dynamic background shapes (Photoshop / Adobe Express Style)
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function patchTextRender(Class: any) {
    if (!Class || !Class.prototype || Class.prototype._renderBgPatched) return;
    Class.prototype._renderBgPatched = true;
    const originalRender = Class.prototype._render;
    Class.prototype._render = function(ctx: CanvasRenderingContext2D) {
        const self = this as unknown as ExtendedFabricObject;
        if (self.textBgEnabled) {
            const w = this.width || 0;
            const h = this.height || 0;
            const pad = Number(self.textBgPadding ?? 10);
            const corners = Number(self.textBgCorners ?? 0);
            const color = self.textBgColor || '#ff0000';
            const style = self.textBgStyle || 'rect';

            ctx.save();
            ctx.fillStyle = color;

            const x = -w / 2 - pad;
            const y = -h / 2 - pad;
            const width = w + pad * 2;
            const height = h + pad * 2;

            ctx.beginPath();
            if (style === 'pill') {
                const rx = height / 2;
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(x, y, width, height, rx);
                } else {
                    ctx.rect(x, y, width, height);
                }
            } else if (style === 'speech') {
                const rx = corners;
                const tailHeight = 12;
                const rectHeight = height - tailHeight;
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(x, y, width, rectHeight, rx);
                } else {
                    ctx.rect(x, y, width, rectHeight);
                }
                const tailWidth = 14;
                ctx.moveTo(0 - tailWidth / 2, y + rectHeight);
                ctx.lineTo(0 + tailWidth / 2, y + rectHeight);
                ctx.lineTo(0, y + height);
                ctx.closePath();
            } else {
                const rx = corners;
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(x, y, width, height, rx);
                } else {
                    ctx.rect(x, y, width, height);
                }
            }
            ctx.fill();
            ctx.restore();
        }
        originalRender.call(this, ctx);
    };
}

export class WarpedImage extends fabric.Image {
    isWarpedText = true;
    warpTL?: WarpPoint;
    warpTR?: WarpPoint;
    warpBR?: WarpPoint;
    warpBL?: WarpPoint;

    override _render(ctx: CanvasRenderingContext2D) {
        const img = this.getElement() as HTMLImageElement;
        if (!img) return;

        const w = this.width || 0;
        const h = this.height || 0;
        if (!w || !h) return;

        const base = {
            tl: { x: -w / 2, y: -h / 2 },
            tr: { x: w / 2, y: -h / 2 },
            br: { x: w / 2, y: h / 2 },
            bl: { x: -w / 2, y: h / 2 }
        };

        const tl = this.warpTL ?? base.tl;
        const tr = this.warpTR ?? base.tr;
        const br = this.warpBR ?? base.br;
        const bl = this.warpBL ?? base.bl;

        const map = (u: number, v: number) => ({
            x: tl.x * (1 - u) * (1 - v) + tr.x * u * (1 - v) + bl.x * (1 - u) * v + br.x * u * v,
            y: tl.y * (1 - u) * (1 - v) + tr.y * u * (1 - v) + bl.y * (1 - u) * v + br.y * u * v
        });

        const getTransform = (src: WarpPoint, src1: WarpPoint, src2: WarpPoint, dst: WarpPoint, dst1: WarpPoint, dst2: WarpPoint) => {
            const x0 = src.x, y0 = src.y;
            const x1 = src1.x, y1 = src1.y;
            const x2 = src2.x, y2 = src2.y;
            const X0 = dst.x, Y0 = dst.y;
            const X1 = dst1.x, Y1 = dst1.y;
            const X2 = dst2.x, Y2 = dst2.y;

            const denom = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
            if (Math.abs(denom) < 1e-6) return null;

            const a = (X0 * (y1 - y2) + X1 * (y2 - y0) + X2 * (y0 - y1)) / denom;
            const c = (X0 * (x2 - x1) + X1 * (x0 - x2) + X2 * (x1 - x0)) / denom;
            const e = (X0 * (x1 * y2 - x2 * y1) + X1 * (x2 * y0 - x0 * y2) + X2 * (x0 * y1 - x1 * y0)) / denom;

            const b = (Y0 * (y1 - y2) + Y1 * (y2 - y0) + Y2 * (y0 - y1)) / denom;
            const d = (Y0 * (x2 - x1) + Y1 * (x0 - x2) + Y2 * (x1 - x0)) / denom;
            const f = (Y0 * (x1 * y2 - x2 * y1) + Y1 * (x2 * y0 - x0 * y2) + Y2 * (x0 * y1 - x1 * y0)) / denom;

            return { a, b, c, d, e, f };
        };

        const cols = 6;
        const rows = 6;
        for (let yi = 0; yi < rows; yi += 1) {
            for (let xi = 0; xi < cols; xi += 1) {
                const u0 = xi / cols;
                const u1 = (xi + 1) / cols;
                const v0 = yi / rows;
                const v1 = (yi + 1) / rows;

                const dst00 = map(u0, v0);
                const dst10 = map(u1, v0);
                const dst01 = map(u0, v1);
                const dst11 = map(u1, v1);

                const src00 = { x: u0 * w, y: v0 * h };
                const src10 = { x: u1 * w, y: v0 * h };
                const src01 = { x: u0 * w, y: v1 * h };
                const src11 = { x: u1 * w, y: v1 * h };

                const t1 = getTransform(src00, src10, src01, dst00, dst10, dst01);
                if (t1) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(dst00.x, dst00.y);
                    ctx.lineTo(dst10.x, dst10.y);
                    ctx.lineTo(dst01.x, dst01.y);
                    ctx.closePath();
                    ctx.clip();
                    ctx.transform(t1.a, t1.b, t1.c, t1.d, t1.e, t1.f);
                    ctx.drawImage(img, 0, 0, w, h);
                    ctx.restore();
                }

                const t2 = getTransform(src11, src01, src10, dst11, dst01, dst10);
                if (t2) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(dst11.x, dst11.y);
                    ctx.lineTo(dst01.x, dst01.y);
                    ctx.lineTo(dst10.x, dst10.y);
                    ctx.closePath();
                    ctx.clip();
                    ctx.transform(t2.a, t2.b, t2.c, t2.d, t2.e, t2.f);
                    ctx.drawImage(img, 0, 0, w, h);
                    ctx.restore();
                }
            }
        }
    }
}

export function ensureWarpedImageNamed(warped: WarpedImage, sourceText?: string) {
    ensureObjectId(warped);
    const extendedWarped = warped as unknown as ExtendedFabricObject;
    if (!extendedWarped.name) extendedWarped.name = `Warped ${sourceText?.substring(0, 10) || 'Text'}`;
}
