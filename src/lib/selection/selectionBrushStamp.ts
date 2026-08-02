import type { DocumentSelectionMask } from '@/lib/selection/documentSelectionMask';
import { colorDistance } from '@/components/Editor/selectionWand';

export type SelectionBrushPaintMode = 'add' | 'subtract';

function sampleRgb(
    data: Uint8ClampedArray,
    width: number,
    x: number,
    y: number,
): { r: number; g: number; b: number } | null {
    const i = ((y * width) + x) * 4;
    if (data[i + 3] < 8) return null;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

/**
 * Soft circular stamp into the document selection mask (expand or contract).
 * hardness 0–100: higher = harder edge.
 */
export function stampSelectionBrushIntoMask(
    mask: DocumentSelectionMask,
    sceneX: number,
    sceneY: number,
    radius: number,
    mode: SelectionBrushPaintMode,
    hardness = 70,
) {
    const r = Math.max(1, Math.round(radius));
    const cx = sceneX - mask.left;
    const cy = sceneY - mask.top;
    const hard = Math.max(0, Math.min(100, hardness)) / 100;
    const inner = r * hard;
    const r2 = r * r;

    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(mask.width - 1, Math.ceil(cx + r));
    const y1 = Math.min(mask.height - 1, Math.ceil(cy + r));

    for (let y = y0; y <= y1; y += 1) {
        const row = y * mask.width;
        for (let x = x0; x <= x1; x += 1) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            const dist2 = (dx * dx) + (dy * dy);
            if (dist2 > r2) continue;

            const dist = Math.sqrt(dist2);
            let alpha = 255;
            if (dist > inner) {
                const t = (dist - inner) / Math.max(0.0001, r - inner);
                alpha = Math.round(255 * (1 - t));
            }
            if (alpha <= 0) continue;

            const idx = row + x;
            if (mode === 'add') {
                mask.data[idx] = Math.max(mask.data[idx], alpha);
            } else {
                mask.data[idx] = Math.min(mask.data[idx], 255 - alpha);
            }
        }
    }
}

/**
 * Quick Select: stamp, then grow into similar colors under the brush (layer pixels).
 * `source` must be artboard-aligned RGBA ImageData matching the mask size.
 */
export function stampQuickSelectIntoMask(
    mask: DocumentSelectionMask,
    source: ImageData | null,
    sceneX: number,
    sceneY: number,
    radius: number,
    mode: SelectionBrushPaintMode,
    colorThreshold: number,
) {
    stampSelectionBrushIntoMask(mask, sceneX, sceneY, radius, mode, 85);
    if (!source || source.width !== mask.width || source.height !== mask.height) return;
    if (mode === 'subtract') return;

    const sx = Math.floor(sceneX - mask.left);
    const sy = Math.floor(sceneY - mask.top);
    if (sx < 0 || sy < 0 || sx >= mask.width || sy >= mask.height) return;

    const seed = sampleRgb(source.data, source.width, sx, sy);
    if (!seed) return;

    const tol = Math.max(0, Math.min(180, Math.round(colorThreshold)));
    const growR = Math.max(radius, Math.round(radius * 1.75));
    const growR2 = growR * growR;
    const { width, height } = mask;
    const visited = new Uint8Array(width * height);
    const stackX: number[] = [sx];
    const stackY: number[] = [sy];

    while (stackX.length > 0) {
        const x = stackX.pop() as number;
        const y = stackY.pop() as number;
        const idx = (y * width) + x;
        if (visited[idx]) continue;
        visited[idx] = 1;

        const dx = x - sx;
        const dy = y - sy;
        if ((dx * dx) + (dy * dy) > growR2) continue;

        const rgb = sampleRgb(source.data, width, x, y);
        if (!rgb || colorDistance(seed, rgb) > tol) continue;

        mask.data[idx] = 255;

        if (x > 0) { stackX.push(x - 1); stackY.push(y); }
        if (x + 1 < width) { stackX.push(x + 1); stackY.push(y); }
        if (y > 0) { stackX.push(x); stackY.push(y - 1); }
        if (y + 1 < height) { stackX.push(x); stackY.push(y + 1); }
    }
}
