import { jsonWithRequestId, apiError } from '@/lib/server/apiContract';
import { syncServerAssetsToCatalog, readVaultCatalog } from '@/lib/server/vault-store';

export async function POST(request: Request) {
    try {
        const catalog = await syncServerAssetsToCatalog();
        return jsonWithRequestId(request, {
            success: true,
            assetCount: catalog.assets.length,
            updatedAt: catalog.updatedAt,
        });
    } catch (error) {
        console.error('Vault sync failed:', error);
        return apiError(request, {
            code: 'vault_sync_failed',
            message: 'Failed to sync vault catalog.',
            status: 500,
            retryable: true,
        });
    }
}

export async function GET(request: Request) {
    const catalog = await readVaultCatalog();
    return jsonWithRequestId(request, {
        success: true,
        assetCount: catalog.assets.length,
        updatedAt: catalog.updatedAt,
    });
}
