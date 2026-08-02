'use client';

import type { AssetType } from '@/types';
import { saveLocalAsset } from '@/lib/localAssetStore';
import { indexLocalAsset } from '@/lib/assetIndexer';
import { ensureDisplayableImage } from '@/lib/imageFormats/universalImageDecoder';
import { inferVaultAssetType } from '@/features/asset-vault/domain/inferAssetType';

function getExtension(filename: string) {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot) : '';
}

export type VaultUploadResult = {
    successCount: number;
    failedNames: string[];
    uploadedTypes: AssetType[];
};

/**
 * Save dropped/picked files into the classic local asset store (IndexedDB),
 * classify by type, and kick off background indexing so Smart search can see them.
 */
export async function uploadFilesToVaultLocal(
    files: File[],
    owner: string,
): Promise<VaultUploadResult> {
    const failedNames: string[] = [];
    const uploadedTypes: AssetType[] = [];
    let successCount = 0;
    const normalizedOwner = owner.trim() || 'Guest';

    for (const originalFile of files) {
        const detectedType = inferVaultAssetType(originalFile.name, originalFile.type) as AssetType;
        let file: File = originalFile;

        if (detectedType === 'images') {
            try {
                const decoded = await ensureDisplayableImage(originalFile);
                if (decoded.convertedFromLabel) {
                    const baseName = originalFile.name.slice(
                        0,
                        originalFile.name.length - getExtension(originalFile.name).length,
                    );
                    file = new File([decoded.blob], `${baseName}.png`, { type: 'image/png' });
                }
            } catch {
                failedNames.push(originalFile.name);
                continue;
            }
        }

        try {
            const saved = await saveLocalAsset({
                file,
                filename: file.name,
                type: detectedType,
                category: 'uploads',
                owner: normalizedOwner,
                isPublic: false,
                mimeType: file.type || undefined,
            });
            void indexLocalAsset(saved).catch(() => undefined);
            successCount += 1;
            uploadedTypes.push(detectedType);
        } catch (error) {
            console.error(`Vault upload failed for ${originalFile.name}`, error);
            failedNames.push(originalFile.name);
        }
    }

    return { successCount, failedNames, uploadedTypes };
}

/** Prefer a single type album when the batch is homogeneous. */
export function preferredVaultTypeAlbumId(types: AssetType[]): string | null {
    const unique = Array.from(new Set(types));
    if (unique.length !== 1) return null;
    return `album_type_${unique[0]}`;
}
