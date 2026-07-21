// IndexedDB backing store for album workspaces.
//
// Albums hold full fabric snapshots with images inlined as data URLs (see
// inlineImageSources.ts). A single 2048px photo is several megabytes, so the
// whole workspace never fit in localStorage's ~5 MB quota — duplicating a
// layer was enough to blow it, and the failed write silently lost new pages.
// IndexedDB has no comparable limit and stores the record as structured data
// rather than one giant string.
//
// Everything here degrades to "not available" rather than throwing, so callers
// can fall back to localStorage (private browsing, ancient browsers, SSR).

const DB_NAME = 'image-express';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
/** Single-record key: the whole workspace is one document. */
export const PROJECTS_RECORD_KEY = 'projects-state';

export const isIndexedDbAvailable = (): boolean => (
    typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
);

const openDb = (): Promise<IDBDatabase | null> => new Promise((resolve) => {
    if (!isIndexedDbAvailable()) {
        resolve(null);
        return;
    }
    let request: IDBOpenDBRequest;
    try {
        request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
        resolve(null);
        return;
    }
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // Another tab holding an older version open would block the upgrade
    // forever; treat that as unavailable rather than hanging the caller.
    request.onblocked = () => resolve(null);
});

export async function idbGet<T>(key: string): Promise<T | null> {
    const db = await openDb();
    if (!db) return null;
    try {
        return await new Promise<T | null>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(key);
            request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    } finally {
        db.close();
    }
}

/** Returns false when the write could not be completed (quota, corruption). */
export async function idbPut(key: string, value: unknown): Promise<boolean> {
    const db = await openDb();
    if (!db) return false;
    try {
        return await new Promise<boolean>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            // Resolve on transaction completion, not request success: the
            // request can succeed and the transaction still abort on quota.
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
            try {
                tx.objectStore(STORE_NAME).put(value, key);
            } catch {
                resolve(false);
            }
        });
    } catch {
        return false;
    } finally {
        db.close();
    }
}

export async function idbDelete(key: string): Promise<void> {
    const db = await openDb();
    if (!db) return;
    try {
        await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
            tx.objectStore(STORE_NAME).delete(key);
        });
    } catch {
        // Nothing to do — a failed delete just leaves a stale record.
    } finally {
        db.close();
    }
}
