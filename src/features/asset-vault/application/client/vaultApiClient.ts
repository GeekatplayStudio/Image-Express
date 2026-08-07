'use client';

import { buildSessionAuthorizationHeader } from '@/lib/authSession';
import {
    isImplementedAssetCloudProvider,
    loadAssetStorageSettings,
    type AssetStorageSettings,
} from '@/lib/assetStorageSettings';
import type { Bookcase } from '@/features/asset-vault/contracts/bookcase';
import { DEFAULT_BOOKCASES } from '@/features/asset-vault/contracts/bookcase';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import type {
    VaultSearchRequest,
    VaultSearchResponse,
    VaultSearchResult,
    VaultStatusResponse,
} from '@/features/asset-vault/contracts/search';
import { mergeCatalogAssets, runVaultSearch } from '@/features/asset-vault/application/vaultSearchService';
import { reciprocalRankFusion } from '@/features/asset-vault/domain/vectorMath';
import { loadAllLocalVaultRecords, resolveLocalPreviewUrl } from './localVaultCatalog';
import { loadAllDriveVaultRecords, resolveDrivePreviewUrl } from './driveVaultCatalog';
import { resolveLocalFilePreviewUrl } from './watchRootClient';

async function vaultFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const authorization = buildSessionAuthorizationHeader();
    const response = await fetch(path, {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...(authorization ? { Authorization: authorization } : {}),
            ...(init?.headers || {}),
        },
    });
    const data = await response.json() as T & { message?: string; error?: { message?: string } };
    if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || `Vault API ${path} failed`);
    }
    return data;
}

function shouldIncludeServer(settings: AssetStorageSettings) {
    if (settings.mode === 'local') return false;
    if (settings.mode === 'cloud') return false;
    return settings.includeLegacyServerAssetsInHybrid;
}

function shouldIncludeLocal(settings: AssetStorageSettings) {
    return settings.mode === 'local' || settings.mode === 'hybrid';
}

function shouldIncludeDrive(settings: AssetStorageSettings) {
    if (!isImplementedAssetCloudProvider(settings.cloudProvider)) return false;
    return settings.mode === 'cloud' || settings.mode === 'hybrid';
}

export async function fetchVaultStatus(): Promise<VaultStatusResponse> {
    return vaultFetch<VaultStatusResponse>('/api/assets/vault/status');
}

export async function syncVaultCatalog(): Promise<void> {
    await vaultFetch('/api/assets/vault/sync', { method: 'POST' });
}

export type VaultEnrichResult = {
    success: true;
    processed: number;
    captioned: number;
    embedded: number;
    skipped: number;
};

export async function enrichVaultCatalog(options?: {
    limit?: number;
    caption?: boolean;
    embed?: boolean;
    onlyUncaptioned?: boolean;
}): Promise<VaultEnrichResult> {
    return vaultFetch<VaultEnrichResult>('/api/assets/vault/enrich', {
        method: 'POST',
        body: JSON.stringify(options || {}),
    });
}

export type VaultSimilarResult = {
    success: true;
    seed: VaultAssetRecord;
    results: VaultSearchResult[];
    total: number;
    bookcase: Bookcase | null;
};

export async function findSimilarVaultAssets(options: {
    assetId: string;
    limit?: number;
    createBookcase?: boolean;
}): Promise<VaultSimilarResult> {
    return vaultFetch<VaultSimilarResult>('/api/assets/vault/similar', {
        method: 'POST',
        body: JSON.stringify(options),
    });
}

function mergeBookcaseLists(serverList: Bookcase[]): Bookcase[] {
    const byId = new Map(serverList.map((bc) => [bc.id, bc]));
    for (const defaults of DEFAULT_BOOKCASES) {
        if (!byId.has(defaults.id)) byId.set(defaults.id, defaults);
    }
    // Preserve a stable sidebar order based on defaults, then any extras.
    const ordered: Bookcase[] = [];
    const seen = new Set<string>();
    for (const defaults of DEFAULT_BOOKCASES) {
        const entry = byId.get(defaults.id);
        if (entry) {
            ordered.push(entry);
            seen.add(entry.id);
        }
    }
    for (const entry of byId.values()) {
        if (!seen.has(entry.id)) ordered.push(entry);
    }
    return ordered;
}

export async function fetchBookcases(): Promise<Bookcase[]> {
    try {
        const data = await vaultFetch<{ success: true; bookcases: Bookcase[] }>('/api/assets/vault/bookcases');
        return mergeBookcaseLists(data.bookcases);
    } catch {
        return DEFAULT_BOOKCASES;
    }
}

