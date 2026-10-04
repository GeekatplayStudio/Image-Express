import crypto from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getVaultDir, joinRuntimePath } from '@/lib/server/appPaths';
import { renameWithRetry } from '@/lib/server/atomicRename';

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
 *
 * The cache itself follows ComfyUIAssetManager's `thumb_service`: fanned-out
 * folders, write-then-rename, one render per rendition however many requests
 * arrive at once, and a size ceiling.
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

const thumbnailDir = () => joinRuntimePath(getVaultDir(), 'thumbs');

/**
 * Where a rendition lives on disk: `thumbs/ab/cd/<digest>.webp`.
 *
 * The cache used to be one flat folder, which at whole-drive scale means
 * hundreds of thousands of files in a single directory — slow to open on every
 * filesystem. Two levels of fan-out keep each folder to a handful of files.
 */
const fannedPath = (key: string) => joinRuntimePath(thumbnailDir(), key.slice(0, 2), key.slice(2, 4), key);

/** Renditions written before the fan-out are still served, from where they are. */
const legacyPath = (key: string) => joinRuntimePath(thumbnailDir(), key);

/** Exported so a precache pass can test for a rendition. */
export function thumbnailCachePath(absolutePath: string, width: number, stats: { size: number; mtimeMs: number }): string {
    return fannedPath(thumbnailCacheKey(absolutePath, normalizeThumbnailWidth(width), stats));
}

/** A validator for one rendition: it changes whenever the file or the width does. */
export function thumbnailEtag(absolutePath: string, width: number | undefined, stats: { size: number; mtimeMs: number }): string {
    return `"${thumbnailCacheKey(absolutePath, normalizeThumbnailWidth(width), stats).replace('.webp', '')}"`;
}

async function readCached(key: string): Promise<Buffer | null> {
    for (const candidate of [fannedPath(key), legacyPath(key)]) {
        try {
            const body = await readFile(/*turbopackIgnore: true*/ candidate);
            // An empty file is a write that never finished, not a thumbnail.
            if (body.byteLength > 0) return body;
        } catch {
            // Try the next location.
        }
    }
    return null;
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
        const key = thumbnailCacheKey(absolutePath, normalizeThumbnailWidth(width), stats);
        for (const candidate of [fannedPath(key), legacyPath(key)]) {
            try {
                if ((await stat(/*turbopackIgnore: true*/ candidate)).size > 0) return true;
            } catch {
                // Try the next location.
            }
        }
        return false;
    } catch {
        return false;
    }
}

export type Thumbnail = { body: Buffer; contentType: string; cached: boolean };

/** Renders in progress, so a burst of requests for one tile decodes the image once. */
const inFlight = new Map<string, Promise<Buffer | null>>();

async function render(sharp: SharpModule, absolutePath: string, width: number, key: string): Promise<Buffer | null> {
    let body: Buffer;
    try {
        body = await sharp(absolutePath)
            // Honour the EXIF orientation; without this, phone photos come out
            // rotated in the grid while looking upright everywhere else.
            .rotate()
            .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 72 })
            .toBuffer();
    } catch {
        // Not a still image sharp can read (a PSD, a RAW file, a corrupt JPEG).
        return null;
    }

    try {
        const target = fannedPath(key);
        await mkdir(path.dirname(target), { recursive: true });
        // Written beside the target and renamed into place: a crash mid-write
        // used to leave a truncated file that was then served as the cached
        // thumbnail from then on.
        const partial = `${target}.${process.pid}.part`;
        await writeFile(partial, body);
        await renameWithRetry(partial, target);
    } catch {
        // A cache write failure must not fail the request; the next view
        // simply regenerates.
    }
    return body;
}

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

    const key = thumbnailCacheKey(absolutePath, width, stats);
    const cached = await readCached(key);
    if (cached) return { body: cached, contentType: 'image/webp', cached: true };

    let pending = inFlight.get(key);
    if (!pending) {
        pending = render(sharp, absolutePath, width, key).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
    }
    const body = await pending;
    return body ? { body, contentType: 'image/webp', cached: false } : null;
}

/** Ceiling for the thumbnail cache. Override with `IMAGE_EXPRESS_VAULT_THUMB_CACHE_MB`. */
export const DEFAULT_THUMBNAIL_CACHE_BYTES = (() => {
    const configured = Number.parseInt(process.env.IMAGE_EXPRESS_VAULT_THUMB_CACHE_MB ?? '', 10);
    return (Number.isFinite(configured) && configured > 0 ? configured : 4096) * 1024 * 1024;
})();

/**
 * Keep the cache under a size ceiling by deleting the renditions written
 * longest ago.
 *
 * Nothing ever removed a thumbnail: the key includes the file's modified time,
 * so every edit left the previous rendition behind, and a deleted file's
 * renditions stayed for good. Unfinished `.part` files are swept as well.
 */
export async function pruneThumbnailCache(
    maxBytes = DEFAULT_THUMBNAIL_CACHE_BYTES,
): Promise<{ files: number; bytes: number; removed: number }> {
    const entries: Array<{ file: string; size: number; mtimeMs: number }> = [];
    let removed = 0;

    async function walk(dir: string) {
        let children;
        try {
            children = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const child of children) {
            const full = path.join(dir, child.name);
            if (child.isDirectory()) {
                await walk(full);
            } else if (child.name.endsWith('.part')) {
                await rm(full, { force: true }).then(() => { removed += 1; }, () => {});
            } else if (child.name.endsWith('.webp')) {
                try {
                    const info = await stat(full);
                    entries.push({ file: full, size: info.size, mtimeMs: info.mtimeMs });
                } catch {
                    // Gone between listing and stat.
                }
            }
        }
    }
    await walk(thumbnailDir());

    let bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    let files = entries.length;
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const entry of entries) {
        if (bytes <= maxBytes) break;
        try {
            await rm(entry.file, { force: true });
            bytes -= entry.size;
            files -= 1;
            removed += 1;
        } catch {
            // Leave it for the next pass.
        }
    }
    return { files, bytes, removed };
}
