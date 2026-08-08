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
                    limit: 200,
                }, owner),
            ]);
            setBookcases(list);
            setAllAssets(response.results.map((entry) => entry.asset));
        } catch (error) {
            console.error('Vault load failed', error);
            setAllAssets([]);
        } finally {
            setIsLoading(false);
        }
    }, [initialFilter, owner]);

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
    };
}
