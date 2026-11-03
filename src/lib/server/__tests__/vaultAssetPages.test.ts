/**
 * @jest-environment node
 */

import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

const store = new Map<string, VaultAssetRecord>();
const readVaultAssetsByIds = jest.fn(async (ids: string[]) => ids.flatMap((id) => {
    const asset = store.get(id);
    return asset ? [asset] : [];
}));
jest.mock('@/lib/server/vault-store', () => ({
    readVaultAssetsByIds: (ids: string[]) => readVaultAssetsByIds(ids),
}));

import { collectVaultAssets, readVaultAssetsInOrder } from '@/lib/server/vaultAssetPages';

const asset = (id: string, over: Partial<VaultAssetRecord> = {}) => ({
    id, name: id, type: 'images', aiIndexed: false, ...over,
} as VaultAssetRecord);

describe('collectVaultAssets', () => {
    beforeEach(() => {
        store.clear();
        readVaultAssetsByIds.mockClear();
        for (let i = 0; i < 25; i += 1) store.set(`a${String(i).padStart(2, '0')}`, asset(`a${String(i).padStart(2, '0')}`, { aiIndexed: i % 5 !== 0 }));
    });
    const ids = () => Array.from(store.keys()).sort();

    it('reads only the pages it needs to fill the limit, and says where it stopped', async () => {
        // Work sits at a00, a05, a10, ...; two matches fit in the first page of 10.
        const result = await collectVaultAssets({ ids: ids(), limit: 2, pageSize: 10, where: (a) => !a.aiIndexed });
        expect(result.assets.map((a) => a.id)).toEqual(['a00', 'a05']);
        expect(readVaultAssetsByIds).toHaveBeenCalledTimes(1);
        // The walk stopped right after a05, so a resume starts at a06.
        expect(result.nextIndex).toBe(6);
    });

    it('keeps paging when a page has no matches, and ends at the list', async () => {
        const result = await collectVaultAssets({ ids: ids(), limit: 50, pageSize: 10, where: (a) => !a.aiIndexed });
        expect(result.assets.map((a) => a.id)).toEqual(['a00', 'a05', 'a10', 'a15', 'a20']);
        expect(readVaultAssetsByIds).toHaveBeenCalledTimes(3);
        expect(result.nextIndex).toBe(25);
    });

    it('resumes from a start index and skips ids that vanished since they were listed', async () => {
        const listed = ids();
        store.delete('a10');
        const result = await collectVaultAssets({ ids: listed, limit: 1, pageSize: 10, startIndex: 6, where: (a) => !a.aiIndexed });
        expect(result.assets.map((a) => a.id)).toEqual(['a15']);
    });
});

describe('readVaultAssetsInOrder', () => {
    it('returns records in the order asked, dropping ids no longer present', async () => {
        store.clear();
        store.set('x', asset('x'));
        store.set('y', asset('y'));
        // The store answers in its own order; the caller's order wins.
        readVaultAssetsByIds.mockImplementationOnce(async () => [store.get('y')!, store.get('x')!]);
        expect((await readVaultAssetsInOrder(['x', 'gone', 'y'])).map((a) => a.id)).toEqual(['x', 'y']);
        expect(await readVaultAssetsInOrder([])).toEqual([]);
    });
});
