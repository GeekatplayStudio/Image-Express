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

function readStoredSources(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, string>
            : {};
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

export async function recoverVolatileModelSource(url: string, filename: string, owner: string): Promise<string> {
    if (!url.startsWith('blob:')) return url;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('VOLATILE_MODEL_FETCH_FAILED');
        return await materializeDurableModelSource({
            cacheKey: `volatile:${filename.toLowerCase()}`,
            blob: await response.blob(),
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
