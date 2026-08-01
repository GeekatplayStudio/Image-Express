import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';
import { normalizeOllamaBaseUrl } from '@/lib/ollama';
import { fetchOllamaWithFallback, listOllamaVisionModelsByCapability } from '@/lib/ollamaServer';
import { buildVisionCatalog, DEFAULT_VISION_MODEL } from '@/lib/server/ollamaVisionCatalog';

const TAGS_TIMEOUT_MS = 5000;

/**
 * Vision models the user can pick from: the ones already installed, and the
 * ones worth installing.
 *
 * Installed models are classified by Ollama's own `capabilities`, and the
 * install suggestions are checked against the live Ollama library, so neither
 * half depends on this app knowing today's model names.
 */
export async function GET(request: NextRequest) {
    const requestedBaseUrl = request.nextUrl.searchParams.get('baseUrl')?.trim() || DEFAULT_OLLAMA_BASE_URL;

    let resolvedBaseUrl: string;
    try {
        resolvedBaseUrl = normalizeOllamaBaseUrl(requestedBaseUrl);
    } catch (error) {
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Invalid Ollama URL.',
        }, { status: 400 });
    }

    // The catalog is useful even with Ollama down — it is what tells the user
    // what to install — so the two halves fail independently.
    const catalog = await buildVisionCatalog();

    let installed: string[] = [];
    let ollamaReachable = false;
    try {
        const tags = await fetchOllamaWithFallback(resolvedBaseUrl, '/api/tags', {
            method: 'GET',
            cache: 'no-store',
            timeoutMs: TAGS_TIMEOUT_MS,
        });
        if (tags.ok && tags.response) {
            ollamaReachable = true;
            resolvedBaseUrl = tags.baseUrl;
            const payload = await tags.response.json() as { models?: Array<{ name?: string; model?: string }> };
            const models = Array.isArray(payload.models)
                ? payload.models.map((entry) => entry.name || entry.model || '').filter((entry) => entry.trim())
                : [];
            installed = await listOllamaVisionModelsByCapability(resolvedBaseUrl, models);
        }
    } catch {
        // Leave ollamaReachable false; the suggestions still stand.
    }

    return NextResponse.json({
        success: true,
        baseUrl: resolvedBaseUrl,
        ollamaReachable,
        /** Installed models Ollama reports as vision-capable. */
        installed,
        /** Curated, installable suggestions with sizes. */
        suggestions: catalog.suggestions,
        /** Vision models in the library newer than the curated list. */
        newerInLibrary: catalog.newerInLibrary,
        libraryChecked: catalog.libraryChecked,
        defaultModel: DEFAULT_VISION_MODEL,
    });
}
