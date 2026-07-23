'use client';

import { loadAssetIndexSettings } from '@/lib/assetIndexSettings';
import { loadLocalAiPreferences } from '@/lib/localAiPreferences';
import {
    listUnindexedLocalAssets,
    updateLocalAssetMetadata,
    type LocalAssetRecord,
    type LocalAssetSearchMetadata,
} from '@/lib/localAssetStore';

/**
 * Asset search-index pipeline.
 *
 * Indexing runs once per asset at ingest (and via backfill for pre-existing
 * assets), writing search metadata onto the IndexedDB record. Queries never
 * touch blobs — listLocalAssets matches against the stored metadata only.
 *
 * Two passes, tracked separately on the record:
 * - basic (always): image dimensions + generation prompts embedded in PNG
 *   text chunks (Stable Diffusion "parameters", ComfyUI "prompt", etc.).
 * - AI (opt-in via asset index settings): caption + tags from the local
 *   Ollama vision model.
 */

const MAX_EMBEDDED_PROMPT_LENGTH = 2000;
const AI_IMAGE_MAX_DIMENSION = 512;

/** Reads keyword/text pairs from PNG tEXt and (uncompressed) iTXt chunks. */
function extractPngTextChunks(bytes: Uint8Array): Record<string, string> {
    const result: Record<string, string> = {};
    const isPng = bytes.length > 8
        && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!isPng) return result;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8;
    const latin1 = new TextDecoder('latin1');
    const utf8 = new TextDecoder('utf-8');

    while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset);
        const type = latin1.decode(bytes.subarray(offset + 4, offset + 8));
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > bytes.length) break;

        if (type === 'tEXt' || type === 'iTXt') {
            const data = bytes.subarray(dataStart, dataEnd);
            const keywordEnd = data.indexOf(0);
            if (keywordEnd > 0) {
                const keyword = latin1.decode(data.subarray(0, keywordEnd)).toLowerCase();
                let text = '';
                if (type === 'tEXt') {
                    text = latin1.decode(data.subarray(keywordEnd + 1));
                } else {
                    // iTXt: keyword\0 compressionFlag compressionMethod langTag\0 translatedKeyword\0 text
                    const compressionFlag = data[keywordEnd + 1];
                    if (compressionFlag === 0) {
                        let cursor = keywordEnd + 3;
                        for (let nulls = 0; cursor < data.length && nulls < 2; cursor += 1) {
                            if (data[cursor] === 0) nulls += 1;
                        }
                        text = utf8.decode(data.subarray(cursor));
                    }
                }
                if (text.trim()) {
                    result[keyword] = text.trim();
                }
            }
        }
        if (type === 'IEND') break;
        offset = dataEnd + 4;
    }
    return result;
}

/** Picks the most useful embedded generation prompt from PNG text metadata. */
function pickEmbeddedPrompt(chunks: Record<string, string>): string | undefined {
    const candidate = chunks['parameters'] || chunks['prompt'] || chunks['description'] || chunks['comment'];
    if (!candidate) return undefined;
    return candidate.length > MAX_EMBEDDED_PROMPT_LENGTH
        ? candidate.slice(0, MAX_EMBEDDED_PROMPT_LENGTH)
        : candidate;
}

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
    try {
        const bitmap = await createImageBitmap(blob);
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return dimensions;
    } catch {
        return null;
    }
}

/** Downscales an image blob to a small JPEG data URL for the vision model. */
async function buildAiImageDataUrl(blob: Blob): Promise<string | null> {
    try {
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, AI_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
            bitmap.close();
            return null;
        }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
        return null;
    }
}

async function requestAiDescription(blob: Blob): Promise<{ description: string; tags: string[] } | null> {
    const imageDataUrl = await buildAiImageDataUrl(blob);
    if (!imageDataUrl) return null;

    const preferences = loadLocalAiPreferences();
    const response = await fetch('/api/ai/ollama/describe-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            baseUrl: preferences.ollamaBaseUrl,
            model: preferences.ollamaModel,
            imageDataUrl,
        }),
    });
    const payload = await response.json() as {
        success?: boolean;
        description?: string;
        tags?: string[];
        message?: string;
    };
    if (!payload.success) {
        throw new Error(payload.message || 'AI describe request failed.');
    }
    return {
        description: payload.description || '',
        tags: Array.isArray(payload.tags) ? payload.tags : [],
    };
}

/**
 * Runs the indexing pass for one local asset and persists the result.
 * Basic extraction always runs; AI captioning runs only when enabled and the
 * asset is an image. AI failures (Ollama down, no vision model) are swallowed
 * per-asset — the basic index still lands, and aiIndexed stays false so a
 * later backfill can retry.
 */
export async function indexLocalAsset(record: LocalAssetRecord): Promise<LocalAssetSearchMetadata> {
    const metadata: LocalAssetSearchMetadata = {
        indexedAt: new Date().toISOString(),
    };

    if (record.type === 'images') {
        const dimensions = await readImageDimensions(record.data);
        if (dimensions) {
            metadata.width = dimensions.width;
            metadata.height = dimensions.height;
        }

        if ((record.mimeType === 'image/png' || record.name.toLowerCase().endsWith('.png')) && record.data.size < 64 * 1024 * 1024) {
            try {
                const bytes = new Uint8Array(await record.data.arrayBuffer());
                const prompt = pickEmbeddedPrompt(extractPngTextChunks(bytes));
                if (prompt) metadata.prompt = prompt;
            } catch {
                // Unreadable blob — skip prompt extraction.
            }
        }

        if (loadAssetIndexSettings().aiIndexingEnabled) {
            try {
                const ai = await requestAiDescription(record.data);
                if (ai) {
                    if (ai.description) metadata.description = ai.description;
                    if (ai.tags.length > 0) metadata.tags = ai.tags;
                    metadata.aiIndexed = true;
                }
            } catch (error) {
                console.warn(`AI indexing skipped for ${record.name}:`, error);
            }
        }
    }

    await updateLocalAssetMetadata(record.id, metadata);
    return metadata;
}

let backfillRunning = false;

/**
 * Indexes all local assets that have not been through the pipeline yet
 * (including AI retries for assets indexed while AI was off, when it is now on).
 * Sequential with a small idle gap so it never competes with user interaction.
 * Safe to call repeatedly — only one run is active at a time.
 */
export async function backfillLocalAssetIndex(options?: {
    onProgress?: (done: number, total: number) => void;
}): Promise<{ indexed: number }> {
    if (backfillRunning) return { indexed: 0 };
    backfillRunning = true;
    try {
        const aiEnabled = loadAssetIndexSettings().aiIndexingEnabled;
        const pending = await listUnindexedLocalAssets({ requireAi: aiEnabled });
        let done = 0;
        for (const record of pending) {
            try {
                await indexLocalAsset(record);
            } catch (error) {
                console.warn(`Indexing failed for ${record.name}:`, error);
            }
            done += 1;
            options?.onProgress?.(done, pending.length);
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return { indexed: done };
    } finally {
        backfillRunning = false;
    }
}
