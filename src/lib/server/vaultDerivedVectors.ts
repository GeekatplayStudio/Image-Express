import { ensureAssetVectors } from '@/features/asset-vault/application/vaultSearchService';
import type { VectorRecord } from '@/features/asset-vault/domain/vectorMath';
import type { VaultCatalog } from '@/features/asset-vault/contracts/assetRecord';

/**
 * Hash vectors for the whole catalog, derived rather than stored.
 *
 * They are a pure function of the catalog, so they are computed once and
 * memoised. Deriving 240k of them costs real time and real memory, which is
 * why this lives in one place: search and "find similar" both need them, and
 * two module-level caches would mean two copies of the same 240k-entry array.
 *
 * Keyed on the catalog alone — crucially NOT on the persisted vectors, which
 * change on every backfill and would invalidate the cache on every search.
 */
let derivedCache: { key: string; vectors: VectorRecord[] } | null = null;

export function getDerivedHashVectors(catalog: VaultCatalog): VectorRecord[] {
    const key = `${catalog.updatedAt}::${catalog.assets.length}`;
    if (!derivedCache || derivedCache.key !== key) {
        derivedCache = { key, vectors: ensureAssetVectors(catalog.assets, []) };
    }
    return derivedCache.vectors;
}

/** Drop the memo. Tests need this so one catalog does not leak into the next. */
export function clearDerivedHashVectors(): void {
    derivedCache = null;
}
