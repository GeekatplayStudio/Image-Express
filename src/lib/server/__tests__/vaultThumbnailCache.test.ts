/**
 * @jest-environment node
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    getVaultThumbnail,
    hasCachedThumbnail,
    isThumbnailerAvailable,
    pruneThumbnailCache,
    thumbnailCacheKey,
    thumbnailCachePath,
    thumbnailEtag,
} from '@/lib/server/vaultThumbnails';

const ORIGINAL_DATA_DIR = process.env.IMAGE_EXPRESS_DATA_DIR;
let dataDir: string;
let source: string;

// Without a codec there is nothing to cache; the unit suite covers that path.
const withCodec = isThumbnailerAvailable() ? describe : describe.skip;

const thumbsDir = () => path.join(dataDir, 'vault', 'thumbs');

const listFiles = async (dir: string): Promise<string[]> => {
    const out: string[] = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await listFiles(full));
        else out.push(full);
    }
    return out;
};

beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iex-thumbs-'));
    process.env.IMAGE_EXPRESS_DATA_DIR = dataDir;
    source = path.join(dataDir, 'photo.png');
    if (isThumbnailerAvailable()) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sharp = require('sharp');
        await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 30, b: 30 } } })
            .png().toFile(source);
    }
});

afterEach(async () => {
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.IMAGE_EXPRESS_DATA_DIR;
    else process.env.IMAGE_EXPRESS_DATA_DIR = ORIGINAL_DATA_DIR;
    await fs.rm(dataDir, { recursive: true, force: true });
});

withCodec('thumbnail cache', () => {
    it('stores a rendition two folders deep and serves it from there next time', async () => {
        const first = await getVaultThumbnail(source, 256);
        expect(first?.cached).toBe(false);

        const stats = await fs.stat(source);
        const key = thumbnailCacheKey(source, 256, stats);
        const expected = path.join(thumbsDir(), key.slice(0, 2), key.slice(2, 4), key);
        expect(path.normalize(thumbnailCachePath(source, 256, stats))).toBe(expected);
        expect((await fs.stat(expected)).size).toBe(first!.body.byteLength);
        expect(await hasCachedThumbnail(source, 256)).toBe(true);

        const second = await getVaultThumbnail(source, 256);
        expect(second?.cached).toBe(true);
        expect(second!.body.equals(first!.body)).toBe(true);
    });

    it('leaves no partial file behind', async () => {
        await getVaultThumbnail(source, 256);
        const files = await listFiles(thumbsDir());
        expect(files).toHaveLength(1);
        expect(files[0].endsWith('.webp')).toBe(true);
    });

    it('renders once for a burst of requests for the same tile', async () => {
        const results = await Promise.all(Array.from({ length: 6 }, () => getVaultThumbnail(source, 256)));
        expect(results.every((result) => result !== null)).toBe(true);
        // Every caller got the same bytes from the one render.
        expect(new Set(results.map((result) => result!.body)).size).toBe(1);
    });

    it('still serves a rendition written before the fan-out', async () => {
        const stats = await fs.stat(source);
        const key = thumbnailCacheKey(source, 256, stats);
        await fs.mkdir(thumbsDir(), { recursive: true });
        await fs.writeFile(path.join(thumbsDir(), key), Buffer.from('legacy-bytes'));

        const thumbnail = await getVaultThumbnail(source, 256);
        expect(thumbnail?.cached).toBe(true);
        expect(thumbnail!.body.toString()).toBe('legacy-bytes');
    });

    it('treats an empty cache file as missing and regenerates it', async () => {
        const stats = await fs.stat(source);
        const target = thumbnailCachePath(source, 256, stats);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, Buffer.alloc(0));

        expect(await hasCachedThumbnail(source, 256)).toBe(false);
        const thumbnail = await getVaultThumbnail(source, 256);
        expect(thumbnail?.cached).toBe(false);
        expect(thumbnail!.body.byteLength).toBeGreaterThan(0);
    });
});

describe('thumbnailEtag', () => {
    it('changes when the file changes and when the width does', () => {
        const stats = { size: 100, mtimeMs: 1000 };
        const base = thumbnailEtag('d:/a.png', 256, stats);
        expect(base).toMatch(/^"[0-9a-f]{40}"$/);
        expect(thumbnailEtag('d:/a.png', 256, stats)).toBe(base);
        expect(thumbnailEtag('d:/a.png', 256, { size: 100, mtimeMs: 2000 })).not.toBe(base);
        expect(thumbnailEtag('d:/a.png', 512, stats)).not.toBe(base);
        // Widths snap, so two requests for the same rendition validate alike.
        expect(thumbnailEtag('d:/a.png', 250, stats)).toBe(base);
    });
});

describe('pruneThumbnailCache', () => {
    const put = async (relative: string, bytes: number, ageMinutes: number) => {
        const full = path.join(thumbsDir(), relative);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, Buffer.alloc(bytes));
        const when = new Date(Date.now() - ageMinutes * 60_000);
        await fs.utimes(full, when, when);
        return full;
    };

    it('removes the oldest renditions until the cache fits, and sweeps partial files', async () => {
        const oldest = await put('aa/bb/old.webp', 400, 300);
        const middle = await put('legacy.webp', 400, 200);
        const newest = await put('cc/dd/new.webp', 400, 100);
        const partial = await put('cc/dd/new.webp.123.part', 50, 5);

        const result = await pruneThumbnailCache(900);

        expect(result).toEqual({ files: 2, bytes: 800, removed: 2 });
        await expect(fs.stat(oldest)).rejects.toThrow();
        await expect(fs.stat(partial)).rejects.toThrow();
        await expect(fs.stat(middle)).resolves.toBeTruthy();
        await expect(fs.stat(newest)).resolves.toBeTruthy();
    });

    it('does nothing to a cache that already fits, or one that does not exist', async () => {
        expect(await pruneThumbnailCache(1000)).toEqual({ files: 0, bytes: 0, removed: 0 });
        await put('aa/bb/a.webp', 100, 10);
        expect(await pruneThumbnailCache(1000)).toEqual({ files: 1, bytes: 100, removed: 0 });
    });
});
