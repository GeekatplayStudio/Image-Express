import type { RectBounds } from '@/components/Editor/selectionGeometry';

/** Artboard-aligned content selection mask (alpha 0–255 per pixel). */
export type DocumentSelectionMask = {
    left: number;
    top: number;
    width: number;
    height: number;
    /** Length = width * height */
    data: Uint8ClampedArray;
};

export function createDocumentSelectionMask(bounds: RectBounds): DocumentSelectionMask {
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    return {
        left: bounds.left,
        top: bounds.top,
        width,
        height,
        data: new Uint8ClampedArray(width * height),
    };
}

export function clearDocumentSelectionMask(mask: DocumentSelectionMask) {
    mask.data.fill(0);
}

export function isDocumentSelectionEmpty(mask: DocumentSelectionMask): boolean {
    for (let i = 0; i < mask.data.length; i += 1) {
        if (mask.data[i] > 0) return false;
    }
    return true;
}

export function sceneToMaskIndex(
    mask: DocumentSelectionMask,
    sceneX: number,
    sceneY: number,
): number | null {
    const x = Math.floor(sceneX - mask.left);
    const y = Math.floor(sceneY - mask.top);
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return null;
    return (y * mask.width) + x;
}

export function clampRectToMask(mask: DocumentSelectionMask, rect: RectBounds): RectBounds | null {
    const left = Math.max(mask.left, rect.left);
    const top = Math.max(mask.top, rect.top);
    const right = Math.min(mask.left + mask.width, rect.left + rect.width);
    const bottom = Math.min(mask.top + mask.height, rect.top + rect.height);
    if (right <= left || bottom <= top) return null;
    return {
        left,
        top,
        width: right - left,
        height: bottom - top,
    };
}

/** Soften mask edges with a separable box blur (feather radius in px). */
export function featherDocumentSelectionMask(mask: DocumentSelectionMask, radius: number) {
    const r = Math.max(0, Math.min(64, Math.round(radius)));
    if (r <= 0) return;

    const { width, height, data } = mask;
    const tmp = new Float32Array(width * height);
    const out = new Uint8ClampedArray(width * height);
    const kernel = (r * 2) + 1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let sum = 0;
            let count = 0;
            for (let kx = -r; kx <= r; kx += 1) {
                const sx = x + kx;
                if (sx < 0 || sx >= width) continue;
                sum += data[(y * width) + sx];
                count += 1;
            }
            tmp[(y * width) + x] = count > 0 ? sum / count : 0;
        }
    }

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let sum = 0;
            let count = 0;
            for (let ky = -r; ky <= r; ky += 1) {
                const sy = y + ky;
                if (sy < 0 || sy >= height) continue;
                sum += tmp[(sy * width) + x];
                count += 1;
            }
            out[(y * width) + x] = count > 0 ? Math.round(sum / count) : 0;
        }
    }

    // Silence unused — kernel size documented for readers.
    void kernel;
    mask.data.set(out);
}

export function getDocumentSelectionTightBounds(mask: DocumentSelectionMask): RectBounds | null {
    let minX = mask.width;
    let minY = mask.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < mask.height; y += 1) {
        const row = y * mask.width;
        for (let x = 0; x < mask.width; x += 1) {
            if (mask.data[row + x] <= 0) continue;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    if (maxX < 0 || maxY < 0) return null;
    return {
        left: mask.left + minX,
        top: mask.top + minY,
        width: (maxX - minX) + 1,
        height: (maxY - minY) + 1,
    };
}

/**
 * White-on-black luminance PNG for applyRasterMaskToObject
 * (white = selected / reveal).
 */
export function documentSelectionToLuminanceDataUrl(mask: DocumentSelectionMask): string | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const image = ctx.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i += 1) {
        const a = mask.data[i];
        const p = i * 4;
        image.data[p] = a;
        image.data[p + 1] = a;
        image.data[p + 2] = a;
        image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
}

/** Blue tint overlay ImageData for ants helper (selected = translucent blue). */
export function documentSelectionToTintImageData(mask: DocumentSelectionMask): ImageData | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const image = ctx.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i += 1) {
        const a = mask.data[i];
        const p = i * 4;
        if (a <= 0) continue;
        image.data[p] = 37;
        image.data[p + 1] = 99;
        image.data[p + 2] = 235;
        image.data[p + 3] = Math.round((a / 255) * 90);
    }
    return image;
}

/** Morphological expand/contract by radius in px (binary threshold at 128). */
export function morphDocumentSelectionMask(
    mask: DocumentSelectionMask,
    direction: 'expand' | 'contract',
    radius: number,
) {
    const r = Math.max(1, Math.min(120, Math.round(radius)));
    const { width, height, data } = mask;
    const src = new Uint8ClampedArray(data);
    const next = new Uint8ClampedArray(data.length);
    const r2 = r * r;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const idx = (y * width) + x;
            let hit = false;
            for (let dy = -r; dy <= r && !hit; dy += 1) {
                for (let dx = -r; dx <= r; dx += 1) {
                    if ((dx * dx) + (dy * dy) > r2) continue;
                    const sx = x + dx;
                    const sy = y + dy;
                    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
                    const on = src[(sy * width) + sx] >= 128;
                    if (direction === 'expand' && on) {
                        hit = true;
                        break;
                    }
                    if (direction === 'contract' && !on) {
                        hit = true;
                        break;
                    }
                }
            }
            if (direction === 'expand') {
                next[idx] = hit || src[idx] >= 128 ? 255 : 0;
            } else {
                next[idx] = (!hit && src[idx] >= 128) ? 255 : 0;
            }
        }
    }
    mask.data.set(next);
}
