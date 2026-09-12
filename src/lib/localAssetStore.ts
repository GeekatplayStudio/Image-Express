'use client';

import type { AssetCategory, AssetType } from '@/types';

const DB_NAME = 'image-express-local-assets';
const STORE_NAME = 'assets';
/**
 * Blob bytes live in their own store, keyed by asset id.
 *
 * They used to sit inline on the metadata record, which made every listing pay
 * for them: `getAll()` deserialises whole records, and the vault called the
 * lister sixteen times per open (four types x two categories x two scopes).
 * Splitting them means browsing reads metadata only, and bytes are fetched for
 * the one asset that actually needs them.
 */
const BLOB_STORE_NAME = 'blobs';
const DB_VERSION = 2;

export interface LocalAssetSearchMetadata {
    /** Short AI- or user-provided summary of the asset's content. */
    description?: string;
    /** Search keywords (AI-generated, extracted, or user-added). */
    tags?: string[];
    /** Generation prompt embedded in the file (e.g. PNG text chunks from AI tools). */
    prompt?: string;
    /** Pixel dimensions for images/videos, when known. */
    width?: number;
    height?: number;
    /** When the indexing pass last ran; absent means never indexed. */
    indexedAt?: string;
    /** True once an AI captioning pass has run (kept separate from basic indexing). */
    aiIndexed?: boolean;
}

export interface LocalAssetRecord extends LocalAssetSearchMetadata {
    id: string;
    name: string;
    type: AssetType;
    category: AssetCategory;
    owner: string;
    isPublic: boolean;
    mimeType: string;
    createdAt: string;
    updatedAt: string;
    /** Byte size, denormalised so listings never have to touch the blob store. */
    sizeBytes?: number;
    /**
     * Only present on records written before the blob split, and on records a
     * caller explicitly hydrated. Use `getLocalAssetBlob` to read bytes.
     */
    data?: Blob;
}

interface LocalAssetListParams {
    type: AssetType;
    category: AssetCategory;
    owner: string;
    scope: 'personal' | 'shared';
    includePublic: boolean;
    visibility: 'all' | 'public' | 'private';
    search: string;
}

function ensureBrowser() {
    if (typeof window === 'undefined' || !window.indexedDB) {
        throw new Error('IndexedDB is not available in this environment.');
    }
}

function openLocalAssetDb(): Promise<IDBDatabase> {
    ensureBrowser();
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            const transaction = request.transaction;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('type', 'type', { unique: false });
                store.createIndex('category', 'category', { unique: false });
                store.createIndex('owner', 'owner', { unique: false });
            }

            if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
                db.createObjectStore(BLOB_STORE_NAME);
            }

            // v1 -> v2: move inline blobs out of the metadata records. Blobs are
            // stored by reference, so this re-points handles rather than copying
            // bytes. Records that fail to move keep their inline copy and stay
            // readable through the fallback in `getLocalAssetBlob`.
            if (transaction && db.objectStoreNames.contains(STORE_NAME)) {
                const assets = transaction.objectStore(STORE_NAME);
                const blobs = transaction.objectStore(BLOB_STORE_NAME);
                const cursorRequest = assets.openCursor();
                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (!cursor) return;
                    const record = cursor.value as LocalAssetRecord;
                    if (record && record.data) {
                        try {
                            blobs.put(record.data, record.id);
                            const { data, ...metadata } = record;
                            cursor.update({ ...metadata, sizeBytes: data.size });
                        } catch {
                            // Leave this record inline; the read path handles it.
                        }
                    }
                    cursor.continue();
                };
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed opening local asset database.'));
    });
}

async function withStores<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    handler: (stores: IDBObjectStore[]) => Promise<T>,
): Promise<T> {
    const db = await openLocalAssetDb();
    return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        const stores = storeNames.map((name) => transaction.objectStore(name));

        handler(stores)
            .then((value) => {
                transaction.oncomplete = () => {
                    db.close();
                    resolve(value);
                };
                transaction.onerror = () => {
                    db.close();
                    reject(transaction.error || new Error('Local asset transaction failed.'));
                };
                transaction.onabort = () => {
                    db.close();
                    reject(transaction.error || new Error('Local asset transaction aborted.'));
                };
            })
            .catch((error) => {
                db.close();
                reject(error);
            });
    });
}

function withStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    return withStores([STORE_NAME], mode, ([store]) => handler(store));
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });
}

function normalizeOwner(owner?: string) {
    const trimmed = owner?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : 'Guest';
}

function generateId() {
    const random = Math.round(Math.random() * 1e9).toString(36);
    return `local_${Date.now().toString(36)}_${random}`;
}

export async function saveLocalAsset(params: {
    file: Blob;
    filename: string;
    type: AssetType;
    category: AssetCategory;
    owner?: string;
    isPublic?: boolean;
    mimeType?: string;
}) {
    const now = new Date().toISOString();
    const record: LocalAssetRecord = {
        id: generateId(),
        name: params.filename,
        type: params.type,
        category: params.category,
        owner: normalizeOwner(params.owner),
        isPublic: Boolean(params.isPublic),
        mimeType: params.mimeType || params.file.type || 'application/octet-stream',
        createdAt: now,
        updatedAt: now,
        sizeBytes: params.file.size,
    };

    await withStores([STORE_NAME, BLOB_STORE_NAME], 'readwrite', async ([assets, blobs]) => {
        await requestToPromise(assets.put(record));
        await requestToPromise(blobs.put(params.file, record.id));
        return undefined;
    });
    invalidateMetadataCache();
    // Callers that index straight away already hold the file; hand it back
    // rather than making them read it out of the store again.
    return { ...record, data: params.file };
}

