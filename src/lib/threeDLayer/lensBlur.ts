// Depth-driven lens blur (depth-of-field) for 3D layers. Approach (after
// NKD-VFX-Tools, reimplemented): per-pixel circle-of-confusion from distance
// to the focal depth band, a kernel bank of pre-blurred levels, and a
// per-pixel lerp between the two bracketing levels. The CoC map itself is
// smoothed to avoid rings at the focal band edges.

export type LensBlurParams = {
    focusX: number;
    focusY: number;
    focalOffset: number;
    strength: number;
    fieldOfDepth: number;
};

const LEVEL_RADII = [0, 2, 4, 8, 14, 22];

/** Depth (disparity grey) at a UV point of the depth canvas. */
export function sampleDepth(depth: HTMLCanvasElement, u: number, v: number): number {
    const x = Math.min(depth.width - 1, Math.max(0, Math.round(u * depth.width)));
    const y = Math.min(depth.height - 1, Math.max(0, Math.round(v * depth.height)));
    return depth.getContext('2d')!.getImageData(x, y, 1, 1).data[0] / 255;
}

const smoothstep = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / Math.max(e1 - e0, 1e-6)));
    return t * t * (3 - 2 * t);
};

export function applyLensBlur(
    image: HTMLCanvasElement,
    depth: HTMLCanvasElement,
    params: LensBlurParams,
): HTMLCanvasElement {
    const w = image.width;
    const h = image.height;
    const maxBlur = Math.max(params.strength, 0) * (LEVEL_RADII[LEVEL_RADII.length - 1]);
    if (maxBlur < 0.5) return image;

    const focal = Math.min(1, Math.max(0,
        sampleDepth(depth, params.focusX, params.focusY) + params.focalOffset));
    const halfBand = Math.max(params.fieldOfDepth, 0.02) * 0.5;

    // CoC map at depth resolution, smoothed to kill focal-band ringing.
    const dctx = depth.getContext('2d')!;
    const dd = dctx.getImageData(0, 0, depth.width, depth.height).data;
    const cocCanvas = document.createElement('canvas');
    cocCanvas.width = depth.width;
    cocCanvas.height = depth.height;
    const cctx = cocCanvas.getContext('2d')!;
    const cimg = cctx.createImageData(depth.width, depth.height);
    for (let i = 0; i < depth.width * depth.height; i++) {
        const d = dd[i * 4] / 255;
        const dist = Math.max(Math.abs(d - focal) - halfBand, 0);
        const coc = smoothstep(0, 0.5, dist) * params.strength;
        const v = Math.round(coc * 255);
        cimg.data[i * 4] = v;
        cimg.data[i * 4 + 1] = v;
        cimg.data[i * 4 + 2] = v;
        cimg.data[i * 4 + 3] = 255;
    }
    cctx.putImageData(cimg, 0, 0);
    const smoothed = document.createElement('canvas');
    smoothed.width = w;
    smoothed.height = h;
    const sctx = smoothed.getContext('2d')!;
    sctx.filter = 'blur(2px)';
    sctx.drawImage(cocCanvas, 0, 0, w, h);
    sctx.filter = 'none';
    const coc = sctx.getImageData(0, 0, w, h).data;

    // Kernel bank: the image pre-blurred at each level radius.
    const levels = LEVEL_RADII.map((r) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d')!;
        if (r > 0) ctx.filter = `blur(${r * Math.max(params.strength, 0.05)}px)`;
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
    });

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d')!;
    const oimg = octx.createImageData(w, h);
    const od = oimg.data;
    const nLevels = LEVEL_RADII.length;
    for (let i = 0; i < w * h; i++) {
        // Map CoC [0,1] onto the level axis and lerp the bracketing levels.
        const level = (coc[i * 4] / 255) * (nLevels - 1);
        const lo = Math.min(Math.floor(level), nLevels - 1);
        const hi = Math.min(lo + 1, nLevels - 1);
        const tt = level - lo;
        const a = levels[lo];
        const b = levels[hi];
        const j = i * 4;
        od[j] = a[j] + (b[j] - a[j]) * tt;
        od[j + 1] = a[j + 1] + (b[j + 1] - a[j + 1]) * tt;
        od[j + 2] = a[j + 2] + (b[j + 2] - a[j + 2]) * tt;
        od[j + 3] = a[j + 3]; // alpha never blurred across
    }
    octx.putImageData(oimg, 0, 0);
    return out;
}
