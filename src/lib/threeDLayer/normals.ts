// Normal-map derivation from a grayscale depth/disparity canvas via Sobel
// gradients. Output is a standard OpenGL-style tangent-space normal map:
// RGB = (N * 0.5 + 0.5), Y up (green increases upward).

export function normalsFromDepth(depth: HTMLCanvasElement, strength = 2.5): HTMLCanvasElement {
    const w = depth.width;
    const h = depth.height;
    const src = depth.getContext('2d')!.getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = src[i * 4] / 255;

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const at = (x: number, y: number) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Sobel gradients; depth is disparity (near = bright), so a
            // positive dzdx means the surface rises toward +x.
            const dzdx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
                - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
            const dzdy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
                - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
            let nx = -dzdx * strength;
            // Screen y grows downward; normal-map green grows upward.
            let ny = dzdy * strength;
            let nz = 1;
            const len = Math.hypot(nx, ny, nz);
            nx /= len; ny /= len; nz /= len;
            const i = (y * w + x) * 4;
            img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
            img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return out;
}
