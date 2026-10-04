import { fileURLToPath } from 'node:url';

import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { generationMetaFromText, readPngInfo } from '@/lib/server/generationMeta';
import { sqliteCatalogReady, upsertVaultAssets } from '@/lib/server/vault-store';
import { openCatalogDb, PRESENT } from '@/lib/server/vaultCatalogDb';

/**
 * What the vault reads from a file itself, at index time.
 *
 * Bump `VAULT_META_VERSION` when this learns to read something new; the
 * backfill then revisits every file indexed by an older version, without a
 * forced rescan. (ComfyUIAssetManager's `PARSER_VERSION_OUTPUT`.)
 */
export const VAULT_META_VERSION = 1;

const MIME_BY_EXTENSION: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml', avif: 'image/avif',
    heic: 'image/heic', ico: 'image/x-icon', exr: 'image/x-exr', psd: 'image/vnd.adobe.photoshop',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo', ogv: 'video/ogg', wmv: 'video/x-ms-wmv',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4',
    aac: 'audio/aac', flac: 'audio/flac', aiff: 'audio/aiff',
    glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'model/obj', stl: 'model/stl',
    usdz: 'model/vnd.usdz+zip', pdf: 'application/pdf',
};

export function mimeTypeForName(name: string): string {
    const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export type FileMeta = Pick<VaultAssetRecord, 'mimeType' | 'width' | 'height' | 'prompt' | 'generation' | 'metaVersion'>;

/**
 * Read what the file says about itself. Never throws: a file that cannot be
 * read still gets its type and is stamped as seen, so it is not retried forever.
 */
export async function readFileMeta(absolutePath: string, name: string): Promise<FileMeta> {
    const meta: FileMeta = { mimeType: mimeTypeForName(name), metaVersion: VAULT_META_VERSION };
    if (meta.mimeType !== 'image/png') return meta;

    const png = await readPngInfo(absolutePath);
    if (!png) return meta;
    meta.width = png.width;
    meta.height = png.height;
    const generation = generationMetaFromText(png.text);
    if (generation) {
        const { prompt, ...rest } = generation;
        if (prompt) meta.prompt = prompt;
        meta.generation = rest;
    }
    return meta;
}

/** Fields read from the file win; a prompt the user or a caption job wrote is kept when the file has none. */
export function withFileMeta(record: VaultAssetRecord, meta: FileMeta): VaultAssetRecord {
    return {
        ...record,
        mimeType: meta.mimeType,
        width: meta.width ?? record.width,
        height: meta.height ?? record.height,
        prompt: meta.prompt ?? record.prompt,
        generation: meta.generation ?? record.generation,
        metaVersion: meta.metaVersion,
    };
}

/** Run `task` over `items`, a few at a time, keeping results in order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await task(items[index]);
        }
    }));
    return results;
}

const localPathOf = (record: VaultAssetRecord): string | null => {
    const uri = record.origin?.uri ?? '';
    if (record.origin?.connector !== 'local' || !uri.startsWith('file://')) return null;
    try {
        return fileURLToPath(uri.replace(/^file:\/\/(?=[a-zA-Z]:)/, 'file:///'));
    } catch {
        return null;
    }
};

let backfillRunning: Promise<number> | null = null;

/**
 * Read metadata for files indexed before the reader existed (or by an older
 * version of it). Runs in batches and yields between them, so a quarter of a
 * million rows are worked through in the background without blocking requests.
 * One pass at a time; a second call joins the pass already running.
 */
export function backfillVaultFileMeta(options: { batchSize?: number; maxFiles?: number } = {}): Promise<number> {
    backfillRunning ??= (async () => {
        if (!(await sqliteCatalogReady())) return 0;
        const database = await openCatalogDb();
        if (!database) return 0;
        const batchSize = options.batchSize ?? 200;
        const maxFiles = options.maxFiles ?? Number.POSITIVE_INFINITY;
        let done = 0;

        while (done < maxFiles) {
            const rows = database
                .prepare(`SELECT record FROM assets WHERE meta_version < ? AND connector = 'local' AND ${PRESENT} ORDER BY id LIMIT ?`)
                .all(VAULT_META_VERSION, batchSize);
            if (rows.length === 0) break;
            const records = rows.map((row) => JSON.parse(String(row.record)) as VaultAssetRecord);
            const updated = await mapWithConcurrency(records, 8, async (record) => {
                const filePath = localPathOf(record);
                const meta = filePath
                    ? await readFileMeta(filePath, record.name)
                    : { mimeType: record.mimeType, metaVersion: VAULT_META_VERSION };
                return withFileMeta(record, meta);
            });
            await upsertVaultAssets(updated);
            done += updated.length;
            // Let queued requests run between batches.
            await new Promise((resolve) => setImmediate(resolve));
        }
        return done;
    })().finally(() => { backfillRunning = null; });
    return backfillRunning;
}
