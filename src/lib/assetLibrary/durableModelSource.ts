import { buildSessionAuthorizationHeader } from '@/lib/authSession';

const STORAGE_KEY = 'image-express-durable-model-sources-v1';
const resolvedSources = new Map<string, string>();
const pendingSources = new Map<string, Promise<string>>();

type MaterializeModelArgs = {
    cacheKey: string;
    blob: Blob;
    filename: string;
    category: 'uploads' | 'generated';
    owner: string;
    isPublic?: boolean;
};

type AssetListResponse = {
    success?: boolean;
    files?: Array<{ name?: string; path?: string }>;
};

function authorizationHeaders(): HeadersInit | undefined {
    const authorization = buildSessionAuthorizationHeader();
    return authorization ? { Authorization: authorization } : undefined;
}

/**
 * A cache entry written by the filename-keyed era: `volatile:<filename>`,
 * where today's keys are `volatile:sha256-…` (or `volatile:<size>:<name>`
 * where hashing is unavailable). Those legacy entries are exactly the
 * poisoned ones — every blob model a session opened resolved to whichever
 * file was first stored under that name, most of them literally
 * "volatile:model.glb" — and because they live in localStorage they keep
 * serving the wrong model long after the code that wrote them is gone.
 * They cannot be trusted and cannot be repaired, only dropped; dropping one
 * merely costs a re-upload on next open.
 */
const isLegacyFilenameKey = (key: string) => (
    key.startsWith('volatile:')
    && !key.startsWith('volatile:sha256-')
    && !/^volatile:\d+:/.test(key)
);

function readStoredSources(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const stored = parsed as Record<string, string>;
        const entries = Object.entries(stored).filter(([key]) => !isLegacyFilenameKey(key));
        if (entries.length !== Object.keys(stored).length) {
            const purged = Object.fromEntries(entries);
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(purged));
            } catch {
                // Filtering on read still protects this session.
            }
            return purged;
        }
        return stored;
    } catch {
        return {};
    }
}

function storeSource(cacheKey: string, url: string) {
    resolvedSources.set(cacheKey, url);
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStoredSources(), [cacheKey]: url }));
    } catch {
        // The in-memory cache still prevents repeated uploads this session.
    }
}

async function storedSource(cacheKey: string): Promise<string | null> {
    const candidate = resolvedSources.get(cacheKey) ?? readStoredSources()[cacheKey];
    if (!candidate) return null;
    try {
        const response = await fetch(candidate, { method: 'HEAD', headers: authorizationHeaders() });
        if (response.ok) {
            resolvedSources.set(cacheKey, candidate);
            return candidate;
        }
    } catch {
        // Missing/stale cache entries are replaced by a fresh materialization.
    }
    return null;
}

export async function materializeDurableModelSource(args: MaterializeModelArgs): Promise<string> {
    const existing = await storedSource(args.cacheKey);
    if (existing) return existing;
    const pending = pendingSources.get(args.cacheKey);
    if (pending) return pending;

    const request = (async () => {
        const form = new FormData();
        form.append('file', new File([args.blob], args.filename, {
            type: args.blob.type || 'application/octet-stream',
        }));
        form.append('category', args.category);
        form.append('owner', args.owner);
        form.append('isPublic', String(Boolean(args.isPublic)));
        const response = await fetch('/api/assets/upload', {
            method: 'POST',
            headers: authorizationHeaders(),
            body: form,
        });
        const result = await response.json() as { success?: boolean; path?: string; message?: string };
        if (!response.ok || !result.success || !result.path) {
            throw new Error(result.message || 'MODEL_MATERIALIZATION_FAILED');
        }
        storeSource(args.cacheKey, result.path);
        return result.path;
    })();
    pendingSources.set(args.cacheKey, request);
    try {
        return await request;
    } finally {
        pendingSources.delete(args.cacheKey);
    }
}

export async function findDurableServerModelSource(filename: string, owner: string): Promise<string | null> {
    const normalized = filename.trim().toLowerCase();
    if (!normalized) return null;
    for (const category of ['uploads', 'generated'] as const) {
        const query = new URLSearchParams({
            type: 'models', category, owner, scope: 'personal', includePublic: 'true', visibility: 'all', search: filename,
        });
        try {
            const response = await fetch(`/api/assets/list?${query}`, { headers: authorizationHeaders() });
            const result = await response.json() as AssetListResponse;
            const match = result.success
                ? result.files?.find((file) => file.name?.trim().toLowerCase() === normalized)
                : undefined;
            if (match?.path) return match.path;
        } catch {
            // Continue to the other category; callers handle a final miss.
        }
    }
    return null;
}

/**
 * Cache key for a volatile model, derived from its *content*.
 *
 * Keying on the filename made two different models with the same name the same
 * model. That was not hypothetical: the Asset Vault opened every blob-backed
 * model as "model.glb", so the first one ever opened was cached under
 * `volatile:model.glb` in localStorage and every model opened afterwards
 * resolved to it — the 3D editor loaded the wrong model, and because the caller
 * writes the resolved URL back to the layer, the layer was permanently
 * repointed at someone else's file.
 *
 * A digest cannot collide that way, and it makes the cache better: re-importing
 * a file the server already holds now reuses it instead of uploading a copy.
 */
/** Blob bytes, without assuming `Blob.arrayBuffer` exists. */
async function blobBytes(blob: Blob): Promise<ArrayBuffer> {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    if (typeof Response !== 'undefined') return new Response(blob).arrayBuffer();
    return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('BLOB_READ_FAILED'));
        reader.readAsArrayBuffer(blob);
    });
}

async function volatileCacheKey(blob: Blob, filename: string): Promise<string> {
    try {
        const subtle = globalThis.crypto?.subtle;
        if (subtle) {
            const digest = await subtle.digest('SHA-256', await blobBytes(blob));
            const hex = Array.from(new Uint8Array(digest))
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('');
            return `volatile:sha256-${hex}`;
        }
    } catch {
        // Fall through: a weaker key still beats colliding on the name alone.
    }
    return `volatile:${blob.size}:${filename.toLowerCase()}`;
}

export async function recoverVolatileModelSource(url: string, filename: string, owner: string): Promise<string> {
    if (!url.startsWith('blob:')) return url;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('VOLATILE_MODEL_FETCH_FAILED');
        const blob = await response.blob();
        return await materializeDurableModelSource({
            cacheKey: await volatileCacheKey(blob, filename),
            blob,
            filename,
            category: 'uploads',
            owner,
        });
    } catch {
        const recovered = await findDurableServerModelSource(filename, owner);
        if (recovered) return recovered;
        throw new Error('VOLATILE_MODEL_SOURCE_EXPIRED');
    }
}

export function clearDurableModelSourceCachesForTests() {
    resolvedSources.clear();
    pendingSources.clear();
}
