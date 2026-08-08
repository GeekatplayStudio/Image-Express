import {
    formatOllamaAttemptedBaseUrls,
    fetchOllamaWithFallback,
} from '@/lib/ollamaServer';
import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';
import { normalizeOllamaBaseUrl } from '@/lib/ollama';
import { hashTextEmbedding } from '@/features/asset-vault/domain/vectorMath';

const EMBED_TIMEOUT_MS = 45_000;
// Generous: this is the budget for the underlying generation (which may need
// to load the chat model). The interactive search path uses
// expandSearchQueryFast, which only waits EXPAND_INLINE_BUDGET_MS and lets the
// generation finish in the background to warm the cache for the next search.
const EXPAND_TIMEOUT_MS = 30_000;
const EXPAND_INLINE_BUDGET_MS = 2_500;

/** Keep the embedding model resident so consecutive searches stay warm. */
const EMBED_KEEP_ALIVE = '30m';

export type EmbedResult = {
    vector: number[];
    model: string;
    source: 'ollama' | 'hash-fallback';
};

export function resolveEmbedModel(model?: string): string {
    return model?.trim() || process.env.IMAGE_EXPRESS_OLLAMA_EMBED_MODEL?.trim() || 'nomic-embed-text';
}

// Small LRU for query embeddings: typing the same search twice (or refining a
// query) must not hit Ollama again.
const queryEmbedCache = new Map<string, EmbedResult>();
const QUERY_EMBED_CACHE_MAX = 200;

export async function embedQueryWithOllama(options: {
    text: string;
    baseUrl?: string;
    model?: string;
}): Promise<EmbedResult> {
    const key = `${resolveEmbedModel(options.model)}::${options.text.trim().toLowerCase()}`;
    const cached = queryEmbedCache.get(key);
    if (cached && cached.source === 'ollama') {
        queryEmbedCache.delete(key);
        queryEmbedCache.set(key, cached);
        return cached;
    }
    const result = await embedTextWithOllama(options);
    if (result.source === 'ollama') {
        queryEmbedCache.set(key, result);
        while (queryEmbedCache.size > QUERY_EMBED_CACHE_MAX) {
            const oldest = queryEmbedCache.keys().next().value;
            if (oldest === undefined) break;
            queryEmbedCache.delete(oldest);
        }
    }
    return result;
}

/**
 * Batch-embed many texts in one Ollama round-trip via /api/embed.
 * Returns null when Ollama is unreachable (callers keep their hash vectors).
 */
export async function embedTextsWithOllama(options: {
    texts: string[];
    baseUrl?: string;
    model?: string;
}): Promise<{ vectors: number[][]; model: string } | null> {
    if (options.texts.length === 0) return { vectors: [], model: resolveEmbedModel(options.model) };
    const baseUrl = normalizeOllamaBaseUrl(options.baseUrl || DEFAULT_OLLAMA_BASE_URL);
    const model = resolveEmbedModel(options.model);
    try {
        const result = await fetchOllamaWithFallback(baseUrl, '/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                input: options.texts.map((text) => text.slice(0, 4000)),
                keep_alive: EMBED_KEEP_ALIVE,
            }),
            timeoutMs: EMBED_TIMEOUT_MS,
        });
        if (!result.ok || !result.response) {
            throw new Error(
                `Ollama batch embed failed${formatOllamaAttemptedBaseUrls(result.attemptedBaseUrls)}`,
            );
        }
        const payload = await result.response.json() as { embeddings?: number[][] };
        if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== options.texts.length) {
            throw new Error('Ollama returned malformed batch embeddings');
        }
        return { vectors: payload.embeddings.map(normalizeVector), model };
    } catch (error) {
        console.warn('Ollama batch embedding unavailable:', error);
        return null;
    }
}

/**
 * Prefer a small local embedding model; fall back to hash when Ollama is down.
 *
 * `timeoutMs` exists for interactive callers. The default budget is generous
 * because a cold model load genuinely takes that long during a backfill — but
 * when Ollama is not running at all, a request pays the whole budget before
 * failing. "Find similar" did exactly that: 45 s of nothing on every click,
 * measured, before falling back to an answer it could have given immediately.
 */
export async function embedTextWithOllama(options: {
    text: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
}): Promise<EmbedResult> {
    const text = options.text.trim();
    if (!text) {
        return { vector: hashTextEmbedding(''), model: 'hash-text-v1', source: 'hash-fallback' };
    }

    const baseUrl = normalizeOllamaBaseUrl(options.baseUrl || DEFAULT_OLLAMA_BASE_URL);
    const model = resolveEmbedModel(options.model);

    try {
        const result = await fetchOllamaWithFallback(baseUrl, '/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: text.slice(0, 4000), keep_alive: EMBED_KEEP_ALIVE }),
            timeoutMs: options.timeoutMs ?? EMBED_TIMEOUT_MS,
        });
        if (!result.ok || !result.response) {
            throw new Error(
                `Ollama embeddings failed${formatOllamaAttemptedBaseUrls(result.attemptedBaseUrls)}`,
            );
        }
        const payload = await result.response.json() as { embedding?: number[] };
        if (!Array.isArray(payload.embedding) || payload.embedding.length === 0) {
            throw new Error('Ollama returned empty embedding');
        }
        return { vector: normalizeVector(payload.embedding), model, source: 'ollama' };
    } catch (error) {
        console.warn('Ollama embedding unavailable, using hash fallback:', error);
        return {
            vector: hashTextEmbedding(text, 64),
            model: 'hash-text-v1',
            source: 'hash-fallback',
        };
    }
}

