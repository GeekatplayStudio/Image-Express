'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetDescriptor } from '@/types';
import { buildSessionAuthorizationHeader } from '@/lib/authSession';
import { listDriveAssets, loadDriveConfig } from '@/lib/googleDrive';
import { listLocalAssets } from '@/lib/localAssetStore';
import { isImplementedAssetCloudProvider, loadAssetStorageSettings } from '@/lib/assetStorageSettings';
import {
    isDrivePassiveAuthError,
    mergeDuplicateAssets,
    type AssetScopeTab,
    type LibraryAsset,
    type VisibilityFilter,
} from '@/lib/assetLibrary/assetMerging';
import { getCachedPreviewUrl, cachePreviewUrl } from '@/lib/assetLibrary/thumbnailCache';
import { TAB_CONFIG, type LibraryTab } from './libraryTabs';

export type AssetSource = 'local' | 'cloud' | 'server';

/** What the status bar shows about the last load. */
export type AssetLoadStats = {
    durationMs: number;
    counts: Record<AssetSource, number>;
    /** Sources that were asked and failed; their assets are simply absent. */
    failed: AssetSource[];
    /** True while the list on screen came from the cache and a refresh is running. */
    fromCache: boolean;
};

export type QueryAssetsOptions = {
    search?: string;
    scope?: AssetScopeTab;
    visibility?: VisibilityFilter;
    includePublic?: boolean;
};

type QueryResult = { assets: LibraryAsset[]; stats: AssetLoadStats };

/**
 * Last result per query, kept for the page session so reopening the library
 * or returning to a tab paints instantly and the fresh list replaces it when
 * it arrives (stale-while-revalidate). Mutations go through `fetchAssets`,
 * which always re-queries, so a stale entry is never shown for longer than
 * one load.
 */
const resultCache = new Map<string, QueryResult>();

export function invalidateAssetQueryCache() {
    resultCache.clear();
}

/** Debounce for search typing only; tab and filter changes load at once. */
export const SEARCH_DEBOUNCE_MS = 150;

type UseAssetLibraryQueryArgs = {
    normalizedUser: string;
    driveClientId: string;
    activeTab: LibraryTab;
    scopeTab: AssetScopeTab;
    visibilityFilter: VisibilityFilter;
    showPublicAssets: boolean;
    searchQuery: string;
};

