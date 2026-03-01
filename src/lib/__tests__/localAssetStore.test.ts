import {
    deleteLocalAsset,
    getLocalAssetBlob,
    listLocalAssets,
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

class FakeObjectStore {
    constructor(
        private readonly records: Map<string, unknown>,
        private readonly requestFactory: <T>(executor: () => T) => IDBRequest<T>
    ) { }

    createIndex() {
        return undefined;
    }

    put(value: unknown) {
        return this.requestFactory(() => {
            const record = value as { id: string };
            this.records.set(record.id, value);
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
}

class FakeTransaction {
    oncomplete: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onabort: ((event: Event) => void) | null = null;
    error: Error | null = null;
    private pendingRequests = 0;

    constructor(private readonly records: Map<string, unknown>) { }

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
                request.error = error as any;
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

    objectStore() {
        return new FakeObjectStore(this.records, (executor) => this.createRequest(executor)) as unknown as IDBObjectStore;
    }
}

class FakeDatabase {
    private hasAssetStore = false;
    private readonly records = new Map<string, unknown>();
    objectStoreNames = {
        contains: (name: string) => this.hasAssetStore && name === 'assets',
    };

    createObjectStore() {
        this.hasAssetStore = true;
        return {
            createIndex: () => undefined,
        } as unknown as IDBObjectStore;
    }

    transaction() {
        return new FakeTransaction(this.records) as unknown as IDBTransaction;
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
            onupgradeneeded: ((event: Event) => void) | null;
            onsuccess: ((event: Event) => void) | null;
            onerror: ((event: Event) => void) | null;
            error: Error | null;
        } = {
            result: this.db as unknown as IDBDatabase,
            onupgradeneeded: null,
            onsuccess: null,
            onerror: null,
            error: null,
        };

        setTimeout(() => {
            try {
                if (!this.db.objectStoreNames.contains('assets')) {
                    request.onupgradeneeded?.(new Event('upgradeneeded'));
                }
                request.onsuccess?.(new Event('success'));
            } catch (error) {
                request.error = error as any;
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