export async function searchVaultUnified(
    request: VaultSearchRequest,
    owner = 'Guest',
): Promise<VaultSearchResponse> {
    const settings = typeof window !== 'undefined'
        ? loadAssetStorageSettings()
        : {
            mode: 'hybrid' as const,
            cloudProvider: 'google-drive' as const,
            hybridUploadToCloudByDefault: false,
            includeLegacyServerAssetsInHybrid: true,
        };

    const includeLocal = shouldIncludeLocal(settings);
    const includeDrive = shouldIncludeDrive(settings);
    const includeServer = shouldIncludeServer(settings);

    const [serverResponse, localAssets, driveAssets] = await Promise.all([
        vaultFetch<VaultSearchResponse>('/api/assets/vault/search', {
            method: 'POST',
            body: JSON.stringify(request),
        }).catch(() => ({
            success: true as const,
            results: [] as VaultSearchResult[],
            total: 0,
            query: request.query,
            expandedTerms: [] as string[],
            engine: undefined,
        })),
        includeLocal ? loadAllLocalVaultRecords(owner) : Promise.resolve([] as VaultAssetRecord[]),
        includeDrive ? loadAllDriveVaultRecords(owner) : Promise.resolve([] as VaultAssetRecord[]),
    ]);

    const expandedTerms = serverResponse.expandedTerms || [];
    const clientQuery = expandedTerms.length > 1
        ? expandedTerms.join(' ')
        : request.query;

    // Server already ran hybrid/smart search over the indexed catalog — keep those hits.
    const serverHits = (includeServer || settings.mode !== 'cloud')
        ? serverResponse.results
        : [];

    // Local + Drive need a client-side hybrid pass (they are not always in the server catalog).
    const clientPool = mergeCatalogAssets(localAssets, driveAssets);
    const clientHits = clientPool.length > 0
        ? runVaultSearch(clientPool, { ...request, query: clientQuery })
        : [];

    if (!request.query.trim()) {
        const merged = mergeCatalogAssets(
            serverHits.map((hit) => hit.asset),
            localAssets,
            driveAssets,
        );
        const results = runVaultSearch(merged, { ...request, query: '' });
        return {
            success: true,
            results,
            total: results.length,
            query: request.query,
            expandedTerms,
            engine: serverResponse.engine,
        };
    }

    // Fuse server contextual ranking with client local/drive ranking.
    // NEVER re-run keyword-only over server hits — that wiped vector matches.
    if (request.mode === 'smart') {
        const byId = new Map<string, VaultAssetRecord>();
        for (const hit of serverHits) byId.set(hit.asset.id, hit.asset);
        for (const hit of clientHits) byId.set(hit.asset.id, hit.asset);

        const fused = reciprocalRankFusion([
            serverHits.map((hit) => ({ id: hit.asset.id, score: hit.score })),
            clientHits.map((hit) => ({ id: hit.asset.id, score: hit.score })),
        ]);

        let results = fused
            .map((entry) => {
                const asset = byId.get(entry.id);
                if (!asset) return null;
                return {
                    asset,
                    score: entry.score,
                    matchReasons: ['hybrid: contextual'],
                };
            })
            .filter((entry): entry is VaultSearchResult => entry !== null)
            .slice(0, request.limit);

        if (results.length === 0) {
            results = [...serverHits, ...clientHits].slice(0, request.limit);
        }

        return {
            success: true,
            results,
            total: results.length,
            query: request.query,
            expandedTerms,
            engine: serverResponse.engine,
        };
    }

    // Keyword mode: merge server + client keyword hits (dedupe by id, keep best score).
    const byId = new Map<string, VaultSearchResult>();
    for (const hit of [...serverHits, ...clientHits]) {
        const previous = byId.get(hit.asset.id);
        if (!previous || hit.score > previous.score) byId.set(hit.asset.id, hit);
    }
    const results = Array.from(byId.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, request.limit);

    return {
        success: true,
        results,
        total: results.length,
        query: request.query,
        expandedTerms,
    };
}

export async function resolveVaultPreviewUrl(asset: VaultAssetRecord): Promise<string | null> {
    if (asset.origin.connector === 'indexeddb-legacy') {
        return resolveLocalPreviewUrl(asset);
    }
    if (asset.origin.connector === 'google-drive') {
        return resolveDrivePreviewUrl(asset);
    }
    if (asset.origin.connector === 'local' || asset.origin.connector === 'network') {
        return resolveLocalFilePreviewUrl(asset.origin.uri);
    }
    if (asset.previewUrl && !asset.previewUrl.startsWith('gdrive://') && !asset.previewUrl.startsWith('local://') && !asset.previewUrl.startsWith('file://')) {
        return asset.previewUrl;
    }
    return null;
}

export type { VaultSearchRequest, VaultSearchResponse, VaultAssetRecord, Bookcase };
