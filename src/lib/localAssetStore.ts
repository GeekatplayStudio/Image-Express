'use client';

import type { AssetCategory, AssetType } from '@/types';

const DB_NAME = 'image-express-local-assets';
const STORE_NAME = 'assets';
const DB_VERSION = 1;

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
    data: Blob;
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
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('type', 'type', { unique: false });
                store.createIndex('category', 'category', { unique: false });
                store.createIndex('owner', 'owner', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed opening local asset database.'));
    });
}

async function withStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await openLocalAssetDb();
    return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);

        handler(store)
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
        data: params.file
    };

    await withStore('readwrite', async (store) => {
        await requestToPromise(store.put(record));
        return undefined;
    });
    return record;
}

export async function listLocalAssets(params: LocalAssetListParams): Promise<LocalAssetRecord[]> {
    const all = await withStore('readonly', async (store) => {
        return requestToPromise(store.getAll() as IDBRequest<LocalAssetRecord[]>);
    });

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
}

export async function deleteLocalAsset(assetId: string) {
    await withStore('readwrite', async (store) => {
        await requestToPromise(store.delete(assetId));
        return undefined;
    });
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
}

/** Returns all records that have never been through the indexing pass. */
export async function listUnindexedLocalAssets(options?: { requireAi?: boolean }): Promise<LocalAssetRecord[]> {
    const all = await withStore('readonly', async (store) => {
        return requestToPromise(store.getAll() as IDBRequest<LocalAssetRecord[]>);
    });
    return all.filter((asset) => !asset.indexedAt || (options?.requireAi && !asset.aiIndexed));
}

export async function getLocalAssetBlob(assetId: string) {
    return withStore('readonly', async (store) => {
        const existing = await requestToPromise(store.get(assetId) as IDBRequest<LocalAssetRecord | undefined>);
        if (!existing) throw new Error('Asset not found.');
        return existing.data;
    });
}

