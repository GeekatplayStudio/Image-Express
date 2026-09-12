import {
    deleteLocalAsset,
    getLocalAssetBlob,
    invalidateLocalAssetCache,
    listLocalAssets,
    listLocalAssetsForOwner,
    renameLocalAsset,
    saveLocalAsset,
    setLocalAssetVisibility,
} from '@/lib/localAssetStore';

type AnyRequest<T> = IDBRequest<T> & {
    onsuccess: ((event: Event) => void) | null;
    onerror: ((event: Event) => void) | null;
    result: T;
    error: Error | null;
};

/**
 * A minimal IndexedDB stand-in.
 *
 * It models what the store actually relies on: several *named* object stores in
 * one transaction, and out-of-line keys (`put(value, key)`) for the blob store.
 * An earlier version kept a single shared record map and ignored the key
 * argument, so every store aliased to the same data - which quietly made the
 * metadata/blob split untestable.
 */
class FakeObjectStore {
    constructor(
        private readonly records: Map<string, unknown>,
        private readonly keyPath: string | null,
        private readonly requestFactory: <T>(executor: () => T) => IDBRequest<T>
    ) { }

    createIndex() {
        return undefined;
    }

    private resolveKey(value: unknown, explicitKey?: string) {
        if (this.keyPath) return (value as Record<string, string>)[this.keyPath];
        if (explicitKey === undefined) throw new Error('A key is required for an out-of-line store.');
        return explicitKey;
    }

    put(value: unknown, key?: string) {
        return this.requestFactory(() => {
            this.records.set(this.resolveKey(value, key), value);
            return value;
        });
    }

    getAll() {
        return this.requestFactory(() => Array.from(this.records.values()));
    }

    get(id: string) {
        return this.requestFactory(() => this.records.get(id));
    }

    delete(id: string) {
        return this.requestFactory(() => {
            this.records.delete(id);
            return undefined;
        });
    }

    openCursor() {
        // No pre-split records exist in these tests, so the migration sweep has
        // nothing to walk.
        return this.requestFactory(() => null);
    }
}

class FakeTransaction {
    oncomplete: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onabort: ((event: Event) => void) | null = null;
    error: Error | null = null;
    private pendingRequests = 0;

    constructor(private readonly stores: Map<string, FakeStoreState>) { }

    private scheduleComplete() {
        if (this.pendingRequests !== 0 || this.error) return;
        setTimeout(() => {
            if (this.pendingRequests === 0 && !this.error) {
                this.oncomplete?.(new Event('complete'));
            }
        }, 0);
    }

    createRequest<T>(executor: () => T): IDBRequest<T> {
        this.pendingRequests += 1;

        const request: Partial<AnyRequest<T>> = {
            onsuccess: null,
            onerror: null,
            error: null,
        };

        setTimeout(() => {
            try {
                request.result = executor();
                request.onsuccess?.(new Event('success'));
            } catch (error) {
                request.error = error as DOMException;
                this.error = request.error || null;
                request.onerror?.(new Event('error'));
                this.onerror?.(new Event('error'));
            } finally {
                this.pendingRequests -= 1;
                this.scheduleComplete();
            }
        }, 0);

        return request as AnyRequest<T>;
    }

    objectStore(name: string) {
        const state = this.stores.get(name);
        if (!state) throw new Error(`No such object store: ${name}`);
        return new FakeObjectStore(
            state.records,
            state.keyPath,
            (executor) => this.createRequest(executor),
        ) as unknown as IDBObjectStore;
    }
}

type FakeStoreState = { records: Map<string, unknown>; keyPath: string | null };

class FakeDatabase {
    readonly stores = new Map<string, FakeStoreState>();

    objectStoreNames = {
        contains: (name: string) => this.stores.has(name),
    };

    createObjectStore(name: string, options?: { keyPath?: string }) {
        this.stores.set(name, { records: new Map(), keyPath: options?.keyPath ?? null });
        return {
            createIndex: () => undefined,
        } as unknown as IDBObjectStore;
    }

