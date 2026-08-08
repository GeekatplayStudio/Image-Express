import { readVaultCatalog } from '@/lib/server/vault-store';
import { readEmbeddedAssetIds, upsertVectorRecords } from '@/lib/server/vaultWatchStore';
import { embedTextsWithOllama, resolveEmbedModel } from '@/lib/server/ollamaEmbeddings';
import { buildAssetEmbeddingText } from '@/features/asset-vault/domain/vectorMath';
import { getQueue } from '@/lib/server/jobQueue';
import type { QueueHandlerContext } from '@/lib/server/jobQueue/types';

/**
 * Builds semantic embeddings for the vault, in the background.
 *
 * This used to happen *inside* the search request: every smart search embedded
 * 32 assets through Ollama before it was allowed to answer. Measured on a
 * 239,769-asset vault that made search take **5.4 s cold and 0.7 s warm**
 * against 0.005 s for keyword — and with 239,321 assets still unembedded it
 * would have taken roughly 7,500 searches to finish, every one of them paying
 * the latency.
 *
 * Indexing is a background activity. Search should read the index, never build
 * it. Running here means it also gets the queue's progress reporting, its
 * cancellation, and its crash recovery for free.
 */

/** Assets per Ollama round-trip. Larger batches amortise the call overhead. */
const BATCH_SIZE = 64;

/**
 * Stop after this many batches in one job.
 *
 * A vault can hold hundreds of thousands of unembedded assets; one job that ran
 * for hours would be impossible to reason about and would hold a lane the whole
 * time. The job finishes, reports what is left, and the next one picks up where
 * it stopped — progress is durable because it lives in the vector store.
 */
const MAX_BATCHES_PER_RUN = 40;

export type VaultEmbedResult = {
    embedded: number;
    remaining: number;
};

export async function runVaultEmbedJob(ctx: QueueHandlerContext): Promise<void> {
    const model = resolveEmbedModel();

    await ctx.update({ stage: 'worker', progress: 0.02, message: 'Reading the catalog…' });
    const catalog = await readVaultCatalog();

    await ctx.update({ stage: 'worker', progress: 0.05, message: 'Checking what is already indexed…' });
    const embedded = await readEmbeddedAssetIds(model);

    const pending = catalog.assets.filter((asset) => !embedded.has(asset.id));
    if (pending.length === 0) {
        await ctx.update({ stage: 'store', progress: 1, message: 'Everything is already indexed.' });
        return;
    }

    const plannedBatches = Math.min(MAX_BATCHES_PER_RUN, Math.ceil(pending.length / BATCH_SIZE));
    const plannedCount = Math.min(pending.length, plannedBatches * BATCH_SIZE);
    let done = 0;

    for (let batch = 0; batch < plannedBatches; batch += 1) {
        // The user asked the run to stop; what was written so far is kept.
        if (ctx.stopRequested?.()) break;

        const slice = pending.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
        if (slice.length === 0) break;

        const result = await embedTextsWithOllama({
            texts: slice.map((asset) => buildAssetEmbeddingText(asset)),
        });

        // A null result means Ollama is unreachable or the model is missing.
        // Stopping cleanly keeps what was already written; retrying the same
        // failing call for the rest of the run would only waste the lane.
        if (!result) {
            await ctx.update({
                stage: 'store',
                progress: 1,
                message: done > 0
                    ? `Indexed ${done.toLocaleString()}; the embedding model stopped responding.`
                    : 'The embedding model is not available.',
            });
            return;
        }

        const now = new Date().toISOString();
        await upsertVectorRecords(slice.map((asset, index) => ({
            assetId: asset.id,
            model: result.model,
            dims: result.vectors[index].length,
            vector: result.vectors[index],
            updatedAt: now,
        })));

        done += slice.length;
        // Reserve the last slice of the bar for the final write, so the job
        // never sits at 100% while still working.
        await ctx.update({
            stage: 'ai',
            progress: 0.05 + 0.9 * (done / plannedCount),
            message: `Indexed ${done.toLocaleString()} of ${pending.length.toLocaleString()} assets…`,
        });
    }

    const remaining = pending.length - done;
    const stopped = ctx.stopRequested?.() === true;

    if (stopped) {
        await ctx.update({
            stage: 'store',
            message: `Stopped after indexing ${done.toLocaleString()}; ${remaining.toLocaleString()} still to go.`,
        });
        return;
    }

    // A service run ("Index & precache") chains the next pass until the whole
    // catalog is embedded. Chained directly rather than through the request
    // guard, which would refuse while this job still counts as running. Only
    // when this pass made progress — an Ollama outage already returned above,
    // and re-enqueueing a run that embeds nothing would loop forever.
    if (ctx.job.payload.continuous === true && remaining > 0 && done > 0) {
        await getQueue().enqueue({
            kind: ctx.job.kind,
            lane: ctx.job.lane,
            external: false,
            label: `Indexing ${remaining.toLocaleString()} assets for search`,
            payload: { continuous: true, pendingCount: remaining },
            priority: ctx.job.priority,
        });
        await ctx.update({
            stage: 'store',
            progress: 1,
            message: `Indexed ${done.toLocaleString()}; continuing with ${remaining.toLocaleString()} to go.`,
        });
        return;
    }

    await ctx.update({
        stage: 'store',
        progress: 1,
        message: remaining > 0
            ? `Indexed ${done.toLocaleString()}; ${remaining.toLocaleString()} still to go.`
            : `Indexed ${done.toLocaleString()} assets.`,
    });
}
