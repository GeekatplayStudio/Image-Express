import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { getAssetsDir } from '@/lib/server/appPaths';
import { assertFetchableUrl } from '@/lib/server/outboundUrlPolicy';
import {
    upsertAssetMetadata,
    VALID_ASSET_CATEGORIES,
    VALID_ASSET_TYPES,
    type AssetCategory,
    type AssetType,
} from '@/lib/server/asset-metadata';

/**
 * Download a provider's result and keep it as one of the user's own assets.
 *
 * Generation providers hand back a **signed, expiring, cross-origin** URL —
 * Tripo's carries `Policy`/`Signature` query parameters and a hard expiry.
 * Handing that URL to the browser fails twice over:
 *
 *  1. **CORS.** `tripo-data…tripo3d.com` sends no `Access-Control-Allow-Origin`,
 *     so a `fetch`/GLTFLoader from the app's origin is blocked outright. The
 *     three.js loader then throws, which took the WebGL context and the whole
 *     renderer with it.
 *  2. **Expiry.** Even where CORS allows it, the link dies. A generation the
 *     user paid for must not evaporate because they reopened it a day later.
 *
 * The server has neither problem: no CORS on server-to-server fetches, and it
 * can copy the bytes while the signature is still valid. So the result is
 * persisted at the moment the job completes, and everything downstream — the
 * canvas, the 3D viewer, the vault — sees a local path.
 */

/** Provider results can be large 3D meshes; well under a real memory risk. */
const MAX_RESULT_BYTES = 256 * 1024 * 1024;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
    'model/gltf-binary': 'glb',
    'model/gltf+json': 'gltf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
};

/**
 * A filename for the stored copy.
 *
 * Derived from the URL *path*, never the query string — a signed URL's
 * `Signature` is hundreds of characters of base64 and would produce a
 * filename that no filesystem accepts.
 */
export function resultFileName(url: string, hint: string, contentType?: string): string {
    let base = '';
    try {
        base = path.posix.basename(new URL(url).pathname);
    } catch {
        base = '';
    }

    const cleanHint = hint.replace(/[^a-z0-9.-]/gi, '_').toLowerCase().slice(0, 60) || 'result';
    const hasExtension = /\.[a-z0-9]{2,5}$/i.test(base);

    if (base && hasExtension) {
        return `${Date.now()}-${base.replace(/[^a-z0-9.-]/gi, '_').toLowerCase()}`.slice(0, 180);
    }

    const extension = (contentType && EXTENSION_BY_CONTENT_TYPE[contentType.split(';')[0].trim()]) || 'bin';
    return `${Date.now()}-${cleanHint}.${extension}`;
}

/** Where a stored asset is served from. */
export function assetPublicPath(category: AssetCategory, type: AssetType, name: string): string {
    return `/api/assets/serve/${category}/${type}/${name}`;
}

export type PersistRemoteAssetOptions = {
    url: string;
    /** Used for the filename when the URL has no usable one. */
    nameHint: string;
    type?: string;
    category?: string;
    owner?: string;
};

export type PersistedAsset = {
    /** App-local URL — safe to hand to the browser. */
    path: string;
    type: AssetType;
    category: AssetCategory;
    name: string;
    bytes: number;
};

/**
 * Fetch and store. Throws on any failure so the caller can decide whether a
 * job should fail or fall back — silently returning the remote URL here would
 * reproduce the exact bug this exists to prevent.
 */
export async function persistRemoteAsset(
    options: PersistRemoteAssetOptions,
): Promise<PersistedAsset> {
    // Same guard the save-url route applies: the server must not be turned
    // into a fetcher for arbitrary internal addresses.
    assertFetchableUrl(options.url);

    const response = await fetch(options.url);
    if (!response.ok) {
        throw new Error(`Provider result fetch failed: ${response.status}`);
    }

    const declaredLength = Number(response.headers.get('content-length') || '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESULT_BYTES) {
        throw new Error(`Provider result is too large to store (${declaredLength} bytes).`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_RESULT_BYTES) {
        throw new Error(`Provider result is too large to store (${buffer.byteLength} bytes).`);
    }

    const type = (options.type && VALID_ASSET_TYPES.includes(options.type as AssetType)
        ? options.type
        : 'models') as AssetType;
    const category = (options.category && VALID_ASSET_CATEGORIES.includes(options.category as AssetCategory)
        ? options.category
        : 'generated') as AssetCategory;

    const name = resultFileName(
        options.url,
        options.nameHint,
        response.headers.get('content-type') ?? undefined,
    );

    const directory = path.join(getAssetsDir(), category, type);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, name), buffer);

    // Registering the metadata is what puts it in the user's collection; a
    // file on disk that the catalog does not know about is invisible.
    await upsertAssetMetadata({
        category,
        type,
        name,
        owner: options.owner || 'Guest',
        isPublic: false,
    });

    return { path: assetPublicPath(category, type, name), type, category, name, bytes: buffer.byteLength };
}
