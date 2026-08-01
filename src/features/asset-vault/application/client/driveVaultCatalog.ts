'use client';

import type { DriveAssetRecord } from '@/lib/googleDrive';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';
import { stableVaultAssetId } from '@/features/asset-vault/domain/inferAssetType';

export function driveAssetToVaultRecord(record: DriveAssetRecord): VaultAssetRecord {
    return {
        id: stableVaultAssetId('vdri', record.id),
        name: record.name,
        mimeType: record.mimeType,
        type: record.type,
        category: record.category,
        sizeBytes: 0,
        origin: {
            connector: 'google-drive',
            uri: `gdrive://${record.id}`,
            displayPath: `Google Drive / ${record.category} / ${record.name}`,
            legacyId: record.id,
        },
        aliases: [],
        createdAt: record.createdAt,
        modifiedAt: record.updatedAt,
        owner: record.owner,
        isPublic: record.isPublic,
        previewUrl: `gdrive://${record.id}`,
    };
}

/**
 * Loads Drive assets for the vault catalog. Passive auth only — never pops
 * a consent window from the vault browser. Returns [] when Drive is off,
 * not configured, or the session needs interactive reconnect.
 */
export async function loadAllDriveVaultRecords(owner = 'Guest'): Promise<VaultAssetRecord[]> {
    if (typeof window === 'undefined') return [];

    const clientId = (process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || '').trim();
    if (!clientId) return [];

    const { loadDriveConfig, listDriveAssets } = await import('@/lib/googleDrive');
    const config = loadDriveConfig();
    if (!config.enabled) return [];

    const types = ['images', 'videos', 'audio', 'models'] as const;
    const categories = ['uploads', 'generated'] as const;
    const records: VaultAssetRecord[] = [];
    const seen = new Set<string>();
    const normalizedOwner = owner.trim() || 'Guest';

    try {
        for (const type of types) {
            for (const category of categories) {
                if (type === 'models' && category === 'generated') continue;
                const personal = await listDriveAssets(
                    clientId,
                    {
                        type,
                        category,
                        owner: normalizedOwner,
                        scope: 'personal',
                        includePublic: true,
                        visibility: 'all',
                    },
                    { allowInteractiveAuth: false },
                );
                const shared = await listDriveAssets(
                    clientId,
                    {
                        type,
                        category,
                        owner: normalizedOwner,
                        scope: 'shared',
                        includePublic: true,
                        visibility: 'all',
                    },
                    { allowInteractiveAuth: false },
                );
                for (const item of [...personal, ...shared]) {
                    if (seen.has(item.id)) continue;
                    seen.add(item.id);
                    records.push(driveAssetToVaultRecord(item));
                }
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        const normalized = message.toLowerCase();
        const softFailure = normalized.includes('requires user interaction')
            || normalized.includes('not enabled')
            || normalized.includes('missing')
            || normalized.includes('popup');
        if (!softFailure) {
            console.warn('Vault Drive catalog load failed:', error);
        }
        return [];
    }

    return records;
}

export async function resolveDrivePreviewUrl(record: VaultAssetRecord): Promise<string | null> {
    const fileId = record.origin.legacyId;
    if (!fileId || record.origin.connector !== 'google-drive') return null;

    const clientId = (process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || '').trim();
    if (!clientId) return null;

    const { downloadDriveAssetBlob } = await import('@/lib/googleDrive');
    try {
        const blob = await downloadDriveAssetBlob(clientId, fileId);
        return URL.createObjectURL(blob);
    } catch {
        return null;
    }
}
