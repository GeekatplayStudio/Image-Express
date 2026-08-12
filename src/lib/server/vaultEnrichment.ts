import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { DEFAULT_OLLAMA_BASE_URL } from '@/lib/localAiPreferences';
import {
    extractBase64PayloadFromDataUrl,
    normalizeOllamaBaseUrl,
} from '@/lib/ollama';
import {
    fetchOllamaWithFallback,
    checkOllamaModelVision,
    listOllamaVisionModelsByCapability,
} from '@/lib/ollamaServer';
import { readVaultCatalog, upsertVaultAssets } from '@/lib/server/vault-store';
import { readEmbeddedAssetIds, upsertVectorRecords } from '@/lib/server/vaultWatchStore';
import { embedTextWithOllama, resolveEmbedModel } from '@/lib/server/ollamaEmbeddings';
import {
    buildAssetEmbeddingText,
    type VectorRecord,
} from '@/features/asset-vault/domain/vectorMath';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { getAssetsDir, joinRuntimePath } from '@/lib/server/appPaths';

const DESCRIBE_TIMEOUT_MS = 60_000;
const MAX_ENRICH_PER_RUN = 24;
const AI_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

const DESCRIBE_PROMPT = [
    'You are indexing a design-tool asset library.',
    'Look at the image and reply with STRICT JSON only, no markdown, no commentary, in this exact shape:',
    '{"description": "<one factual sentence describing the image content>", "tags": ["<8-12 short lowercase search keywords: subjects, objects, style, colors, mood>"]}',
].join('\n');

function parseDescribeResponse(raw: string): { description: string; tags: string[] } | null {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
        const parsed = JSON.parse(jsonMatch[0]) as { description?: unknown; tags?: unknown };
        const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
        const tags = Array.isArray(parsed.tags)
            ? parsed.tags
                .filter((tag): tag is string => typeof tag === 'string')
                .map((tag) => tag.trim().toLowerCase())
                .filter((tag) => tag.length > 0 && tag.length <= 40)
                .slice(0, 16)
            : [];
        if (!description && tags.length === 0) return null;
        return { description, tags };
    } catch {
        return null;
    }
}

