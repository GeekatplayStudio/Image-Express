'use client';

import type { AssetCategory, AssetType } from '@/types';

import { loadAssetStorageSettings } from '@/lib/assetStorageSettings';
import { dispatchAssetLibraryChanged } from '@/lib/assetLibraryEvents';
import { loadDriveConfig, uploadDriveAsset } from '@/lib/googleDrive';
import { saveLocalAsset } from '@/lib/localAssetStore';

type AssetSource = Blob | string;

export interface PersistAssetToLibraryParams {
    source: AssetSource;
    filename: string;
    type: AssetType;
    category: AssetCategory;
    owner?: string;
    isPublic?: boolean;
}

export interface PersistAssetToLibraryResult {
    savedProviders: Array<'local' | 'google-drive'>;
    warnings: string[];
}

function normalizeOwner(owner?: string) {
    const trimmed = owner?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : 'Guest';
}

async function sourceToBlob(source: AssetSource): Promise<Blob> {
    if (source instanceof Blob) {
        return source;
    }

    if (source.startsWith('data:')) {
        return fetch(source).then((response) => response.blob());
    }

    const response = await fetch('/api/assets/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: source }),
    });

    if (!response.ok) {
        const message = await response.text().catch(() => 'Failed to fetch remote asset.');
        throw new Error(message || 'Failed to fetch remote asset.');
    }

    return response.blob();
}

export async function persistAssetToLibrary({
    source,
    filename,
    type,
    category,
    owner,
    isPublic = false,
}: PersistAssetToLibraryParams): Promise<PersistAssetToLibraryResult> {
    const settings = loadAssetStorageSettings();
    const uploadLocal = settings.mode === 'local' || settings.mode === 'hybrid';
    const uploadCloud = settings.mode === 'cloud' || (settings.mode === 'hybrid' && settings.hybridUploadToCloudByDefault);
    const warnings: string[] = [];
    const savedProviders: Array<'local' | 'google-drive'> = [];

    if (!uploadLocal && !uploadCloud) {
        return { savedProviders, warnings };
    }

    const blob = await sourceToBlob(source);
    const normalizedOwner = normalizeOwner(owner);

    if (uploadLocal) {
        await saveLocalAsset({
            file: blob,
            filename,
            type,
            category,
            owner: normalizedOwner,
            isPublic,
            mimeType: blob.type || undefined,
        });
        savedProviders.push('local');
    }

    if (uploadCloud) {
        const driveConfig = loadDriveConfig();
        const resolvedDriveClientId = (driveConfig.clientId || process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || '').trim();

        if (!driveConfig.enabled || !resolvedDriveClientId) {
            const warning = 'Google Drive is not connected, so the asset was not mirrored to cloud storage.';
            if (!uploadLocal) {
                throw new Error(warning);
            }
            warnings.push(warning);
        } else {
            await uploadDriveAsset(resolvedDriveClientId, {
                file: blob,
                filename,
                type,
                category,
                owner: normalizedOwner,
                isPublic,
            });
            savedProviders.push('google-drive');
        }
    }

    if (savedProviders.length > 0) {
        dispatchAssetLibraryChanged({
            type,
            category,
            owner: normalizedOwner,
            savedProviders,
        });
    }

    return { savedProviders, warnings };
}