import { jsonWithRequestId, apiError } from '@/lib/server/apiContract';
import {
    getVaultFilesystemAccess,
    listIndexableDrives,
} from '@/lib/server/vaultFilesystemPolicy';

/**
 * Drives/volumes available to index.
 *
 * Exists because the browser has no native folder picker — on a local install
 * this lets the UI offer the same "pick a drive" experience the desktop build
 * gets from Electron. Self-hosted returns only the operator's authorised
 * folders (or nothing), so it never enumerates a server's volumes to a visitor.
 */
export async function GET(request: Request) {
    try {
        const access = getVaultFilesystemAccess();
        const drives = await listIndexableDrives();
        return jsonWithRequestId(request, {
            success: true as const,
            mode: access.mode,
            drives,
        });
    } catch (error) {
        console.error('Drive enumeration failed:', error);
        return apiError(request, {
            code: 'vault_drives_failed',
            message: 'Failed to list available drives.',
            status: 500,
            retryable: true,
        });
    }
}
