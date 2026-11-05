'use client';

import { useEffect, useRef, useState } from 'react';
import { pickRepresentativeAsset, type LibraryAsset } from '@/lib/assetLibrary/assetMerging';
import { getCachedPreviewUrl, resolvePreviewUrl } from '@/lib/assetLibrary/thumbnailCache';

/** How many blobs are read at once. IndexedDB and Drive both prefer a few in flight, not hundreds. */
export const PREVIEW_CONCURRENCY = 4;
/** Results are published in batches so a big grid does not re-render per tile. */
const FLUSH_INTERVAL_MS = 40;

/**
 * Stable cache key for one stored asset's artwork. Stored bytes never change
 * under an id (rename and visibility edit metadata only), so the key omits
 * timestamps and a rename does not throw the thumbnail away.
 */
export function previewCacheKey(asset: LibraryAsset) {
    return `${asset.storageProvider}:${asset.storageId || asset.path}`;
}

/**
 * Does this asset need bytes read before its tile can show anything?
 * Server files have a URL already; legacy inline records carry `previewPath`;
 * 3D models go through the model-thumbnail renderer instead.
 */
export function needsResolvedPreview(asset: LibraryAsset) {
    const representative = pickRepresentativeAsset(asset);
    if (representative.previewPath || representative.type === 'models') return false;
    return representative.storageProvider === 'local' || representative.storageProvider === 'google-drive';
}

type UseAssetTilePreviewsArgs = {
    assets: LibraryAsset[];
    getAssetKey: (asset: LibraryAsset) => string;
    /** Read the bytes for one (non-merged) asset. */
    loadBlob: (asset: LibraryAsset) => Promise<Blob>;
};

/**
 * Fills in tile artwork for local and cloud assets, which have no URL until
 * their bytes are read. Reads run a few at a time in grid order, publish as
 * they land, and are cached for the session, so a tab that was open before
 * paints without touching storage again.
 */
export function useAssetTilePreviews({ assets, getAssetKey, loadBlob }: UseAssetTilePreviewsArgs) {
    const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
    const [failedKeys, setFailedKeys] = useState<Record<string, true>>({});
    const previewUrlsRef = useRef(previewUrls);
    previewUrlsRef.current = previewUrls;
    const failedKeysRef = useRef(failedKeys);
    failedKeysRef.current = failedKeys;

    useEffect(() => {
        let cancelled = false;
        const immediate: Record<string, string> = {};
        const queue: Array<{ assetKey: string; asset: LibraryAsset }> = [];

        for (const asset of assets) {
            if (!needsResolvedPreview(asset)) continue;
            const assetKey = getAssetKey(asset);
            if (previewUrlsRef.current[assetKey] || failedKeysRef.current[assetKey]) continue;
            const representative = pickRepresentativeAsset(asset);
            const cached = getCachedPreviewUrl(previewCacheKey(representative));
            if (cached) immediate[assetKey] = cached;
            else queue.push({ assetKey, asset: representative });
        }
        if (Object.keys(immediate).length > 0) {
            setPreviewUrls((previous) => ({ ...previous, ...immediate }));
        }
        if (queue.length === 0) return;

        let pendingUrls: Record<string, string> = {};
        let pendingFailures: Record<string, true> = {};
        let flushTimer: number | null = null;
        const flush = () => {
            flushTimer = null;
            if (cancelled) return;
            if (Object.keys(pendingUrls).length > 0) {
                const additions = pendingUrls;
                pendingUrls = {};
                setPreviewUrls((previous) => ({ ...previous, ...additions }));
            }
            if (Object.keys(pendingFailures).length > 0) {
                const additions = pendingFailures;
                pendingFailures = {};
                setFailedKeys((previous) => ({ ...previous, ...additions }));
            }
        };
        const scheduleFlush = () => {
            if (flushTimer === null) flushTimer = window.setTimeout(flush, FLUSH_INTERVAL_MS);
        };

        let cursor = 0;
        const worker = async () => {
            while (!cancelled && cursor < queue.length) {
                const { assetKey, asset } = queue[cursor++];
                try {
                    const url = await resolvePreviewUrl(
                        previewCacheKey(asset),
                        () => loadBlob(asset),
                        { thumbnail: asset.type === 'images' },
                    );
                    pendingUrls[assetKey] = url;
                } catch (error) {
                    console.error(`Failed loading preview for ${asset.name}`, error);
                    pendingFailures[assetKey] = true;
                }
                scheduleFlush();
            }
        };
        const workers = Array.from({ length: Math.min(PREVIEW_CONCURRENCY, queue.length) }, worker);
        void Promise.all(workers).then(flush);

        return () => {
            cancelled = true;
            if (flushTimer !== null) window.clearTimeout(flushTimer);
        };
    }, [assets, getAssetKey, loadBlob]);

    return { previewUrls, failedPreviewKeys: failedKeys };
}
