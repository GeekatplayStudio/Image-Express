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
        sizeBytes: record.data?.size ?? 0,
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
    const { listLocalAssets } = await import('@/lib/localAssetStore');
    const types = ['images', 'videos', 'audio', 'models'] as const;
    const categories = ['uploads', 'generated'] as const;
    const records: VaultAssetRecord[] = [];
    const normalizedOwner = owner.trim() || 'Guest';

    for (const type of types) {
        for (const category of categories) {
            const personal = await listLocalAssets({
                type,
                category,
                owner: normalizedOwner,
                scope: 'personal',
                includePublic: true,
                visibility: 'all',
                search: '',
            });
            const shared = await listLocalAssets({
                type,
                category,
                owner: normalizedOwner,
                scope: 'shared',
                includePublic: true,
                visibility: 'all',
                search: '',
            });
            const seen = new Set<string>();
            for (const item of [...personal, ...shared]) {
                if (seen.has(item.id)) continue;
                seen.add(item.id);
                records.push(localAssetToVaultRecord(item));
            }
        }
    }
    return records;
}

export async function resolveLocalPreviewUrl(record: VaultAssetRecord): Promise<string | null> {
    const legacyId = record.origin.legacyId;
    if (!legacyId) return null;
    const { getLocalAssetBlob } = await import('@/lib/localAssetStore');
    const blob = await getLocalAssetBlob(legacyId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
}