    transaction() {
        return new FakeTransaction(this.stores) as unknown as IDBTransaction;
    }

    close() {
        return undefined;
    }
}

class FakeIndexedDb {
    private readonly db = new FakeDatabase();

    open() {
        const request: Partial<IDBOpenDBRequest> & {
            result: IDBDatabase;
            transaction: IDBTransaction | null;
            onupgradeneeded: ((event: Event) => void) | null;
            onsuccess: ((event: Event) => void) | null;
            onerror: ((event: Event) => void) | null;
            error: Error | null;
        } = {
            result: this.db as unknown as IDBDatabase,
            transaction: null,
            onupgradeneeded: null,
            onsuccess: null,
            onerror: null,
            error: null,
        };

        setTimeout(() => {
            try {
                if (!this.db.objectStoreNames.contains('assets') || !this.db.objectStoreNames.contains('blobs')) {
                    request.transaction = this.db.transaction();
                    request.onupgradeneeded?.(new Event('upgradeneeded'));
                    request.transaction = null;
                }
                request.onsuccess?.(new Event('success'));
            } catch (error) {
                request.error = error as DOMException;
                request.onerror?.(new Event('error'));
            }
        }, 0);

        return request as IDBOpenDBRequest;
    }
}

const listParams = {
    type: 'images' as const,
    category: 'uploads' as const,
    owner: 'alice@example.com',
    scope: 'personal' as const,
    includePublic: false,
    visibility: 'all' as const,
    search: '',
};