function resolveAbsoluteAssetPath(asset: VaultAssetRecord): string | null {
    if (asset.origin.connector === 'local' || asset.origin.connector === 'network') {
        let pathPart = asset.origin.uri.replace(/^file:\/\//i, '');
        if (pathPart.startsWith('/') && /^[A-Za-z]:/.test(pathPart.slice(1))) {
            pathPart = pathPart.slice(1);
        }
        return decodeURIComponent(pathPart.replace(/\//g, path.sep));
    }
    if (asset.origin.connector === 'server') {
        const relative = asset.origin.uri.replace(/^server:\/\//, '');
        return joinRuntimePath(getAssetsDir(), ...relative.split('/'));
    }
    return null;
}

async function loadImageDataUrl(asset: VaultAssetRecord): Promise<string | null> {
    if (asset.type !== 'images') return null;
    const absolute = resolveAbsoluteAssetPath(asset);
    if (!absolute) return null;
    try {
        const bytes = await readFile(/*turbopackIgnore: true*/ absolute);
        if (bytes.length === 0 || bytes.length > AI_IMAGE_MAX_BYTES) return null;
        const ext = path.extname(asset.name).toLowerCase();
        const mime = ext === '.png' ? 'image/png'
            : ext === '.webp' ? 'image/webp'
            : ext === '.gif' ? 'image/gif'
            : 'image/jpeg';
        return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
        return null;
    }
}

async function describeImageWithOllama(options: {
    imageDataUrl: string;
    baseUrl: string;
    model?: string;
}): Promise<{ description: string; tags: string[] } | null> {
    const baseUrl = normalizeOllamaBaseUrl(options.baseUrl);
    const tagsResult = await fetchOllamaWithFallback(baseUrl, '/api/tags', {
        method: 'GET',
        timeoutMs: DESCRIBE_TIMEOUT_MS,
    });
    if (!tagsResult.ok || !tagsResult.response) return null;
    const tagsPayload = await tagsResult.response.json() as {
        models?: Array<{ name?: string; model?: string }>;
    };
    const models = Array.isArray(tagsPayload.models)
        ? tagsPayload.models.map((entry) => entry.name || entry.model || '').filter(Boolean)
        : [];
    // Pick by what Ollama says each model can do, not by its name — the name
    // patterns miss most of the current library, which would leave vault
    // enrichment silently doing nothing on a machine that has a vision model.
    const requested = options.model?.trim() || '';
    let model = '';
    if (requested && models.includes(requested)) {
        const check = await checkOllamaModelVision(tagsResult.baseUrl, requested);
        if (check.supportsVision) model = requested;
    }
    if (!model) {
        const visionModels = await listOllamaVisionModelsByCapability(tagsResult.baseUrl, models);
        model = visionModels[0] ?? '';
    }
    if (!model) return null;

    const imageBase64 = extractBase64PayloadFromDataUrl(options.imageDataUrl);
    const describeResult = await fetchOllamaWithFallback(tagsResult.baseUrl, '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt: DESCRIBE_PROMPT,
            images: [imageBase64],
            stream: false,
            format: 'json',
            options: { temperature: 0.1 },
        }),
        timeoutMs: DESCRIBE_TIMEOUT_MS,
    });
    if (!describeResult.ok || !describeResult.response) return null;
    const payload = await describeResult.response.json() as { response?: string };
    return parseDescribeResponse(payload.response || '');
}

export type EnrichVaultOptions = {
    limit?: number;
    caption?: boolean;
    embed?: boolean;
    onlyUncaptioned?: boolean;
    assetIds?: string[];
    ollamaBaseUrl?: string;
};

export type EnrichVaultResult = {
    processed: number;
    captioned: number;
    embedded: number;
    skipped: number;
};

export async function enrichVaultCatalog(options: EnrichVaultOptions = {}): Promise<EnrichVaultResult> {
    const limit = Math.min(options.limit ?? MAX_ENRICH_PER_RUN, MAX_ENRICH_PER_RUN);
    const caption = options.caption !== false;
    const embed = options.embed !== false;
    const baseUrl = normalizeOllamaBaseUrl(options.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL);

    const catalog = await readVaultCatalog();
    // Only which assets already have an embedding, not the embeddings
    // themselves: loading those costs 1.2 GB at 200k assets and this job needs
    // none of them.
    const embeddedIds = await readEmbeddedAssetIds(resolveEmbedModel());
    const freshVectors: VectorRecord[] = [];

    const candidates = catalog.assets.filter((asset) => {
        if (options.assetIds?.length) return options.assetIds.includes(asset.id);
        if (options.onlyUncaptioned !== false) {
            const needsCaption = caption && asset.type === 'images' && !asset.aiIndexed;
            const needsEmbed = embed && !embeddedIds.has(asset.id);
            return needsCaption || needsEmbed;
        }
        return true;
    }).slice(0, limit);

    let captioned = 0;
    let embedded = 0;
    let skipped = 0;
    const now = new Date().toISOString();
    // Only what this run actually changed. A run enriches at most MAX_ENRICH_PER_RUN
    // assets, so handing the whole catalog to the store would make it rediscover
    // a handful of changes by scanning every row.
    const changedAssets: VaultAssetRecord[] = [];

    for (const asset of candidates) {
        let next: VaultAssetRecord = { ...asset };
        let changed = false;

        if (caption && asset.type === 'images' && !asset.aiIndexed) {
            try {
                const dataUrl = await loadImageDataUrl(asset);
                if (dataUrl) {
                    const ai = await describeImageWithOllama({ imageDataUrl: dataUrl, baseUrl });
                    if (ai) {
                        next = {
                            ...next,
                            description: ai.description || next.description,
                            tags: ai.tags.length > 0 ? ai.tags : next.tags,
                            aiIndexed: true,
                            indexedAt: now,
                        };
                        captioned += 1;
                        changed = true;
                    } else {
                        skipped += 1;
                    }
                } else {
                    skipped += 1;
                }
            } catch (error) {
                console.warn(`Vault caption failed for ${asset.name}:`, error);
                skipped += 1;
            }
        }

        if (embed) {
            try {
                const text = buildAssetEmbeddingText(next);
                const result = await embedTextWithOllama({ text, baseUrl });
                const record: VectorRecord = {
                    assetId: next.id,
                    model: result.model,
                    dims: result.vector.length,
                    vector: result.vector,
                    updatedAt: now,
                };
                freshVectors.push(record);
                embeddedIds.add(next.id);
                next = {
                    ...next,
                    embeddingModel: result.model,
                    indexedAt: next.indexedAt || now,
                };
                embedded += 1;
                changed = true;
            } catch (error) {
                console.warn(`Vault embed failed for ${asset.name}:`, error);
                skipped += 1;
            }
        }

        if (changed) changedAssets.push(next);
    }

    await upsertVaultAssets(changedAssets);
    // Write only this run's embeddings. Rewriting the whole store threw
    // outright past ~34k assets, and the failure was caught and warned, so the
    // index silently stopped converging from that point on.
    await upsertVectorRecords(freshVectors);

    return {
        processed: candidates.length,
        captioned,
        embedded,
        skipped,
    };
}
