import { driveAssetToVaultRecord } from '@/features/asset-vault/application/client/driveVaultCatalog';
import type { DriveAssetRecord } from '@/lib/googleDrive';

describe('driveVaultCatalog', () => {
    it('maps Drive records into vault assets with google-drive origin', () => {
        const drive: DriveAssetRecord = {
            id: 'drive-file-1',
            name: 'banner.png',
            type: 'images',
            category: 'uploads',
            owner: 'artist@example.com',
            isPublic: true,
            mimeType: 'image/png',
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-02T00:00:00.000Z',
        };
        const vault = driveAssetToVaultRecord(drive);
        expect(vault.origin.connector).toBe('google-drive');
        expect(vault.origin.legacyId).toBe('drive-file-1');
        expect(vault.origin.uri).toBe('gdrive://drive-file-1');
        expect(vault.id).toBe('vdri_drive-file-1');
        expect(vault.name).toBe('banner.png');
        expect(vault.isPublic).toBe(true);
    });
});
