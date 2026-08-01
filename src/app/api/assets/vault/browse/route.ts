import { jsonWithRequestId, apiError } from '@/lib/server/apiContract';
import {
    getVaultFilesystemAccess,
    listVaultDirectory,
} from '@/lib/server/vaultFilesystemPolicy';

/**
 * Subfolders of a path, for the in-app folder browser.
 *
 * The browser has no native folder dialog and the File System Access API
 * hands back an opaque handle, never a path — but the indexer needs a real
 * path. On a local install the server is the same machine as the user, so it
 * can do the walking and return paths the indexer can actually use. That is
 * what makes "Browse drive / folder" work on localhost without the desktop
 * build.
 *
 * Scoping is the same rule the rest of the vault filesystem uses
 * (vaultFilesystemPolicy): every drive on a local install, and only the
 * operator's authorised roots when self-hosted.
 */
export async function GET(request: Request) {
    const requestedPath = new URL(request.url).searchParams.get('path')?.trim();
    if (!requestedPath) {
        return apiError(request, {
            code: 'vault_browse_path_required',
            message: 'A folder path is required. Call /api/assets/vault/drives first to get a starting point.',
            status: 400,
            retryable: false,
        });
    }

    try {
        const listing = await listVaultDirectory(requestedPath);
        return jsonWithRequestId(request, {
            success: true as const,
            mode: getVaultFilesystemAccess().mode,
            ...listing,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'Failed to read that folder.';
        const code = (error as NodeJS.ErrnoException)?.code;
        // Three different things end up here, and only one is a fault:
        //   - the policy refused the path      -> tell the user why
        //   - the folder is gone/unreadable    -> normal while browsing
        //   - anything else                    -> ours, and worth logging
        const denied = /authoris|required|outside/i.test(reason);
        const expectedFsOutcome = ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EBUSY'].includes(code ?? '');
        if (!denied && !expectedFsOutcome) {
            console.error('Vault folder browse failed:', error);
        }
        return apiError(request, {
            code: denied ? 'vault_browse_denied' : 'vault_browse_failed',
            message: denied ? reason : 'Could not read that folder. It may not exist, or may not be readable.',
            status: denied ? 403 : 400,
            retryable: false,
        });
    }
}