export function useAssetLibraryQuery({
    normalizedUser,
    driveClientId,
    activeTab,
    scopeTab,
    visibilityFilter,
    showPublicAssets,
    searchQuery,
}: UseAssetLibraryQueryArgs) {
    const [assets, setAssets] = useState<LibraryAsset[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadStats, setLoadStats] = useState<AssetLoadStats | null>(null);
    /** Monotonic request id; a response that is not the latest is dropped. */
    const requestSeqRef = useRef(0);

    const queryAssetsForTab = useCallback(async (targetTab: LibraryTab, options?: QueryAssetsOptions): Promise<QueryResult> => {
        const startedAt = performance.now();
        const config = TAB_CONFIG[targetTab];
        const settings = loadAssetStorageSettings();
        const resolvedScope = options?.scope || scopeTab;
        const resolvedVisibility = options?.visibility || visibilityFilter;
        const includePublic = typeof options?.includePublic === 'boolean'
            ? options.includePublic
            : (resolvedScope === 'shared' ? true : showPublicAssets);
        const search = (options?.search ?? searchQuery).trim();
        const cloudProviderImplemented = isImplementedAssetCloudProvider(settings.cloudProvider);

        const shouldLoadLocal = settings.mode === 'local' || settings.mode === 'hybrid';
        const shouldLoadCloud = cloudProviderImplemented && (settings.mode === 'cloud' || settings.mode === 'hybrid');
        const shouldLoadServer = settings.mode === 'hybrid' && settings.includeLegacyServerAssetsInHybrid;
        const failed: AssetSource[] = [];

        const listParams = { owner: normalizedUser, scope: resolvedScope, includePublic, visibility: resolvedVisibility, search };
        const loadLocalPromise = shouldLoadLocal
            ? listLocalAssets({ type: config.type, category: config.category, ...listParams }).catch((error) => {
                console.error('Failed loading local assets', error);
                failed.push('local');
                return [];
            })
            : Promise.resolve([]);

        const driveConfig = loadDriveConfig();
        const resolvedDriveClientId = (driveConfig.clientId || driveClientId || '').trim();
        const loadCloudPromise = shouldLoadCloud && driveConfig.enabled && resolvedDriveClientId
            ? listDriveAssets(resolvedDriveClientId, { ...listParams, type: config.type, category: config.category }, { allowInteractiveAuth: false })
                .catch((error) => {
                    if (!isDrivePassiveAuthError(error)) console.error('Failed loading Google Drive assets', error);
                    failed.push('cloud');
                    return [];
                })
            : Promise.resolve([]);

        const loadServerPromise = shouldLoadServer
            ? fetch(`/api/assets/list?${new URLSearchParams({
                type: config.type,
                category: config.category,
                owner: normalizedUser,
                scope: resolvedScope,
                includePublic: String(includePublic),
                visibility: resolvedVisibility,
                search,
            }).toString()}`, {
                headers: (() => {
                    const authorization = buildSessionAuthorizationHeader();
                    return authorization ? { Authorization: authorization } : undefined;
                })(),
            })
                .then((res) => res.json())
                .then((data) => {
                    if (!data.success) failed.push('server');
                    return data.success ? (data.files || []) as AssetDescriptor[] : [];
                })
                .catch((error) => {
                    console.error('Failed loading legacy server assets', error);
                    failed.push('server');
                    return [] as AssetDescriptor[];
                })
            : Promise.resolve([]);

        const [localAssets, cloudAssets, serverAssets] = await Promise.all([loadLocalPromise, loadCloudPromise, loadServerPromise]);

        const localNormalized: LibraryAsset[] = localAssets.map((item) => {
            // Records written before the blob split still carry inline bytes; the
            // URL for those is made once per session, not once per refresh.
            const inlineKey = `local:${item.id}:${item.updatedAt}`;
            const previewPath = item.data ? (getCachedPreviewUrl(inlineKey) ?? cachePreviewUrl(inlineKey, item.data)) : undefined;
            return {
                path: `local-file://${item.id}`,
                previewPath,
                name: item.name,
                type: item.type,
                category: item.category,
                owner: item.owner,
                isPublic: item.isPublic,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                storageProvider: 'local',
                storageId: item.id,
                description: item.description,
                tags: item.tags,
                sizeBytes: item.sizeBytes ?? item.data?.size,
                width: item.width,
                height: item.height,
            };
        });

        const cloudNormalized: LibraryAsset[] = cloudAssets.map((item) => ({
            path: `gdrive-file://${item.id}`,
            name: item.name,
            type: item.type,
            category: item.category,
            owner: item.owner,
            isPublic: item.isPublic,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            storageProvider: 'google-drive',
            storageId: item.id,
        }));

        const serverNormalized: LibraryAsset[] = serverAssets.map((file) => ({
            ...file,
            category: file.category || config.category,
            type: file.type || config.type,
            storageProvider: 'server',
        }));

        return {
            assets: mergeDuplicateAssets([...localNormalized, ...cloudNormalized, ...serverNormalized]),
            stats: {
                durationMs: Math.round(performance.now() - startedAt),
                counts: { local: localNormalized.length, cloud: cloudNormalized.length, server: serverNormalized.length },
                failed,
                fromCache: false,
            },
        };
    }, [driveClientId, normalizedUser, scopeTab, searchQuery, showPublicAssets, visibilityFilter]);

    const cacheKeyFor = useCallback((tab: LibraryTab) => {
        const settings = loadAssetStorageSettings();
        return [normalizedUser, tab, scopeTab, visibilityFilter, showPublicAssets, searchQuery.trim(), settings.mode, settings.cloudProvider, settings.includeLegacyServerAssetsInHybrid].join('|');
    }, [normalizedUser, scopeTab, searchQuery, showPublicAssets, visibilityFilter]);

    /**
     * Load the active tab (or `forcedTab`). A cached result for the same query
     * is shown at once while the fresh one loads; the spinner only appears when
     * there is nothing to show.
     */
    const fetchAssets = useCallback(async (forcedTab?: LibraryTab) => {
        const resolvedTab = forcedTab || activeTab;
        const seq = ++requestSeqRef.current;
        const key = cacheKeyFor(resolvedTab);
        const cached = resultCache.get(key);
        if (cached) {
            setAssets(cached.assets);
            setLoadStats({ ...cached.stats, fromCache: true });
            setIsLoading(false);
            setIsRefreshing(true);
        } else {
            // A query never run before: do not leave the previous tab's tiles under the new tab.
            setAssets([]);
            setIsLoading(true);
        }
        try {
            const result = await queryAssetsForTab(resolvedTab);
            if (seq !== requestSeqRef.current) return;
            resultCache.set(key, result);
            setAssets(result.assets);
            setLoadStats(result.stats);
        } catch (error) {
            console.error('Failed to load assets', error);
        } finally {
            if (seq === requestSeqRef.current) {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        }
    }, [activeTab, cacheKeyFor, queryAssetsForTab]);

    // Re-fetch when the tab or a filter changes. Only search typing is debounced.
    const lastSearchRef = useRef<string | null>(null);
    useEffect(() => {
        const searchChanged = lastSearchRef.current !== null && lastSearchRef.current !== searchQuery;
        lastSearchRef.current = searchQuery;
        if (!searchChanged) {
            void fetchAssets();
            return;
        }
        const timer = window.setTimeout(() => { void fetchAssets(); }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [fetchAssets, searchQuery]);

    return { assets, isLoading, isRefreshing, loadStats, fetchAssets, queryAssetsForTab };
}
