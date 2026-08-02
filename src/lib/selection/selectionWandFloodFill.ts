import { colorDistance } from '@/components/Editor/selectionWand';
import type { DocumentSelectionMask } from '@/lib/selection/documentSelectionMask';

export type Rgb = { r: number; g: number; b: number };

function sampleRgb(data: Uint8ClampedArray, width: number, x: number, y: number): Rgb | null {
    const i = ((y * width) + x) * 4;
    if (data[i + 3] < 8) return null;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

export function parseHexRgb(hex: string): Rgb | null {
    const normalized = hex.trim();
    const short = normalized.match(/^#([0-9a-f]{3})$/i);
    if (short) {
        const d = short[1];
        return {
            r: Number.parseInt(`${d[0]}${d[0]}`, 16),
            g: Number.parseInt(`${d[1]}${d[1]}`, 16),
            b: Number.parseInt(`${d[2]}${d[2]}`, 16),
        };
    }
    const full = normalized.match(/^#([0-9a-f]{6})$/i);
    if (!full) return null;
    const d = full[1];
    return {
        r: Number.parseInt(d.slice(0, 2), 16),
        g: Number.parseInt(d.slice(2, 4), 16),
        b: Number.parseInt(d.slice(4, 6), 16),
    };
}

export function rgbToHex({ r, g, b }: Rgb): string {
    const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function sampleRgbAtScenePoint(
    source: ImageData,
    mask: DocumentSelectionMask,
    seedSceneX: number,
    seedSceneY: number,
): Rgb | null {
    if (source.width !== mask.width || source.height !== mask.height) return null;
    const sx = Math.floor(seedSceneX - mask.left);
    const sy = Math.floor(seedSceneY - mask.top);
    if (sx < 0 || sy < 0 || sx >= mask.width || sy >= mask.height) return null;
    return sampleRgb(source.data, source.width, sx, sy);
}

/**
 * Contiguous flood-fill from artboard-local seed into the document mask.
 * `source` must be RGBA ImageData aligned to the same artboard as `mask`.
 */
export function unionFloodFillIntoMask(
    mask: DocumentSelectionMask,
    source: ImageData,
    seedSceneX: number,
    seedSceneY: number,
    threshold: number,
) {
    if (source.width !== mask.width || source.height !== mask.height) return;

    const sx = Math.floor(seedSceneX - mask.left);
    const sy = Math.floor(seedSceneY - mask.top);
    if (sx < 0 || sy < 0 || sx >= mask.width || sy >= mask.height) return;

    const seed = sampleRgb(source.data, source.width, sx, sy);
    if (!seed) return;

    const tol = Math.max(0, Math.min(180, Math.round(threshold)));
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

        const rgb = sampleRgb(source.data, width, x, y);
        if (!rgb || colorDistance(seed, rgb) > tol) continue;

        mask.data[idx] = 255;

        if (x > 0) {
            stackX.push(x - 1);
            stackY.push(y);
        }
        if (x + 1 < width) {
            stackX.push(x + 1);
            stackY.push(y);
        }
        if (y > 0) {
            stackX.push(x);
            stackY.push(y - 1);
        }
        if (y + 1 < height) {
            stackX.push(x);
            stackY.push(y + 1);
        }
    }
}

/**
 * Non-contiguous: select every opaque pixel within threshold of `seed` (Color Range style).
 */
export function unionColorMatchIntoMask(
    mask: DocumentSelectionMask,
    source: ImageData,
    seed: Rgb,
    threshold: number,
) {
    if (source.width !== mask.width || source.height !== mask.height) return;

    const tol = Math.max(0, Math.min(180, Math.round(threshold)));
    const { width, height } = mask;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const rgb = sampleRgb(source.data, width, x, y);
            if (!rgb || colorDistance(seed, rgb) > tol) continue;
            mask.data[(y * width) + x] = 255;
        }
    }
}