describe('localAssetStore', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'indexedDB', {
            value: new FakeIndexedDb(),
            configurable: true,
            writable: true,
        });
        // The metadata cache is module-level; a fresh database needs a fresh cache.
        invalidateLocalAssetCache();
    });

    it('saves, lists, filters, renames, toggles visibility, downloads, and deletes local assets', async () => {
        const first = await saveLocalAsset({
            file: new Blob(['first'], { type: 'image/png' }),
            filename: 'alpha.png',
            type: 'images',
            category: 'uploads',
            owner: 'alice@example.com',
            isPublic: false,
        });
        const second = await saveLocalAsset({
            file: new Blob(['second'], { type: 'image/png' }),
            filename: 'beta.png',
            type: 'images',
            category: 'uploads',
            owner: 'bob@example.com',
            isPublic: true,
        });
        const guest = await saveLocalAsset({
            file: new Blob(['guest'], { type: 'image/png' }),
            filename: 'guest.png',
            type: 'images',
            category: 'uploads',
            owner: '   ',
            isPublic: false,
        });

        expect(guest.owner).toBe('Guest');

        const personal = await listLocalAssets(listParams);
        expect(personal.map((item) => item.id)).toContain(first.id);
        expect(personal.map((item) => item.id)).not.toContain(second.id);

        const personalWithPublic = await listLocalAssets({
            ...listParams,
            includePublic: true,
        });
        expect(personalWithPublic.map((item) => item.id)).toEqual(
            expect.arrayContaining([first.id, second.id])
        );

        const shared = await listLocalAssets({
            ...listParams,
            scope: 'shared',
            includePublic: true,
        });
        expect(shared).toHaveLength(1);
        expect(shared[0]?.id).toBe(second.id);

        const publicOnly = await listLocalAssets({
            ...listParams,
            includePublic: true,
            visibility: 'public',
        });
        expect(publicOnly.every((item) => item.isPublic)).toBe(true);

        await renameLocalAsset(first.id, '  alpha-renamed.png  ');
        await setLocalAssetVisibility(first.id, true);
        const filtered = await listLocalAssets({
            ...listParams,
            includePublic: true,
            search: 'renamed',
        });
        expect(filtered.some((item) => item.name === 'alpha-renamed.png')).toBe(true);

        const blob = await getLocalAssetBlob(first.id);
        expect(blob).toBe(first.data);
        expect(blob.type).toBe('image/png');

        await deleteLocalAsset(first.id);
        await expect(getLocalAssetBlob(first.id)).rejects.toThrow('Asset not found.');
    });

    it('throws for missing assets and invalid names', async () => {
        const saved = await saveLocalAsset({
            file: new Blob(['first'], { type: 'image/png' }),
            filename: 'alpha.png',
            type: 'images',
            category: 'uploads',
            owner: 'alice@example.com',
            isPublic: false,
        });

        await expect(renameLocalAsset(saved.id, '   ')).rejects.toThrow('Asset name is required.');
        await expect(renameLocalAsset('missing-id', 'new.png')).rejects.toThrow('Asset not found.');
        await expect(setLocalAssetVisibility('missing-id', true)).rejects.toThrow('Asset not found.');
        await expect(getLocalAssetBlob('missing-id')).rejects.toThrow('Asset not found.');
    });

    it('keeps listings free of blob bytes so browsing never deserialises them', async () => {
        const saved = await saveLocalAsset({
            file: new Blob(['payload-bytes']),
            filename: 'alpha.png',
            type: 'images',
            category: 'uploads',
            owner: 'alice@example.com',
            isPublic: false,
        });

        const listed = await listLocalAssets({ ...listParams, owner: 'alice@example.com' });
        const record = listed.find((item) => item.id === saved.id);

        expect(record).toBeDefined();
        // The whole point of the split: a listing carries metadata, not payloads.
        expect(record?.data).toBeUndefined();
        expect(record?.sizeBytes).toBe(13);

        // The bytes are still retrievable on demand.
        const blob = await getLocalAssetBlob(saved.id);
        expect(blob.size).toBe(13);
    });

    it('returns every visible record for an owner in one pass', async () => {
        await saveLocalAsset({
            file: new Blob(['a']),
            filename: 'mine.png',
            type: 'images',
            category: 'uploads',
            owner: 'alice@example.com',
            isPublic: false,
        });
        await saveLocalAsset({
            file: new Blob(['b']),
            filename: 'theirs-public.mp4',
            type: 'videos',
            category: 'generated',
            owner: 'bob@example.com',
            isPublic: true,
        });
        await saveLocalAsset({
            file: new Blob(['c']),
            filename: 'theirs-private.png',
            type: 'images',
            category: 'uploads',
            owner: 'bob@example.com',
            isPublic: false,
        });

        const visible = await listLocalAssetsForOwner('alice@example.com');
        const names = visible.map((item) => item.name).sort();

        // Across every type and category at once - own assets plus public ones.
        expect(names).toEqual(['mine.png', 'theirs-public.mp4']);
    });

    it('serves repeat listings from cache and refreshes them after a write', async () => {
        const saved = await saveLocalAsset({
            file: new Blob(['a']),
            filename: 'alpha.png',
            type: 'images',
            category: 'uploads',
            owner: 'alice@example.com',
            isPublic: false,
        });

        const first = await listLocalAssetsForOwner('alice@example.com');
        const second = await listLocalAssetsForOwner('alice@example.com');
        expect(second).toHaveLength(first.length);

        await renameLocalAsset(saved.id, 'renamed.png');
        const afterWrite = await listLocalAssetsForOwner('alice@example.com');
        expect(afterWrite.map((item) => item.name)).toContain('renamed.png');

        invalidateLocalAssetCache();
        const afterInvalidate = await listLocalAssetsForOwner('alice@example.com');
        expect(afterInvalidate.map((item) => item.name)).toContain('renamed.png');
    });

    it('throws when IndexedDB is unavailable', async () => {
        Object.defineProperty(window, 'indexedDB', {
            value: undefined,
            configurable: true,
            writable: true,
        });

        await expect(
            saveLocalAsset({
                file: new Blob(['first']),
                filename: 'alpha.png',
                type: 'images',
                category: 'uploads',
                owner: 'alice@example.com',
                isPublic: false,
            })
        ).rejects.toThrow('IndexedDB is not available in this environment.');
    });
});
