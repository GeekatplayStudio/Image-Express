'use client';
import type { VaultSearchMatch } from '@/components/AssetVault/vaultModalTypes';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Bookcase, BookcaseFilter } from '@/features/asset-vault/contracts/bookcase';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import {
    enrichVaultCatalog,
    fetchBookcases,
    searchVaultUnified,
    syncVaultCatalog,
} from '@/features/asset-vault/application/client/vaultApiClient';
import { loadVaultUiState } from '@/features/asset-vault/application/client/vaultUiState';
import { parseVaultNaturalQuery } from '@/features/asset-vault/domain/vaultNaturalQuery';

/** One page of the browse view. The server caps a request at 200. */
const BROWSE_PAGE_SIZE = 200;

type UseVaultCatalogArgs = {
    isOpen: boolean;
    owner: string;
    initialFilter?: BookcaseFilter;
    t: (key: string, params?: Record<string, string | number>) => string;
};

export function useVaultCatalog({
    isOpen,
    owner,
    initialFilter,
    t,
}: UseVaultCatalogArgs) {
    const savedUi = useMemo(() => (typeof window === 'undefined' ? null : loadVaultUiState()), []);

    const [query, setQuery] = useState(savedUi?.query ?? '');
    const [smartSearch, setSmartSearch] = useState(savedUi?.smartSearch ?? true);
    const [bookcases, setBookcases] = useState<Bookcase[]>([]);
    const [allAssets, setAllAssets] = useState<VaultAssetRecord[]>([]);
    /** How many the server holds for this view, and whether another page exists. */
    const [browseTotal, setBrowseTotal] = useState(0);
    const [hasMoreAssets, setHasMoreAssets] = useState(false);
    const [serverOffset, setServerOffset] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchHits, setSearchHits] = useState<VaultAssetRecord[] | null>(null);
    /**
     * Why each hit matched, keyed by asset id.
     *
     * The search response carries a score and match reasons per result; those
     * used to be dropped on the floor here, so the UI could show *that* an
     * asset matched but never *why*. Kept alongside rather than inside
     * `searchHits` so every existing consumer of that list is untouched.
     */
    const [searchMatchById, setSearchMatchById] = useState<Map<string, VaultSearchMatch> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const naturalQuery = useMemo(() => parseVaultNaturalQuery(query), [query]);

    const runLoad = useCallback(async () => {
        setIsLoading(true);
        try {
            const [list, response] = await Promise.all([
                fetchBookcases().catch(() => [] as Bookcase[]),
                searchVaultUnified({
                    query: '',
                    mode: 'keyword',
                    filter: initialFilter,
                    limit: BROWSE_PAGE_SIZE,
                }, owner),
            ]);
            setBookcases(list);
            setAllAssets(response.results.map((entry) => entry.asset));
            setBrowseTotal(response.total);
            setHasMoreAssets(Boolean(response.hasMore));
            setServerOffset(BROWSE_PAGE_SIZE);
        } catch (error) {
            console.error('Vault load failed', error);
            setAllAssets([]);
        } finally {
            setIsLoading(false);
        }
    }, [initialFilter, owner]);

    /** Fetch the next page of the browse view and append it. */
    const loadMoreAssets = useCallback(async () => {
        if (isLoadingMore || !hasMoreAssets) return;
        setIsLoadingMore(true);
        try {
            const response = await searchVaultUnified({
                query: '',
                mode: 'keyword',
                filter: initialFilter,
                limit: BROWSE_PAGE_SIZE,
                offset: serverOffset,
            }, owner);
            // Local and Drive items come back with every page; keep one of each.
            setAllAssets((current) => {
                const seen = new Set(current.map((asset) => asset.id));
                return [...current, ...response.results.map((entry) => entry.asset).filter((asset) => !seen.has(asset.id))];
            });
            setBrowseTotal(response.total);
            setHasMoreAssets(Boolean(response.hasMore));
            setServerOffset((offset) => offset + BROWSE_PAGE_SIZE);
        } catch (error) {
            console.error('Vault load-more failed', error);
        } finally {
            setIsLoadingMore(false);
        }
    }, [hasMoreAssets, initialFilter, isLoadingMore, owner, serverOffset]);

    useEffect(() => {
        if (!isOpen) return;
        void runLoad();
    }, [isOpen, runLoad]);

    useEffect(() => {
        if (!isOpen) return;
        const q = naturalQuery.text.trim();
        if (!q) {
            setSearchHits(null);
            setSearchMatchById(null);
            setIsSearching(false);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void (async () => {
                setIsSearching(true);
                try {
                    const response = await searchVaultUnified({
                        query: q,
                        mode: smartSearch ? 'smart' : 'keyword',
                        filter: initialFilter,
                        limit: 120,
                    }, owner);
                    if (!cancelled) {
                        setSearchHits(response.results.map((entry) => entry.asset));
                        setSearchMatchById(new Map(response.results.map((entry) => [
                            entry.asset.id,
                            { score: entry.score, matchReasons: entry.matchReasons ?? [] },
                        ])));
                        if (response.expandedTerms?.length) {
                            setStatusMessage(t('vault.smartExpanded', {
                                terms: response.expandedTerms.slice(0, 4).join(', '),
                            }));
                        } else {
                            setStatusMessage(t('vault.searchResultCount', { count: response.results.length }));
                        }
                    }
                } catch (error) {
                    console.error(error);
                    if (!cancelled) {
                        setSearchHits([]);
                        setStatusMessage(t('vault.searchFailed'));
                    }
                } finally {
                    if (!cancelled) setIsSearching(false);
                }
            })();
        }, 280);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [isOpen, naturalQuery.text, smartSearch, initialFilter, owner, t]);

    const handleSync = useCallback(async () => {
        setIsSyncing(true);
        try {
            await syncVaultCatalog();
            await runLoad();
        } finally {
            setIsSyncing(false);
        }
    }, [runLoad]);

    const handleEnrich = useCallback(async () => {
        setIsEnriching(true);
        setStatusMessage(null);
        try {
            const result = await enrichVaultCatalog({ limit: 12, caption: true, embed: true });
            setStatusMessage(t('vault.enrichDone', {
                captioned: result.captioned,
                embedded: result.embedded,
            }));
            await runLoad();
        } catch (error) {
            console.error(error);
            setStatusMessage(t('vault.enrichFailed'));
        } finally {
            setIsEnriching(false);
        }
    }, [runLoad, t]);

    return {
        query,
        setQuery,
        smartSearch,
        setSmartSearch,
        naturalQuery,
        bookcases,
        setBookcases,
        allAssets,
        setAllAssets,
        searchHits,
        searchMatchById,
        isLoading,
        isSyncing,
        isEnriching,
        isSearching,
        statusMessage,
        setStatusMessage,
        runLoad,
        handleSync,
        handleEnrich,
        workingAssets: searchHits ?? allAssets,
        browseTotal,
        hasMoreAssets: searchHits ? false : hasMoreAssets,
        isLoadingMore,
        loadMoreAssets,
    };
}
