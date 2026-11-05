'use client';

/**
 * Tile artwork for the Asset Library, cached twice over.
 *
 * - In memory, as object URLs keyed by asset. A URL is created once per page
 *   session and never revoked while the page lives, so switching tabs, closing
 *   and reopening the library, or filtering never shows a tile going blank
 *   and never re-reads a blob out of IndexedDB. (The old code revoked every
 *   URL at the *start* of a refresh, so tiles broke until the new list came.)
 * - On disk, as downscaled WebP thumbnails in their own IndexedDB database.
 *   Decoding a 20 MB photo to draw a 160 px tile is what made large local
 *   libraries slow to open; the thumbnail is a few KB and decodes instantly
 *   on the next visit.
 *
 * Videos, audio and vector/animated images are not downscaled: the tile needs
 * the real bytes to play or animate, so those get a plain object URL.
 */

const DB_NAME = 'image-express-asset-thumbnails';
const STORE_NAME = 'thumbs';
const DB_VERSION = 1;
/** Soft cap on stored thumbnails; the oldest are pruned past this. */
export const THUMBNAIL_CACHE_MAX_ENTRIES = 4000;
/** Longest edge of a stored thumbnail, in CSS pixels at 2x. */
export const THUMBNAIL_EDGE = 320;

type ThumbRecord = { key: string; blob: Blob; createdAt: number };

const memoryUrls = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let putsSincePrune = 0;

function openDb(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
    dbPromise ??= new Promise((resolve) => {
        try {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' }).createIndex('createdAt', 'createdAt');
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function readStored(key: string): Promise<Blob | null> {
    const db = await openDb();
    if (!db) return null;
    try {
        const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
        const record = await requestToPromise(store.get(key) as IDBRequest<ThumbRecord | undefined>);
        return record?.blob ?? null;
    } catch {
        return null;
    }
}

async function writeStored(key: string, blob: Blob) {
    const db = await openDb();
    if (!db) return;
    try {
        const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
        await requestToPromise(store.put({ key, blob, createdAt: Date.now() } satisfies ThumbRecord));
        putsSincePrune += 1;
        if (putsSincePrune >= 50) {
            putsSincePrune = 0;
            void pruneStored(db);
        }
    } catch {
        // Quota or a closed database: the in-memory URL still serves this session.
    }
}

async function pruneStored(db: IDBDatabase) {
    try {
        const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
        const count = await requestToPromise(store.count());
        const excess = count - THUMBNAIL_CACHE_MAX_ENTRIES;
        if (excess <= 0) return;
        const oldest = await requestToPromise(store.index('createdAt').getAllKeys(undefined, excess));
        for (const key of oldest) store.delete(key);
    } catch {
        // Best effort.
    }
}

/** Formats that must keep their original bytes to render correctly. */
const KEEP_ORIGINAL_TYPES = new Set(['image/svg+xml', 'image/gif', 'image/apng']);

/**
 * Downscale an image blob to a WebP thumbnail. Returns the input untouched
 * when the browser cannot decode it (the tile then shows the original, which
 * is what it did before) or when downscaling would lose something (vectors,
 * animations).
 */
export async function downscaleImage(blob: Blob, edge = THUMBNAIL_EDGE): Promise<Blob> {
    if (!blob.type.startsWith('image/') || KEEP_ORIGINAL_TYPES.has(blob.type)) return blob;
    if (typeof createImageBitmap !== 'function') return blob;
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(blob);
    } catch {
        return blob;
    }
    try {
        const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
        if (scale >= 1 && blob.size < 256 * 1024) return blob;
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const encoded = await encodeBitmap(bitmap, width, height);
        return encoded ?? blob;
    } finally {
        bitmap.close();
    }
}

async function encodeBitmap(bitmap: ImageBitmap, width: number, height: number): Promise<Blob | null> {
    if (typeof OffscreenCanvas === 'function') {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.drawImage(bitmap, 0, 0, width, height);
        return canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
    }
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
}

/**
 * Make (or reuse) a session URL for bytes that are already in hand, such as a
 * legacy record with an inline blob. Synchronous; nothing is stored on disk.
 */
export function cachePreviewUrl(key: string, blob: Blob): string {
    const existing = memoryUrls.get(key);
    if (existing) return existing;
    const url = URL.createObjectURL(blob);
    memoryUrls.set(key, url);
    return url;
}

/** The URL already made for `key` this session, if any. Synchronous. */
export function getCachedPreviewUrl(key: string): string | null {
    return memoryUrls.get(key) ?? null;
}

/**
 * Resolve a preview URL for `key`, loading bytes with `loadBlob` only when
 * neither cache has it. Concurrent calls for one key share a single load.
 */
export function resolvePreviewUrl(
    key: string,
    loadBlob: () => Promise<Blob>,
    options: { thumbnail?: boolean } = {},
): Promise<string> {
    const cached = memoryUrls.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = inFlight.get(key);
    if (pending) return pending;

    const run = (async () => {
        let blob: Blob | null = options.thumbnail ? await readStored(key) : null;
        if (!blob) {
            const source = await loadBlob();
            if (options.thumbnail) {
                blob = await downscaleImage(source);
                if (blob !== source) void writeStored(key, blob);
            } else {
                blob = source;
            }
        }
        const url = URL.createObjectURL(blob);
        memoryUrls.set(key, url);
        return url;
    })();
    inFlight.set(key, run);
    run.catch(() => undefined).finally(() => inFlight.delete(key));
    return run;
}

/** Drop every cache entry for `key`, e.g. after the asset is deleted or replaced. */
export async function forgetPreview(key: string) {
    const url = memoryUrls.get(key);
    if (url) {
        memoryUrls.delete(key);
        URL.revokeObjectURL(url);
    }
    const db = await openDb();
    if (!db) return;
    try {
        db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key);
    } catch {
        // Best effort.
    }
}

/** Test hook: clears the memory tier and forgets the open database handle. */
export function resetPreviewCacheForTests() {
    memoryUrls.forEach((url) => URL.revokeObjectURL(url));
    memoryUrls.clear();
    inFlight.clear();
    dbPromise = null;
    putsSincePrune = 0;
}
