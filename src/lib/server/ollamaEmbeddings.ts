import {
    formatOllamaAttemptedBaseUrls,
    fetchOllamaWithFallback,
} from '@/lib/ollamaServer';
import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';
import { normalizeOllamaBaseUrl } from '@/lib/ollama';
import { hashTextEmbedding } from '@/features/asset-vault/domain/vectorMath';

const EMBED_TIMEOUT_MS = 45_000;
const EXPAND_TIMEOUT_MS = 30_000;

export type EmbedResult = {
    vector: number[];
    model: string;
    source: 'ollama' | 'hash-fallback';
};

/** Prefer a small local embedding model; fall back to hash when Ollama is down. */
export async function embedTextWithOllama(options: {
    text: string;
    baseUrl?: string;
    model?: string;
}): Promise<EmbedResult> {
    const text = options.text.trim();
    if (!text) {
        return { vector: hashTextEmbedding(''), model: 'hash-text-v1', source: 'hash-fallback' };
    }

    const baseUrl = normalizeOllamaBaseUrl(options.baseUrl || DEFAULT_OLLAMA_BASE_URL);
    const model = options.model?.trim() || process.env.IMAGE_EXPRESS_OLLAMA_EMBED_MODEL?.trim() || 'nomic-embed-text';

    try {
        const result = await fetchOllamaWithFallback(baseUrl, '/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: text.slice(0, 4000) }),
            timeoutMs: EMBED_TIMEOUT_MS,
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

export async function expandSearchQueryWithOllama(options: {
    query: string;
    baseUrl?: string;
    model?: string;
}): Promise<string[]> {
    const query = options.query.trim();
    if (!query) return [];

    const baseUrl = normalizeOllamaBaseUrl(options.baseUrl || DEFAULT_OLLAMA_BASE_URL);
    let resolvedModel = options.model?.trim() || process.env.IMAGE_EXPRESS_OLLAMA_CHAT_MODEL?.trim() || '';

    try {
        if (!resolvedModel) {
            const tagsResult = await fetchOllamaWithFallback(baseUrl, '/api/tags', {
                method: 'GET',
                timeoutMs: 8_000,
            });
            if (!tagsResult.ok || !tagsResult.response) return [query];
            const tags = await tagsResult.response.json() as { models?: Array<{ name?: string }> };
            resolvedModel = tags.models?.[0]?.name || '';
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
        return Array.from(new Set([query.toLowerCase(), ...terms]));
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
