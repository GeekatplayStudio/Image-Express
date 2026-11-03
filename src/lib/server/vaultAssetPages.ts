import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { readVaultAssetsByIds } from '@/lib/server/vault-store';

/**
 * Walk a list of asset ids in order, fetching records a page at a time, until
 * `limit` records satisfy `where` or the list runs out.
 *
 * This is how a background job finds its next few dozen pieces of work in a
 * 200k-asset catalog without loading the catalog: the id list is cheap, and
 * only the pages actually inspected are parsed. The common case — the next
 * batch of uncaptioned images sits near the cursor — reads one page.
 */
export async function collectVaultAssets(options: {
    ids: string[];
    limit: number;
    where?: (asset: VaultAssetRecord) => boolean;
    startIndex?: number;
    pageSize?: number;
}): Promise<{ assets: VaultAssetRecord[]; nextIndex: number }> {
    const pageSize = Math.max(1, options.pageSize ?? 500);
    const limit = Math.max(0, options.limit);
    const assets: VaultAssetRecord[] = [];
    let index = Math.max(0, options.startIndex ?? 0);

    while (assets.length < limit && index < options.ids.length) {
        const pageIds = options.ids.slice(index, index + pageSize);
        const page = await readVaultAssetsByIds(pageIds);
        // Records come back in store order; the walk must follow the id list so
        // a cursor means the same thing from one run to the next.
        const byId = new Map(page.map((asset) => [asset.id, asset] as const));
        for (const id of pageIds) {
            index += 1;
            const asset = byId.get(id);
            if (!asset) continue; // deleted since the ids were listed
            if (options.where && !options.where(asset)) continue;
            assets.push(asset);
            if (assets.length >= limit) break;
        }
    }
    return { assets, nextIndex: index };
}

/** Records for `ids`, in the order of `ids`; ids no longer present are skipped. */
export async function readVaultAssetsInOrder(ids: string[]): Promise<VaultAssetRecord[]> {
    if (ids.length === 0) return [];
    const byId = new Map((await readVaultAssetsByIds(ids)).map((asset) => [asset.id, asset] as const));
    return ids.flatMap((id) => {
        const asset = byId.get(id);
        return asset ? [asset] : [];
    });
}
