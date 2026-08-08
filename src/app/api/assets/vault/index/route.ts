import { jsonWithRequestId, toApiErrorResponse } from '@/lib/server/apiContract';
import { blockCrossSiteRequest } from '@/lib/server/trustedCaller';
import { readVaultCatalog } from '@/lib/server/vault-store';
import { readEmbeddedAssetIds } from '@/lib/server/vaultWatchStore';
import { resolveEmbedModel } from '@/lib/server/ollamaEmbeddings';
import {
    requestVaultEmbedding,
    requestVaultThumbnails,
} from '@/lib/server/vaultEmbedQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start the indexing service: precache thumbnails and build the semantic
 * index across everything the vault knows about, as a continuous background
 * run that chains passes until it is done.
 *
 * Deliberately a *start* button and not a long-lived request: the work runs in
 * the job queue at background priority (interactive work always preempts it,
 * and each pass yields between batches), progress streams over the existing
 * queue SSE channel, and the queue's cancel endpoint is the stop button. If a
 * run is already going, this is a no-op that reports the running jobs, so
 * clicking twice never doubles the work.
 */
export async function POST(request: Request) {
    const crossSite = blockCrossSiteRequest(request);
    if (crossSite) return crossSite;
    try {
        const catalog = await readVaultCatalog();
        const embedded = await readEmbeddedAssetIds(resolveEmbedModel());
        const pendingEmbeds = Math.max(0, catalog.assets.length - embedded.size);

        const [thumbsJobId, embedJobId] = await Promise.all([
            requestVaultThumbnails({ continuous: true }),
            requestVaultEmbedding(pendingEmbeds, { continuous: true }),
        ]);

        return jsonWithRequestId(request, {
            success: true as const,
            // null means that work was already in flight — not an error.
            thumbsJobId,
            embedJobId,
            pendingEmbeds,
            totalAssets: catalog.assets.length,
        });
    } catch (error) {
        return toApiErrorResponse(request, error, {
            code: 'vault_index_failed',
            message: 'Failed to start vault indexing.',
            status: 500,
            retryable: true,
        });
    }
}