/**
 * Metadata for every stored asset, cached until something writes.
 *
 * The vault asks for records sixteen times per open and again on each search
 * keystroke; without this each of those was a separate full scan of the store.
 */
let metadataCache: Promise<LocalAssetRecord[]> | null = null;

function invalidateMetadataCache() {
    metadataCache = null;
}

/** Drops the cached scan. Exposed for tests and for after an external import. */
export function invalidateLocalAssetCache() {
    invalidateMetadataCache();
}

function readAllMetadata(): Promise<LocalAssetRecord[]> {
    metadataCache ??= withStore('readonly', async (store) => {
        return requestToPromise(store.getAll() as IDBRequest<LocalAssetRecord[]>);
    }).catch((error) => {
        metadataCache = null;
        throw error;
    });
    return metadataCache;
}

/**
 * Every record visible to `owner`, newest first, in a single scan.
 *
 * The vault used to assemble this by calling `listLocalAssets` once per
 * type/category/scope combination — sixteen full store scans for one open.
 */
export async function listLocalAssetsForOwner(owner: string): Promise<LocalAssetRecord[]> {
    const normalized = normalizeOwner(owner);
    const all = await readAllMetadata();
    return all
        .filter((asset) => asset.owner === normalized || asset.isPublic)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function listLocalAssets(params: LocalAssetListParams): Promise<LocalAssetRecord[]> {
    const all = await readAllMetadata();

    const query = params.search.trim().toLowerCase();
    return all
        .filter((asset) => asset.type === params.type && asset.category === params.category)
        .filter((asset) => {
            if (params.scope === 'shared') {
                return asset.owner !== params.owner && asset.isPublic;
            }
            if (asset.owner === params.owner) return true;
            return params.includePublic && asset.isPublic;
        })
        .filter((asset) => {
            if (params.visibility === 'public') return asset.isPublic;
            if (params.visibility === 'private') return !asset.isPublic;
            return true;
        })
        .filter((asset) => {
            if (!query) return true;
            const haystack = [
                asset.name,
                asset.owner,
                asset.description || '',
                asset.prompt || '',
                ...(asset.tags || []),
            ].join(' ').toLowerCase();
            // Every whitespace-separated term must match somewhere in the metadata.
            return query.split(/\s+/).every((term) => haystack.includes(term));
        })
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function renameLocalAsset(assetId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Asset name is required.');
    await withStore('readwrite', async (store) => {
        const existing = await requestToPromise(store.get(assetId) as IDBRequest<LocalAssetRecord | undefined>);
        if (!existing) throw new Error('Asset not found.');
        existing.name = trimmed;
        existing.updatedAt = new Date().toISOString();
        await requestToPromise(store.put(existing));
        return undefined;
    });
    invalidateMetadataCache();
}

export async function deleteLocalAsset(assetId: string) {
    await withStores([STORE_NAME, BLOB_STORE_NAME], 'readwrite', async ([assets, blobs]) => {
        await requestToPromise(assets.delete(assetId));
        await requestToPromise(blobs.delete(assetId));
        return undefined;
    });
    invalidateMetadataCache();
}

export async function setLocalAssetVisibility(assetId: string, isPublic: boolean) {
    await withStore('readwrite', async (store) => {
        const existing = await requestToPromise(store.get(assetId) as IDBRequest<LocalAssetRecord | undefined>);
        if (!existing) throw new Error('Asset not found.');
        existing.isPublic = isPublic;
        existing.updatedAt = new Date().toISOString();
        await requestToPromise(store.put(existing));
        return undefined;
    });
}

/**
 * Merges search metadata into an existing record. Does not bump updatedAt —
 * indexing is a background concern and must not reshuffle "recently updated"
 * sort order in the library.
 */
export async function updateLocalAssetMetadata(assetId: string, metadata: LocalAssetSearchMetadata) {
    await withStore('readwrite', async (store) => {
        const existing = await requestToPromise(store.get(assetId) as IDBRequest<LocalAssetRecord | undefined>);
        if (!existing) throw new Error('Asset not found.');
        await requestToPromise(store.put({ ...existing, ...metadata }));
        return undefined;
    });
    invalidateMetadataCache();
}

/** Returns all records that have never been through the indexing pass. */
export async function listUnindexedLocalAssets(options?: { requireAi?: boolean }): Promise<LocalAssetRecord[]> {
    const all = await readAllMetadata();
    return all.filter((asset) => !asset.indexedAt || (options?.requireAi && !asset.aiIndexed));
}

export async function getLocalAssetBlob(assetId: string): Promise<Blob> {
    return withStores([STORE_NAME, BLOB_STORE_NAME], 'readonly', async ([assets, blobs]) => {
        const blob = await requestToPromise(blobs.get(assetId) as IDBRequest<Blob | undefined>);
        if (blob) return blob;

        // Written before the blob split, or left behind by a partial migration.
        const existing = await requestToPromise(assets.get(assetId) as IDBRequest<LocalAssetRecord | undefined>);
        if (!existing) throw new Error('Asset not found.');
        if (!existing.data) throw new Error('Asset has no stored data.');
        return existing.data;
    });
}

