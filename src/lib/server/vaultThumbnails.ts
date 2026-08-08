import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

import { getVaultDir } from '@/lib/server/appPaths';

/**
 * Small, cached thumbnails for the vault grid.
 *
 * The grid used the original file as its own thumbnail. Measured against a real
 * indexed drive, each tile was **1.3–2.0 MB**, so one page of 96 pulled roughly
 * **170 MB** across the wire and decoded all of it in the browser — for images
 * displayed at about 200 pixels square. That is the whole of "accessing assets
 * is painfully slow".
 *
 * Resizing needs an image codec, which Node does not have. `sharp` is used
 * because Next already bundles and ships it for its own image optimisation, so
 * this adds no native module that was not in the package already. It is still
 * loaded optionally: if it ever goes missing the caller falls back to serving
 * the original, which is slow but never broken.
 */

type SharpModule = {
    (input: string): {
        rotate: () => {
            resize: (options: Record<string, unknown>) => {
                webp: (options: Record<string, unknown>) => { toBuffer: () => Promise<Buffer> };
            };
        };
    };
};

let sharpModule: SharpModule | null | undefined;

function loadSharp(): SharpModule | null {
    if (sharpModule !== undefined) return sharpModule;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        sharpModule = require('sharp') as SharpModule;
    } catch {
        sharpModule = null;
    }
    return sharpModule;
}

export function isThumbnailerAvailable(): boolean {
    return loadSharp() !== null;
}

/** Widths the grid actually asks for. Anything else is clamped onto one. */
const ALLOWED_WIDTHS = [128, 256, 384, 512] as const;

export function normalizeThumbnailWidth(requested: number | undefined): number {
    // A negative width is nonsense rather than "very small": snapping it would
    // silently serve the 128px rendition for `?w=-50`.
    if (!requested || !Number.isFinite(requested) || requested <= 0) return 256;
    // Snap to a fixed set so the cache cannot be filled with a thousand
    // near-identical sizes by a caller passing arbitrary widths.
    return ALLOWED_WIDTHS.reduce((best, width) => (
        Math.abs(width - requested) < Math.abs(best - requested) ? width : best
    ), ALLOWED_WIDTHS[0]);
}

/**
 * Cache key for one rendition.
 *
 * Includes size and mtime so editing a file in place produces a new key —
 * otherwise the grid would keep showing the previous version of an image
 * indefinitely, with no way for the user to force a refresh.
 */
export function thumbnailCacheKey(
    absolutePath: string,
    width: number,
    stats: { size: number; mtimeMs: number },
): string {
    const digest = crypto.createHash('sha1')
        .update(`${absolutePath}|${stats.size}|${Math.round(stats.mtimeMs)}|${width}`)
        .digest('hex');
    return `${digest}.webp`;
}

const thumbnailDir = () => path.join(getVaultDir(), 'thumbs');

/** Where a rendition lives on disk. Exported so a precache pass can test for it. */
export function thumbnailCachePath(absolutePath: string, width: number, stats: { size: number; mtimeMs: number }): string {
    return path.join(thumbnailDir(), thumbnailCacheKey(absolutePath, normalizeThumbnailWidth(width), stats));
}

/**
 * True when this rendition is already on disk.
 *
 * Used by the precache job to skip work it has already done. A `stat` per asset
 * is far cheaper than decoding an image, so this stays worthwhile even across
 * hundreds of thousands of files.
 */
export async function hasCachedThumbnail(absolutePath: string, width: number): Promise<boolean> {
    try {
        const stats = await stat(absolutePath);
        await stat(thumbnailCachePath(absolutePath, width, stats));
        return true;
    } catch {
        return false;
    }
}

export type Thumbnail = { body: Buffer; contentType: string; cached: boolean };

/**
 * A resized WebP for the grid, generated once and reused.
 *
 * Returns null when no codec is available or the source cannot be read, so the
 * caller can fall back to the original rather than showing a broken tile.
 */
export async function getVaultThumbnail(
    absolutePath: string,
    requestedWidth: number | undefined,
): Promise<Thumbnail | null> {
    const sharp = loadSharp();
    if (!sharp) return null;

    const width = normalizeThumbnailWidth(requestedWidth);

    let stats: { size: number; mtimeMs: number };
    try {
        stats = await stat(absolutePath);
    } catch {
        return null;
    }

    const cachePath = path.join(thumbnailDir(), thumbnailCacheKey(absolutePath, width, stats));
    try {
        const cached = await readFile(cachePath);
        return { body: cached, contentType: 'image/webp', cached: true };
    } catch {
        // Not generated yet — fall through and build it.
    }

    try {
        const body = await sharp(absolutePath)
            // Honour the EXIF orientation; without this, phone photos come out
            // rotated in the grid while looking upright everywhere else.
            .rotate()
            .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 72 })
            .toBuffer();

        try {
            await mkdir(thumbnailDir(), { recursive: true });
            await writeFile(cachePath, body);
        } catch {
            // A cache write failure must not fail the request; the next view
            // simply regenerates.
        }

        return { body, contentType: 'image/webp', cached: false };
    } catch {
        // Not a still image sharp can read (a PSD, a RAW file, a corrupt JPEG).
        return null;
    }
}