// Cache expansions per query — the same search (typed twice, or the client
// refreshing) must not trigger another chat-model generation.
const expansionCache = new Map<string, string[]>();
const EXPANSION_CACHE_MAX = 200;

function isLikelyTextChatModel(name: string): boolean {
    const lower = name.toLowerCase();
    // Skip embedding and vision models: expansion needs a small TEXT chat
    // model, and picking a vision model swaps the embed model out of memory.
    // Also skip raw base models — they don't follow the JSON instruction.
    return !/embed|-vl|vl:|vision|llava|minicpm-v|moondream|bakllava|-base/.test(lower);
}

/**
 * Expansion for the interactive search path: answer within a small fixed
 * budget. If the chat model needs longer (cold load), the generation keeps
 * running in the background and fills the cache, so the next search of the
 * same query gets the expanded terms instantly. Search quality degrades
 * gracefully to the raw query — never to a stalled request.
 */
export async function expandSearchQueryFast(options: {
    query: string;
    baseUrl?: string;
    model?: string;
}): Promise<string[]> {
    const query = options.query.trim();
    if (!query) return [];
    const inflightKey = query.toLowerCase();
    let pending = inflightExpansions.get(inflightKey);
    if (!pending) {
        pending = expandSearchQueryWithOllama(options)
            .catch(() => [query])
            .finally(() => inflightExpansions.delete(inflightKey));
        inflightExpansions.set(inflightKey, pending);
    }
    const budget = new Promise<string[]>((resolve) => {
        setTimeout(() => resolve([query]), EXPAND_INLINE_BUDGET_MS);
    });
    return Promise.race([pending, budget]);
}

const inflightExpansions = new Map<string, Promise<string[]>>();

export async function expandSearchQueryWithOllama(options: {
    query: string;
    baseUrl?: string;
    model?: string;
}): Promise<string[]> {
    const query = options.query.trim();
    if (!query) return [];

    const baseUrl = normalizeOllamaBaseUrl(options.baseUrl || DEFAULT_OLLAMA_BASE_URL);
    let resolvedModel = options.model?.trim() || process.env.IMAGE_EXPRESS_OLLAMA_CHAT_MODEL?.trim() || '';

    const cacheKey = `${baseUrl}::${resolvedModel}::${query.toLowerCase()}`;
    const cached = expansionCache.get(cacheKey);
    if (cached) {
        expansionCache.delete(cacheKey);
        expansionCache.set(cacheKey, cached);
        return cached;
    }

    try {
        if (!resolvedModel) {
            const tagsResult = await fetchOllamaWithFallback(baseUrl, '/api/tags', {
                method: 'GET',
                timeoutMs: 8_000,
            });
            if (!tagsResult.ok || !tagsResult.response) return [query];
            const tags = await tagsResult.response.json() as {
                models?: Array<{ name?: string; size?: number }>;
            };
            const candidates = (tags.models ?? [])
                .filter((entry) => entry.name && isLikelyTextChatModel(entry.name))
                // Smallest first: expansion needs speed, not depth.
                .sort((a, b) => (a.size ?? Number.MAX_SAFE_INTEGER) - (b.size ?? Number.MAX_SAFE_INTEGER));
            resolvedModel = candidates[0]?.name || '';
            if (!resolvedModel) return [query];
        }

        const prompt = [
            'Expand this asset-library search query into related keywords for creative media.',
            'Reply with STRICT JSON only: {"terms":["term1","term2",...]} with 6-12 short lowercase terms.',
            `Query: ${query}`,
        ].join('\n');

        const result = await fetchOllamaWithFallback(baseUrl, '/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: resolvedModel,
                prompt,
                stream: false,
                format: 'json',
                keep_alive: '30m',
                options: { temperature: 0.2 },
            }),
            timeoutMs: EXPAND_TIMEOUT_MS,
        });
        if (!result.ok || !result.response) return [query];
        const payload = await result.response.json() as { response?: string };
        const raw = payload.response || '';
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return [query];
        const parsed = JSON.parse(match[0]) as { terms?: unknown };
        const terms = Array.isArray(parsed.terms)
            ? parsed.terms
                .filter((term): term is string => typeof term === 'string')
                .map((term) => term.trim().toLowerCase())
                .filter((term) => term.length > 1 && term.length <= 40)
                .slice(0, 12)
            : [];
        const expanded = Array.from(new Set([query.toLowerCase(), ...terms]));
        if (expanded.length > 1) {
            expansionCache.set(cacheKey, expanded);
            while (expansionCache.size > EXPANSION_CACHE_MAX) {
                const oldest = expansionCache.keys().next().value;
                if (oldest === undefined) break;
                expansionCache.delete(oldest);
            }
        }
        return expanded;
    } catch (error) {
        console.warn('Query expansion failed:', error);
        return [query];
    }
}

function normalizeVector(values: number[]): number[] {
    let mag = 0;
    for (const value of values) mag += value * value;
    mag = Math.sqrt(mag) || 1;
    return values.map((value) => value / mag);
}
