'use client';

import type { LocalAssetRecord } from '@/lib/localAssetStore';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { stableVaultAssetId } from '@/features/asset-vault/domain/inferAssetType';

export function localAssetToVaultRecord(record: LocalAssetRecord): VaultAssetRecord {
    const objectUrl = `local://${record.id}`;
    return {
        id: stableVaultAssetId('vloc', record.id),
        name: record.name,
        mimeType: record.mimeType,
        type: record.type,
        category: record.category,
        sizeBytes: record.sizeBytes ?? record.data?.size ?? 0,
        origin: {
            connector: 'indexeddb-legacy',
            uri: objectUrl,
            displayPath: `Local / ${record.category} / ${record.name}`,
            legacyId: record.id,
        },
        aliases: [],
        createdAt: record.createdAt,
        modifiedAt: record.updatedAt,
        description: record.description,
        tags: record.tags,
        prompt: record.prompt,
        width: record.width,
        height: record.height,
        indexedAt: record.indexedAt,
        aiIndexed: record.aiIndexed,
        owner: record.owner,
        isPublic: record.isPublic,
        previewUrl: objectUrl,
    };
}

export async function loadAllLocalVaultRecords(owner = 'Guest'): Promise<VaultAssetRecord[]> {
    if (typeof window === 'undefined') return [];
    const { listLocalAssetsForOwner } = await import('@/lib/localAssetStore');

    /**
     * One scan, not sixteen.
     *
     * This used to loop four types x two categories x two scopes, calling a
     * lister that read the entire store each time. Opening the vault therefore
     * scanned every stored asset sixteen times over — and did it again on every
     * search keystroke, since the unified search merges local records in.
     */
    const records = await listLocalAssetsForOwner(owner);
    return records.map(localAssetToVaultRecord);
}

export async function resolveLocalPreviewUrl(record: VaultAssetRecord): Promise<string | null> {
    const legacyId = record.origin.legacyId;
    if (!legacyId) return null;
    const { getLocalAssetBlob } = await import('@/lib/localAssetStore');
    const blob = await getLocalAssetBlob(legacyId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
}
