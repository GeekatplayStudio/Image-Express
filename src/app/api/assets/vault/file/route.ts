import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import mime from 'mime';
import { apiError } from '@/lib/server/apiContract';
import { getVaultThumbnail } from '@/lib/server/vaultThumbnails';
import { readWatchRootStore } from '@/lib/server/vaultWatchStore';
import {
    decideVaultPathAccess,
    fileUriToPath,
    isPathInside,
} from '@/lib/server/vaultFilesystemPolicy';

/** Cap inline previews; a vault entry can legitimately be a multi-GB video. */
const MAX_PREVIEW_BYTES = 64 * 1024 * 1024;

/**
 * Streams an indexed file so previews work in the browser.
 *
 * Without this, `resolveVaultPreviewUrl` fell back to an Electron IPC call that
 * does not exist in a web browser, so drive-indexed assets were searchable but
 * rendered blank.
 *
 * Two independent gates, because this endpoint turns a path into file bytes:
 *  1. The path must satisfy the runtime access policy (all drives locally,
 *     operator allowlist when self-hosted).
 *  2. The path must sit inside a *registered watch root*. Passing the policy is
 *     not enough — otherwise a local install would expose the entire filesystem
 *     to anything that can reach the port, rather than just what the user chose
 *     to index.
 */
export async function GET(request: Request) {
    const requested = new URL(request.url).searchParams.get('uri');
    if (!requested) {
        return apiError(request, {
            code: 'vault_file_missing_uri',
            message: 'A file uri is required.',
            status: 400,
        });
    }

    const absolutePath = requested.startsWith('file://')
        ? fileUriToPath(requested)
        : requested;

    const decision = decideVaultPathAccess(absolutePath);
    if (!decision.allowed) {
        return apiError(request, {
            code: 'vault_file_not_authorized',
            message: decision.reason,
            status: 403,
        });
    }

    const store = await readWatchRootStore();
    const insideWatchRoot = store.roots.some((root) => isPathInside(decision.resolvedPath, root.rootUri));
    if (!insideWatchRoot) {
        return apiError(request, {
            code: 'vault_file_not_indexed',
            message: 'That file is not inside any indexed folder.',
            status: 403,
        });
    }

    let info;
    try {
        info = await stat(decision.resolvedPath);
    } catch {
        return apiError(request, {
            code: 'vault_file_not_found',
            message: 'File not found.',
            status: 404,
        });
    }
    if (!info.isFile()) {
        return apiError(request, {
            code: 'vault_file_not_a_file',
            message: 'That path is not a file.',
            status: 400,
        });
    }
    // A grid tile asks for a width; serving the original there meant sending
    // 1.3-2.0 MB per thumbnail. Falls through to the original when no codec is
    // available or the file is not a still image sharp can read.
    const requestedWidth = Number(new URL(request.url).searchParams.get('w') || '');
    if (requestedWidth > 0) {
        const thumbnail = await getVaultThumbnail(decision.resolvedPath, requestedWidth);
        if (thumbnail) {
            return new Response(new Uint8Array(thumbnail.body), {
                headers: {
                    'content-type': thumbnail.contentType,
                    'content-length': String(thumbnail.body.byteLength),
                    // Keyed on size and mtime, so a longer cache is safe: an
                    // edited file produces a different URL.
                    'cache-control': 'private, max-age=86400',
                    'x-content-type-options': 'nosniff',
                },
            });
        }
    }

    if (info.size > MAX_PREVIEW_BYTES) {
        return apiError(request, {
            code: 'vault_file_too_large',
            message: 'That file is too large to preview.',
            status: 413,
        });
    }

    const stream = Readable.toWeb(createReadStream(decision.resolvedPath)) as ReadableStream;
    return new Response(stream, {
        headers: {
            'content-type': mime.getType(decision.resolvedPath) || 'application/octet-stream',
            'content-length': String(info.size),
            // Local disk contents must never be cached by a shared proxy.
            'cache-control': 'private, max-age=300',
            'content-disposition': 'inline',
            'x-content-type-options': 'nosniff',
        },
    });
}
